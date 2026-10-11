import json
import sys
import tempfile
import unittest
from pathlib import Path
from mcap.reader import make_reader
from robotscope import Recorder


class RecorderTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "telemetry.mcap"

    def read(self):
        with self.path.open("rb") as stream:
            return list(make_reader(stream).iter_messages())

    def test_standard_mcap_schema_metadata_sequence_and_explicit_times(self):
        with Recorder(self.path) as log:
            log.log_scalar("/robot/test/speed", 1.25, unit="m/s", time_ns=0)
            log.log_scalar("/robot/test/speed", 2.5, unit="m/s", time_ns=500)
        messages = self.read()
        self.assertEqual(len(messages), 2)
        schema, channel, first = messages[0]
        self.assertEqual(schema.encoding, "jsonschema")
        self.assertEqual(channel.message_encoding, "json")
        self.assertEqual(channel.metadata["robotscope.entity_path"], "/robot/test/speed")
        self.assertEqual([item[2].sequence for item in messages], [0, 1])
        self.assertEqual([item[2].log_time for item in messages], [0, 500])
        self.assertEqual(json.loads(first.data), {"value": 1.25, "unit": "m/s"})
        self.assertNotIn("rclpy", sys.modules)

    def test_all_geometry_and_image_payloads_are_json(self):
        with Recorder(self.path) as log:
            log.log_pose("/robot/test/pose", [1, 2, 3], time_ns=1)
            log.log_points("/robot/test/points", [[1, 0, 0]], frame="camera", time_ns=2)
            log.log_trajectory("/robot/test/plan", [[0, 0, 0], [1, 1, 0]], time_ns=3)
            log.log_image("/robot/test/image", bytes([255, 0, 0]), width=1, height=1, time_ns=4)
            log.log_transform("/system/frames/camera", "map", "camera", [0, 0, 1], time_ns=0, static=True)
            log.log_observation("/robot/test/state", {"motor": {"temperature": 42}, "mode": "moving"}, time_ns=5)
        messages = self.read()
        self.assertEqual(len(messages), 6)
        self.assertTrue(all(channel.message_encoding == "json" for _, channel, _ in messages))
        self.assertEqual({schema.name for schema, _, _ in messages}, {f"robotscope.{name}.v1" for name in ["Pose", "PointCloud", "Trajectory", "Image", "Transform", "Observation"]})

    def test_reject_bad_paths_timestamps_and_nonfinite_values_before_writing(self):
        with Recorder(self.path) as log:
            for path in ["relative", "/robot/../escape", "/robot//pose"]:
                with self.assertRaises(ValueError):
                    log.log_scalar(path, 1, time_ns=0)
            for time in [-1, 1.5, True, 2**64]:
                with self.assertRaises(ValueError):
                    log.log_scalar("/robot/test/speed", 1, time_ns=time)
            for value in [float("nan"), float("inf"), True]:
                with self.assertRaises(ValueError):
                    log.log_scalar("/robot/test/speed", value, time_ns=0)
            with self.assertRaises(ValueError):
                log.log_observation("/robot/test/state", {"bad": float("nan")}, time_ns=0)
            log.log_scalar("/robot/test/speed", 1, time_ns=0)
        self.assertEqual(len(self.read()), 1)

    def test_reject_bad_geometry_and_image_size(self):
        with Recorder(self.path) as log:
            with self.assertRaises(ValueError):
                log.log_pose("/robot/test/pose", [1, 2], time_ns=0)
            with self.assertRaises(ValueError):
                log.log_pose("/robot/test/pose", [0, 0, 0], rotation=[0, 0, 0, 0], time_ns=0)
            with self.assertRaises(ValueError):
                log.log_image("/robot/test/image", b"", width=1, height=1, time_ns=0)
            with self.assertRaises(ValueError):
                log.log_transform("/system/frame", "map", "map", [0, 0, 0], time_ns=0)
        self.assertEqual(self.read(), [])

    def test_channel_schema_cannot_change(self):
        with Recorder(self.path) as log:
            log.log_scalar("/robot/test/value", 1, time_ns=0)
            with self.assertRaises(ValueError):
                log.log_pose("/robot/test/value", [0, 0, 0], time_ns=1)
        self.assertEqual(len(self.read()), 1)

    def test_close_is_idempotent_and_exception_keeps_accepted_messages_readable(self):
        with self.assertRaises(RuntimeError):
            with Recorder(self.path) as log:
                log.log_scalar("/robot/test/value", 1, time_ns=0)
                raise RuntimeError("caller failed")
        log.close()
        self.assertEqual(len(self.read()), 1)
        with self.assertRaises(ValueError):
            log.log_scalar("/robot/test/value", 2, time_ns=1)


if __name__ == "__main__":
    unittest.main()
