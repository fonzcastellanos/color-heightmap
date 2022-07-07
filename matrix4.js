const matrix4 = {
  identity: function () {
    return [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];
  },
  multiply: function (a, b) {
    const res = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        for (let k = 0; k < 4; k++) {
          res[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
        }
      }
    }
    return res;
  }
};