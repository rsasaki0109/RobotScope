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

try:
    from std_srvs.srv import SetBool, Trigger
except ImportError:  # pragma: no cover - optional at import time
    SetBool = None  # type: ignore[misc, assignment]
    Trigger = None  # type: ignore[misc, assignment]

try:
    from example_interfaces.action import Fibonacci
except ImportError:  # pragma: no cover - optional at import time
    Fibonacci = None  # type: ignore[misc, assignment]

try:
    from rclpy.action import ActionClient
except ImportError:  # pragma: no cover - optional at import time
    ActionClient = None  # type: ignore[misc, assignment]

try:
    from action_msgs.msg import GoalStatus
except ImportError:  # pragma: no cover - optional at import time
    GoalStatus = None  # type: ignore[misc, assignment]


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
        service_allowlist: list[str] | None = None,
        service_type_map: dict[str, str] | None = None,
        action_allowlist: list[str] | None = None,
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
        self._service_allowlist = set(service_allowlist or [])
        self._service_type_map = dict(service_type_map or {})
        self._service_clients: dict[str, object] = {}
        self._action_allowlist = set(action_allowlist or [])
        self._action_clients: dict[str, object] = {}
        self._active_goal_handles: dict[str, object] = {}
        self._on_action_feedback: Callable[[str, list[int]], None] | None = None
        self._on_action_outcome: Callable[[str, bool, str, list[int], str | None], None] | None = None

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

    def set_action_callbacks(
        self,
        on_feedback: Callable[[str, list[int]], None] | None,
        on_outcome: Callable[[str, bool, str, list[int], str | None], None] | None,
    ) -> None:
        self._on_action_feedback = on_feedback
        self._on_action_outcome = on_outcome

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

    def call_service(
        self,
        service: str,
        schema: str,
        payload: dict[str, Any],
    ) -> tuple[bool, str, bool | None]:
        if service not in self._service_allowlist:
            return False, f"Service {service} is not allowlisted for call", None

        if payload.get("trigger"):
            if schema != "std_srvs/srv/Trigger":
                return False, "trigger shortcut is only supported for std_srvs/srv/Trigger", None
            if Trigger is None:
                return False, "std_srvs is not available in this ROS environment", None

            client_key = f"{schema}:{service}"
            client = self._service_clients.get(client_key)
            if client is None:
                client = self.create_client(Trigger, service)
                if not client.wait_for_service(timeout_sec=2.0):
                    return False, f"Service {service} is not available", None
                self._service_clients[client_key] = client
                self.get_logger().info(f"Created service client for {service} ({schema})")

            request = Trigger.Request()
            future = client.call_async(request)
            rclpy.spin_until_future_complete(self, future, timeout_sec=5.0)
            if not future.done():
                return False, f"Service call to {service} timed out", None
            result = future.result()
            if result is None:
                return False, f"Service call to {service} failed", None
            return True, result.message or f"Called {service}", bool(result.success)

        if (
            schema == "std_srvs/srv/SetBool"
            or self._service_type_map.get(service) == "std_srvs/srv/SetBool"
        ):
            if SetBool is None:
                return False, "std_srvs is not available in this ROS environment", None

            data = payload.get("data") is True
            client_key = f"std_srvs/srv/SetBool:{service}"
            client = self._service_clients.get(client_key)
            if client is None:
                client = self.create_client(SetBool, service)
                if not client.wait_for_service(timeout_sec=2.0):
                    return False, f"Service {service} is not available", None
                self._service_clients[client_key] = client
                self.get_logger().info(
                    f"Created service client for {service} (std_srvs/srv/SetBool)"
                )

            self.get_logger().info(f"Calling SetBool service {service} data={data}")
            request = SetBool.Request()
            request.data = data
            future = client.call_async(request)
            rclpy.spin_until_future_complete(self, future, timeout_sec=5.0)
            if not future.done():
                return False, f"Service call to {service} timed out", None
            result = future.result()
            if result is None:
                return False, f"Service call to {service} failed", None
            return True, result.message or f"Called {service}", bool(result.success)

        return False, "Missing trigger shortcut or unsupported payload", None

    def send_action_goal(
        self,
        action: str,
        schema: str,
        payload: dict[str, Any],
    ) -> tuple[bool, str, bool | None]:
        if action not in self._action_allowlist:
            return False, f"Action {action} is not allowlisted for goal send", None

        fibonacci_payload = payload.get("fibonacci")
        if isinstance(fibonacci_payload, dict):
            if schema != "example_interfaces/action/Fibonacci":
                return False, "fibonacci shortcut is only supported for example_interfaces/action/Fibonacci", None
            if Fibonacci is None or ActionClient is None:
                return False, "example_interfaces actions are not available in this ROS environment", None

            preempt = bool(payload.get("preempt"))
            if action in self._active_goal_handles:
                if not preempt:
                    return (
                        False,
                        f"Action {action} already has an active goal (set preempt to replace)",
                        None,
                    )
                cancel_ok, cancel_msg, _ = self.cancel_action_goal(action)
                if not cancel_ok:
                    return False, f"Preempt cancel failed on {action}: {cancel_msg}", None
                self._active_goal_handles.pop(action, None)

            client = self._action_clients.get(action)
            if client is None:
                client = ActionClient(self, Fibonacci, action)
                if not client.wait_for_server(timeout_sec=2.0):
                    return False, f"Action {action} is not available", None
                self._action_clients[action] = client
                self.get_logger().info(f"Created action client for {action} ({schema})")

            goal = Fibonacci.Goal()
            goal.order = int(fibonacci_payload.get("order", 3))

            def feedback_callback(feedback_msg: object) -> None:
                feedback = getattr(feedback_msg, "feedback", None)
                sequence = getattr(feedback, "sequence", None)
                if not isinstance(sequence, (list, tuple)):
                    return
                if self._on_action_feedback is not None:
                    self._on_action_feedback(action, [int(value) for value in sequence])

            send_goal_future = client.send_goal_async(goal, feedback_callback=feedback_callback)
            rclpy.spin_until_future_complete(self, send_goal_future, timeout_sec=5.0)
            if not send_goal_future.done():
                return False, f"Action goal send to {action} timed out", None
            goal_handle = send_goal_future.result()
            if goal_handle is None:
                return False, f"Action goal send to {action} failed", None
            if not goal_handle.accepted:
                return False, f"Action goal rejected on {action}", False

            self._active_goal_handles[action] = goal_handle

            result_future = goal_handle.get_result_async()
            result_future.add_done_callback(
                lambda future, action_name=action: self._handle_action_outcome(action_name, future)
            )
            return True, f"Fibonacci goal accepted on {action} (order={goal.order})", True

        return False, "Missing fibonacci shortcut or unsupported payload", None

    def cancel_action_goal(self, action: str) -> tuple[bool, str, bool | None]:
        if action not in self._action_allowlist:
            return False, f"Action {action} is not allowlisted for goal cancel", None

        goal_handle = self._active_goal_handles.get(action)
        if goal_handle is None:
            return False, f"No active goal on {action}", None

        cancel_future = goal_handle.cancel_goal_async()  # type: ignore[union-attr]
        rclpy.spin_until_future_complete(self, cancel_future, timeout_sec=5.0)
        if not cancel_future.done():
            return False, f"Action cancel on {action} timed out", None
        cancel_response = cancel_future.result()
        if cancel_response is None:
            return False, f"Action cancel on {action} failed", None

        return True, f"Cancel requested on {action}", True

    def _handle_action_outcome(self, action: str, future: object) -> None:
        self._active_goal_handles.pop(action, None)
        if self._on_action_outcome is None:
            return

        try:
            wrapped = future.result()  # type: ignore[union-attr]
            status_code = getattr(wrapped, "status", None)
            result = getattr(wrapped, "result", None)
            sequence_raw = getattr(result, "sequence", None) if result is not None else None
            sequence = [int(value) for value in sequence_raw] if isinstance(sequence_raw, (list, tuple)) else []
            status_name = self._goal_status_name(status_code)
            ok = status_name == "succeeded"
            message = f"Fibonacci {status_name} on {action}"
            self._on_action_outcome(action, ok, status_name, sequence, message)
        except Exception as exc:  # pragma: no cover - defensive path
            self._on_action_outcome(action, False, "failed", [], str(exc))

    def _goal_status_name(self, status_code: object) -> str:
        if GoalStatus is not None:
            mapping = {
                GoalStatus.STATUS_SUCCEEDED: "succeeded",
                GoalStatus.STATUS_ABORTED: "aborted",
                GoalStatus.STATUS_CANCELED: "canceled",
            }
            if status_code in mapping:
                return mapping[status_code]

        numeric_mapping = {
            4: "succeeded",
            5: "canceled",
            6: "aborted",
        }
        if isinstance(status_code, int) and status_code in numeric_mapping:
            return numeric_mapping[status_code]
        return "failed"

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
