import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { fetchAndMatch, type MatchedModel } from "./core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv(): string {
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

async function main() {
  const apiKey = loadEnv();
  console.log("Fetching and matching models...\n");

  const result = await fetchAndMatch(apiKey);

  // Save raw output
  const dataDir = resolve(ROOT, "data");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(resolve(dataDir, "top-40-matched.json"), JSON.stringify(result, null, 2));

  // Print table
  const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);
  const rpad = (s: string, n: number) => s.slice(0, n).padStart(n);

  console.log(
    pad("##", 4) + pad("Model", 35) + pad("Creator", 15) +
    rpad("Intel", 7) + rpad("Code", 7) + rpad("Math", 7) +
    rpad("Tok/s", 8) + rpad("$/1M", 9) + pad("  OnOR?", 8) + "  OpenRouter ID(s)"
  );
  console.log("-".repeat(140));

  for (const r of result.top40) {
    const intel = r.intelligenceIndex != null ? r.intelligenceIndex.toFixed(1) : "-";
    const code = r.codingIndex != null ? r.codingIndex.toFixed(1) : "-";
    const math = r.mathIndex != null ? r.mathIndex.toFixed(1) : "-";
    const speed = r.speedToksPerSec != null ? r.speedToksPerSec.toFixed(0) : "-";
    const price = r.priceBlended != null ? `$${r.priceBlended.toFixed(2)}` : "-";
    const onOR = r.availableOnOpenRouter ? "  Y" : "  N";
    const orIds = r.openRouterIds.length > 0 ? r.openRouterIds.join(", ") : "-";

    console.log(
      pad(`#${r.rank}`, 4) + pad(r.aaName, 35) + pad(r.creator, 15) +
      rpad(intel, 7) + rpad(code, 7) + rpad(math, 7) +
      rpad(speed, 8) + rpad(price, 9) + pad(onOR, 8) + "  " + orIds
    );
  }

  const available = result.top40.filter((r: MatchedModel) => r.availableOnOpenRouter).length;
  const free = result.top40.filter((r: MatchedModel) => r.openRouterDetails.some((d) => d.isFree)).length;
  console.log(`\nSummary: ${result.top40.length} models | ${available} on OpenRouter | ${free} free`);
  console.log(`Saved to data/top-40-matched.json`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
