const http = require("http");
const fs = require("fs");
const path = require("path");

const requestedPort = Number(process.argv[2] || 5500);
const host = "127.0.0.1";
const root = process.cwd();
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${host}:${requestedPort}`);
  let requestPath = decodeURIComponent(url.pathname);
  if (requestPath.endsWith("/")) requestPath += "index.html";

  let file = path.resolve(root, `.${requestPath}`);
  if (!file.startsWith(root)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.stat(file, (statError, stat) => {
    if (!statError && stat.isDirectory()) file = path.join(file, "index.html");
    fs.readFile(file, (readError, data) => {
      if (readError) {
        send(res, 404, "Not found");
        return;
      }
      send(res, 200, data, types[path.extname(file).toLowerCase()] || "application/octet-stream");
    });
  });
});

server.listen(requestedPort, host, () => {
  console.log(`Overlay Manager running at http://${host}:${requestedPort}/`);
});
