"use strict";

var vertexShaderSrc = `
attribute vec3 position;
attribute vec4 color;

uniform mat4 model_view;
uniform mat4 projection;

varying lowp vec4 v_color;

void main(void) {
  gl_Position = projection * model_view * vec4(position, 1.0);
  v_color = color;
  gl_PointSize = 2.0;
}
`;

var fragmentShaderSrc = `
varying lowp vec4 v_color;

void main(void) {
  gl_FragColor = v_color;
}
`;

var gl = null;

/**
 * High-level pipeline objects
 */
var mvMatrix;
var program;
var vertexPositionAttribute;
var vertexColorAttribute;
var perspectiveMatrix;

/**
 * Geometric data objects
 */
var vertices = [];
var colors = [];
var indicesTriStrip = [];
var indicesTri = [];
var indicesLine = [];
var indicesPoint = [];

/**
 * Buffers
 */
var vertexBuffer;
var colorBuffer;
var indexBuffer;

/**
 * Image width & height
 */
var imgWidth;
var imgHeight;

/**
 * Primitive options
 */
const NUM_PRIM = 4;
const TRIANGLE_STRIPS = 0;
const TRIANGLES = 1;
const LINES = 2;
const POINTS = 3;
var currPrimitive;

/**
 * Channel options
 */
const NUM_CH = 3;
const RED_CH = 0;
const GREEN_CH = 1;
const BLUE_CH = 2;
var currChannel;

/**
 * Camera
 */
var camController;

/**
 * Bounding sphere
 */
var radius;
var center;

/**
 * 32-bit uint index flag
 */
var uintForIndices;

function main() {
  const canvas = document.getElementById("gl-canvas");
  if (canvas == null) {
    console.error("Failed to get canvas with id gl-canvas.");
    return;
  }

  gl = canvas.getContext("webgl");
  if (gl == null) {
    alert("Unable to initialize WebGL. Your browser may not support it.");
    return;
  }

  uintForIndices = gl.getExtension("OES_element_index_uint"); // attempt to enable 32-bit uint indices
  if (uintForIndices == null) {
    alert("Unsuccessful at enabling the extension for 32-bit uint indices. Defaulting to 16-bit uint indices.");
  }

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);

  initShaders();
  initBuffers();

  camController = new CameraController(canvas);
  camController.onchange = function (xRot, yRot) {
    requestAnimationFrame(drawScene);
  };

  const geomPrimMenu = document.getElementById("geom-prim-menu");
  geomPrimMenu.onchange = (evt) => {
    currPrimitive = evt.target.selectedIndex - 1;
    bufferIndices();
    requestAnimationFrame(drawScene);
  };

  const colorChMenu = document.getElementById("color-ch-menu");
  colorChMenu.onchange = (evt) => {
    currChannel = evt.target.selectedIndex - 1;

    vertices = createVertices(imageWidth, imageHeight, colors);

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, null, gl.DYNAMIC_DRAW);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);

    requestAnimationFrame(drawScene);
  };

  const img = new Image();
  img.addEventListener("load", initHeightfield);

  const freader = new FileReader();
  freader.addEventListener("load", (evt) => {
    img.src = evt.target.result;
  });

  const finput = document.getElementById("file-input");
  finput.addEventListener("change", (evt) => {
    const f = evt.target.files[0];
    freader.readAsDataURL(f);

    if (geomPrimMenu.selectedIndex == 0) {
      currPrimitive = TRIANGLE_STRIPS;
      geomPrimMenu.selectedIndex = TRIANGLE_STRIPS + 1;
    }
    if (colorChMenu.selectedIndex == 0) {
      currChannel = RED_CH;
      colorChMenu.selectedIndex = RED_CH + 1;
    }
  });
}

function initShaders() {
  const vs = compileShader(gl, vertexShaderSrc, gl.VERTEX_SHADER);
  const fs = compileShader(gl, fragmentShaderSrc, gl.FRAGMENT_SHADER);

  program = createProgram(gl, vs, fs);

  gl.useProgram(program);

  vertexPositionAttribute = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(vertexPositionAttribute);

  vertexColorAttribute = gl.getAttribLocation(program, "color");
  gl.enableVertexAttribArray(vertexColorAttribute);
}

function compileShader(gl, shaderSrc, shaderType) {
  const shader = gl.createShader(shaderType);

  gl.shaderSource(shader, shaderSrc);

  gl.compileShader(shader);

  return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
  const prog = gl.createProgram();
  gl.attachShader(prog, vertexShader);
  gl.attachShader(prog, fragmentShader);
  gl.linkProgram(prog);

  const ok = gl.getProgramParameter(prog, gl.LINK_STATUS);
  if (ok) {
    return prog
  }

  const errMsg = `Link failed: ${gl.getProgramInfoLog(prog)}\n` +
    `Vertex shader info log: ${gl.getShaderInfoLog(vertexShader)}\n` +
    `Fragment shader info log: ${gl.getShaderInfoLog(fragmentShader)}\n`;

  gl.deleteProgram(prog);

  throw errMsg;
}

function getImgData(img) {
  const w = img.width;
  const h = img.height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  return ctx.getImageData(0, 0, w, h);
}

function initHeightfield() {
  var width = this.width;
  var height = this.height;
  imgWidth = width;
  imgHeight = height;

  const imgData = getImgData(this);

  clearBufferData();

  colors = new Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let base = (y * width + x) * 4;
      for (let offset = 0; offset < 4; offset++) {
        colors[base + offset] = imgData.data[base + offset] / 255.0;
      }
    }
  }

  vertices = createVertices(width, height, colors);

  ritterBoundingSphere(vertices);

  indicesTriStrip = createTriStripIndices(width, height);
  indicesTri = createTriIndices(width, height);
  indicesLine = createLineIndices(width, height);
  indicesPoint = createPointIndices(width, height);

  bufferData(vertices, colors);

  requestAnimationFrame(drawScene);
}

function createVertices(w, h, colors) {
  const res = new Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      res[i] = x - w / 2.0;
      res[i + 1] = colors[(y * w + x) * 4 + currChannel] * 255.0;
      res[i + 2] = -(y - h / 2.0);
    }
  }
  return res;
}

function createTriStripIndices(w, h) {
  let res = [];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      let bL = x + y * w;
      let tL = x + (y + 1) * w;

      res.push(bL);
      res.push(tL);

      if (x === (w - 1)) {
        res.push(tL);
        res.push((y + 1) * w);
      }
    }
  }
  return res
}

function createTriIndices(w, h) {
  let res = [];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const botLeft = x + y * w;
      const botRight = (x + 1) + y * w;
      const topLeft = x + (y + 1) * w;
      const topRight = (x + 1) + (y + 1) * w;

      res.push(topLeft);
      res.push(topRight);
      res.push(botLeft);
      res.push(topRight);
      res.push(botRight);
      res.push(botLeft);
    }
  }
  return res;
}

function createLineIndices(w, h) {
  let res = [];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const botLeft = x + y * w;
      const botRight = (x + 1) + y * w;
      const topLeft = x + (y + 1) * w;
      const topRight = (x + 1) + (y + 1) * w;

      res.push(topLeft);
      res.push(topRight);

      res.push(topRight);
      res.push(botLeft);

      res.push(botLeft);
      res.push(topLeft);

      res.push(topRight);
      res.push(botRight);

      res.push(botRight);
      res.push(botLeft);
    }
  }
  return res;
}

function createPointIndices(w, h) {
  const res = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      res[y * w + x] = y * w + x;
    }
  }
  return res;
}

/**************************************
 * Ritter's bounding sphere algorithm
 **************************************/

function ritterBoundingSphere(vertices) {
  let x = getVertex(vertices, 0);
  let y = largestDistFrom(x, vertices);
  let z = largestDistFrom(y, vertices);

  center = midpoint(y, z);
  radius = Math.sqrt(distSq(y, z)) / 2.0;
  let radiusSq = Math.pow(radius, 2);

  var outsideVertices = [];
  for (var i = 0; i < vertices.length; i += 3) {
    var w = getVertex(vertices, i);
    if (radiusSq < distSq(w, center)) {
      outsideVertices.push(w);
    }
  }

  while (outsideVertices.length > 0) {
    var ov = popVertex(outsideVertices);
    var ovDistSq = distSq(ov, center);
    if (ovDistSq > radiusSq) {
      radiusSq = ovDistSq;
    }
  }
  radius = Math.sqrt(radiusSq);
}

function popVertex(inVertices) {
  var vertex = [];
  for (var i = 0; i < 3; i++) {
    vertex.push(inVertices.pop());
  }
  return vertex.reverse();
}

function midpoint(a, b) {
  let z = new Array(3);
  for (let i = 0; i < 3; i++) {
    z[i] = (a[i] + b[i]) / 2.0;
  }
  return z;
}


function largestDistFrom(v, vertices) {
  let maxDistSq = 0;
  let vLargest;
  for (let i = 0; i < vertices.length; i += 3) {
    let w = getVertex(vertices, i);
    let dSq = distSq(v, w);
    if (maxDistSq < dSq) {
      maxDistSq = dSq;
      vLargest = w;
    }
  }
  return vLargest;
}

function getVertex(vertices, idx) {
  const v = new Array(3);
  for (let i = 0; i < 3; i++) {
    v[i] = vertices[idx + i];
  }
  return v;
}

function distSq(va, vb) {
  const vdiff = diff(va, vb);
  let res = 0;
  for (const component of vdiff) {
    res += Math.pow(component, 2);
  }
  return res;
}

function diff(va, vb) {
  const d = new Array(3);
  for (let i = 0; i < 3; i++) {
    d[i] = va[i] - vb[i];
  }
  return d;
}

/******************
 * Buffer methods
 ******************/

function initBuffers() {
  vertexBuffer = gl.createBuffer();
  colorBuffer = gl.createBuffer();
  indexBuffer = gl.createBuffer();
}

function clearBufferData() {
  vertices = [];
  colors = [];
  indicesTriStrip = [];
  indicesTri = [];
  indicesLine = [];
  indicesPoint = [];
}

function bufferData(vertices, colors) {
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);

  bufferIndices()
}

function bufferIndices() {
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  if (currPrimitive === TRIANGLE_STRIPS) {
    if (uintForIndices) {
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indicesTriStrip), gl.DYNAMIC_DRAW);
    }
    else {
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indicesTriStrip), gl.DYNAMIC_DRAW);
    }
  }
  else if (currPrimitive === TRIANGLES) {
    if (uintForIndices) {
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indicesTri), gl.DYNAMIC_DRAW);
    }
    else {
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indicesTri), gl.DYNAMIC_DRAW);
    }
  }
  else if (currPrimitive === LINES) {
    if (uintForIndices) {
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indicesLine), gl.DYNAMIC_DRAW);
    }
    else {
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indicesLine), gl.DYNAMIC_DRAW);
    }
  }
  else if (currPrimitive === POINTS) {
    if (uintForIndices) {
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indicesPoint), gl.DYNAMIC_DRAW);
    }
    else {
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indicesPoint), gl.DYNAMIC_DRAW);
    }
  }
}

/******************
 * Drawing methods
 ******************/

function drawScene() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.viewport(0, 0, 640.0, 480.0);
  perspectiveMatrix = makePerspective(45.0, 640.0 / 480.0, 0.01, 10000.0);

  loadIdentity();

  var eyeDistance = (radius / Math.tan(45.0 / 2.0 * (Math.PI / 180.0)));
  mvLookAt(center[0], center[1], center[2] - eyeDistance, center[0], center[1], center[2], 0, 1, 0);

  mvRotate(camController.xRot, [1, 0, 0]);
  mvRotate(camController.yRot, [0, 1, 0]);

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.vertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.vertexAttribPointer(vertexColorAttribute, 4, gl.FLOAT, false, 0, 0);

  setMatrixUniforms();

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  if (currPrimitive === TRIANGLE_STRIPS) {
    if (uintForIndices) {
      gl.drawElements(gl.TRIANGLE_STRIP, indicesTriStrip.length, gl.UNSIGNED_INT, 0);
    }
    else {
      gl.drawElements(gl.TRIANGLE_STRIP, indicesTriStrip.length, gl.UNSIGNED_SHORT, 0);
    }
  }
  else if (currPrimitive === TRIANGLES) {
    if (uintForIndices) {
      gl.drawElements(gl.TRIANGLES, indicesTri.length, gl.UNSIGNED_INT, 0);
    }
    else {
      gl.drawElements(gl.TRIANGLES, indicesTri.length, gl.UNSIGNED_SHORT, 0);
    }
  }
  else if (currPrimitive === LINES) {
    if (uintForIndices) {
      gl.drawElements(gl.LINES, indicesLine.length, gl.UNSIGNED_INT, 0);
    }
    else {
      gl.drawElements(gl.LINES, indicesLine.length, gl.UNSIGNED_SHORT, 0);
    }
  }
  else if (currPrimitive === POINTS) {
    if (uintForIndices) {
      gl.drawElements(gl.POINTS, indicesPoint.length, gl.UNSIGNED_INT, 0);
    }
    else {
      gl.drawElements(gl.POINTS, indicesPoint.length, gl.UNSIGNED_SHORT, 0);
    }
  }
}

/************************
 Matrix utility methods
************************/

function loadIdentity() {
  mvMatrix = Matrix.I(4);
}

function multMatrix(m) {
  mvMatrix = mvMatrix.x(m);
}

function mvTranslate(v) {
  multMatrix(Matrix.Translation($V([v[0], v[1], v[2]])).ensure4x4());
}

function setMatrixUniforms() {
  var pUniform = gl.getUniformLocation(program, "projection");
  gl.uniformMatrix4fv(pUniform, false, new Float32Array(perspectiveMatrix.flatten()));

  var mvUniform = gl.getUniformLocation(program, "model_view");
  gl.uniformMatrix4fv(mvUniform, false, new Float32Array(mvMatrix.flatten()));
}

var mvMatrixStack = [];

function mvPushMatrix(m) {
  if (m) {
    mvMatrixStack.push(m.dup());
    mvMatrix = m.dup();
  } else {
    mvMatrixStack.push(mvMatrix.dup());
  }
}

function mvPopMatrix() {
  if (!mvMatrixStack.length) {
    throw ("Can't pop from an empty matrix stack.");
  }

  mvMatrix = mvMatrixStack.pop();
  return mvMatrix;
}

function mvRotate(angle, v) {
  var inRadians = angle * Math.PI / 180.0;

  var m = Matrix.Rotation(inRadians, $V([v[0], v[1], v[2]])).ensure4x4();
  multMatrix(m);
}

function mvLookAt(ex, ey, ez, cx, cy, cz, ux, uy, uz) {
  mvMatrix = makeLookAt(ex, ey, ez, cx, cy, cz, ux, uy, uz);
}