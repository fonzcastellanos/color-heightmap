const vec3 = {
  subtract: function (a, b) {
    const res = new Array(3);
    for (let i = 0; i < 3; i++) {
      res[i] = a[i] - b[i];
    }
    return res;
  },
  dot: function (a, b) {
    let res = 0;
    for (let i = 0; i < 3; i++) {
      res += a[i] * b[i];
    }
    return res;
  },
  magnitude: function (v) {
    return Math.sqrt(this.dot(v, v));
  },
  normalize: function (v) {
    const magn = this.magnitude(v);

    if (magn < 0.00001) {
      for (let i = 0; i < 3; i++) {
        v[i] = 0;
      }
      return;
    }

    for (let i = 0; i < 3; i++) {
      v[i] /= magn;
    }
  },
  cross: function (a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  },
  squaredDistance: function (a, b) {
    const diff = this.subtract(a, b);
    return this.dot(diff, diff);
  },
  midpoint: function (a, b) {
    const res = new Array(3);
    for (let i = 0; i < 3; i++) {
      res[i] = (a[i] + b[i]) / 2.0;
    }
    return res;
  }
}