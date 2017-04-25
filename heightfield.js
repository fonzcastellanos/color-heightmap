var gl;
var fileInput;
var fileDisplayArea;
var channelButton;
var primitiveButton;
var primitiveText;
var colorChannelText;

var mvMatrix;
var shaderProgram;
var vertexPositionAttribute;
var vertexColorAttribute;
var perspectiveMatrix;

var vertices = [];
var colors = [];
var indicesTriStrip = [];
var indicesTri = [];
var indicesLine = [];
var indicesPoint = [];

var vertexBuffer;
var colorBuffer;
var indexBuffer;

var imageWidth;
var imageHeight;

const NUM_PRIM = 4;
const TRIANGLE_STRIPS = 0;
const TRIANGLES = 1;
const LINES = 2;
const POINTS = 3;
var currPrimitive;

const NUM_CH = 3;
const RED_CH = 0;
const BLUE_CH = 1;
const GREEN_CH = 2;
var currChannel;

var camController;

// bounding box
var bbMin;
var bbMax;

// bounding sphere
var radius;
var center;

function start() {
    var canvas = document.getElementById("glCanvas");

    initWebGL(canvas);

    if (gl) {
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.enable(gl.DEPTH_TEST);

        initShaders();
        initBuffers();

        camController = new CameraController(canvas);
        camController.onchange = function (xRot, yRot) {
            requestAnimationFrame(drawScene);
        };

        fileDisplayArea = document.getElementById("fileDisplayArea");

        primitiveText = document.getElementById("primitiveText");
        primitiveText.innerHTML = "TRIANGLE_STRIP";
        currPrimitive = TRIANGLE_STRIPS;

        colorChannelText = document.getElementById("colorChannelText");
        colorChannelText.innerHTML = "RED";
        currChannel = RED_CH;

        fileInput = document.getElementById("fileInput");
        fileInput.addEventListener('change', readFile);

        channelButton = document.getElementById("channelButton");
        channelButton.onclick = changeChannel;

        primitiveButton = document.getElementById("primitiveButton");
        primitiveButton.onclick = changePrimitive;

    }
}

function initWebGL(canvas) {
    gl = null;

    try {
        gl = canvas.getContext("webgl");
    }
    catch(e) {}

    if (!gl) {
        alert("Unable to initialize WebGL. Your browser may not support it.");
    }
}

/**********************
 *  Shader methods
 **********************/

function initShaders() {
    var fragmentShader = getShader(gl, "shader-fs");
    var vertexShader = getShader(gl, "shader-vs");

    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert("Unable to initialize the shader program: " + gl.getProgramInfoLog(shader));
    }

    gl.useProgram(shaderProgram);

    vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
    gl.enableVertexAttribArray(vertexPositionAttribute);

    vertexColorAttribute = gl.getAttribLocation(shaderProgram, "aVertexColor");
    gl.enableVertexAttribArray(vertexColorAttribute);
}

function getShader(gl, id) {
    var shaderScript = document.getElementById(id);

    if (!shaderScript) {
        return null;
    }

    var theSource = "";
    var currentChild = shaderScript.firstChild;

    while(currentChild) {
        if (currentChild.nodeType === 3) {
            theSource += currentChild.textContent;
        }

        currentChild = currentChild.nextSibling;
    }

    var shader;

    if (shaderScript.type === "x-shader/x-fragment") {
        shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (shaderScript.type === "x-shader/x-vertex") {
        shader = gl.createShader(gl.VERTEX_SHADER);
    } else {
        return null;  // Unknown shader type
    }

    gl.shaderSource(shader, theSource);

    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
        return null;
    }

    return shader;
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
    }
    else {
        fileDisplayArea.innerHTML = "File not supported!"
    }
}

function readImage() {
    fileDisplayArea.innerHTML = "";

    var image = new Image();
    image.onload = initHeightfield;
    image.src = this.result;

    fileDisplayArea.appendChild(image);
}

/*********************************
 * Channel and primitive methods
 *********************************/

function changeChannel() {
    currChannel = (currChannel + 1) % NUM_CH;

    if (currChannel === RED_CH) {
        colorChannelText.innerHTML = "RED";
    }
    else if (currChannel === GREEN_CH) {
        colorChannelText.innerHTML = "GREEN";
    }
    else if (currChannel === BLUE_CH) {
        colorChannelText.innerHTML = "BLUE";
    }

    loadVertices(imageWidth, imageHeight);

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    requestAnimationFrame(drawScene);
}

function changePrimitive() {
    currPrimitive = (currPrimitive+1)%NUM_PRIM;

    if (currPrimitive === TRIANGLE_STRIPS) {
        primitiveText.innerHTML = "TRIANGLE_STRIPS";
    }
    else if (currPrimitive === TRIANGLES) {
        primitiveText.innerHTML = "TRIANGLES";
    }
    else if (currPrimitive === LINES) {
        primitiveText.innerHTML = "LINES";
    }
    else if (currPrimitive === POINTS) {
        primitiveText.innerHTML = "POINTS";
    }

    bufferIndices();

    requestAnimationFrame(drawScene);
}

/****************************
 * Data wrangling methods
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
    getBoundingBox();
    getBoundingSphere();

    loadTriStripIndices(width, height);
    loadTriIndices(width, height);
    loadLineIndices(width, height);
    loadPointIndices(width, height);

    bufferData();

    requestAnimationFrame(drawScene);
}

function getBoundingBox() {
    bbMin = [Infinity, Infinity, Infinity];
    bbMax = [-Infinity, -Infinity, -Infinity];

    for (var i=0; i<vertices.length; i++) {
        for (var j=0; j<3; j++) {
            bbMin[j] = bbMin[j] > vertices[i+j] ? vertices[i+j] : bbMin[j];
            bbMax[j] = bbMax[j] < vertices[i+j] ? vertices[i+j] : bbMax[j];
        }
    }
}

function getBoundingSphere() {
    center = [];
    for (var i=0; i<3; i++) {
        center.push( (bbMax[i]+bbMin[i])/2.0 );
    }

    var sum = 0;
    for (var i=0; i<3; i++) {
        sum += Math.pow(bbMax[i] - center[i], 2);
    }
    radius = Math.sqrt(sum)/2.0;
}

function loadVertices(width, height) {
    vertices = [];
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var index = (y * width + x) * 4;
            vertices.push(x - width / 2.0);
            vertices.push(colors[index+currChannel]*255.0);
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
    for (var y=0; y<height-1; y++) {
        for (var x=0; x<width-1; x++) {
            var bL = x + y*width;
            var bR = (x+1) + y*width;
            var tL = x + (y+1)*width;
            var tR = (x+1) + (y+1)*width;

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
    for (var y=0; y<height-1; y++) {
        for (var x=0; x<width-1; x++) {
            var bL = x+y*width;
            var bR = (x+1) + y*width;
            var tL = x + (y+1)*width;
            var tR = (x+1) + (y+1)*width;

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
    for (var y=0; y<height; y++) {
        for (var x = 0; x < width; x++) {
            indicesPoint.push(x + y * width);
        }
    }
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
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    bufferIndices()
}

function bufferIndices() {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    if (currPrimitive === TRIANGLE_STRIPS) {
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indicesTriStrip), gl.STATIC_DRAW);
    }
    else if (currPrimitive === TRIANGLES) {
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indicesTri), gl.STATIC_DRAW);
    }
    else if (currPrimitive === LINES){
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indicesLine), gl.STATIC_DRAW);
    }
    else if (currPrimitive === POINTS) {
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indicesPoint), gl.STATIC_DRAW);
    }
}

/******************
 * Drawing methods
 ******************/

function drawScene() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    perspectiveMatrix = makePerspective(45.0, 640.0 / 480.0, 0.01, 10000.0);

    loadIdentity();

    var eyeDistance = ( (bbMax[1] - bbMin[1])/2.0 ) / Math.tan(45.0/2.0*(Math.PI/180.0));
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
        gl.drawElements(gl.TRIANGLE_STRIP, indicesTriStrip.length, gl.UNSIGNED_SHORT, 0);
    }
    else if (currPrimitive === TRIANGLES) {
        gl.drawElements(gl.TRIANGLES, indicesTri.length, gl.UNSIGNED_SHORT, 0);
    }
    else if (currPrimitive === LINES) {
        gl.drawElements(gl.LINES, indicesLine.length, gl.UNSIGNED_SHORT, 0);
    }
    else if (currPrimitive === POINTS) {
        gl.drawElements(gl.POINTS, indicesPoint.length, gl.UNSIGNED_SHORT, 0);
    }
}

/****************************
 Matrix utility methods
*****************************/

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
    var pUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
    gl.uniformMatrix4fv(pUniform, false, new Float32Array(perspectiveMatrix.flatten()));

    var mvUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
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
        throw("Can't pop from an empty matrix stack.");
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
