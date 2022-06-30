"use strict";

var vertexShaderSrc = `
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

var fragmentShaderSrc = `
varying lowp vec4 v_color;

void main(void) {
  gl_FragColor = v_color;
}
`;

// var gl = null;

/**
 * High-level pipeline objects
 */
var mvMatrix;
// var program;
// var positionAttribLoc;
// var colorAttribLoc;
var perspectiveMatrix;

/**
 * Geometric data objects
 */
// var positions = [];
// var colors = [];
// var indices = [];


// var indicesTriStrip = [];
// var indicesTri = [];
// var indicesLine = [];
// var indicesPoint = [];

/**
 * Buffers
 */
// var vertexBuffer;
// var colorBuffer;
// var indexBuffer;

/**
 * Image width & height
 */
// var imgWidth;
// var imgHeight;

/**
 * Primitive options
 */
const NUM_PRIM = 4;
const TRIANGLE_STRIPS = 0;
const TRIANGLES = 1;
const LINES = 2;
const POINTS = 3;

// var primitive;

/**
 * Channel options
 */
const NUM_CH = 3;
const RED_CH = 0;
const GREEN_CH = 1;
const BLUE_CH = 2;
// var colorChannel;

/**
 * Camera
 */
// var camController;

/**
 * Bounding sphere
 */
var radius;
var center;

/**
 * 32-bit uint index flag
 */
// var extOesElementIndexUint = null;

function glPrimitive(gl, selectPrimitive) {
  switch (selectPrimitive) {
    case "triangle-strips":
      return gl.TRIANGLE_STRIPS;
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
  if (extOesElementIndexUint == null) {
    console.log("Unsuccessful at enabling the extension for 32-bit uint indices. Defaulting to 16-bit uint indices.");
  }

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  const vs = compileShader(gl, vertexShaderSrc, gl.VERTEX_SHADER);
  const fs = compileShader(gl, fragmentShaderSrc, gl.FRAGMENT_SHADER);
  const program = createProgram(gl, vs, fs);
  gl.useProgram(program);

  const positionAttribLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionAttribLoc);

  const colorAttribLoc = gl.getAttribLocation(program, "a_color");
  gl.enableVertexAttribArray(colorAttribLoc);

  const positionBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();

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
      drawScene(gl, extOesElementIndexUint, program, positionAttribLoc, colorAttribLoc, positionBuffer, colorBuffer, indexBuffer, camController, selectedPrimitive, indices);
    })
  };

  primSelect.addEventListener("change", (evt) => {
    selectedPrimitive = evt.target.selectedOptions[0].value;
    if (imgData) {
      indices = createIndices(imgData.width, imgData.height, selectedPrimitive);

      const typedIndices = extOesElementIndexUint ? new Uint32Array(indices) : new Uint16Array(indices);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, typedIndices, gl.DYNAMIC_DRAW);

      requestAnimationFrame(() => {
        drawScene(gl, extOesElementIndexUint, program, positionAttribLoc, colorAttribLoc, positionBuffer, colorBuffer, indexBuffer, camController, selectedPrimitive, indices);
      });
    }
  });

  colorChSelect.addEventListener("change", (evt) => {
    selectedColorChannel = evt.target.selectedOptions[0].value;

    if (imgData) {
      positions = createPositions(imgData.width, imgData.height, colors, selectedColorChannel);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      // gl.bufferData(gl.ARRAY_BUFFER, null, gl.DYNAMIC_DRAW);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);

      requestAnimationFrame(() => {
        drawScene(gl, extOesElementIndexUint, program, positionAttribLoc, colorAttribLoc, positionBuffer, colorBuffer, indexBuffer, camController, selectedPrimitive, indices);
      });
    }

  });

  const img = new Image();
  img.addEventListener("load", (evt) => {
    imgData = getImgData(evt.target);
    colors = createColors(imgData);
    positions = createPositions(imgData.width, imgData.height, colors, selectedColorChannel);
    indices = createIndices(imgData.width, imgData.height, selectedPrimitive);


    ritterBoundingSphere(positions);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);

    const typedIndices = extOesElementIndexUint ? new Uint32Array(indices) : new Uint16Array(indices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, typedIndices, gl.DYNAMIC_DRAW);

    requestAnimationFrame(() => {
      drawScene(gl, extOesElementIndexUint, program, positionAttribLoc, colorAttribLoc, positionBuffer, colorBuffer, indexBuffer, camController, selectedPrimitive, indices);
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

function createIndices(w, h, selectedPrimitive) {
  switch (selectedPrimitive) {
    case "triangle-strips":
      return createTriStripIndices(w, h);
    case "triangles":
      return createTriIndices(w, h);
    case "lines":
      return createLineIndices(w, h);
    case "points":
      return createPointIndices(w, h);
  }
  return null;
}

function getImgData(img) {
  const w = img.width;
  const h = img.height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  return ctx.getImageData(0, 0, w, h);
}

function createColors(imgData) {
  const w = imgData.width;
  const h = imgData.height;
  const res = new Array(w * h);
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

// function initHeightfield(positionBuffer, colorBuffer) {
//   const w = this.width;
//   const h = this.height;
//   imgWidth = w;
//   imgHeight = h;

//   const imgData = getImgData(this);

//   colors = new Array(w * h);
//   for (let y = 0; y < h; y++) {
//     for (let x = 0; x < w; x++) {
//       const offset = (y * w + x) * 4;
//       for (let i = 0; i < 4; i++) {
//         const j = offset + i;
//         colors[j] = imgData.data[j] / 255.0;
//       }
//     }
//   }

//   positions = createPositions(w, h, colors);

//   ritterBoundingSphere(positions);

//   indicesTriStrip = createTriStripIndices(w, h);
//   indicesTri = createTriIndices(w, h);
//   indicesLine = createLineIndices(w, h);
//   indicesPoint = createPointIndices(w, h);

//   // bufferData(vertices, colors);

//   gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
//   gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);

//   gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
//   gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);

//   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
//   gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indicesTriStrip), gl.DYNAMIC_DRAW);

//   requestAnimationFrame(drawScene);
// }

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


  const res = new Array(w * h * 3);
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

function createTriStripIndices(w, h) {
  const res = [];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const botLeft = x + y * w;
      const topLeft = x + (y + 1) * w;

      res.push(botLeft);
      res.push(topLeft);

      if (x === (w - 1)) {
        res.push(topLeft);
        res.push((y + 1) * w);
      }
    }
  }
  return res
}

function createTriIndices(w, h) {
  const res = [];
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
  const res = [];
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
  const x = getVertex(vertices, 0);
  const y = largestDistFrom(x, vertices);
  const z = largestDistFrom(y, vertices);

  center = midpoint(y, z);
  radius = Math.sqrt(distSq(y, z)) / 2.0;
  let radiusSq = Math.pow(radius, 2);

  const outsideVertices = [];
  for (let i = 0; i < vertices.length; i += 3) {
    const w = getVertex(vertices, i);
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
  const vertex = [];
  for (let i = 0; i < 3; i++) {
    vertex.push(inVertices.pop());
  }
  return vertex.reverse();
}

function midpoint(a, b) {
  const z = new Array(3);
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

function drawScene(gl, extOesElementIndexUint, program, positionAttribLoc, colorAttribLoc, positionBuffer, colorBuffer, indexBuffer, camController, selectedPrimitive, indices) {
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  perspectiveMatrix = makePerspective(45.0, 640.0 / 480.0, 0.01, 10000.0);

  loadIdentity();

  var eyeDistance = (radius / Math.tan(45.0 / 2.0 * (Math.PI / 180.0)));
  mvLookAt(center[0], center[1], center[2] - eyeDistance, center[0], center[1], center[2], 0, 1, 0);

  mvRotate(camController.xRot, [1, 0, 0]);
  mvRotate(camController.yRot, [0, 1, 0]);

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(positionAttribLoc, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.vertexAttribPointer(colorAttribLoc, 4, gl.FLOAT, false, 0, 0);

  setMatrixUniforms(gl, program);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  const glPrim = glPrimitive(gl, selectedPrimitive);
  const glType = extOesElementIndexUint ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  gl.drawElements(glPrim, indices.length, glType, 0);
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

function setMatrixUniforms(gl, program) {
  var pUniform = gl.getUniformLocation(program, "u_projection");
  gl.uniformMatrix4fv(pUniform, false, new Float32Array(perspectiveMatrix.flatten()));

  var mvUniform = gl.getUniformLocation(program, "u_model_view");
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