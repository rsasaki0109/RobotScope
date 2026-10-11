"""Native integration: actual rclpy/DDS, CDR and the WebSocket gateway.

Run in an isolated ROS domain with no robot attached. No mocked ROS modules.
"""
import asyncio
import base64
import json
import threading
import unittest

import rclpy
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from rclpy.serialization import deserialize_message
from std_msgs.msg import Float64
import websockets

from robotscope_agent.bridge import LiveBridge
from robotscope_agent.gateway import LiveGateway


class NativeBridgeTest(unittest.TestCase):
    def test_delayed_discovery_cdr_stream_and_readonly_gateways(self):
        asyncio.run(self.check_stream())

    async def check_stream(self):
        rclpy.init()
        node = Node("robotscope_validation_publisher")
        holder = {}

        def on_data(channel, log_time, publish_time, payload):
            holder["gateway"].publish(channel, log_time, publish_time, payload)

        topic = "/robotscope/validation/score"
        bridge = LiveBridge([topic], on_data, topic_retry_sec=0.1)
        gateway = LiveGateway("127.0.0.1", 0, bridge)
        holder["gateway"] = gateway
        gateway._loop = asyncio.get_running_loop()
        gateway.attach_bridge_callbacks()
        executor = MultiThreadedExecutor(num_threads=2)
        executor.add_node(bridge)
        executor.add_node(node)
        thread = threading.Thread(target=executor.spin, daemon=True)
        thread.start()
        try:
            async with websockets.serve(gateway._handle_client, "127.0.0.1", 0) as server:
                port = server.sockets[0].getsockname()[1]
                async with websockets.connect(f"ws://127.0.0.1:{port}") as client:
                    session = None
                    while session is None:
                        payload = json.loads(await asyncio.wait_for(client.recv(), 10))
                        if payload["type"] == "session":
                            session = payload
                    self.assertEqual(session["protocol"], "robotscope.live.v0.1")
                    self.assertNotIn("capabilities", session)
                    self.assertEqual(session["topics"], [])
                    publisher = node.create_publisher(Float64, topic, 10)
                    channel = None
                    while channel is None:
                        payload = json.loads(await asyncio.wait_for(client.recv(), 15))
                        if payload["type"] == "channel":
                            channel = payload["channel"]
                    self.assertEqual(channel["topic"], topic)
                    self.assertEqual(channel["schema"], "std_msgs/msg/Float64")
                    self.assertIn("float64 data", channel["definition"])
                    timer = node.create_timer(0.05, lambda: publisher.publish(Float64(data=1.25)))
                    data = None
                    while data is None:
                        payload = json.loads(await asyncio.wait_for(client.recv(), 15))
                        if payload["type"] == "message":
                            data = payload
                    decoded = deserialize_message(base64.b64decode(data["data_b64"]), Float64)
                    self.assertEqual(decoded.data, 1.25)
                    self.assertEqual(data["channel_id"], channel["id"])
                    self.assertGreater(data["log_time_ns"], 0)
                    for command, destination, expected in [
                        ("command.publish", {"topic": topic, "schema": "std_msgs/msg/Float64", "data_b64": data["data_b64"]}, "command.publish_result"),
                        ("command.service_call", {"service": "/robotscope/validation/trigger", "schema": "std_srvs/srv/Trigger", "trigger": True}, "command.service_result"),
                        ("command.action_send_goal", {"action": "/robotscope/validation/fibonacci", "schema": "example_interfaces/action/Fibonacci", "fibonacci": {"order": 3}}, "command.action_result"),
                    ]:
                        await client.send(json.dumps({"type": command, **destination}))
                        while True:
                            payload = json.loads(await asyncio.wait_for(client.recv(), 10))
                            if payload["type"] == expected:
                                self.assertFalse(payload["ok"])
                                self.assertIn("allowlisted", payload["message"])
                                break
                    node.destroy_timer(timer)
                    print("PASS native ROS discovery after connect, ROS CDR payload, WebSocket delivery and three read-only gateway denials", flush=True)
        finally:
            executor.shutdown(timeout_sec=5)
            thread.join(timeout=5)
            bridge.destroy_node()
            node.destroy_node()
            rclpy.shutdown()


if __name__ == "__main__":
    unittest.main()
