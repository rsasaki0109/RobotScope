import type { SceneOccupancyGrid, SceneSnapshot } from "@robotscope/core";
import type { WebGLRenderer } from "three";
import {
  AmbientLight,
  AxesHelper,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
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

function occupancyTexture(grid: SceneOccupancyGrid): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new CanvasTexture(canvas);
  }

  const image = ctx.createImageData(grid.width, grid.height);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const src = x + y * grid.width;
      const dst = x + (grid.height - 1 - y) * grid.width;
      const offset = dst * 4;
      const sourceOffset = src * 4;
      image.data[offset] = grid.rgba[sourceOffset] ?? 0;
      image.data[offset + 1] = grid.rgba[sourceOffset + 1] ?? 0;
      image.data[offset + 2] = grid.rgba[sourceOffset + 2] ?? 0;
      image.data[offset + 3] = grid.rgba[sourceOffset + 3] ?? 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function addOccupancyGridMesh(group: Group, grid: SceneOccupancyGrid): void {
  const widthM = grid.width * grid.resolution;
  const heightM = grid.height * grid.resolution;
  const geometry = new PlaneGeometry(widthM, heightM);
  const material = new MeshBasicMaterial({
    map: occupancyTexture(grid),
    transparent: true,
    opacity: 0.92,
    side: DoubleSide,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);

  const rotation = new Quaternion(
    grid.origin.rotation[0],
    grid.origin.rotation[1],
    grid.origin.rotation[2],
    grid.origin.rotation[3],
  );
  const centerOffset = new Vector3(widthM / 2, heightM / 2, 0).applyQuaternion(rotation);
  mesh.position.set(grid.origin.position[0], grid.origin.position[1], grid.origin.position[2]);
  mesh.position.add(centerOffset);
  mesh.setRotationFromQuaternion(rotation);
  mesh.position.z = grid.origin.position[2] - 0.01;
  mesh.userData.topic = grid.topic;
  group.add(mesh);
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
    maps: new Group(),
    tf: new Group(),
    poses: new Group(),
    clouds: new Group(),
    trajectories: new Group(),
  };
  dynamicRoot.add(
    layers.maps,
    layers.tf,
    layers.trajectories,
    layers.poses,
    layers.clouds,
  );

  let followPose: Vector3 | undefined;

  const disposeObject = (object: Object3D) => {
    object.traverse((child) => {
      const mesh = child as Object3D & {
        geometry?: BufferGeometry;
        material?: MeshBasicMaterial | LineBasicMaterial | PointsMaterial | MeshBasicMaterial[];
      };
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => {
          entry.map?.dispose();
          entry.dispose();
        });
      } else if (material) {
        material.map?.dispose();
        material.dispose();
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
    clearGroup(layers.maps);
    clearGroup(layers.tf);
    clearGroup(layers.poses);
    clearGroup(layers.clouds);
    clearGroup(layers.trajectories);
    followPose = undefined;

    if (!snapshot) {
      return;
    }

    snapshot.occupancy_grids.forEach((grid) => {
      addOccupancyGridMesh(layers.maps, grid);
    });

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
      const color = trajectory.archetype === "Lanelet2" ? 0xf5a623 : 0x3dd68c;
      const material = new LineBasicMaterial({ color, linewidth: 2 });
      layers.trajectories.add(new Line(geometry, material));
    });

    if (followPose) {
      controls.target.copy(followPose);
    } else if (snapshot.occupancy_grids.length > 0) {
      const grid = snapshot.occupancy_grids[0]!;
      const widthM = grid.width * grid.resolution;
      const heightM = grid.height * grid.resolution;
      controls.target.set(
        grid.origin.position[0] + widthM / 2,
        grid.origin.position[1] + heightM / 2,
        grid.origin.position[2],
      );
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
      clearGroup(layers.maps);
      clearGroup(layers.tf);
      clearGroup(layers.poses);
      clearGroup(layers.clouds);
      clearGroup(layers.trajectories);
      controls.dispose();
      scene.clear();
    },
  };
}
