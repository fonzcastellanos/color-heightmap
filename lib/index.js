import * as vec3 from "./vec3.js";
import * as matrix4 from "./matrix4.js";
import * as glutil from "./glutil.js";
import { assert } from "./assert.js";
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

const Primitive = {
  TRIANGLE_STRIP: 0,
  TRIANGLE: 1,
  LINE: 2,
  POINT: 3
};

const glPrimitive = (gl, prim) => {
  switch (prim) {
    case Primitive.TRIANGLE_STRIP:
      return gl.TRIANGLE_STRIP;
    case Primitive.TRIANGLE:
      return gl.TRIANGLES;
    case Primitive.LINE:
      return gl.LINES;
    case Primitive.POINT:
      return gl.POINTS;
    default:
      assert(false);
  }
};

const RgbaChannel = {
  RED: 0,
  GREEN: 1,
  BLUE: 2,
  ALPHA: 3
};

const RGBA_CHANNEL_COUNT = 4;

class FrustumProps {
  constructor(fovy, near, far) {
    this.fovy = fovy;
    this.near = near;
    this.far = far;
  }
}

const FRUSTUM_FOVY = 60;
const FRUSTUM_NEAR = 1;
const FRUSTUM_FAR = 10000;

const createPositions = (w, h, colors, rgbaChannel) => {
  const len = w * h * 3;
  const res = new Float32Array(len);
  for (let y = 0; y < h; ++y) {
    for (let x = 0; x < w; ++x) {
      const i = (y * w + x) * 3;

      res[i] = x - w / 2;
      res[i + 1] = colors[(y * w + x) * RGBA_CHANNEL_COUNT + rgbaChannel] * 255;
      res[i + 2] = -(y - h / 2);
    }
  }

  return res;
};

const extractColors = (imageData) => {
  const w = imageData.width;
  const h = imageData.height;

  const len = w * h * RGBA_CHANNEL_COUNT;
  const res = new Float32Array(len);
  for (let y = 0; y < h; ++y) {
    for (let x = 0; x < w; ++x) {
      const offset = (y * w + x) * RGBA_CHANNEL_COUNT;
      for (let i = 0; i < RGBA_CHANNEL_COUNT; ++i) {
        const j = offset + i;
        res[j] = imageData.data[j] / 255;
      }
    }
  }
  return res;
};

const createTriStripIndices = (arrayConstructor, w, h) => {
  assert(w > 0);
  assert(h > 1);

  const len = 2 * w * (h - 1) + (h - 1) + (h - 2);
  const res = new arrayConstructor(len);

  let i = 0;
  for (let y = 0; y < h - 1; ++y) {
    for (let x = 0; x < w; ++x) {
      const tl = y * w + x;
      const bl = (y + 1) * w + x;

      res[i] = bl;
      res[i + 1] = tl;

      i += 2;
    }

    res[i] = y * w + (w - 1);
    ++i;

    if (y < h - 2) {
      res[i] = (y + 2) * w;
      ++i;
    }
  }

  return res;
};

const createTriIndices = (arrayConstructor, w, h) => {
  assert(w > 0);
  assert(h > 0);

  const len = 6 * (w - 1) * (h - 1);
  const res = new arrayConstructor(len);
  let i = 0;
  for (let y = 0; y < h - 1; ++y) {
    for (let x = 0; x < w - 1; ++x) {
      const tl = x + y * w;
      const tr = (x + 1) + y * w;
      const bl = x + (y + 1) * w;
      const br = (x + 1) + (y + 1) * w;

      res[i] = tl;
      res[i + 1] = tr;
      res[i + 2] = bl;
      res[i + 3] = tr;
      res[i + 4] = br;
      res[i + 5] = bl;

      i += 6;
    }
  }
  return res;
};

const createLineIndices = (arrayConstructor, w, h) => {
  assert(w > 0);
  assert(h > 0);

  const len = 2 * (w - 1) * h + 2 * w * (h - 1);
  const res = new arrayConstructor(len);
  let i = 0;
  for (let y = 0; y < h; ++y) {
    for (let x = 0; x < w - 1; ++x) {
      res[i] = y * w + x;
      res[i + 1] = y * w + x + 1;
      i += 2;
    }
  }
  for (let y = 0; y < h - 1; ++y) {
    for (let x = 0; x < w; ++x) {
      res[i] = y * w + x;
      res[i + 1] = (y + 1) * w + x;
      i += 2;
    }
  }
  return res;
};

const createPointIndices = (arrayConstructor, w, h) => {
  assert(w >= 0);
  assert(h >= 0);

  const len = w * h;
  const res = new arrayConstructor(len);
  for (let y = 0; y < h; ++y) {
    for (let x = 0; x < w; ++x) {
      res[y * w + x] = y * w + x;
    }
  }
  return res;
};

const createIndices = (w, h, prim, idxArrayConstructor) => {
  switch (prim) {
    case Primitive.TRIANGLE_STRIP:
      return createTriStripIndices(idxArrayConstructor, w, h);
    case Primitive.TRIANGLE:
      return createTriIndices(idxArrayConstructor, w, h);
    case Primitive.LINE:
      return createLineIndices(idxArrayConstructor, w, h);
    case Primitive.POINT:
      return createPointIndices(idxArrayConstructor, w, h);
    default:
      assert(false);
  }
};

const findBoundingSphere = (points) => {
  let xmin = points[0];
  let xmax = points[0];
  let ymin = points[0];
  let ymax = points[0];
  let zmin = points[0];
  let zmax = points[0];

  for (let i = 1; i < points.length; ++i) {
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

      radius = (radius + dist) / 2;
      radiusSq = radius * radius;

      const offset = dist - radius;
      for (let i = 0; i < 3; ++i) {
        center[i] = (radius * center[i] + offset * p[i]) / dist;
      }
    }
  }

  return { center: center, radius: radius };
};

const draw = (
  gl,
  glIdxType,
  projectionUniformLoc,
  modelViewUniformLoc,
  indexBuffer,
  camController,
  glPrim,
  indices,
  frustumProps,
  boundingSphere
) => {
  glutil.resizeCanvasToClientSize(gl.canvas);
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const perspective = glutil.perspective(
    frustumProps.fovy, gl.drawingBufferWidth / gl.drawingBufferHeight, frustumProps.near, frustumProps.far
  );
  gl.uniformMatrix4fv(projectionUniformLoc, false, new Float32Array(perspective));

  const eyeDist = boundingSphere.radius / Math.tan(frustumProps.fovy / 2 * (Math.PI / 180));
  const eye = [boundingSphere.center[0], boundingSphere.center[1], boundingSphere.center[2] - eyeDist];

  let modelView = glutil.lookAt(eye, boundingSphere.center, [0, 1, 0]);

  modelView = matrix4.multiply(modelView, matrix4.rotationX(camController.xRot));
  modelView = matrix4.multiply(modelView, matrix4.rotationY(camController.yRot));

  gl.uniformMatrix4fv(modelViewUniformLoc, false, new Float32Array(modelView));

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.drawElements(glPrim, indices.length, glIdxType, 0);
};

export function setup(
  canvasId,
  fileInputId,
  primitiveSelectId,
  colorChannelSelectId
) {
  const canvas = document.getElementById(canvasId);
  if (canvas === null) {
    throw Error(`No canvas element with id \"${canvasId}\" was found.`);
  }

  const fileInput = document.getElementById(fileInputId);
  if (fileInput === null) {
    throw Error(
      `No input[type=\"file\"] element with id \"${fileInputId}\" was found.`
    );
  }

  const primSelect = document.getElementById(primitiveSelectId);
  if (primSelect === null) {
    throw Error(
      `No primitive select element with id \"${primitiveSelectId}\" was found.`
    );
  }

  const colorChSelect = document.getElementById(colorChannelSelectId);
  if (colorChSelect === null) {
    throw Error(
      `No color channel select element with id \"${colorChannelSelectId}\" was found.`
    );
  }

  const gl = canvas.getContext("webgl");
  if (gl === null) {
    throw Error("WebGL context was not retrieved. WebGL is probably not supported on the executing browser.");
  }

  let selectedPrim = Primitive[primSelect.selectedOptions[0].value];
  if (selectedPrim === undefined) {
    throw Error(`The selected primitive \"${primSelect.selectedOptions[0].value}\" is invalid.`);
  }
  let glPrim = glPrimitive(gl, selectedPrim);

  let selectedColorCh = RgbaChannel[colorChSelect.selectedOptions[0].value];
  if (selectedColorCh === undefined) {
    throw Error(`The selected color channel \"${colorChSelect.selectedOptions[0].value}\" is invalid.`);
  }

  const camController = new CameraController(gl.canvas);

  const ext = gl.getExtension("OES_element_index_uint");
  const glIdxType = ext ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  const idxArrayConstructor = ext ? Uint32Array : Uint16Array;

  const program = glutil.createProgFromShaderSources(
    gl, VERTEX_SHADER_SRC, FRAGMENT_SHADER_SRC
  );
  const uProjectionLoc = gl.getUniformLocation(program, "u_projection");
  const uModelViewLoc = gl.getUniformLocation(program, "u_model_view");
  const aPositionLoc = gl.getAttribLocation(program, "a_position");
  const aColorLoc = gl.getAttribLocation(program, "a_color");
  gl.useProgram(program);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(aPositionLoc);

  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.vertexAttribPointer(aColorLoc, 4, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(aColorLoc);

  const indexBuffer = gl.createBuffer();

  let positions = null;
  let colors = null;
  let indices = null;
  let imgData = null;
  let boundingSphere = null;

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 1);

  const frustumProps = new FrustumProps(FRUSTUM_FOVY, FRUSTUM_NEAR, FRUSTUM_FAR);
  const wrappedDraw = () => {
    draw(
      gl,
      glIdxType,
      uProjectionLoc,
      uModelViewLoc,
      indexBuffer,
      camController,
      glPrim,
      indices,
      frustumProps,
      boundingSphere
    );
  };

  camController.onchange = () => {
    if (imgData) {
      requestAnimationFrame(wrappedDraw);
    }
  };

  primSelect.addEventListener("change", (evt) => {
    selectedPrim = Primitive[evt.target.selectedOptions[0].value];
    if (selectedPrim === undefined) {
      throw Error(`The selected primitive \"${evt.target.selectedOptions[0].value}\" is invalid.`);
    }
    glPrim = glPrimitive(gl, selectedPrim);

    if (imgData === null) {
      return;
    }

    indices = createIndices(
      imgData.width, imgData.height, selectedPrim, idxArrayConstructor
    );

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);

    requestAnimationFrame(wrappedDraw);
  });

  colorChSelect.addEventListener("change", (evt) => {
    selectedColorCh = RgbaChannel[evt.target.selectedOptions[0].value];
    if (selectedColorCh === undefined) {
      throw Error(`The selected color channel \"${evt.target.selectedOptions[0].value}\" is invalid.`);
    }

    if (imgData === null) {
      return;
    }

    positions = createPositions(
      imgData.width, imgData.height, colors, selectedColorCh,
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

    requestAnimationFrame(wrappedDraw);
  });

  const img = new Image();
  img.addEventListener("load", (evt) => {
    const cvs = document.createElement("canvas");
    cvs.width = evt.target.naturalWidth;
    cvs.height = evt.target.naturalHeight;

    const ctx = cvs.getContext("2d");
    ctx.drawImage(evt.target, 0, 0);
    imgData = ctx.getImageData(0, 0, evt.target.naturalWidth, evt.target.naturalHeight);

    colors = extractColors(imgData);
    positions = createPositions(
      imgData.width, imgData.height, colors, selectedColorCh,
    );
    indices = createIndices(
      imgData.width, imgData.height, selectedPrim, idxArrayConstructor
    );

    const unflattenedPositions = new Array(positions.length / 3);
    for (let i = 0; i < unflattenedPositions.length; ++i) {
      const start = i * 3;
      unflattenedPositions[i] = new Array(3);
      for (let j = 0; j < 3; ++j) {
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

  const fileReader = new FileReader();
  fileReader.addEventListener("load", (evt) => {
    img.src = evt.target.result;
  });

  fileInput.addEventListener("change", (evt) => {
    const f = evt.target.files[0];
    fileReader.readAsDataURL(f);
  });
}