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
 * HTML Elements
 */
var fileInput;
var geomPrimList;
var colorChList;

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
var imageWidth;
var imageHeight;

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

  fileInput = document.getElementById("fileInput");
  fileInput.addEventListener('change', readFile);

  geomPrimList = document.getElementById("geomPrimList");
  geomPrimList.onchange = changePrim;

  colorChList = document.getElementById("colorChList");
  colorChList.onchange = changeChannel;
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

  const successful = gl.getProgramParameter(prog, gl.LINK_STATUS);
  if (successful) {
    return prog
  }

  const errMsg = `Link failed: ${gl.getProgramInfoLog(prog)}\n` +
    `Vertex shader info log: ${gl.getShaderInfoLog(vertexShader)}\n` +
    `Fragment shader info log: ${gl.getShaderInfoLog(fragmentShader)}\n`;

  gl.deleteProgram(prog);

  throw errMsg;
}

/***************
 * I/O methods
 ***************/

function readFile() {
  var file = fileInput.files[0];
  var imgType = /image.*/;

  if (file.type.match(imgType)) {
    var reader = new FileReader();
    reader.onload = readImage;
    reader.readAsDataURL(file);

    if (geomPrimList.selectedIndex == 0) {
      currPrimitive = TRIANGLE_STRIPS;
      geomPrimList.selectedIndex = TRIANGLE_STRIPS + 1;
    }
    if (colorChList.selectedIndex == 0) {
      currChannel = RED_CH;
      colorChList.selectedIndex = RED_CH + 1;
    }
  }
}

function readImage() {
  var image = new Image();
  image.onload = initHeightfield;
  image.src = this.result;
}

/*********************************
 * Channel and primitive methods
 *********************************/

function changeChannel() {
  currChannel = colorChList.selectedIndex - 1;

  loadVertices(imageWidth, imageHeight);

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, null, gl.DYNAMIC_DRAW);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);

  requestAnimationFrame(drawScene);
}

function changePrim() {
  currPrimitive = geomPrimList.selectedIndex - 1;
  bufferIndices();
  requestAnimationFrame(drawScene);
}

/****************************
 * Initialization methods
 ****************************/

function initHeightfield() {
  var width = this.width;
  var height = this.height;
  imageWidth = width;
  imageHeight = height;

  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  var context = canvas.getContext('2d');
  context.drawImage(this, 0, 0);

  var imageData = context.getImageData(0, 0, width, height);

  clearBufferData();

  // load colors
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var index = (y * width + x) * 4;
      for (var i = 0; i < 4; i++) {
        colors.push(imageData.data[index + i] / 255.0);
      }
    }
  }

  loadVertices(width, height);

  ritterBoundingSphere();

  loadTriStripIndices(width, height);
  loadTriIndices(width, height);
  loadLineIndices(width, height);
  loadPointIndices(width, height);

  bufferData();

  requestAnimationFrame(drawScene);
}

function loadVertices(width, height) {
  vertices = [];
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var index = (y * width + x) * 4;
      vertices.push(x - width / 2.0);
      vertices.push(colors[index + currChannel] * 255.0);
      vertices.push(-(y - height / 2.0));
    }
  }
}

function loadTriStripIndices(width, height) {
  for (var y = 0; y < height - 1; y++) {
    for (var x = 0; x < width; x++) {
      var bL = x + y * width;
      var tL = x + (y + 1) * width;

      indicesTriStrip.push(bL);
      indicesTriStrip.push(tL);

      if (x === (width - 1)) {
        indicesTriStrip.push(tL);
        indicesTriStrip.push((y + 1) * width);
      }
    }
  }
}

function loadTriIndices(width, height) {
  for (var y = 0; y < height - 1; y++) {
    for (var x = 0; x < width - 1; x++) {
      var bL = x + y * width;
      var bR = (x + 1) + y * width;
      var tL = x + (y + 1) * width;
      var tR = (x + 1) + (y + 1) * width;

      indicesTri.push(tL);
      indicesTri.push(tR);
      indicesTri.push(bL);
      indicesTri.push(tR);
      indicesTri.push(bR);
      indicesTri.push(bL);
    }
  }
}

function loadLineIndices(width, height) {
  for (var y = 0; y < height - 1; y++) {
    for (var x = 0; x < width - 1; x++) {
      var bL = x + y * width;
      var bR = (x + 1) + y * width;
      var tL = x + (y + 1) * width;
      var tR = (x + 1) + (y + 1) * width;

      indicesLine.push(tL);
      indicesLine.push(tR);

      indicesLine.push(tR);
      indicesLine.push(bL);

      indicesLine.push(bL);
      indicesLine.push(tL);

      indicesLine.push(tR);
      indicesLine.push(bR);

      indicesLine.push(bR);
      indicesLine.push(bL);
    }
  }
}

function loadPointIndices(width, height) {
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      indicesPoint.push(x + y * width);
    }
  }
}

/**************************************
 * Ritter's bounding sphere algorithm
 **************************************/

function ritterBoundingSphere() {
  var x = getVertex(0);
  var y = largestDistFrom(x);
  var z = largestDistFrom(y);

  center = midpoint(y, z);
  radius = Math.sqrt(distanceSqVertex(y, z)) / 2.0;
  var radiusSq = Math.pow(radius, 2);

  var outsideVertices = [];
  for (var i = 0; i < vertices.length; i += 3) {
    var w = getVertex(i);
    if (radiusSq < distanceSqVertex(w, center)) {
      outsideVertices.push(w);
    }
  }

  while (outsideVertices.length > 0) {
    var ov = popVertex(outsideVertices);
    var ovDistSq = distanceSqVertex(ov, center);
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
  var z = [];
  for (var i = 0; i < 3; i++) {
    z.push((a[i] + b[i]) / 2.0);
  }
  return z;
}


function largestDistFrom(v) {
  var maxDistSq = 0;
  var vLargest;
  for (var i = 0; i < vertices.length; i += 3) {
    var w = getVertex(i);
    var distSq = distanceSqVertex(v, w);
    if (maxDistSq < distSq) {
      maxDistSq = distSq;
      vLargest = w;
    }
  }
  return vLargest;
}

function getVertex(index) {
  var vertex = [];
  for (var i = 0; i < 3; i++) {
    vertex.push(vertices[index + i]);
  }
  return vertex;
}

function distanceSqVertex(a, b) {
  var c = differenceVertex(a, b);
  var sum = 0;
  for (var i = 0; i < 3; i++) {
    sum += Math.pow(c[i], 2);
  }
  return sum;
}

function differenceVertex(a, b) {
  var c = [];
  for (var i = 0; i < 3; i++) {
    c.push(a[i] - b[i]);
  }
  return c;
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

function bufferData() {
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