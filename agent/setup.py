from setuptools import setup

package_name = "robotscope_agent"

setup(
    name=package_name,
    version="0.1.0",
    packages=[package_name],
    data_files=[
        ("share/ament_index/resource_index/packages", ["resource/" + package_name]),
        ("share/" + package_name, ["package.xml"]),
    ],
    install_requires=["setuptools", "websockets>=12.0"],
    zip_safe=True,
    maintainer="RobotScope Contributors",
    maintainer_email="dev@robotscope.dev",
    description="RobotScope ROS 2 live bridge for the web viewer",
    license="Apache-2.0",
    entry_points={
        "console_scripts": [
            "agent = robotscope_agent.main:main",
        ],
    },
)
