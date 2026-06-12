#!/usr/bin/env bash
# Fetch sample MCAP recordings for demos (placeholders — add URLs when published).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/sample_data"

mkdir -p "${OUT}"

cat <<EOF
RobotScope sample data

Large MCAP files are not committed. Options:

1. Record locally:
   ros2 bag record -s mcap --all

2. Convert existing rosbag2:
   ros2 bag convert -i input.db3 -o output.mcap

3. Autoware sample (when available):
   Place autoware demo MCAP in: ${OUT}/autoware/

Then open from the viewer or:
  npm run dev
EOF
