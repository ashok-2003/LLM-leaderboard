import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname, extname, join } from "path";
import { fileURLToPath } from "url";
import { fetchAll, type MultiSourceResult } from "./core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC = resolve(ROOT, "public");
const DATA_DIR = resolve(ROOT, "data");
const CACHE_PATH = resolve(DATA_DIR, "dashboard.json");
const PORT = 3000;

function loadApiKey(): string {
  try {
    const env = readFileSync(resolve(ROOT, ".env"), "utf-8");
    const match = env.match(/^AA_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch {}
  try {
    return readFileSync(resolve(ROOT, "apikey.txt"), "utf-8").trim();
  } catch {}
  throw new Error("No API key found in .env or apikey.txt");
}

const AA_API_KEY = loadApiKey();

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
};

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function serveStatic(res: ServerResponse, filePath: string) {
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function getCached(): MultiSourceResult | null {
  try {
    if (existsSync(CACHE_PATH)) return JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
  } catch {}
  return null;
}

function saveCache(data: MultiSourceResult) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2));
}

async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  if (url === "/api/models" && method === "GET") {
    let data = getCached();
    if (!data) {
      try {
        data = await fetchAll(AA_API_KEY);
        saveCache(data);
      } catch (err: any) {
        return json(res, { error: err.message }, 500);
      }
    }
    return json(res, data);
  }

  if (url === "/api/refresh" && method === "POST") {
    try {
      console.log("Refreshing all sources...");
      const data = await fetchAll(AA_API_KEY);
      saveCache(data);
      console.log("Refresh complete.");
      return json(res, data);
    } catch (err: any) {
      return json(res, { error: err.message }, 500);
    }
  }

  serveStatic(res, join(PUBLIC, url === "/" ? "index.html" : url));
}

const server = createServer(handler);
server.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
