
const glutil = {
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
  },
  compileShader: function (gl, shaderSrc, shaderType) {
    const shader = gl.createShader(shaderType);

    gl.shaderSource(shader, shaderSrc);

    gl.compileShader(shader);

    return shader;
  },
  resizeCanvasToClientSize: function (canvas) {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;

    const resize = canvas.width !== cw || canvas.height !== ch;

    if (resize) {
      canvas.width = cw;
      canvas.height = ch;
    }

    return resize;
  },
  createProgramFromShaders: function (gl, vertexShader, fragmentShader) {
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
  },
  createProgramFromShaderSources: function (gl, vertexShaderSrc, fragmentShaderSrc) {
    const vs = this.compileShader(gl, vertexShaderSrc, gl.VERTEX_SHADER);
    const fs = this.compileShader(gl, fragmentShaderSrc, gl.FRAGMENT_SHADER);
    return this.createProgramFromShaders(gl, vs, fs);
  },
};