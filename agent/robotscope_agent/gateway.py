"""WebSocket gateway for RobotScope live clients."""

from __future__ import annotations

import asyncio
import json
import threading

import websockets
from websockets.server import WebSocketServerProtocol

from .bridge import ChannelInfo, LiveBridge
from .protocol import (
    channel_message,
    command_action_cancel_result_message,
    command_action_feedback_message,
    command_action_outcome_message,
    command_action_result_message,
    command_publish_result_message,
    command_service_result_message,
    data_message,
    session_message,
    status_message,
)


class LiveGateway:
    def __init__(
        self,
        host: str,
        port: int,
        bridge: LiveBridge,
        *,
        publish_allowlist: list[str] | None = None,
        service_allowlist: list[str] | None = None,
        service_type_map: dict[str, str] | None = None,
        action_allowlist: list[str] | None = None,
    ) -> None:
        self.host = host
        self.port = port
        self.bridge = bridge
        self.publish_allowlist = list(publish_allowlist or [])
        self.service_allowlist = list(service_allowlist or [])
        self.service_type_map = dict(service_type_map or {})
        self.action_allowlist = list(action_allowlist or [])
        self._clients: set[WebSocketServerProtocol] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = threading.Lock()

    def attach_bridge_callbacks(self) -> None:
        self.bridge.set_callbacks(self.notify_channel_added, self.notify_subscription_status)
        self.bridge.set_action_callbacks(self.notify_action_feedback, self.notify_action_outcome)

    def notify_action_feedback(self, action: str, sequence: list[int]) -> None:
        if self._loop is None:
            return
        payload = command_action_feedback_message(action, sequence)
        asyncio.run_coroutine_threadsafe(self._broadcast(payload), self._loop)

    def notify_action_outcome(
        self,
        action: str,
        ok: bool,
        status: str,
        sequence: list[int],
        message: str | None,
    ) -> None:
        if self._loop is None:
            return
        payload = command_action_outcome_message(
            action,
            ok,
            status,
            sequence,
            message=message,
        )
        asyncio.run_coroutine_threadsafe(self._broadcast(payload), self._loop)

    def publish(self, channel: ChannelInfo, log_time_ns: int, publish_time_ns: int, data: bytes) -> None:
        if self._loop is None:
            return
        payload = data_message(
            channel.id,
            log_time_ns,
            data,
            publish_time_ns=publish_time_ns,
        )
        asyncio.run_coroutine_threadsafe(self._broadcast(payload), self._loop)

    def notify_channel_added(self, channel: ChannelInfo) -> None:
        if self._loop is None:
            return
        asyncio.run_coroutine_threadsafe(self._emit_channel(channel), self._loop)

    def notify_subscription_status(self, subscribed: int, pending: int) -> None:
        if self._loop is None:
            return
        asyncio.run_coroutine_threadsafe(
            self._broadcast(self._status_payload(subscribed, pending)),
            self._loop,
        )

    async def _emit_channel(self, channel: ChannelInfo) -> None:
        await self._broadcast(
            channel_message(
                {
                    "id": channel.id,
                    "topic": channel.topic,
                    "schema": channel.schema,
                    "encoding": channel.encoding,
                    "definition": channel.definition,
                }
            )
        )
        await self._broadcast(
            self._status_payload(len(self.bridge.channels), self.bridge.pending_topic_count)
        )

    def _status_payload(self, subscribed: int, pending: int) -> str:
        if subscribed == 0 and pending > 0:
            return status_message(
                "waiting_for_topics",
                f"Waiting for {pending} ROS topic(s)…",
                topics_subscribed=subscribed,
                topics_pending=pending,
            )
        if subscribed == 0:
            return status_message(
                "waiting_for_topics",
                "No ROS topics available yet",
                topics_subscribed=0,
                topics_pending=0,
            )
        if pending > 0:
            return status_message(
                "waiting_for_topics",
                f"{subscribed} subscribed · {pending} pending",
                topics_subscribed=subscribed,
                topics_pending=pending,
            )
        return status_message(
            "ready",
            f"Streaming {subscribed} topics from ROS 2",
            topics_subscribed=subscribed,
            topics_pending=0,
        )

    async def _broadcast(self, payload: str) -> None:
        if not self._clients:
            return
        await asyncio.gather(
            *[client.send(payload) for client in list(self._clients)],
            return_exceptions=True,
        )

    async def _handle_client(self, websocket: WebSocketServerProtocol) -> None:
        await websocket.send(
            status_message(
                "connecting",
                "ROS 2 agent handshake",
                topics_subscribed=len(self.bridge.channels),
                topics_pending=self.bridge.pending_topic_count,
            )
        )

        start_ns = self.bridge.get_clock().now().nanoseconds
        await websocket.send(
            session_message(
                start_ns,
                self.bridge.session_topics,
                publish_topics=self.publish_allowlist or None,
                service_call_services=self.service_allowlist or None,
                service_call_types=self.service_type_map or None,
                action_send_goal_actions=self.action_allowlist or None,
            )
        )
        for channel in self.bridge.channels:
            await websocket.send(
                channel_message(
                    {
                        "id": channel.id,
                        "topic": channel.topic,
                        "schema": channel.schema,
                        "encoding": channel.encoding,
                        "definition": channel.definition,
                    }
                )
            )

        await websocket.send(
            self._status_payload(len(self.bridge.channels), self.bridge.pending_topic_count)
        )
        if len(self.bridge.channels) > 0:
            await websocket.send(
                status_message(
                    "streaming",
                    "ROS 2 live stream active",
                    topics_subscribed=len(self.bridge.channels),
                    topics_pending=self.bridge.pending_topic_count,
                )
            )

        self._clients.add(websocket)
        try:
            async for raw_message in websocket:
                await self._handle_client_message(websocket, raw_message)
        finally:
            self._clients.discard(websocket)

    async def _handle_client_message(
        self,
        websocket: WebSocketServerProtocol,
        raw_message: str | bytes,
    ) -> None:
        if isinstance(raw_message, bytes):
            raw_message = raw_message.decode("utf-8", errors="ignore")

        try:
            payload = json.loads(raw_message)
        except json.JSONDecodeError:
            await websocket.send(
                command_publish_result_message(False, "Invalid JSON from viewer")
            )
            return

        if not isinstance(payload, dict):
            return

        message_type = payload.get("type")
        if message_type == "command.publish":
            topic = payload.get("topic")
            schema = payload.get("schema")
            if not isinstance(topic, str) or not isinstance(schema, str):
                await websocket.send(
                    command_publish_result_message(False, "command.publish requires topic and schema")
                )
                return

            ok, message = self.bridge.publish_command(topic, schema, payload)
            await websocket.send(command_publish_result_message(ok, message, topic=topic))
            return

        if message_type == "command.service_call":
            service = payload.get("service")
            schema = payload.get("schema")
            if not isinstance(service, str) or not isinstance(schema, str):
                await websocket.send(
                    command_service_result_message(False, "command.service_call requires service and schema")
                )
                return

            ok, message, success = self.bridge.call_service(service, schema, payload)
            await websocket.send(
                command_service_result_message(ok, message, service=service, success=success)
            )
            return

        if message_type == "command.action_send_goal":
            action = payload.get("action")
            schema = payload.get("schema")
            if not isinstance(action, str) or not isinstance(schema, str):
                await websocket.send(
                    command_action_result_message(
                        False,
                        "command.action_send_goal requires action and schema",
                    )
                )
                return

            ok, message, goal_accepted = self.bridge.send_action_goal(action, schema, payload)
            await websocket.send(
                command_action_result_message(ok, message, action=action, goal_accepted=goal_accepted)
            )
            return

        if message_type == "command.action_cancel_goal":
            action = payload.get("action")
            if not isinstance(action, str):
                await websocket.send(
                    command_action_cancel_result_message(
                        False,
                        "command.action_cancel_goal requires action",
                    )
                )
                return

            ok, message, cancel_accepted = self.bridge.cancel_action_goal(action)
            await websocket.send(
                command_action_cancel_result_message(
                    ok,
                    message,
                    action=action,
                    cancel_accepted=cancel_accepted,
                )
            )
            return

    async def run(self) -> None:
        self._loop = asyncio.get_running_loop()
        self.attach_bridge_callbacks()
        async with websockets.serve(self._handle_client, self.host, self.port):
            publish_note = (
                f" · publish allowlist: {', '.join(self.publish_allowlist)}"
                if self.publish_allowlist
                else ""
            )
            service_note = (
                f" · service allowlist: {', '.join(self.service_allowlist)}"
                if self.service_allowlist
                else ""
            )
            action_note = (
                f" · action allowlist: {', '.join(self.action_allowlist)}"
                if self.action_allowlist
                else ""
            )
            readonly_note = (
                " · read-only"
                if not self.publish_allowlist and not self.service_allowlist and not self.action_allowlist
                else ""
            )
            print(
                f"RobotScope ROS2 agent on ws://{self.host}:{self.port}"
                f"{publish_note}{service_note}{action_note}{readonly_note}"
            )
            await asyncio.Future()
