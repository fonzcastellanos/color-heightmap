const http = require("http");
const fs = require("fs");
const path = require("path");

function serveInternalServerErr(resp) {
  resp.writeHead(500);
  resp.end("500: Internal Server Error");
}

const server = http.createServer((req, resp) => {
  let fpath = `.${req.url}`;
  if (fpath === "./") {
    fpath = "./index.html";
  }

  const mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
  };
  const contentType = mimeTypes[path.extname(fpath)];

  fs.readFile(fpath, (error, content) => {
    if (!error) {
      resp.writeHead(200, { "Content-Type": contentType });
      resp.end(content, "utf-8");
    } else if (error.code === "ENOENT") {
      fs.readFile("./404.html", (error, content) => {
        if (error) {
          serveInternalServerErr(resp);
          return;
        }
        resp.writeHead(404, { "Content-Type": "text/html" });
        resp.end(content, "utf-8");
      });
    } else {
      serveInternalServerErr(resp);
    }
  });
});

server.listen(8000);
