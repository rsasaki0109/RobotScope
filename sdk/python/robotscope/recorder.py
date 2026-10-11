"""Small offline SDK: explicit times, SI geometry, semantic entities, standard MCAP."""
import base64
import json
import math
import re
from pathlib import Path

from mcap.writer import CompressionType, Writer


def _tuple(values, size, quaternion=False):
    values = list(values)
    if len(values) != size or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in values):
        raise ValueError(f"Expected {size} finite numbers")
    if quaternion and abs(math.sqrt(sum(v * v for v in values)) - 1) >= 0.001:
        raise ValueError("Rotation must be a unit quaternion in xyzw order")
    return values


def _frame(value):
    if not isinstance(value, str) or not value:
        raise ValueError("Frame must be a nonempty string")
    return value


def _schema(kind):
    number = {"type": "number"}
    def vector(n):
        return {"type": "array", "items": number, "minItems": n, "maxItems": n}
    if kind == "Observation":
        return {"$schema": "http://json-schema.org/draft-07/schema#", "title": "robotscope.Observation.v1", "type": "object"}
    props = {
        "Scalar": {"value": number, "unit": {"type": "string"}},
        "Pose": {"frame_id": {"type": "string"}, "position": vector(3), "rotation": vector(4)},
        "Image": {"frame_id": {"type": "string"}, "width": {"type": "integer", "minimum": 1}, "height": {"type": "integer", "minimum": 1}, "encoding": {"enum": ["rgb8", "rgba8", "mono8"]}, "data_b64": {"type": "string", "contentEncoding": "base64"}},
        "PointCloud": {"frame_id": {"type": "string"}, "points": {"type": "array", "items": vector(3)}},
        "Trajectory": {"frame_id": {"type": "string"}, "points": {"type": "array", "items": vector(3)}},
        "Transform": {"parent_frame_id": {"type": "string"}, "child_frame_id": {"type": "string"}, "translation": vector(3), "rotation": vector(4), "is_static": {"type": "boolean"}},
    }[kind]
    return {"$schema": "http://json-schema.org/draft-07/schema#", "title": f"robotscope.{kind}.v1", "type": "object", "properties": props, "required": [key for key in props if key != "unit"]}


class Recorder:
    """Context manager for JSON MCAP logs; timestamps are nonnegative integer ns.

    Coordinates use metres and right-handed frames. Quaternions use xyzw.
    A channel is fixed to one schema/kind. Recording is synchronous and single-threaded.
    """
    def __init__(self, path):
        self._stream = Path(path).open("wb")
        self._writer = Writer(self._stream, compression=CompressionType.NONE)
        try:
            self._writer.start(profile="", library="robotscope-python/0.1.0")
        except BaseException:
            self._stream.close()
            raise
        self._channels = {}
        self._schemas = {}
        self._closed = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    def close(self):
        if self._closed:
            return
        self._closed = True
        try:
            self._writer.finish()
        finally:
            self._stream.close()

    def _write(self, path, kind, archetype, entity_kind, data, time_ns):
        if self._closed:
            raise ValueError("Recorder is closed")
        if not isinstance(path, str) or not re.fullmatch(r"/(?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_.-]+", path) or any(p in (".", "..") for p in path.split("/")):
            raise ValueError("Expected an absolute semantic entity path")
        if isinstance(time_ns, bool) or not isinstance(time_ns, int) or time_ns < 0 or time_ns > 2**64 - 1:
            raise ValueError("time_ns must be a nonnegative uint64 integer")
        # Validate/serialize before mutating the channel table or writing anything.
        payload = json.dumps(data, allow_nan=False, separators=(",", ":")).encode("utf-8")
        previous = self._channels.get(path)
        signature = (kind, archetype, entity_kind)
        if previous and previous[1] != signature:
            raise ValueError("An entity path cannot change schema or kind within a recording")
        if kind not in self._schemas:
            self._schemas[kind] = self._writer.register_schema(f"robotscope.{kind}.v1", "jsonschema", json.dumps(_schema(kind)).encode())
        if previous is None:
            channel = self._writer.register_channel(path, "json", self._schemas[kind], metadata={"robotscope.entity_path": path, "robotscope.archetype": archetype, "robotscope.kind": entity_kind})
            self._channels[path] = (channel, signature, 0)
        channel, signature, sequence = self._channels[path]
        self._writer.add_message(channel, log_time=time_ns, publish_time=time_ns, sequence=sequence, data=payload)
        self._channels[path] = (channel, signature, sequence + 1)

    def log_scalar(self, path, value, *, time_ns, unit=""):
        _tuple([value], 1)
        if not isinstance(unit, str):
            raise ValueError("unit must be a string")
        self._write(path, "Scalar", "Observation", "robot", {"value": value, "unit": unit}, time_ns)

    def log_observation(self, path, values, *, time_ns):
        if not isinstance(values, dict):
            raise ValueError("Observation must be a JSON object")
        self._write(path, "Observation", "Observation", "robot", values, time_ns)

    def log_pose(self, path, position, *, time_ns, frame="map", rotation=(0, 0, 0, 1)):
        self._write(path, "Pose", "Pose", "robot", {"frame_id": _frame(frame), "position": _tuple(position, 3), "rotation": _tuple(rotation, 4, True)}, time_ns)

    def log_image(self, path, data, *, width, height, time_ns, encoding="rgb8", frame="camera"):
        channels = {"rgb8": 3, "rgba8": 4, "mono8": 1}.get(encoding)
        if type(width) is not int or type(height) is not int or width <= 0 or height <= 0 or not channels:
            raise ValueError("Image needs positive integer dimensions and rgb8, rgba8 or mono8 encoding")
        if not isinstance(data, (bytes, bytearray, memoryview)):
            raise ValueError("Image data must be bytes")
        data = bytes(data)
        if len(data) != width * height * channels or len(data) > 64 * 1024 * 1024:
            raise ValueError("Image byte count does not match dimensions or exceeds 64 MiB")
        self._write(path, "Image", "Image", "sensor", {"frame_id": _frame(frame), "width": width, "height": height, "encoding": encoding, "data_b64": base64.b64encode(data).decode("ascii")}, time_ns)

    def log_points(self, path, points, *, time_ns, frame="map"):
        self._write(path, "PointCloud", "PointCloud", "sensor", {"frame_id": _frame(frame), "points": [_tuple(p, 3) for p in points]}, time_ns)

    def log_trajectory(self, path, points, *, time_ns, frame="map"):
        self._write(path, "Trajectory", "Trajectory", "robot", {"frame_id": _frame(frame), "points": [_tuple(p, 3) for p in points]}, time_ns)

    def log_transform(self, path, parent, child, translation, *, time_ns, rotation=(0, 0, 0, 1), static=False):
        if _frame(parent) == _frame(child) or type(static) is not bool:
            raise ValueError("Transform needs different parent/child frames and a boolean static flag")
        self._write(path, "Transform", "TF", "system", {"parent_frame_id": parent, "child_frame_id": child, "translation": _tuple(translation, 3), "rotation": _tuple(rotation, 4, True), "is_static": static}, time_ns)
