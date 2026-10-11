"""Deterministic simulator-style recording: no ROS installation or runtime."""
import argparse
from pathlib import Path
from robotscope import Recorder


def record(path):
    with Recorder(path) as log:
        log.log_transform("/system/frames/camera", "map", "camera", [0, 0, 1], time_ns=0, static=True)
        for i in range(20):
            time = i * 100_000_000
            log.log_scalar("/robot/demo/speed", i / 10, time_ns=time, unit="m/s")
            log.log_pose("/robot/demo/pose", [i / 10, 0, 0], time_ns=time)
            pixels = bytes([255, i * 10, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255])
            log.log_image("/robot/demo/camera", pixels, width=2, height=2, time_ns=time)
            log.log_points("/robot/demo/points", [[0, 0, 0], [1, 0, 0], [0, 1, 0]], time_ns=time, frame="camera")
            log.log_trajectory("/robot/demo/trajectory", [[i / 10, 0, 0], [i / 10 + 1, 0, 0]], time_ns=time)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    record(args.output)
    print(f"Wrote {args.output}: 6 channels / 101 messages (JSON MCAP, no ROS)")
