"""ROS 2 topic bridge -> RobotScope live protocol payloads."""

from __future__ import annotations

import base64
import subprocess
from dataclasses import dataclass
from typing import Any, Callable

import rclpy
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from rclpy.serialization import deserialize_message, serialize_message
from rosidl_runtime_py.utilities import get_message

from .profiles import IGNORED_TOPICS

try:
    from geometry_msgs.msg import Twist
except ImportError:  # pragma: no cover - optional at import time
    Twist = None  # type: ignore[misc, assignment]


@dataclass
class ChannelInfo:
    id: int
    topic: str
    schema: str
    encoding: str
    definition: str


class LiveBridge(Node):
    def __init__(
        self,
        desired_topics: list[str],
        on_data: Callable[[ChannelInfo, int, int, bytes], None],
        *,
        on_channel_added: Callable[[ChannelInfo], None] | None = None,
        on_subscription_status: Callable[[int, int], None] | None = None,
        discover: bool = False,
        max_topics: int = 48,
        topic_retry_sec: float = 2.0,
        publish_allowlist: list[str] | None = None,
    ) -> None:
        super().__init__("robotscope_live_bridge")
        self._on_data = on_data
        self._on_channel_added = on_channel_added
        self._on_subscription_status = on_subscription_status
        self._discover = discover
        self._max_topics = max_topics
        self._desired_topics = list(desired_topics)
        self._pending_topics = set(desired_topics)
        self._channels: dict[str, ChannelInfo] = {}
        self._sequences: dict[str, int] = {}
        self._next_channel_id = 1
        self._definition_cache: dict[str, str] = {}
        self._publish_allowlist = set(publish_allowlist or [])
        self._publishers: dict[str, tuple[object, object]] = {}

        self._scan_and_subscribe()
        self._emit_subscription_status()
        self.create_timer(topic_retry_sec, self._on_retry_timer)

    @property
    def channels(self) -> list[ChannelInfo]:
        return list(self._channels.values())

    @property
    def pending_topic_count(self) -> int:
        if self._discover:
            available = discover_topics(self, self._max_topics)
            return sum(1 for topic in available if topic not in self._channels)
        return len(self._pending_topics)

    @property
    def session_topics(self) -> list[dict[str, str]]:
        return [{"name": channel.topic, "schema": channel.schema} for channel in self.channels]

    def pending_topic_names(self) -> list[str]:
        return sorted(self._pending_topics)

    def set_callbacks(
        self,
        on_channel_added: Callable[[ChannelInfo], None] | None,
        on_subscription_status: Callable[[int, int], None] | None,
    ) -> None:
        self._on_channel_added = on_channel_added
        self._on_subscription_status = on_subscription_status

    def _on_retry_timer(self) -> None:
        before = len(self._channels)
        self._scan_and_subscribe()
        if len(self._channels) != before:
            self._emit_subscription_status()

    def _scan_and_subscribe(self) -> None:
        available = dict(self.get_topic_names_and_types())

        if self._discover:
            for topic in discover_topics(self, self._max_topics):
                if topic in self._channels:
                    continue
                if len(self._channels) >= self._max_topics:
                    break
                type_names = available.get(topic)
                if not type_names:
                    continue
                self._subscribe_topic(topic, type_names[0])
            return

        for topic in list(self._pending_topics):
            type_names = available.get(topic)
            if not type_names:
                continue
            self._subscribe_topic(topic, type_names[0])
            self._pending_topics.discard(topic)

    def _emit_subscription_status(self) -> None:
        subscribed = len(self._channels)
        pending = self.pending_topic_count
        if self._on_subscription_status is not None:
            self._on_subscription_status(subscribed, pending)
            return

        if subscribed == 0 and pending > 0:
            self.get_logger().info(
                f"Waiting for {pending} ROS topic(s): {', '.join(self.pending_topic_names()[:5])}"
                + ("…" if pending > 5 else "")
            )
        elif subscribed == 0:
            self.get_logger().warn("No topics subscribed — check --topics, --profile, or --discover")
        elif pending > 0:
            self.get_logger().info(f"Subscribed {subscribed} topic(s); {pending} still pending")

    def _subscribe_topic(self, topic: str, type_name: str) -> None:
        if topic in self._channels:
            return

        schema_name = normalize_schema_name(type_name)
        definition = self._load_definition(schema_name)
        channel = ChannelInfo(
            id=self._next_channel_id,
            topic=topic,
            schema=schema_name,
            encoding="ros2msg",
            definition=definition,
        )
        self._next_channel_id += 1
        self._channels[topic] = channel
        self._sequences[topic] = 0

        message_class = get_message(type_name)
        self.create_subscription(
            message_class,
            topic,
            lambda msg, t=topic: self._handle_message(t, msg),
            qos_profile_sensor_data,
        )
        self.get_logger().info(f"Subscribed {topic} ({schema_name})")

        if self._on_channel_added is not None:
            self._on_channel_added(channel)

    def publish_command(self, topic: str, schema: str, payload: dict[str, Any]) -> tuple[bool, str]:
        if topic not in self._publish_allowlist:
            return False, f"Topic {topic} is not allowlisted for publish"

        publisher_entry = self._publishers.get(topic)
        if publisher_entry is None:
            available = dict(self.get_topic_names_and_types())
            type_names = available.get(topic)
            if not type_names:
                return False, f"Topic {topic} is not on the ROS graph"
            message_class = get_message(type_names[0])
            publisher = self.create_publisher(message_class, topic, 10)
            publisher_entry = (publisher, message_class)
            self._publishers[topic] = publisher_entry
            self.get_logger().info(f"Created publisher for {topic} ({schema})")

        publisher, message_class = publisher_entry

        try:
            twist_payload = payload.get("twist")
            if isinstance(twist_payload, dict):
                if schema != "geometry_msgs/msg/Twist":
                    return False, "twist is only supported for geometry_msgs/msg/Twist"
                if Twist is None:
                    return False, "geometry_msgs is not available in this ROS environment"
                message = Twist()
                message.linear.x = float(twist_payload.get("linear_x", 0.0))
                message.linear.y = float(twist_payload.get("linear_y", 0.0))
                message.linear.z = float(twist_payload.get("linear_z", 0.0))
                message.angular.x = float(twist_payload.get("angular_x", 0.0))
                message.angular.y = float(twist_payload.get("angular_y", 0.0))
                message.angular.z = float(twist_payload.get("angular_z", 0.0))
            elif payload.get("zero_twist"):
                if schema != "geometry_msgs/msg/Twist":
                    return False, "zero_twist is only supported for geometry_msgs/msg/Twist"
                if Twist is None:
                    return False, "geometry_msgs is not available in this ROS environment"
                message = Twist()
            else:
                data_b64 = payload.get("data_b64")
                if not data_b64:
                    return False, "Missing twist, data_b64, or zero_twist"
                raw = base64.b64decode(str(data_b64))
                message = deserialize_message(raw, message_class)
            publisher.publish(message)  # type: ignore[attr-defined]
            return True, f"Published to {topic}"
        except Exception as exc:  # pragma: no cover - runtime ROS errors
            return False, str(exc)

    def _handle_message(self, topic: str, msg: object) -> None:
        channel = self._channels.get(topic)
        if channel is None:
            return

        now_ns = self.get_clock().now().nanoseconds
        sequence = self._sequences[topic]
        self._sequences[topic] = sequence + 1
        payload = serialize_message(msg)
        self._on_data(channel, now_ns, now_ns, payload)

    def _load_definition(self, schema_name: str) -> str:
        cached = self._definition_cache.get(schema_name)
        if cached is not None:
            return cached

        try:
            completed = subprocess.run(
                ["ros2", "interface", "show", schema_name],
                check=True,
                capture_output=True,
                text=True,
            )
            definition = completed.stdout.strip()
        except subprocess.CalledProcessError:
            definition = f"# unavailable: {schema_name}\n"

        self._definition_cache[schema_name] = definition
        return definition


def normalize_schema_name(type_name: str) -> str:
    if type_name.count("/") == 1:
        package, name = type_name.split("/", 1)
        return f"{package}/msg/{name}"
    return type_name


def discover_topics(node: Node, max_topics: int) -> list[str]:
    discovered: list[str] = []
    for topic, _types in node.get_topic_names_and_types():
        if topic in IGNORED_TOPICS or topic.startswith("/_"):
            continue
        if topic.endswith("/transition_event"):
            continue
        discovered.append(topic)
    discovered.sort()
    return discovered[:max_topics]


def spin_bridge(bridge: LiveBridge) -> MultiThreadedExecutor:
    executor = MultiThreadedExecutor()
    executor.add_node(bridge)
    return executor
