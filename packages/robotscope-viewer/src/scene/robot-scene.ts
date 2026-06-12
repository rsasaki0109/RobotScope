import type { SceneSnapshot } from "@robotscope/core";
import type { WebGLRenderer } from "three";
import {
  AmbientLight,
  AxesHelper,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Quaternion,
  Scene,
  Vector3,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface RobotSceneController {
  resize: (width: number, height: number) => void;
  updateScene: (snapshot: SceneSnapshot | null) => void;
  render: () => void;
  dispose: () => void;
}

export function createRobotSceneController(
  canvas: HTMLCanvasElement,
  renderer: WebGLRenderer,
): RobotSceneController {
  const scene = new Scene();
  scene.background = new Color(0x0f1117);

  const camera = new PerspectiveCamera(55, 1, 0.05, 500);
  camera.position.set(8, 6, 8);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  scene.add(new AmbientLight(0xffffff, 0.55));
  const keyLight = new DirectionalLight(0xffffff, 0.85);
  keyLight.position.set(5, 10, 7);
  scene.add(keyLight);
  scene.add(new GridHelper(20, 20, 0x3a4256, 0x252b3a));

  const dynamicRoot = new Group();
  scene.add(dynamicRoot);

  const layers = {
    tf: new Group(),
    poses: new Group(),
    clouds: new Group(),
    trajectories: new Group(),
  };
  dynamicRoot.add(layers.tf, layers.poses, layers.clouds, layers.trajectories);

  let followPose: Vector3 | undefined;

  const disposeObject = (object: Object3D) => {
    object.traverse((child) => {
      const mesh = child as Object3D & {
        geometry?: BufferGeometry;
        material?: LineBasicMaterial | PointsMaterial | LineBasicMaterial[];
      };
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => material.dispose());
      } else {
        mesh.material?.dispose();
      }
    });
  };

  const clearGroup = (group: Group) => {
    while (group.children.length > 0) {
      const child = group.children.pop();
      if (child) {
        disposeObject(child);
      }
    }
  };

  const updateScene = (snapshot: SceneSnapshot | null) => {
    clearGroup(layers.tf);
    clearGroup(layers.poses);
    clearGroup(layers.clouds);
    clearGroup(layers.trajectories);
    followPose = undefined;

    if (!snapshot) {
      return;
    }

    snapshot.tf_frames.forEach((frame) => {
      const axes = new AxesHelper(frame.frame_id === snapshot.fixed_frame ? 1.2 : 0.6);
      axes.position.set(frame.position[0], frame.position[1], frame.position[2]);
      axes.setRotationFromQuaternion(
        new Quaternion(
          frame.rotation[0],
          frame.rotation[1],
          frame.rotation[2],
          frame.rotation[3],
        ),
      );
      axes.userData.frame_id = frame.frame_id;
      layers.tf.add(axes);
    });

    snapshot.poses.forEach((pose, index) => {
      const marker = new AxesHelper(0.9);
      marker.position.set(pose.position[0], pose.position[1], pose.position[2]);
      marker.setRotationFromQuaternion(
        new Quaternion(
          pose.rotation[0],
          pose.rotation[1],
          pose.rotation[2],
          pose.rotation[3],
        ),
      );
      marker.userData.label = pose.label;
      layers.poses.add(marker);

      if (index === snapshot.poses.length - 1) {
        followPose = marker.position.clone();
      }
    });

    snapshot.point_clouds.forEach((cloud) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(cloud.points, 3));
      const material = new PointsMaterial({
        color: 0x7ec8ff,
        size: 0.06,
        sizeAttenuation: true,
      });
      layers.clouds.add(new Points(geometry, material));
    });

    snapshot.trajectories.forEach((trajectory) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(trajectory.points, 3));
      const material = new LineBasicMaterial({ color: 0x3dd68c, linewidth: 2 });
      layers.trajectories.add(new Line(geometry, material));
    });

    if (followPose) {
      controls.target.copy(followPose);
    } else if (snapshot.tf_frames.length > 0) {
      const origin = snapshot.tf_frames.find((f) => f.frame_id === snapshot.fixed_frame);
      if (origin) {
        controls.target.set(origin.position[0], origin.position[1], origin.position[2]);
      }
    }
  };

  return {
    resize(width: number, height: number) {
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    },
    updateScene,
    render() {
      controls.update();
      renderer.render(scene, camera);
    },
    dispose() {
      clearGroup(layers.tf);
      clearGroup(layers.poses);
      clearGroup(layers.clouds);
      clearGroup(layers.trajectories);
      controls.dispose();
      scene.clear();
    },
  };
}
