export interface Transform3D {
  translation: [number, number, number];
  rotation: [number, number, number, number];
}

export const IDENTITY_TRANSFORM: Transform3D = {
  translation: [0, 0, 0],
  rotation: [0, 0, 0, 1],
};

export function multiplyQuaternions(
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function rotateVectorByQuaternion(
  q: [number, number, number, number],
  v: [number, number, number],
): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  const [x, y, z] = v;

  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;

  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

export function composeTransforms(
  parentToChild: Transform3D,
  childToSource: Transform3D,
): Transform3D {
  const rotated = rotateVectorByQuaternion(
    parentToChild.rotation,
    childToSource.translation,
  );

  return {
    translation: [
      parentToChild.translation[0] + rotated[0],
      parentToChild.translation[1] + rotated[1],
      parentToChild.translation[2] + rotated[2],
    ],
    rotation: multiplyQuaternions(parentToChild.rotation, childToSource.rotation),
  };
}

export function applyTransform(
  transform: Transform3D,
  point: [number, number, number],
): [number, number, number] {
  const rotated = rotateVectorByQuaternion(transform.rotation, point);
  return [
    transform.translation[0] + rotated[0],
    transform.translation[1] + rotated[1],
    transform.translation[2] + rotated[2],
  ];
}
