import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = Number(process.env.E2E_PORT || process.env.PORT || 4175);
const HOST = "127.0.0.1";
const MIME = new Map([
   [".css", "text/css; charset=utf-8"],
   [".html", "text/html; charset=utf-8"],
   [".js", "text/javascript; charset=utf-8"],
   [".json", "application/json; charset=utf-8"],
   [".mjs", "text/javascript; charset=utf-8"],
   [".png", "image/png"],
   [".svg", "image/svg+xml"],
   [".webmanifest", "application/manifest+json"],
   [".woff2", "font/woff2"],
]);

function resolveFile(urlPath) {
   const decoded = decodeURIComponent(urlPath.split("?")[0]);
   const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
   const absolute = path.resolve(ROOT, relative);
   if (absolute !== ROOT && !absolute.startsWith(`${ROOT}${path.sep}`)) return null;
   return absolute;
}

const server = http.createServer(async (request, response) => {
   if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
   }
   const file = resolveFile(request.url || "/");
   if (!file) {
      response.writeHead(400);
      response.end("Bad request");
      return;
   }
   try {
      const info = await stat(file);
      if (!info.isFile()) {
         response.writeHead(404);
         response.end("Not found");
         return;
      }
      response.writeHead(200, {
         "Cache-Control": "no-store",
         "Content-Length": info.size,
         "Content-Type": MIME.get(path.extname(file)) || "application/octet-stream",
         "X-Content-Type-Options": "nosniff",
      });
      if (request.method === "HEAD") {
         response.end();
         return;
      }
      createReadStream(file).pipe(response);
   } catch {
      response.writeHead(404);
      response.end("Not found");
   }
});

server.listen(PORT, HOST, () => {
   console.log(`E2E server listening on http://${HOST}:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
   process.on(signal, () => server.close(() => process.exit(0)));
}
