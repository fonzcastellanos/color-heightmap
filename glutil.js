
var glutil = {
  frustum: function (left, right, bottom, top, near, far) {
    return [
      2 * near / (right - left), 0, 0, 0,
      0, 2 * near / (top - bottom), 0, 0,
      (right + left) / (right - left), (top + bottom) / (top - bottom), -(far + near) / (far - near), -1,
      0, 0, -2 * far * near / (far - near), 0
    ];
  },
  perspective: function (fovy, aspect, near, far) {
    const top = near * Math.tan(fovy * Math.PI / 360.0);
    const bottom = -top;
    const left = bottom * aspect;
    const right = top * aspect;
    return this.frustum(left, right, bottom, top, near, far);
  }
};