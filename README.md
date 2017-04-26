# WebGL Image Heightfield

Renders a heightfield for an input image. Height is a function of the chosen color channel level.

Input Image                | Output Heightfield
:-------------------------:|:-------------------------:
![](grass.jpg)  |  ![](heightfield.png)


## Main Features
* Color channel modes
  * R, G, & B
* Geometric primitive modes
  * TRIANGLE_STRIPS, TRIANGLES, LINES, & POINTS
* [Ritter's bounding sphere algorithm](https://en.wikipedia.org/wiki/Bounding_sphere#Ritter.27s_bounding_sphere).
  * Finds an approximate bounding sphere for the heightfield. Sphere parameters are used to achieve a proper camera orientation.

## Limitations
* The WebGL extension for 32-bit unsigned integer (uint) indices may not be available on some platforms. If the extension is not available, the program defaults to 16-bit uint indices, which is supported by WebGL 1.0.

## Built With
* [WebGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API) - JavaScript API for rendering interactive 3D and 2D graphics
* [Sylvester](http://sylvester.jcoglan.com/) - JavaScript API for vector and matrix math

## Author
Alfonso Castellanos

## License
MIT @ [Alfonso Castellanos](https://github.com/TrulyFonz)

## Acknowledgements
* Professor Jernej Barbic for his [computer graphics class](http://www-bcf.usc.edu/~jbarbic/cs420-s17/)
* Mozilla for its [introduction to WebGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Getting_started_with_WebGL)
* Khronos Group and Google for their [camera controller module](https://github.com/KhronosGroup/WebGL/blob/master/sdk/demos/google/resources/cameracontroller.js)
