export interface ArenaModel {
  rank: number;
  model: string;
  vendor: string;
  license: string;
  score: number;
  ci: number;
  votes: number;
}

export interface ArenaResult {
  meta: { leaderboard: string; model_count: number };
  models: ArenaModel[];
}

async function fetchArenaLeaderboard(name: string): Promise<ArenaResult> {
  const res = await fetch(
    `https://api.wulong.dev/arena-ai-leaderboards/v1/leaderboard?name=${name}`,
    { signal: AbortSignal.timeout(10000) },
  );
  if (!res.ok) throw new Error(`Arena API error (${name}): ${res.status} ${res.statusText}`);
  return await res.json();
}

export async function fetchArenaCode(): Promise<ArenaResult> {
  return fetchArenaLeaderboard("code");
}

export async function fetchArenaText(): Promise<ArenaResult> {
  return fetchArenaLeaderboard("text");
}
