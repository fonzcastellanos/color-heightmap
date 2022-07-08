"use strict";

const VERTEX_SHADER_SRC = `
attribute vec3 a_position;
attribute vec4 a_color;

uniform mat4 u_model_view;
uniform mat4 u_projection;

varying lowp vec4 v_color;

void main(void) {
  gl_Position = u_projection * u_model_view * vec4(a_position, 1.0);
  v_color = a_color;
  gl_PointSize = 2.0;
}
`;

const FRAGMENT_SHADER_SRC = `
varying lowp vec4 v_color;

void main(void) {
  gl_FragColor = v_color;
}
`;

/**
 * High-level pipeline objects
 */
var mvMatrix;

/**
 * Bounding sphere
 */
var radius;
var center;

function glPrimitive(gl, selectedPrimitive) {
  switch (selectedPrimitive) {
    case "triangle-strips":
      return gl.TRIANGLE_STRIP;
    case "triangles":
      return gl.TRIANGLES;
    case "lines":
      return gl.LINES;
    case "points":
      return gl.POINTS;
  }
  return null;
}

function main() {
  const canvas = document.getElementById("gl-canvas");
  if (canvas == null) {
    console.error("Failed to get canvas with id gl-canvas.");
    return;
  }

  const gl = canvas.getContext("webgl");
  if (gl == null) {
    console.error("Failed to to initialize WebGL. Executing browser may not support it.");
    return;
  }

  const extOesElementIndexUint = gl.getExtension("OES_element_index_uint");

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  const program = glutil.createProgramFromShaderSources(gl, VERTEX_SHADER_SRC, FRAGMENT_SHADER_SRC);

  gl.useProgram(program);

  const positionBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();

  const positionAttribLoc = gl.getAttribLocation(program, "a_position");
  const colorAttribLoc = gl.getAttribLocation(program, "a_color");

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(positionAttribLoc, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(positionAttribLoc);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.vertexAttribPointer(colorAttribLoc, 4, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(colorAttribLoc);

  const projectionUniformLoc = gl.getUniformLocation(program, "u_projection");
  const modelViewUniformLoc = gl.getUniformLocation(program, "u_model_view");

  let positions = null;
  let colors = null;
  let indices = null;
  let imgData = null;

  const camController = new CameraController(canvas);

  const primSelect = document.getElementById("geometric-primitive-select");
  const colorChSelect = document.getElementById("color-channel-select");

  let selectedPrimitive = primSelect.selectedOptions[0].value;
  let selectedColorChannel = colorChSelect.selectedOptions[0].value;

  camController.onchange = () => {
    requestAnimationFrame(() => {
      draw(gl, extOesElementIndexUint, projectionUniformLoc, modelViewUniformLoc, indexBuffer, camController, selectedPrimitive, indices);
    })
  };

  primSelect.addEventListener("change", (evt) => {
    selectedPrimitive = evt.target.selectedOptions[0].value;
    if (imgData) {
      indices = createIndices(imgData.width, imgData.height, selectedPrimitive, extOesElementIndexUint);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);

      requestAnimationFrame(() => {
        draw(gl, extOesElementIndexUint, projectionUniformLoc, modelViewUniformLoc, indexBuffer, camController, selectedPrimitive, indices);
      });
    }
  });

  colorChSelect.addEventListener("change", (evt) => {
    selectedColorChannel = evt.target.selectedOptions[0].value;

    if (imgData) {
      positions = createPositions(imgData.width, imgData.height, colors, selectedColorChannel);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      // gl.bufferData(gl.ARRAY_BUFFER, null, gl.DYNAMIC_DRAW);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

      requestAnimationFrame(() => {
        draw(gl, extOesElementIndexUint, projectionUniformLoc, modelViewUniformLoc, indexBuffer, camController, selectedPrimitive, indices);
      });
    }

  });

  const img = new Image();
  img.addEventListener("load", (evt) => {
    imgData = getImgData(evt.target);
    colors = createColors(imgData);

    positions = createPositions(imgData.width, imgData.height, colors, selectedColorChannel);
    indices = createIndices(imgData.width, imgData.height, selectedPrimitive, extOesElementIndexUint);

    const unflattenedPositions = new Array(positions.length / 3);
    for (let i = 0; i < unflattenedPositions.length; i++) {
      const start = i * 3;
      unflattenedPositions[i] = new Array(3);
      for (let j = 0; j < 3; j++) {
        unflattenedPositions[i][j] = positions[start + j];
      }
    }

    [center, radius] = boundingSphere(unflattenedPositions);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);

    requestAnimationFrame(() => {
      draw(gl, extOesElementIndexUint, projectionUniformLoc, modelViewUniformLoc, indexBuffer, camController, selectedPrimitive, indices);
    });
  });

  const freader = new FileReader();
  freader.addEventListener("load", (evt) => {
    img.src = evt.target.result;
  });

  const finput = document.getElementById("file-input");
  finput.addEventListener("change", (evt) => {
    const f = evt.target.files[0];
    freader.readAsDataURL(f);
  });
}

function createIndices(w, h, selectedPrimitive, extOesElementIndexUint) {
  const arrayConstructor = extOesElementIndexUint ? Uint32Array : Uint16Array;
  switch (selectedPrimitive) {
    case "triangle-strips":
      return createTriStripIndices(w, h, arrayConstructor);
    case "triangles":
      return createTriIndices(w, h, arrayConstructor);
    case "lines":
      return createLineIndices(w, h, arrayConstructor);
    case "points":
      return createPointIndices(w, h, arrayConstructor);
  }
  return null;
}

function getImgData(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  return ctx.getImageData(0, 0, img.width, img.height);
}

function createColors(imgData) {
  const w = imgData.width;
  const h = imgData.height;
  const res = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const offset = (y * w + x) * 4;
      for (let i = 0; i < 4; i++) {
        const j = offset + i;
        res[j] = imgData.data[j] / 255.0;
      }
    }
  }
  return res;
}

function createPositions(w, h, colors, colorChannel) {
  let colorCh = 0;
  switch (colorChannel) {
    case "red":
      colorCh = 0;
      break;
    case "green":
      colorCh = 1;
      break;
    case "blue":
      colorCh = 2;
      break;
    default:
      throw "invalid color channel"
  }

  const res = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      res[i] = x - w / 2.0;
      res[i + 1] = colors[(y * w + x) * 4 + colorCh] * 255.0;
      res[i + 2] = -(y - h / 2.0);
    }
  }
  return res;
}

function createTriStripIndices(w, h, arrayConstructor) {
  const res = new arrayConstructor(w * (h - 1) * 2 + 2 * (h - 1));
  let i = 0;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const botLeft = y * w + x;
      const topLeft = (y + 1) * w + x;

      res[i] = botLeft;
      i++;
      res[i] = topLeft;
      i++;

      if (x === (w - 1)) {
        res[i] = topLeft;
        i++;
        res[i] = (y + 1) * w;
        i++;
      }
    }
  }
  return res
}

function createTriIndices(w, h, arrayConstructor) {
  const res = new arrayConstructor((w - 1) * (h - 1) * 6);
  let i = 0;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const botLeft = x + y * w;
      const botRight = (x + 1) + y * w;
      const topLeft = x + (y + 1) * w;
      const topRight = (x + 1) + (y + 1) * w;

      const indices = [
        topLeft,
        topRight,
        botLeft,
        topRight,
        botRight,
        botLeft
      ];

      for (const index of indices) {
        res[i] = index;
        i++;
      }
    }
  }
  return res;
}

function createLineIndices(w, h, arrayConstructor) {
  const res = new arrayConstructor((w - 1) * (h - 1) * 10);
  let i = 0;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const botLeft = x + y * w;
      const botRight = (x + 1) + y * w;
      const topLeft = x + (y + 1) * w;
      const topRight = (x + 1) + (y + 1) * w;

      const indices = [
        topLeft,
        topRight,
        topRight,
        botLeft,
        botLeft,
        topLeft,
        topRight,
        botRight,
        botRight,
        botLeft
      ];

      for (const index of indices) {
        res[i] = index;
        i++;
      }
    }
  }
  return res;
}

function createPointIndices(w, h, arrayConstructor) {
  const res = new arrayConstructor(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      res[y * w + x] = y * w + x;
    }
  }
  return res;
}

function boundingSphere(points) {
  let xmin = points[0];
  let xmax = points[0];
  let ymin = points[0];
  let ymax = points[0];
  let zmin = points[0];
  let zmax = points[0];

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p[0] < xmin[0]) {
      xmin = p;
    }
    if (p[0] > xmax[0]) {
      xmax = p;
    }
    if (p[1] < ymin[1]) {
      ymin = p;
    }
    if (p[1] > ymax[1]) {
      ymax = p;
    }
    if (p[2] < zmin[2]) {
      zmin = p;
    }
    if (p[2] > zmax[2]) {
      zmax = p;
    }
  }

  const xspan = vec3.squaredDistance(xmax, xmin);
  const yspan = vec3.squaredDistance(ymax, ymin);
  const zspan = vec3.squaredDistance(zmax, zmin);

  const pointPairMaxSpan = [xmin, xmax];
  let maxSpan = xspan;
  if (yspan > maxSpan) {
    maxSpan = yspan;
    pointPairMaxSpan[0] = ymin;
    pointPairMaxSpan[1] = ymax;
  }
  if (zspan > maxSpan) {
    maxSpan = zspan;
    pointPairMaxSpan[0] = zmin;
    pointPairMaxSpan[1] = zmax;
  }

  const center = midpoint(pointPairMaxSpan[0], pointPairMaxSpan[1]);
  let radiusSq = vec3.squaredDistance(pointPairMaxSpan[1], center);
  let radius = Math.sqrt(radiusSq);

  for (const p of points) {
    const distSq = vec3.squaredDistance(p, center);
    if (distSq > radiusSq) {
      const dist = Math.sqrt(distSq);

      radius = (radius + dist) / 2.0;
      radiusSq = radius * radius;

      const offset = dist - radius;
      for (let i = 0; i < 3; i++) {
        center[i] = (radius * center[i] + offset * p[i]) / dist;
      }
    }
  }

  return [center, radius];
}

function midpoint(a, b) {
  const res = new Array(3);
  for (let i = 0; i < 3; i++) {
    res[i] = (a[i] + b[i]) / 2.0;
  }
  return res;
}

function draw(gl, extOesElementIndexUint, projectionUniformLoc, modelViewUniformLoc, indexBuffer, camController, selectedPrimitive, indices) {
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const perspectiveMatrix = glutil.perspective(45.0, 640.0 / 480.0, 0.01, 10000.0);

  const eyeDist = radius / Math.tan(45.0 / 2.0 * (Math.PI / 180.0));
  const eye = [center[0], center[1], center[2] - eyeDist];
  const modelViewMatrix = lookAt(eye, center, [0, 1, 0]);
  mvMatrix = modelViewMatrix;

  mvRotate(camController.xRot, [1, 0, 0]);
  mvRotate(camController.yRot, [0, 1, 0]);

  gl.uniformMatrix4fv(projectionUniformLoc, false, new Float32Array(perspectiveMatrix));
  gl.uniformMatrix4fv(modelViewUniformLoc, false, new Float32Array(mvMatrix));

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  const glPrim = glPrimitive(gl, selectedPrimitive);
  const glType = extOesElementIndexUint ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  gl.drawElements(glPrim, indices.length, glType, 0);
}

function lookAt(eye, at, up) {
  const n = vec3.subtract(eye, at);
  vec3.normalize(n);

  const u = vec3.cross(up, n)
  vec3.normalize(u);

  const v = vec3.cross(n, u);
  vec3.normalize(v);

  const rotation = [
    u[0], v[0], n[0], 0,
    u[1], v[1], n[1], 0,
    u[2], v[2], n[2], 0,
    0, 0, 0, 1
  ];

  const translation = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    -eye[0], -eye[1], -eye[2], 1
  ];

  return matrix4.multiply(rotation, translation);
}

function multMatrix(m) {
  mvMatrix = matrix4.multiply(mvMatrix, m.flatten());
}

function mvRotate(angle, v) {
  var inRadians = angle * Math.PI / 180.0;

  var m = Matrix.Rotation(inRadians, $V([v[0], v[1], v[2]])).ensure4x4();
  multMatrix(m);
}