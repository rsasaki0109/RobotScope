#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROS_SETUP=""

for candidate in /opt/ros/jazzy/setup.bash /opt/ros/humble/setup.bash; do
  if [[ -f "$candidate" ]]; then
    ROS_SETUP="$candidate"
    break
  fi
done

if [[ -z "$ROS_SETUP" ]]; then
  echo "ROS 2 not found. Install Humble or Jazzy, or use npm run demo:live-agent" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ROS_SETUP"

cd "$ROOT/agent"
export PYTHONPATH="$ROOT/agent${PYTHONPATH:+:$PYTHONPATH}"
python3 -m robotscope_agent "$@"
