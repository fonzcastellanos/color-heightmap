import * as vec3 from "./vec3.js";
import * as matrix4 from "./matrix4.js";
import * as glutil from "./glutil.js";
import { CameraController } from "./../vendor/cameracontroller.js";

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

export function setup(
  canvasElId,
  fileInputElId,
  primitiveSelectElId,
  colorChannelSelectElId
) {
  const canvas = document.getElementById(canvasElId);
  if (canvas == null) {
    console.error(`Failed to get canvas with id \"${canvasElId}\".`);
    return;
  }

  const finput = document.getElementById(fileInputElId);
  if (finput == null) {
    console.error(
      `Failed to get file input element with id \"${fileInputElId}\".`
    );
    return;
  }

  const primSelect = document.getElementById(primitiveSelectElId);
  if (primSelect == null) {
    console.error(
      `Failed to get primitive select element with id \"${primitiveSelectElId}\".`
    );
    return;
  }

  const colorChSelect = document.getElementById(colorChannelSelectElId);
  if (colorChSelect == null) {
    console.error(
      `Failed to get color channel select element with id \"${colorChannelSelectElId}\".`
    );
    return;
  }

  const gl = canvas.getContext("webgl");
  if (gl == null) {
    console.error(
      "Failed to to initialize WebGL. Executing browser may not support it."
    );
    return;
  }

  const extOesElementIndexUint = gl.getExtension("OES_element_index_uint");

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  const program = glutil.createProgramFromShaderSources(
    gl, VERTEX_SHADER_SRC, FRAGMENT_SHADER_SRC
  );

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

  const camController = new CameraController(gl.canvas);

  let selectedPrimitive = primSelect.selectedOptions[0].value;
  let selectedColorChannel = colorChSelect.selectedOptions[0].value;

  let positions = null;
  let colors = null;
  let indices = null;
  let imgData = null;
  let boundingSphere = null;

  const wrappedDraw = () => {
    draw(
      gl,
      extOesElementIndexUint,
      projectionUniformLoc,
      modelViewUniformLoc,
      indexBuffer,
      camController,
      selectedPrimitive,
      indices,
      boundingSphere
    );
  };

  camController.onchange = () => {
    if (imgData) {
      requestAnimationFrame(wrappedDraw);
    }
  };

  primSelect.addEventListener("change", (evt) => {
    selectedPrimitive = evt.target.selectedOptions[0].value;
    if (imgData) {
      indices = createIndices(
        imgData.width, imgData.height, selectedPrimitive, extOesElementIndexUint
      );

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);

      requestAnimationFrame(wrappedDraw);
    }
  });

  colorChSelect.addEventListener("change", (evt) => {
    selectedColorChannel = evt.target.selectedOptions[0].value;

    if (imgData) {
      positions = createPositions(
        imgData.width, imgData.height, colors, selectedColorChannel
      );

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

      requestAnimationFrame(wrappedDraw);
    }
  });

  const img = new Image();
  img.addEventListener("load", (evt) => {
    imgData = getImgData(evt.target);
    colors = createColors(imgData);

    positions = createPositions(
      imgData.width, imgData.height, colors, selectedColorChannel
    );
    indices = createIndices(
      imgData.width, imgData.height, selectedPrimitive, extOesElementIndexUint
    );

    const unflattenedPositions = new Array(positions.length / 3);
    for (let i = 0; i < unflattenedPositions.length; i++) {
      const start = i * 3;
      unflattenedPositions[i] = new Array(3);
      for (let j = 0; j < 3; j++) {
        unflattenedPositions[i][j] = positions[start + j];
      }
    }

    boundingSphere = findBoundingSphere(unflattenedPositions);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);

    requestAnimationFrame(wrappedDraw);
  });

  const freader = new FileReader();
  freader.addEventListener("load", (evt) => {
    img.src = evt.target.result;
  });

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
  let colorCh = null;
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

      for (const idx of indices) {
        res[i] = idx;
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

      for (const idx of indices) {
        res[i] = idx;
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

function findBoundingSphere(points) {
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

  const center = vec3.midpoint(pointPairMaxSpan[0], pointPairMaxSpan[1]);
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

  return { center: center, radius: radius };
}

function draw(
  gl,
  extOesElementIndexUint,
  projectionUniformLoc,
  modelViewUniformLoc,
  indexBuffer,
  camController,
  selectedPrimitive,
  indices,
  boundingSphere
) {
  glutil.resizeCanvasToClientSize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const bsph = boundingSphere;

  const perspective = glutil.perspective(
    45.0, gl.canvas.clientWidth / gl.canvas.clientHeight, 1, 10000.0
  );
  gl.uniformMatrix4fv(projectionUniformLoc, false, new Float32Array(perspective));

  const eyeDist = bsph.radius / Math.tan(45.0 / 2.0 * (Math.PI / 180.0));
  const eye = [bsph.center[0], bsph.center[1], bsph.center[2] - eyeDist];

  let modelView = glutil.lookAt(eye, bsph.center, [0, 1, 0]);

  modelView = matrix4.multiply(modelView, matrix4.rotationX(camController.xRot));
  modelView = matrix4.multiply(modelView, matrix4.rotationY(camController.yRot));

  gl.uniformMatrix4fv(modelViewUniformLoc, false, new Float32Array(modelView));

  const glPrim = glPrimitive(gl, selectedPrimitive);
  const glType = extOesElementIndexUint ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.drawElements(glPrim, indices.length, glType, 0);
}