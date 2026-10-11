# RobotScope Python SDK

Record robot, simulator or experiment telemetry into **standard JSON MCAP**.
No ROS installation, daemon, cloud service, NumPy or proprietary storage is needed.
The SDK is an initial offline recorder, not a published PyPI package or a live
transport client. Python >=3.10 is required.

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install ./sdk/python
python sdk/python/examples/record_demo.py run.mcap
```

Drop `run.mcap` into RobotScope. Use the default layout to inspect images and
entities, and the time-series layout to plot scalar values and pose coordinates.

```python
from robotscope import Recorder

with Recorder("run.mcap") as log:
    # SI geometry, xyzw unit quaternion, explicit nanosecond timestamps.
    log.log_scalar("/robot/arm/temperature", 42.5, unit="degC", time_ns=0)
    log.log_observation("/robot/arm/state", {"mode": "grasp", "confidence": 0.8}, time_ns=0)
    log.log_pose("/robot/arm/tool", [0.1, 0.2, 0.3], frame="map", time_ns=0)
    log.log_transform("/system/frames/camera", "map", "camera", [0, 0, 1], static=True, time_ns=0)
    log.log_points("/robot/arm/points", [[0, 0, 0], [1, 0, 0]], frame="camera", time_ns=0)
    log.log_trajectory("/robot/arm/plan", [[0, 0, 0], [1, 1, 0]], time_ns=0)
    log.log_image("/robot/arm/camera", bytes([255, 0, 0]), width=1, height=1, time_ns=0)
```

Image rows are tightly packed `rgb8`, `rgba8` or `mono8`, up to 64 MiB per image.
Coordinate frames are named explicitly. Geometry uses metres, right-handed
frames and unit quaternions in xyzw order. Match the viewer's fixed frame or
record transforms to it; geometry with a missing transform is omitted with a
warning. Arbitrary observation objects are inspectable; built-in plot candidates
cover scalars and pose coordinates. Custom JSON numeric fields are available
through `getNumericSeries(stream, fieldPath, ...)` in the query API.

Use nonnegative integer timestamps in nanoseconds, including zero for relative
episode time. Streams must share a clock chosen by the caller; the SDK does not
synchronize clocks or fill in timestamps. The viewer currently represents times
as JavaScript numbers, so epoch-scale values lose sub-nanosecond/integer precision
beyond `2**53`. Prefer relative times when that precision matters.

Use absolute semantic paths such as `/robot/arm/tool`. An entity path keeps one
payload schema and kind throughout a recording. Writes are synchronous and
single-threaded; `close()` drains the file's indexes and footer. Context-manager
exit closes the file even if the caller raises, retaining accepted messages.
Large images/point sets and the viewer's file loads remain memory-based; this
release has no multi-GB or long-running recording guarantee.

Validate the installed package and its TypeScript reader from the repository root:

```bash
npm ci
npm run test:python
```

Use `ROBOTSCOPE_PYTHON=/path/to/venv/bin/python` to select a different interpreter.
See [input contract](../../docs/non-ros-input.md) for MCAP channel fields and the
optional WebSocket adapter interface.
