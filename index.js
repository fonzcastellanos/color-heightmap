import * as heightfield from "./lib/index.js";

window.onload = () => {
  heightfield.setup(
    "gl-canvas",
    "file-input",
    "geometric-primitive-select",
    "color-channel-select"
  );
};