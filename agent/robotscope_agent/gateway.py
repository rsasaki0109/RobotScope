"""WebSocket gateway for RobotScope live clients."""

from __future__ import annotations

import asyncio
import threading

import websockets
from websockets.server import WebSocketServerProtocol

from .bridge import ChannelInfo, LiveBridge
from .protocol import channel_message, data_message, session_message, status_message


class LiveGateway:
    def __init__(self, host: str, port: int, bridge: LiveBridge) -> None:
        self.host = host
        self.port = port
        self.bridge = bridge
        self._clients: set[WebSocketServerProtocol] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = threading.Lock()

    def attach_bridge_callbacks(self) -> None:
        self.bridge.set_callbacks(self.notify_channel_added, self.notify_subscription_status)

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
        await websocket.send(session_message(start_ns, self.bridge.session_topics))
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
            async for _message in websocket:
                # v0.1: read-only gateway (no command publish)
                pass
        finally:
            self._clients.discard(websocket)

    async def run(self) -> None:
        self._loop = asyncio.get_running_loop()
        self.attach_bridge_callbacks()
        async with websockets.serve(self._handle_client, self.host, self.port):
            print(f"RobotScope ROS2 agent on ws://{self.host}:{self.port}")
            await asyncio.Future()
