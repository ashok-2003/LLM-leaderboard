import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { fetchAAModels } from "./fetchers/aa.js";
import { fetchOpenRouterModels } from "./fetchers/openrouter.js";
import { fetchArenaCode, fetchArenaText } from "./fetchers/arena.js";
import { fetchClawEvalModels } from "./fetchers/claw-eval.js";
import { fetchOpenRouterRankings, fetchOpenClawRankings } from "./fetchers/openrouter-rankings.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadApiKey(): string {
  try {
    const env = readFileSync(resolve(ROOT, ".env"), "utf-8");
    const match = env.match(/^AA_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch {}
  throw new Error("No API key found in .env");
}

async function test(name: string, fn: () => Promise<unknown[]>) {
  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    const status = result.length > 0 ? "✓ OK" : "⚠ EMPTY";
    console.log(`${status.padEnd(8)} ${name.padEnd(20)} ${result.length} items  (${elapsed}ms)`);
    return result.length;
  } catch (e: unknown) {
    const elapsed = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`✗ FAIL  ${name.padEnd(20)} ERROR: ${msg}  (${elapsed}ms)`);
    return -1;
  }
}

async function main() {
  const apiKey = loadApiKey();
  console.log("Testing all fetchers...\n");

  const results = await Promise.all([
    test("AA",             () => fetchAAModels(apiKey)),
    test("OpenRouter",     () => fetchOpenRouterModels()),
    test("Arena Code",     () => fetchArenaCode().then(r => r.models)),
    test("Arena Text",     () => fetchArenaText().then(r => r.models)),
    test("Claw-Eval",      () => fetchClawEvalModels()),
    test("OR Rankings",    () => fetchOpenRouterRankings()),
    test("OpenClaw",       () => fetchOpenClawRankings()),
  ]);

  console.log("\n--- Summary ---");
  const names = ["AA", "OpenRouter", "Arena Code", "Arena Text", "Claw-Eval", "OR Rankings", "OpenClaw"];
  let allOk = true;
  for (let i = 0; i < names.length; i++) {
    const r = results[i];
    const status = r > 0 ? "OK" : r === 0 ? "EMPTY (no data)" : "FAILED";
    if (r <= 0) allOk = false;
    console.log(`  ${names[i].padEnd(15)}: ${status}`);
  }
  console.log(allOk ? "\nAll fetchers working!" : "\nSome fetchers have issues.");
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
