"""RobotScope live WebSocket protocol v0.1."""

from __future__ import annotations

import base64
import json
from typing import Any

LIVE_PROTOCOL_VERSION = "robotscope.live.v0.1"
AGENT_NAME = "robotscope-ros2-agent"


def encode_payload(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def session_message(
    start_ns: int,
    topics: list[dict[str, str]],
    *,
    publish_topics: list[str] | None = None,
    service_call_services: list[str] | None = None,
) -> str:
    payload: dict[str, Any] = {
        "type": "session",
        "protocol": LIVE_PROTOCOL_VERSION,
        "agent": AGENT_NAME,
        "start_ns": start_ns,
        "topics": topics,
    }
    capabilities: dict[str, Any] = {}
    if publish_topics:
        capabilities["command_publish"] = publish_topics
    if service_call_services:
        capabilities["command_service_call"] = service_call_services
    if capabilities:
        payload["capabilities"] = capabilities
    return json.dumps(payload)


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


def command_publish_result_message(
    ok: bool,
    message: str,
    *,
    topic: str | None = None,
) -> str:
    payload: dict[str, Any] = {
        "type": "command.publish_result",
        "ok": ok,
        "message": message,
    }
    if topic:
        payload["topic"] = topic
    return json.dumps(payload)


def command_service_result_message(
    ok: bool,
    message: str,
    *,
    service: str | None = None,
    success: bool | None = None,
) -> str:
    payload: dict[str, Any] = {
        "type": "command.service_result",
        "ok": ok,
        "message": message,
    }
    if service:
        payload["service"] = service
    if success is not None:
        payload["success"] = success
    return json.dumps(payload)
