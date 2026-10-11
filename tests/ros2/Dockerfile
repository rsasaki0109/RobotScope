FROM ros:humble-ros-base@sha256:860e53793ccf575e5369b5e9a19939de2bfcfb46a299954d06f54f2af54fed19
# ROS is already installed in the pinned image. Only Ubuntu's signed package
# indexes are needed for this additional Python library.
RUN apt-get -o Dir::Etc::sourceparts=- update \
    && apt-get install -y --no-install-recommends python3-pip \
    && rm -rf /var/lib/apt/lists/*
# A proxy CA bundle can be supplied as a BuildKit secret without baking a
# machine-specific trust store into the image. TLS verification stays enabled.
RUN --mount=type=secret,id=pip_ca_bundle \
    if [ -f /run/secrets/pip_ca_bundle ]; then export PIP_CERT=/run/secrets/pip_ca_bundle; fi; \
    python3 -m pip install --no-cache-dir websockets==12.0
ENV ROS_LOCALHOST_ONLY=1 ROS_DOMAIN_ID=187 PYTHONUNBUFFERED=1
WORKDIR /test
COPY agent/ /test/agent/
COPY tests/ros2/ /test/tests/ros2/
ENV PYTHONPATH=/test/agent
CMD ["timeout", "60", "python3", "tests/ros2/test_bridge.py"]
