export const subtract = (a, b) => {
  const res = new Array(3);
  for (let i = 0; i < 3; ++i) {
    res[i] = a[i] - b[i];
  }
  return res;
};

export const dot = (a, b) => {
  let res = 0;
  for (let i = 0; i < 3; ++i) {
    res += a[i] * b[i];
  }
  return res;
};

export const magnitude = (v) => {
  return Math.sqrt(dot(v, v));
};

export const normalize = (v) => {
  const magn = magnitude(v);

  if (magn < 0.00001) {
    for (let i = 0; i < 3; ++i) {
      v[i] = 0;
    }
    return;
  }

  for (let i = 0; i < 3; ++i) {
    v[i] /= magn;
  }
};

export const cross = (a, b) => {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
};

export const squaredDistance = (a, b) => {
  const diff = subtract(a, b);
  return dot(diff, diff);
};

export const midpoint = (a, b) => {
  const res = new Array(3);
  for (let i = 0; i < 3; ++i) {
    res[i] = (a[i] + b[i]) / 2;
  }
  return res;
};