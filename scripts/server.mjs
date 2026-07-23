import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wardrobeImportApi } from "./import-job-api.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(projectRoot, "dist");
const backend = wardrobeImportApi({ env: process.env });

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

async function existingFile(file) {
  try {
    const details = await stat(file);
    return details.isFile() ? file : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end(JSON.stringify({ error: "Not found" }));
  }
  if (!["GET", "HEAD"].includes(req.method)) {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    return res.end("Method not allowed");
  }

  let requestedPath;
  try {
    requestedPath = decodeURIComponent(url.pathname);
  } catch {
    res.statusCode = 400;
    return res.end("Invalid URL");
  }
  const candidate = path.resolve(buildRoot, `.${requestedPath === "/" ? "/index.html" : requestedPath}`);
  const insideBuild = candidate === buildRoot || candidate.startsWith(`${buildRoot}${path.sep}`);
  if (!insideBuild) {
    res.statusCode = 403;
    return res.end("Forbidden");
  }

  const file = await existingFile(candidate) || await existingFile(path.join(buildRoot, "index.html"));
  if (!file) {
    res.statusCode = 503;
    return res.end("The application has not been built.");
  }

  const extension = path.extname(file).toLowerCase();
  res.statusCode = 200;
  res.setHeader("Content-Type", contentTypes.get(extension) || "application/octet-stream");
  res.setHeader(
    "Cache-Control",
    file.includes(`${path.sep}assets${path.sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  );
  if (req.method === "HEAD") return res.end();
  return createReadStream(file)
    .on("error", (error) => {
      console.error(`[wardrobe] Failed to serve ${file}: ${error.message}`);
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    })
    .pipe(res);
}

await backend.initialize(projectRoot);

const server = createServer((req, res) => {
  Promise.resolve(backend.handler(req, res, () => serveStatic(req, res)))
    .catch((error) => {
      console.error(`[wardrobe] ${req.method} ${req.url} failed: ${error.stack || error.message}`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
      }
      res.end(JSON.stringify({ error: "Internal server error" }));
    });
});

const port = Number.parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.info(`[wardrobe] Listening on http://0.0.0.0:${port}`);
});

