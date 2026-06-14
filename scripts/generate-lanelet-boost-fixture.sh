#!/usr/bin/env bash
# Regenerate lanelet2_io Boost binary fixture used by scripts/test-lanelet-boost.mjs
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/packages/robotscope-core/fixtures/lanelet-boost-1llt.bin"
TMP="/tmp/lanelet_boost_fixture.cpp"

cat > "$TMP" <<'EOF'
#include <lanelet2_core/LaneletMap.h>
#include <boost/archive/binary_oarchive.hpp>
#include <fstream>
#include <iostream>
#include <sstream>

using namespace lanelet;

int main() {
  Point3d p1(1, BasicPoint3d(0, 0, 0));
  Point3d p2(2, BasicPoint3d(10, 0, 0));
  Point3d p3(3, BasicPoint3d(10, 5, 0));
  Point3d p4(4, BasicPoint3d(0, 5, 0));
  LineString3d left(5, {p1, p2});
  LineString3d right(6, {p4, p3});
  Lanelet ll(7, left, right);
  LaneletMap map;
  map.add(ll);

  std::stringstream ss;
  boost::archive::binary_oarchive oa(ss);
  oa << map;
  Id idCounter = utils::getId();
  oa << idCounter;

  std::ofstream out("/tmp/lanelet_boost_fixture.bin", std::ios::binary);
  out.write(ss.str().data(), static_cast<std::streamsize>(ss.str().size()));
  std::cout << ss.str().size() << std::endl;
}
EOF

g++ -std=c++17 "$TMP" -o /tmp/lanelet_boost_fixture \
  -I/opt/ros/jazzy/include -I/usr/include/eigen3 \
  -L/opt/ros/jazzy/lib/x86_64-linux-gnu -llanelet2_core -llanelet2_io -lboost_serialization

/tmp/lanelet_boost_fixture
cp /tmp/lanelet_boost_fixture.bin "$OUT"
echo "Wrote $OUT"
