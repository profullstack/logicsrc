import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCommandBoardServer } from "../commandboard-api/dist/index.js";

const appDirectory = fileURLToPath(new URL(".", import.meta.url));
const distDirectory = resolve(appDirectory, "dist");
const indexFile = join(distDirectory, "index.html");
const port = readPort(process.env.PORT, 4173);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

export function createCommandBoardWebServer() {
  const apiServer = createCommandBoardServer();

  return createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (url.pathname === "/health" || url.pathname.startsWith("/api/")) {
      apiServer.emit("request", request, response);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD" });
      response.end("Method not allowed");
      return;
    }

    let file;
    try {
      file = resolveStaticPath(url.pathname);
    } catch (error) {
      if (error instanceof URIError) {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end("Invalid path encoding");
        return;
      }
      throw error;
    }

    if (!file) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    sendFile(file, request.method === "HEAD", response);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createCommandBoardWebServer().listen(port, () => {
    console.log(`CommandBoard.run PWA listening on http://localhost:${port}`);
  });
}

export function resolveStaticPath(pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  let candidate = join(distDirectory, normalizedPath);

  if (!candidate.startsWith(distDirectory)) {
    return null;
  }

  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    candidate = join(candidate, "index.html");
  }

  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }

  return indexFile;
}

function readPort(value, fallback) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function sendFile(file, headOnly, response) {
  if (!existsSync(file)) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Build output missing. Run `npm run build` before `npm start`.");
    return;
  }

  const extension = extname(file);
  response.writeHead(200, {
    "cache-control": extension === ".html" ? "no-store" : "public, max-age=31536000, immutable",
    "content-type": mimeTypes[extension] ?? "application/octet-stream"
  });

  if (headOnly) {
    response.end();
    return;
  }

  createReadStream(file).pipe(response);
}
