import * as heightfield from "./heightfield.js";

window.onload = () => {
  heightfield.main(
    "gl-canvas",
    "file-input",
    "geometric-primitive-select",
    "color-channel-select"
  );
};