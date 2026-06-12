"""RobotScope live WebSocket protocol v0.1."""

from __future__ import annotations

import base64
import json
from typing import Any

LIVE_PROTOCOL_VERSION = "robotscope.live.v0.1"
AGENT_NAME = "robotscope-ros2-agent"


def encode_payload(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def session_message(start_ns: int, topics: list[dict[str, str]]) -> str:
    return json.dumps(
        {
            "type": "session",
            "protocol": LIVE_PROTOCOL_VERSION,
            "agent": AGENT_NAME,
            "start_ns": start_ns,
            "topics": topics,
        }
    )


def channel_message(channel: dict[str, Any]) -> str:
    return json.dumps({"type": "channel", "channel": channel})


def data_message(
    channel_id: int,
    log_time_ns: int,
    data: bytes,
    publish_time_ns: int | None = None,
    sequence: int | None = None,
) -> str:
    payload: dict[str, Any] = {
        "type": "message",
        "channel_id": channel_id,
        "log_time_ns": log_time_ns,
        "data_b64": encode_payload(data),
    }
    if publish_time_ns is not None:
        payload["publish_time_ns"] = publish_time_ns
    if sequence is not None:
        payload["sequence"] = sequence
    return json.dumps(payload)


def status_message(
    phase: str,
    message: str | None = None,
    *,
    topics_subscribed: int | None = None,
    topics_pending: int | None = None,
) -> str:
    payload: dict[str, Any] = {"type": "status", "phase": phase}
    if message:
        payload["message"] = message
    if topics_subscribed is not None:
        payload["topics_subscribed"] = topics_subscribed
    if topics_pending is not None:
        payload["topics_pending"] = topics_pending
    return json.dumps(payload)


def error_message(message: str) -> str:
    return json.dumps({"type": "error", "message": message})
