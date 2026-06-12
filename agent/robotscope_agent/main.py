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
    )
    gateway = LiveGateway(args.host, args.port, bridge)
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
