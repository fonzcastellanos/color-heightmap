# Color Heightmap

![License](https://img.shields.io/github/license/fonzcastellanos/color-heightmap)

A WebGL-powered application to render the color heightmap of an input image. 

Input Image                | Heightmap
:-------------------------:|:-------------------------:
![](grass.jpg)  |  ![](heightmap.png)

## Demo
Try the app yourself at https://fonzcastellanos.github.io/color-heightmap/.

## Features
- Configurable height channel
  - Height channel is one of the channels of the RGB color model
- Configurable interpretation of vertex streams
  - Vertex streams are interpreted as one of the following geometric primitives:
    - Triangle strips
    - Triangles
    - Lines
    - Points
- Automatic camera positioning and orientation 
  - Achieved using the radius and center of the heightmap's bounding sphere, which is found by an implementation of Ritter's bounding sphere algorithm
- Intuitive mouse-based camera control

## Limitations
- Performance is an issue for large images. I intend to implement downscaling in the future.
- Camera view is awkward for some orientations of the heightmap achieved through mouse-based camera control.
- Targets browsers supporting ECMAScript 2015.