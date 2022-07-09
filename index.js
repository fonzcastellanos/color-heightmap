import * as heightfield from "./heightfield.js";

window.onload = () => {
  heightfield.setup(
    "gl-canvas",
    "file-input",
    "geometric-primitive-select",
    "color-channel-select"
  );
};