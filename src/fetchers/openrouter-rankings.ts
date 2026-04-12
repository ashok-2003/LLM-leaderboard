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
    signal: AbortSignal.timeout(15000),
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
    .slice(0, 15);

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

// Static fallback: extracted from OpenClaw app page on 2026-04-03.
// The page migrated from SSR to client-only rendering — live scraping no longer works.
// This fallback is used when the live fetch returns no data.
const OPENCLAW_FALLBACK: OROpenClawModel[] = [
  { modelId: "stepfun/step-3.5-flash",                  totalTokens: 3546488539232, openclawRank: 1  },
  { modelId: "xiaomi/mimo-v2-pro-20260318",              totalTokens: 2564138823942, openclawRank: 2  },
  { modelId: "z-ai/glm-5-turbo-20260315",               totalTokens: 2422260813259, openclawRank: 3  },
  { modelId: "anthropic/claude-4.6-sonnet-20260217",    totalTokens: 1061840653398, openclawRank: 4  },
  { modelId: "minimax/minimax-m2.5-20260211",           totalTokens: 1000969014713, openclawRank: 5  },
  { modelId: "minimax/minimax-m2.7-20260318",           totalTokens:  820100558715, openclawRank: 6  },
  { modelId: "openrouter/hunter-alpha",                  totalTokens:  772719162336, openclawRank: 7  },
  { modelId: "arcee-ai/trinity-large-preview",           totalTokens:  713831381439, openclawRank: 8  },
  { modelId: "anthropic/claude-4.6-opus-20260205",      totalTokens:  702456043283, openclawRank: 9  },
  { modelId: "moonshotai/kimi-k2.5-0127",               totalTokens:  616950043695, openclawRank: 10 },
  { modelId: "google/gemini-3-flash-preview-20251217",  totalTokens:  545575409886, openclawRank: 11 },
  { modelId: "nvidia/nemotron-3-super-120b-a12b-20230311", totalTokens: 382969569117, openclawRank: 12 },
  { modelId: "xiaomi/mimo-v2-omni-20260318",            totalTokens:  377004822888, openclawRank: 13 },
  { modelId: "deepseek/deepseek-v3.2-20251201",         totalTokens:  312857922697, openclawRank: 14 },
  { modelId: "google/gemini-2.5-flash-lite",            totalTokens:  262816415859, openclawRank: 15 },
];

/**
 * OpenClaw-specific rankings.
 *
 * OpenRouter migrated the apps page from SSR (which embedded appModelAnalytics in HTML)
 * to App Router RSC (data only in client-side JS stream). Live scraping no longer works.
 * We try the live fetch first in case SSR is restored, then fall back to static data.
 */
export async function fetchOpenClawRankings(): Promise<OROpenClawModel[]> {
  const url = "https://openrouter.ai/apps?url=https%3A%2F%2Fopenclaw.ai%2F";

  try {
    // Try live: parse appModelAnalytics from SSR HTML (works if OpenRouter restores SSR)
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const html = await res.text();

      // Strategy 1: appModelAnalytics JSON embedded in page
      const marker = "appModelAnalytics";
      const mIdx = html.indexOf(marker);
      if (mIdx >= 0) {
        const arrayStart = html.indexOf("[", mIdx);
        if (arrayStart >= 0) {
          let depth = 0, end = arrayStart;
          for (let i = arrayStart; i < html.length && i < arrayStart + 500_000; i++) {
            if (html[i] === "[") depth++;
            else if (html[i] === "]") { depth--; if (depth === 0) { end = i + 1; break; } }
          }
          let jsonStr = html.slice(arrayStart, end);
          if (jsonStr.includes('\\"')) jsonStr = jsonStr.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
          try {
            const raw: { date: string; model_permaslug: string; total_tokens: number }[] = JSON.parse(jsonStr);
            if (raw.length) {
              const dates = [...new Set(raw.map(e => e.date))].sort();
              const latestDate = dates[dates.length - 1];
              const byModel = new Map<string, number>();
              for (const e of raw) {
                if (e.date !== latestDate) continue;
                byModel.set(e.model_permaslug, (byModel.get(e.model_permaslug) ?? 0) + e.total_tokens);
              }
              const sorted = [...byModel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
              console.log(`  OpenClaw: live data (${sorted.length} models, ${latestDate})`);
              return sorted.map(([modelId, totalTokens], i) => ({ modelId, totalTokens, openclawRank: i + 1 }));
            }
          } catch { /* continue to fallback */ }
        }
      }

      // Strategy 2: rankingData (old format)
      const entries = await parseRankingsData(url).catch(() => []);
      if (entries.length) {
        const dates = [...new Set(entries.map(e => e.date))].sort();
        const latestDate = dates[dates.length - 1];
        const byModel = new Map<string, number>();
        for (const e of entries) {
          if (e.date !== latestDate) continue;
          byModel.set(e.model_permaslug, (byModel.get(e.model_permaslug) ?? 0) + (e.total_prompt_tokens ?? 0) + (e.total_completion_tokens ?? 0));
        }
        const sorted = [...byModel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
        if (sorted.length) {
          console.log(`  OpenClaw: live rankingData (${sorted.length} models)`);
          return sorted.map(([modelId, totalTokens], i) => ({ modelId, totalTokens, openclawRank: i + 1 }));
        }
      }
    }
  } catch { /* fall through to static fallback */ }

  console.log("  OpenClaw: using static fallback (2026-04-03)");
  return OPENCLAW_FALLBACK;
}
