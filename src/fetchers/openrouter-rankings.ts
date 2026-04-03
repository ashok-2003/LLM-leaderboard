export interface ORRankedModel {
  modelId: string;          // e.g. "qwen/qwen3.6-plus-preview:free"
  totalTokens: number;      // cumulative tokens across all weeks in the page
  orRank: number;           // 1-based rank by usage
}

export interface OROpenClawModel {
  modelId: string;
  totalTokens: number;
  openclawRank: number;
}

async function parseRankingsPage(url: string): Promise<Map<string, number>> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const html = await res.text();

  // Data is embedded as escaped JSON: \"model/id\":bignum
  const pairs = html.matchAll(/\\"([a-z][a-z0-9_-]+\/[a-z][a-z0-9._:@-]+)\\":(\d{8,})/g);
  const totals = new Map<string, number>();
  for (const [, model, tokens] of pairs) {
    totals.set(model, (totals.get(model) ?? 0) + Number(tokens));
  }
  return totals;
}

export async function fetchOpenRouterRankings(): Promise<ORRankedModel[]> {
  const totals = await parseRankingsPage("https://openrouter.ai/rankings");
  const sorted = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);

  return sorted.map(([modelId, totalTokens], i) => ({
    modelId,
    totalTokens,
    orRank: i + 1,
  }));
}

export async function fetchOpenClawRankings(): Promise<OROpenClawModel[]> {
  const totals = await parseRankingsPage(
    "https://openrouter.ai/apps?url=https%3A%2F%2Fopenclaw.ai%2F"
  );
  if (totals.size === 0) return [];

  const sorted = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  return sorted.map(([modelId, totalTokens], i) => ({
    modelId,
    totalTokens,
    openclawRank: i + 1,
  }));
}
