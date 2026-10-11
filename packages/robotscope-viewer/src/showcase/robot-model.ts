import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from "three";

/** Schematic mobile robot marker; its pose comes from the recording. */
export function createShowcaseRobot() {
  const group = new Group();
  const wheels: Group[] = [];
  const shell = new MeshStandardMaterial({ color: 0xd9e7ed, roughness: 0.4, metalness: 0.3 });
  const dark = new MeshStandardMaterial({ color: 0x182739, roughness: 0.6 });
  const tire = new MeshStandardMaterial({ color: 0x080c12, roughness: 0.85 });
  const hub = new MeshStandardMaterial({ color: 0x9bb0bd, roughness: 0.3, metalness: 0.6 });
  const accent = new MeshStandardMaterial({ color: 0x52dbc5, emissive: 0x1e806c, emissiveIntensity: 0.45 });
  function box(size: [number, number, number], position: [number, number, number], material: MeshStandardMaterial) {
    const mesh = new Mesh(new BoxGeometry(...size), material);
    mesh.position.set(...position);
    group.add(mesh);
  }
  box([1.18, 0.72, 0.25], [0, 0, 0.32], shell);
  box([1.02, 0.66, 0.07], [0, 0, 0.18], dark);
  box([0.64, 0.61, 0.16], [-0.09, 0, 0.525], shell);
  box([0.025, 0.55, 0.09], [0.6, 0, 0.35], accent);
  box([0.5, 0.018, 0.065], [-0.09, -0.365, 0.345], accent);
  const lidar = new Mesh(new CylinderGeometry(0.11, 0.13, 0.1, 20), dark);
  lidar.rotation.x = Math.PI / 2;
  lidar.position.set(-0.15, 0, 0.66);
  group.add(lidar);
  for (const x of [-0.4, 0.4]) {
    for (const y of [-0.43, 0.43]) {
      const wheel = new Group();
      wheel.position.set(x, y, 0.17);
      wheel.add(new Mesh(new CylinderGeometry(0.17, 0.17, 0.16, 20), tire));
      wheel.add(new Mesh(new CylinderGeometry(0.075, 0.075, 0.165, 16), hub));
      for (const angle of [0, Math.PI / 2]) {
        const spoke = new Mesh(new BoxGeometry(0.22, 0.172, 0.028), hub);
        spoke.rotation.y = angle;
        wheel.add(spoke);
      }
      wheels.push(wheel);
      group.add(wheel);
    }
  }
  return { group, wheels };
}
