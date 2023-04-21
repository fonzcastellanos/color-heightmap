import * as vec3 from "./vec3.js";
import * as matrix4 from "./matrix4.js";

export const frustum = (left, right, bot, top, near, far) => {
  return [
    2 * near / (right - left), 0, 0, 0,
    0, 2 * near / (top - bot), 0, 0,
    (right + left) / (right - left), (top + bot) / (top - bot), -(far + near) / (far - near), -1,
    0, 0, -2 * far * near / (far - near), 0
  ];
};

export const perspective = (fovy, aspect, near, far) => {
  const top = near * Math.tan(fovy * Math.PI / 360);
  const right = top * aspect;
  const bot = -top;
  const left = -right;
  return frustum(left, right, bot, top, near, far);
};

export const compileShader = (gl, src, type) => {
  const sh = gl.createShader(type);

  gl.shaderSource(sh, src);

  gl.compileShader(sh);

  return sh;
};

export const resizeCanvasToClientSize = (canvas) => {
  // If the drawing buffer dimensions are set like the example below, then
  // setting `canvas.width` to `canvas.clientWidth`, will cause the browser 
  // to automatically resize the canvas element to match the `clientWidth`. 
  // However, the default value for `canvas.height` is 150 pixels, which is 
  // used if the height is not explicitly set. So, when you set `canvas.width` 
  // equal to `canvas.clientWidth`, the height of the canvas element is 
  // effectively reset to its default value of 150 pixels.
  // 
  // ```
  // canvas.width = canvas.clientWidth;
  // canvas.height = canvas.clientHeight;
  // ```

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  const resize = canvas.width !== w || canvas.height !== h;

  if (resize) {
    canvas.width = w;
    canvas.height = h;
  }

  return resize;
};

export const lookAt = (eye, at, up) => {
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
};

export const createProgFromShaders = (gl, vertex, fragment) => {
  const prog = gl.createProgram();
  gl.attachShader(prog, vertex);
  gl.attachShader(prog, fragment);
  gl.linkProgram(prog);

  const ok = gl.getProgramParameter(prog, gl.LINK_STATUS);
  if (!ok) {
    const errMsg = `Link failed: ${gl.getProgramInfoLog(prog)}\n` +
      `Vertex shader info log: ${gl.getShaderInfoLog(vertex)}\n` +
      `Fragment shader info log: ${gl.getShaderInfoLog(fragment)}\n`;

    gl.deleteProgram(prog);

    throw errMsg;
  }

  return prog;
};

export const createProgFromShaderSources = (gl, vertex, fragment) => {
  const v = compileShader(gl, vertex, gl.VERTEX_SHADER);
  const f = compileShader(gl, fragment, gl.FRAGMENT_SHADER);
  return createProgFromShaders(gl, v, f);
};