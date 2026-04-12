// One-time script: extract OpenClaw rankings from cached HTML into a static JSON
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const html = readFileSync(resolve(ROOT, "data/raw/openclaw-rankings.html"), "utf-8");

// Find appModelAnalytics array
const marker = "appModelAnalytics";
const startIdx = html.indexOf(marker);
if (startIdx < 0) { console.error("appModelAnalytics not found"); process.exit(1); }

const arrayStart = html.indexOf("[", startIdx);
if (arrayStart < 0) { console.error("array start not found"); process.exit(1); }

// Track bracket depth
let depth = 0, end = arrayStart;
for (let i = arrayStart; i < html.length && i < arrayStart + 500_000; i++) {
  if (html[i] === "[") depth++;
  else if (html[i] === "]") { depth--; if (depth === 0) { end = i + 1; break; } }
}

let jsonStr = html.slice(arrayStart, end);
// Unescape if needed
if (jsonStr.includes('\\"')) jsonStr = jsonStr.replace(/\\"/g, '"').replace(/\\\\/g, "\\");

const raw: { date: string; model_permaslug: string; total_tokens: number }[] = JSON.parse(jsonStr);
console.log("Raw entries:", raw.length);

// Get latest date
const dates = [...new Set(raw.map(e => e.date))].sort();
const latestDate = dates[dates.length - 1];
console.log("Latest date:", latestDate);

// Aggregate by model
const byModel = new Map<string, number>();
for (const e of raw) {
  if (e.date !== latestDate) continue;
  byModel.set(e.model_permaslug, (byModel.get(e.model_permaslug) ?? 0) + e.total_tokens);
}

const sorted = [...byModel.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .map(([modelId, totalTokens], i) => ({ modelId, totalTokens, openclawRank: i + 1 }));

console.log("Top 15 OpenClaw models:");
sorted.forEach(m => console.log(`  #${m.openclawRank} ${m.modelId} (${m.totalTokens.toLocaleString()} tokens)`));

writeFileSync(resolve(ROOT, "data/openclaw-fallback.json"), JSON.stringify({ date: latestDate, models: sorted }, null, 2));
console.log("\nSaved to data/openclaw-fallback.json");
