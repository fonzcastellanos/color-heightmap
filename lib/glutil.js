import * as vec3 from "./vec3.js";
import * as matrix4 from "./matrix4.js";

export function frustum(left, right, bottom, top, near, far) {
  return [
    2 * near / (right - left), 0, 0, 0,
    0, 2 * near / (top - bottom), 0, 0,
    (right + left) / (right - left), (top + bottom) / (top - bottom), -(far + near) / (far - near), -1,
    0, 0, -2 * far * near / (far - near), 0
  ];
}

export function perspective(fovy, aspect, near, far) {
  const top = near * Math.tan(fovy * Math.PI / 360.0);
  const bottom = -top;
  const left = bottom * aspect;
  const right = top * aspect;
  return frustum(left, right, bottom, top, near, far);
}

export function compileShader(gl, shaderSrc, shaderType) {
  const shader = gl.createShader(shaderType);

  gl.shaderSource(shader, shaderSrc);

  gl.compileShader(shader);

  return shader;
}

export function resizeCanvasToClientSize(canvas) {
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;

  const resize = canvas.width !== cw || canvas.height !== ch;

  if (resize) {
    canvas.width = cw;
    canvas.height = ch;
  }

  return resize;
}

export function lookAt(eye, at, up) {
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

export function createProgramFromShaders(gl, vertexShader, fragmentShader) {
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

export function createProgramFromShaderSources(gl, vertexShaderSrc, fragmentShaderSrc) {
  const vs = compileShader(gl, vertexShaderSrc, gl.VERTEX_SHADER);
  const fs = compileShader(gl, fragmentShaderSrc, gl.FRAGMENT_SHADER);
  return createProgramFromShaders(gl, vs, fs);
}