export interface ORRankedModel {
  modelId: string;          // canonical OR slug e.g. "qwen/qwen3.6-plus-preview"
  variantId: string;        // full variant e.g. "qwen/qwen3.6-plus-preview:free"
  totalTokens: number;      // prompt + completion for the LATEST date
  promptTokens: number;
  completionTokens: number;
  requestCount: number;
  orRank: number;           // 1-based rank by total tokens
}

export interface OROpenClawModel {
  modelId: string;
  totalTokens: number;
  openclawRank: number;
}

interface RankingEntry {
  date: string;
  model_permaslug: string;
  variant: string;
  variant_permaslug: string;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_native_tokens_reasoning: number;
  total_native_tokens_cached: number;
  total_tool_calls: number;
  count: number;
}

/**
 * Parse the rankings page and extract the structured rankingData JSON.
 * The page embeds a `rankingData` array with per-model per-date entries.
 * We use only the LATEST date to match what OpenRouter displays.
 */
async function parseRankingsData(url: string): Promise<RankingEntry[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const html = await res.text();

  // Find the rankingData JSON array embedded in the page.
  // It's escaped as \"key\":\"value\" inside the HTML, so we need to unescape first.
  const marker = 'rankingData":[';
  let startIdx = html.indexOf(marker);
  // Also try escaped variant
  if (startIdx < 0) startIdx = html.indexOf('rankingData\\":[');
  if (startIdx < 0) return [];

  // Find the `[` that starts the array
  const arrayStart = html.indexOf("[", startIdx);
  if (arrayStart < 0) return [];

  // Track bracket depth to find the matching `]`
  let depth = 0;
  let end = arrayStart;
  for (let i = arrayStart; i < html.length && i < arrayStart + 1_000_000; i++) {
    const ch = html[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }

  let jsonStr = html.slice(arrayStart, end);

  // Unescape: the HTML may have \" instead of real quotes
  // Check if it starts with [\" (escaped) vs [" (raw)
  if (jsonStr.startsWith('[{\\"') || jsonStr.startsWith('[{\\\"')) {
    jsonStr = jsonStr.replace(/\\"/g, '"');
  }

  try {
    return JSON.parse(jsonStr);
  } catch {
    return [];
  }
}

export async function fetchOpenRouterRankings(): Promise<ORRankedModel[]> {
  const entries = await parseRankingsData("https://openrouter.ai/rankings");
  if (!entries.length) return [];

  // Find the latest date
  const dates = [...new Set(entries.map(e => e.date))].sort();
  const latestDate = dates[dates.length - 1];

  // Filter to latest date only, aggregate by model_permaslug
  // (a model can have multiple variants like ":free" and paid)
  const byModel = new Map<string, {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    requestCount: number;
    variantId: string;
  }>();

  for (const e of entries) {
    if (e.date !== latestDate) continue;
    const key = e.model_permaslug;
    const existing = byModel.get(key);
    const total = (e.total_prompt_tokens ?? 0) + (e.total_completion_tokens ?? 0);
    if (existing) {
      existing.totalTokens += total;
      existing.promptTokens += e.total_prompt_tokens ?? 0;
      existing.completionTokens += e.total_completion_tokens ?? 0;
      existing.requestCount += e.count ?? 0;
      // Keep the variant with higher tokens
      if (total > existing.totalTokens / 2) {
        existing.variantId = e.variant_permaslug || e.model_permaslug;
      }
    } else {
      byModel.set(key, {
        totalTokens: total,
        promptTokens: e.total_prompt_tokens ?? 0,
        completionTokens: e.total_completion_tokens ?? 0,
        requestCount: e.count ?? 0,
        variantId: e.variant_permaslug || e.model_permaslug,
      });
    }
  }

  const sorted = [...byModel.entries()]
    .sort((a, b) => b[1].totalTokens - a[1].totalTokens)
    .slice(0, 50);

  return sorted.map(([modelId, data], i) => ({
    modelId,
    variantId: data.variantId,
    totalTokens: data.totalTokens,
    promptTokens: data.promptTokens,
    completionTokens: data.completionTokens,
    requestCount: data.requestCount,
    orRank: i + 1,
  }));
}

/**
 * OpenClaw-specific rankings.
 *
 * The OpenClaw app page on OpenRouter is fully client-rendered (no SSR data).
 * Strategy:
 *   1. Try live fetch — parse chart data from the HTML if present
 *   2. Fall back to saved snapshot on disk (data/raw/openclaw-rankings.html)
 *   3. If neither works, return empty (graceful degradation)
 */
export async function fetchOpenClawRankings(): Promise<OROpenClawModel[]> {
  // Try live fetch first
  const liveResult = await fetchOpenClawFromUrl(
    "https://openrouter.ai/apps?url=https%3A%2F%2Fopenclaw.ai%2F"
  );
  if (liveResult.length > 0) return liveResult;

  // Fall back to saved HTML snapshot on disk
  try {
    const { readFileSync } = await import("fs");
    const { resolve, dirname } = await import("path");
    const { fileURLToPath } = await import("url");
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const savedPath = resolve(__dirname, "../../data/raw/openclaw-rankings.html");
    const html = readFileSync(savedPath, "utf-8");
    const result = parseChartData(html);
    if (result.length > 0) {
      console.log(`  OpenClaw: using saved snapshot (${result.length} models)`);
      return result;
    }
  } catch {}

  return [];
}

async function fetchOpenClawFromUrl(url: string): Promise<OROpenClawModel[]> {
  try {
    // Try structured rankingData first
    const entries = await parseRankingsData(url);
    if (entries.length) {
      const dates = [...new Set(entries.map(e => e.date))].sort();
      const latestDate = dates[dates.length - 1];
      const byModel = new Map<string, number>();
      for (const e of entries) {
        if (e.date !== latestDate) continue;
        const key = e.model_permaslug;
        byModel.set(key, (byModel.get(key) ?? 0) + (e.total_prompt_tokens ?? 0) + (e.total_completion_tokens ?? 0));
      }
      const sorted = [...byModel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
      return sorted.map(([modelId, totalTokens], i) => ({
        modelId, totalTokens, openclawRank: i + 1,
      }));
    }

    // Try chart data from fresh fetch
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    return parseChartData(await res.text());
  } catch {
    return [];
  }
}

function parseChartData(html: string): OROpenClawModel[] {
  const pairs = html.matchAll(/\\"([a-z][a-z0-9_-]+\/[a-z][a-z0-9._:@-]+)\\":(\d{8,})/g);
  const totals = new Map<string, number>();
  for (const [, model, tokens] of pairs) {
    totals.set(model, (totals.get(model) ?? 0) + Number(tokens));
  }
  if (totals.size === 0) return [];
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  return sorted.map(([modelId, totalTokens], i) => ({
    modelId, totalTokens, openclawRank: i + 1,
  }));
}
