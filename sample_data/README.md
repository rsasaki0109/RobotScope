# Sample MCAP recordings

Large MCAP files are gitignored. Generate a local TF demo:

```bash
node RobotScope/scripts/create-tf-demo.mjs
```

Opens as `sample_data/demo-tf.mcap` — map → odom → base_link with 2s of motion.

For Autoware/real robot data, record with:

```bash
ros2 bag record -s mcap --all
```

Or convert rosbag2 SQLite:

```bash
ros2 bag convert -i input.db3 -o output.mcap
```
