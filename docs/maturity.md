# Development maturity and validation

## Scope of the estimate

The working target is **approximately 70% maturity for middleware-independent
robot observability: Python/JSON and ROS 2 input, recording/playback, shared
frames/3D, numeric telemetry, images and domain debugging**. This is a
subjective engineering estimate, not a standardized score or a claim that
RobotScope implements 70% of RViz2, Rerun or Foxglove. Those projects provide
reference expectations for reliability, reproducibility and everyday debugging.
Their broader renderer, SDK, plugin and operational ecosystems are outside this
comparison. The earlier approximately 40% estimate was also qualitative. After
expanding the objective beyond ROS 2, the estimate was reduced to approximately
50% because a tested non-ROS input path was missing. This change supplies that
path and its cross-language/browser evidence; the 70% estimate now covers this
broader development baseline, rather than just the ROS-focused demo.

A usable demo alone is below this target. The following development gates make
the 70% assessment reviewable:

| Gate | Evidence in this change |
| --- | --- |
| Reproducible development | Locked npm installation, workspace builds, type checks, plugin validation; CI definitions for Node 20/22/24 |
| Independent input | Installable Python SDK, standard JSON MCAP, no ROS imports/runtime, typed and structured telemetry, explicit semantic metadata, schema-less JSON inspection |
| Shared visualization | Native pose/points/trajectory transformations, frame provenance, scalar/pose plots, exact image pixels in development and bundled browsers |
| Offline recordings | Generated MCAP and rosbag2 ingestion, damaged-input rejection, validated sidecar reuse, zstd/lz4 decompression in Node and bundled browsers |
| Live lifecycle | Real WebSocket handshake/timeout/abort/disconnect tests, one StrictMode auto-connection, explicit reconnect, obsolete source-load cancellation |
| Capture and reopen | Serialized MCAP writes and drained finalization, mixed ROS/JSON encoding and metadata preservation, both replay inputs downloaded and reloaded in the browser |
| Correct time queries | Sub-millisecond cache regression, sorted out-of-order live data, retained full offline TF history, no future-transform fallback |
| ROS integration | Actual Humble rclpy/DDS discovery after connection, CDR data delivery, default publish/service/action denials in an isolated container |
| Debugging workflow | Browser playback and report export with facts and inference separated; generated Autoware incident and showcase |
| Bounded live data and baseline load | 100,000 live messages retain 512 raw messages/index entries per topic; approximately 98 MB CDR and 130 MB JSON offline synthetic workloads complete with correctness assertions |

These gates establish a tested development baseline. They do not replace field
use by multiple independent users. The remaining work toward 80% includes real
robot/Autoware recordings, multi-GB and long-running sensor workloads, supported
QoS/type matrices, Jazzy integration, Firefox/WebKit, device/simulator adapters,
streaming Python transport, additional binary codecs, failure recovery under
network disruption, release packaging and user feedback. A full-platform OSS
comparison requires a separate assessment; this scoped percentage must not be
presented as that score.

## Locally executed checks (2026-10-11)

| Check | Result |
| --- | --- |
| Workspace build, typecheck, five plugin manifests | Passed |
| Node 24.19.0 unit/integration tests | 45 core + 6 viewer passed, no skips |
| Node 20.20.2 unit/integration tests | Same 51 passed, no skips |
| Python SDK / Python 3.12 | 6 tests passed, plus Python-written MCAP queried by TypeScript with matching values, image bytes and transformed geometry |
| Chromium browser workflows | 11 development + 4 production tests passed, including non-ROS offline and live replay/record/reopen |
| Native ROS Humble / Python 3.10 / websockets 12.0 | Previous ROS milestone: 1 integration test passed using actual DDS and CDR; ROS agent unchanged |
| Synthetic ingest benchmarks | CDR and JSON correctness assertions and all local 15-second smoke budgets passed |

GitHub Actions workflows were added but have **not** run remotely. Node 22 is
configured in CI but was not executed locally. Python SDK CI includes 3.10 and
3.12; SDK tests were executed locally on 3.12 with mcap 1.3.1 and 1.5.0. The native test is a local ROS
publisher in a container with external networking disabled, not a robot or a
complete Autoware deployment. Browser tests use Chromium with software WebGL.
The LZ4 fixture exercises valid literal-only frames; broader compression variants
and bz2 are not covered by the recorded browser checks. Bundle-size and
externalized Node-module warnings remain; the bundled browser workflows pass.

## Repeat the checks

From the repository root with Node >=20:

```bash
npm ci
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -c sdk/python/constraints.txt ./sdk/python
npm run build
npm run typecheck
npm test
npm run validate:plugins
npm run test:python
npx playwright install --with-deps chromium
npm run test:e2e
npm run benchmark:ingest
npm run benchmark:json
npm run test:ros2 # optional Docker-based native ROS integration
```

In the prepared cloud instance, use `CHROME_PATH=/usr/bin/chromium npm run
test:e2e` to reuse the available browser. Playwright starts the viewer, replay
agent and production preview itself. Existing services may be reused locally;
CI uses fresh services. Failure traces are retained in ignored `test-results/`.
Native integration does not require ROS installed on the host.

If Docker builds behind a TLS-inspecting proxy cannot trust its CA, supply the
host's trusted **public CA bundle** as an optional BuildKit secret. The bundle
is mounted only for dependency installation, is not copied into the image, and
TLS verification remains enabled:

```bash
docker build --secret id=pip_ca_bundle,src=/etc/ssl/certs/ca-certificates.crt \
  -f tests/ros2/Dockerfile -t robotscope-validation:humble .
docker run --rm --network=none robotscope-validation:humble
```

## Synthetic performance evidence

Single local run, Node 24.19.0, Linux x64, 4 CPU quota, 32 GiB memory limit.
Input: 100,000 Float64 messages plus 100 standard 640x480 RGB images, uncompressed
MCAP, **98,082,353 bytes / 100,100 messages**. Each measured query also asserts
its decoded result. The benchmark is a Node ingestion workload, not browser
rendering performance, a peak-memory measurement or a production SLA.

| Operation | Time |
| --- | ---: |
| Generate input | 3,319 ms |
| Open and index MCAP | 330 ms |
| Reopen with sidecar | 87 ms |
| 100 deterministic time queries (total) | 503 ms |
| Numeric series, up to 2,000 points | 340 ms |
| Ingest 100,000 live messages | 359 ms |
| Insert/query 100,000 offline TF samples | 76 ms |

Live raw payload and topic index retention: 512 messages for the tested topic.
The final process RSS was approximately 562 MiB, including input generation,
multiple open readers and retained test buffers. This is not evidence of bounded
memory for arbitrarily large recordings: file loading, offline TF history and
live recording still use in-memory buffers. Recordings should be evaluated on
representative real data before making larger-scale claims.

The non-ROS JSON workload uses 100,000 scalar samples and 100 tightly packed
640x480 RGB images, **130,478,051 bytes / 100,100 messages**, on Node 24.19.0.
The image bytes are encoded as base64 inside JSON; the additional size compared
with CDR is expected. Generation took 9,306 ms, open/index 373 ms, 100 time queries
396 ms total, a 2,000-point numeric series 337 ms and one full image decode/byte
comparison 26 ms. Final RSS was approximately 551 MiB, including generated
buffers; this also is not a peak or browser memory claim. The script is
`scripts/benchmark-json-ingest.mjs` and all measured operations assert correctness.
