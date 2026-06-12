#!/usr/bin/env bash
# Convert rosbag2 SQLite storage to MCAP (requires sourced ROS 2 distro).
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 input.db3 [output.mcap]" >&2
  exit 1
fi

INPUT="$1"
OUTPUT="${2:-${INPUT%.*}.mcap}"

if ! command -v ros2 >/dev/null 2>&1; then
  echo "ros2 CLI not found — source your ROS 2 distro first." >&2
  exit 1
fi

ros2 bag convert -i "$INPUT" -o "$OUTPUT"
echo "Wrote $OUTPUT"
