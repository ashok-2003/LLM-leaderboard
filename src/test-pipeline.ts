import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { fetchAll } from "./core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const env = readFileSync(resolve(ROOT, ".env"), "utf-8");
const apiKey = env.match(/^AA_API_KEY=(.+)$/m)![1].trim();

const result = await fetchAll(apiKey);
console.log("Total models:", result.models.length);
console.log("Sources:", JSON.stringify(result.sources, null, 2));
console.log("\nFirst 20 models:");
result.models.slice(0, 20).forEach((m, i) =>
  console.log(`  ${i + 1}. ${m.name.padEnd(35)} [${m.sources.join(",")}]`)
);
