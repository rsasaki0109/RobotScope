"""RobotScope native ROS 2 live agent entry point."""

from __future__ import annotations

import argparse
import asyncio
import threading

import rclpy

from .bridge import LiveBridge, spin_bridge
from .gateway import LiveGateway
from .profiles import PROFILE_TOPICS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="RobotScope ROS 2 live WebSocket agent")
    parser.add_argument("--host", default="127.0.0.1", help="WebSocket bind host")
    parser.add_argument("--port", type=int, default=8765, help="WebSocket port")
    parser.add_argument(
        "--profile",
        choices=sorted(PROFILE_TOPICS.keys()),
        default="default",
        help="Topic profile aligned with RobotScope plugin packs",
    )
    parser.add_argument(
        "--topics",
        help="Comma-separated ROS topic list (overrides --profile)",
    )
    parser.add_argument(
        "--discover",
        action="store_true",
        help="Subscribe to discovered topics instead of profile list",
    )
    parser.add_argument(
        "--max-topics",
        type=int,
        default=48,
        help="Maximum topics when using --discover",
    )
    parser.add_argument(
        "--topic-retry-sec",
        type=float,
        default=2.0,
        help="Retry interval for topics that are not published yet",
    )
    parser.add_argument(
        "--allow-publish",
        action="append",
        default=[],
        metavar="TOPIC",
        help="Allow command.publish to this ROS topic (repeatable). Example: --allow-publish /cmd_vel",
    )
    parser.add_argument(
        "--allow-service",
        action="append",
        default=[],
        metavar="SERVICE",
        help="Allow command.service_call to this ROS service (repeatable). Example: --allow-service /robotscope/demo/trigger",
    )
    parser.add_argument(
        "--allow-set-bool",
        action="append",
        default=[],
        metavar="SERVICE",
        help=(
            "Allow command.service_call SetBool data to this ROS service (repeatable). "
            "Example: --allow-set-bool /robotscope/demo/set_bool"
        ),
    )
    parser.add_argument(
        "--allow-action",
        action="append",
        default=[],
        metavar="ACTION",
        help="Allow command.action_send_goal to this ROS action (repeatable). Example: --allow-action /robotscope/demo/fibonacci",
    )
    return parser.parse_args()


def resolve_topics(args: argparse.Namespace) -> list[str]:
    if args.topics:
        return [topic.strip() for topic in args.topics.split(",") if topic.strip()]
    if args.discover:
        return []
    return PROFILE_TOPICS[args.profile]


def main() -> None:
    args = parse_args()
    rclpy.init()
    topics = resolve_topics(args)
    service_allowlist = list(dict.fromkeys([*args.allow_service, *args.allow_set_bool]))
    service_type_map = {service: "std_srvs/srv/SetBool" for service in args.allow_set_bool}
    gateway_holder: dict[str, LiveGateway] = {}

    def on_data(channel, log_time_ns, publish_time_ns, data):
        gateway = gateway_holder.get("gateway")
        if gateway is not None:
            gateway.publish(channel, log_time_ns, publish_time_ns, data)

    bridge = LiveBridge(
        topics,
        on_data,
        discover=args.discover,
        max_topics=args.max_topics,
        topic_retry_sec=args.topic_retry_sec,
        publish_allowlist=args.allow_publish,
        service_allowlist=service_allowlist,
        service_type_map=service_type_map,
        action_allowlist=args.allow_action,
    )
    gateway = LiveGateway(
        args.host,
        args.port,
        bridge,
        publish_allowlist=args.allow_publish,
        service_allowlist=service_allowlist,
        service_type_map=service_type_map,
        action_allowlist=args.allow_action,
    )
    gateway_holder["gateway"] = gateway

    executor = spin_bridge(bridge)
    spin_thread = threading.Thread(target=executor.spin, daemon=True)
    spin_thread.start()

    try:
        asyncio.run(gateway.run())
    except KeyboardInterrupt:
        pass
    finally:
        bridge.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
