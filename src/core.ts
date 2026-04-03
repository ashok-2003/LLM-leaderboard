import { fetchAAModels, type AAModel } from "./fetchers/aa.js";
import { fetchOpenRouterModels, type OpenRouterModel } from "./fetchers/openrouter.js";
import { fetchArenaCode, fetchArenaText, type ArenaModel } from "./fetchers/arena.js";
import { fetchClawEvalModels, type ClawEvalModel } from "./fetchers/claw-eval.js";
import { fetchOpenRouterRankings, fetchOpenClawRankings, type ORRankedModel, type OROpenClawModel } from "./fetchers/openrouter-rankings.js";

// ─── Unified Model Type ─────────────────────────────────────────────────────

export interface UnifiedModel {
  // Identity — canonical name + creator derived from best available source
  id: string;           // normalized key
  name: string;
  creator: string;
  sources: string[];    // which sources this model appeared in

  aa: {
    intelligenceIndex: number | null;
    codingIndex: number | null;
    mathIndex: number | null;
    speedToksPerSec: number | null;
  } | null;

  arenaCode: { rank: number; elo: number; votes: number } | null;
  arenaText:  { rank: number; elo: number; votes: number } | null;

  clawEval: {
    passAll3Rate: number;
    avgCompletion: number;
    avgRobustness: number;
    avgSafety: number;
  } | null;

  openRouter: {
    id: string;
    outputPricePerMillion: number;
    contextLength: number;
    supportsTools: boolean;
    supportsReasoning: boolean;
    isFree: boolean;
  } | null;

  orUsage: {
    rank: number;
    totalTokens: number;
  } | null;

  openClawUsage: {
    rank: number;
    totalTokens: number;
  } | null;
}

export interface MultiSourceResult {
  generatedAt: string;
  sources: {
    aa:           { count: number };
    arenaCode:    { count: number };
    arenaText:    { count: number };
    clawEval:     { count: number };
    openRouter:   { count: number };
    orRankings:   { count: number };
    openClawUsage:{ count: number };
  };
  models: UnifiedModel[];
}

// ─── Name Normalization & Matching ───────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function modelKeys(creator: string, name: string): string[] {
  const keys: string[] = [];
  keys.push(norm(name));
  keys.push(norm(creator + name));
  const cleaned = name.replace(/\(.*?\)/g, "").replace(/preview/gi, "").trim();
  if (cleaned !== name) {
    keys.push(norm(cleaned));
    keys.push(norm(creator + cleaned));
  }
  return [...new Set(keys.filter(k => k.length > 3))];
}

function orModelKeys(model: OpenRouterModel): string[] {
  const keys: string[] = [];
  keys.push(norm(model.id));
  keys.push(norm(model.id.replace(/:free$/, "")));
  const parts = model.id.split("/");
  if (parts.length >= 2) {
    const slug = parts.slice(1).join("/").replace(/:free$/, "");
    keys.push(norm(slug));
    keys.push(norm(parts[0] + slug));
  }
  keys.push(norm(model.name));
  return [...new Set(keys.filter(k => k.length > 3))];
}

// Keys from an OpenRouter model ID like "qwen/qwen3.6-plus-preview:free"
function orIdKeys(id: string): string[] {
  const keys: string[] = [];
  keys.push(norm(id));
  keys.push(norm(id.replace(/:free$/, "")));
  const parts = id.split("/");
  if (parts.length >= 2) {
    const slug = parts.slice(1).join("/").replace(/:free$/, "");
    keys.push(norm(slug));
    keys.push(norm(parts[0] + slug));
    // strip date suffixes like -20260205
    const noDate = slug.replace(/-\d{8}$/, "");
    keys.push(norm(noDate));
    keys.push(norm(parts[0] + noDate));
  }
  return [...new Set(keys.filter(k => k.length > 3))];
}

type IndexMap<T> = Map<string, T[]>;

function buildIndex<T>(items: T[], keyFn: (item: T) => string[]): IndexMap<T> {
  const index = new Map<string, T[]>();
  for (const item of items) {
    for (const key of keyFn(item)) {
      const list = index.get(key) ?? [];
      list.push(item);
      index.set(key, list);
    }
  }
  return index;
}

function lookupFirst<T>(index: IndexMap<T>, keys: string[]): T | null {
  for (const key of keys) {
    const hits = index.get(key);
    if (hits?.length) return hits[0];
  }
  return null;
}

// ─── Build a candidate pool from all sources ─────────────────────────────────

interface Candidate {
  id: string;   // normalized key
  name: string;
  creator: string;
  aaModel?: AAModel;
  arenaCodeModel?: ArenaModel & { vendor: string };
  arenaTextModel?: ArenaModel & { vendor: string };
  clawModel?: ClawEvalModel;
  orModel?: OpenRouterModel;
  orRanked?: ORRankedModel;
  openClawRanked?: OROpenClawModel;
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

export async function fetchAll(apiKey: string): Promise<MultiSourceResult> {
  const [
    aaModels, orModels,
    arenaCodeResult, arenaTextResult,
    clawModels, orRankings, openClawRankings,
  ] = await Promise.all([
    fetchAAModels(apiKey),
    fetchOpenRouterModels(),
    fetchArenaCode().catch(() => ({ meta: { leaderboard: "code", model_count: 0 }, models: [] as ArenaModel[] })),
    fetchArenaText().catch(() => ({ meta: { leaderboard: "text", model_count: 0 }, models: [] as ArenaModel[] })),
    fetchClawEvalModels().catch(() => [] as ClawEvalModel[]),
    fetchOpenRouterRankings().catch(() => [] as ORRankedModel[]),
    fetchOpenClawRankings().catch(() => [] as OROpenClawModel[]),
  ]);

  const now = new Date().toISOString();

  // ── Build indexes ──
  const orIndex      = buildIndex(orModels, orModelKeys);
  const arenaCodeIdx = buildIndex(arenaCodeResult.models as (ArenaModel & { vendor: string })[], m => modelKeys(m.vendor, m.model));
  const arenaTextIdx = buildIndex(arenaTextResult.models as (ArenaModel & { vendor: string })[], m => modelKeys(m.vendor, m.model));
  const clawIdx      = buildIndex(clawModels, m => modelKeys(m.org, m.name));

  // ── Build candidate pool: union of top-N from each source ──
  // Key = normalized id, value = Candidate
  const pool = new Map<string, Candidate>();

  function getOrCreateCandidate(keys: string[], name: string, creator: string): Candidate {
    for (const k of keys) {
      const existing = pool.get(k);
      if (existing) return existing;
    }
    const primaryKey = keys[0];
    const c: Candidate = { id: primaryKey, name, creator };
    for (const k of keys) pool.set(k, c);
    return c;
  }

  // From AA — top 50 by intelligence
  const aaTop = aaModels
    .filter(m => m.evaluations?.artificial_analysis_intelligence_index != null)
    .sort((a, b) =>
      (b.evaluations.artificial_analysis_intelligence_index ?? 0) -
      (a.evaluations.artificial_analysis_intelligence_index ?? 0)
    )
    .slice(0, 50);

  for (const aa of aaTop) {
    const keys = [
      ...modelKeys(aa.model_creator.name, aa.name),
      norm(aa.model_creator.slug + aa.slug),
      norm(aa.slug),
    ];
    const c = getOrCreateCandidate(keys, aa.name, aa.model_creator.name);
    c.aaModel = aa;
  }

  // From Arena Code — top 40
  for (const m of arenaCodeResult.models.slice(0, 40)) {
    const keys = modelKeys(m.vendor, m.model);
    const c = getOrCreateCandidate(keys, m.model, m.vendor);
    c.arenaCodeModel = m as ArenaModel & { vendor: string };
    // Try to link OpenRouter match for name
    const orMatch = lookupFirst(orIndex, keys);
    if (orMatch && !c.orModel) c.orModel = orMatch;
  }

  // From Arena Text — top 30
  for (const m of arenaTextResult.models.slice(0, 30)) {
    const keys = modelKeys(m.vendor, m.model);
    const c = getOrCreateCandidate(keys, m.model, m.vendor);
    c.arenaTextModel = m as ArenaModel & { vendor: string };
    const orMatch = lookupFirst(orIndex, keys);
    if (orMatch && !c.orModel) c.orModel = orMatch;
  }

  // From Claw-Eval — all models
  for (const m of clawModels) {
    const keys = modelKeys(m.org, m.name);
    const c = getOrCreateCandidate(keys, m.name, m.org);
    c.clawModel = m;
    const orMatch = lookupFirst(orIndex, keys);
    if (orMatch && !c.orModel) c.orModel = orMatch;
  }

  // From OR Rankings — top 40
  for (const r of orRankings.slice(0, 40)) {
    const keys = orIdKeys(r.modelId);
    const orMatch = lookupFirst(orIndex, keys);
    const name = orMatch?.name ?? r.modelId.split("/").slice(1).join("/");
    const creator = r.modelId.split("/")[0] ?? "Unknown";
    const c = getOrCreateCandidate(keys, name, creator);
    c.orRanked = r;
    if (orMatch && !c.orModel) c.orModel = orMatch;
  }

  // From OpenClaw usage
  for (const r of openClawRankings) {
    const keys = orIdKeys(r.modelId);
    const orMatch = lookupFirst(orIndex, keys);
    const name = orMatch?.name ?? r.modelId.split("/").slice(1).join("/");
    const creator = r.modelId.split("/")[0] ?? "Unknown";
    const c = getOrCreateCandidate(keys, name, creator);
    c.openClawRanked = r;
    if (orMatch && !c.orModel) c.orModel = orMatch;
  }

  // ── Deduplicate pool (multiple keys may point to same Candidate) ──
  const unique = [...new Set(pool.values())];

  // ── Enrich each candidate with all source data ──
  const models: UnifiedModel[] = unique.map(c => {
    const aa  = c.aaModel;
    const ac  = c.arenaCodeModel ?? lookupFirst(arenaCodeIdx, [c.id]);
    const at  = c.arenaTextModel ?? lookupFirst(arenaTextIdx, [c.id]);
    const ce  = c.clawModel      ?? lookupFirst(clawIdx,      [c.id]);
    const or  = c.orModel        ?? lookupFirst(orIndex,      [c.id]);

    const presentSources: string[] = [];
    if (aa) presentSources.push("aa");
    if (ac) presentSources.push("arenaCode");
    if (at) presentSources.push("arenaText");
    if (ce) presentSources.push("clawEval");
    if (or) presentSources.push("openRouter");
    if (c.orRanked) presentSources.push("orRankings");
    if (c.openClawRanked) presentSources.push("openClaw");

    return {
      id: c.id,
      name: aa?.name ?? or?.name ?? c.name,
      creator: aa?.model_creator.name ?? c.creator,
      sources: presentSources,

      aa: aa ? {
        intelligenceIndex: aa.evaluations.artificial_analysis_intelligence_index ?? null,
        codingIndex:       aa.evaluations.artificial_analysis_coding_index ?? null,
        mathIndex:         aa.evaluations.artificial_analysis_math_index ?? null,
        speedToksPerSec:   aa.median_output_tokens_per_second ?? null,
      } : null,

      arenaCode: ac ? { rank: ac.rank, elo: ac.score, votes: ac.votes } : null,
      arenaText: at ? { rank: at.rank, elo: at.score, votes: at.votes } : null,

      clawEval: ce ? {
        passAll3Rate: ce.pass_all_3_rate,
        avgCompletion: ce.avg_completion,
        avgRobustness: ce.avg_robustness,
        avgSafety:     ce.avg_safety,
      } : null,

      openRouter: or ? {
        id:                   or.id,
        outputPricePerMillion: parseFloat(or.pricing.completion) * 1_000_000,
        contextLength:        or.context_length,
        supportsTools:        or.supported_parameters?.includes("tools") ?? false,
        supportsReasoning:
          or.supported_parameters?.includes("reasoning") ||
          or.supported_parameters?.includes("include_reasoning") || false,
        isFree:
          or.id.endsWith(":free") ||
          (parseFloat(or.pricing.prompt) === 0 && parseFloat(or.pricing.completion) === 0),
      } : null,

      orUsage: c.orRanked ? {
        rank: c.orRanked.orRank,
        totalTokens: c.orRanked.totalTokens,
      } : null,

      openClawUsage: c.openClawRanked ? {
        rank: c.openClawRanked.openclawRank,
        totalTokens: c.openClawRanked.totalTokens,
      } : null,
    };
  });

  // Sort by AA intelligence first (null to bottom), then by OR usage rank
  models.sort((a, b) => {
    const ia = a.aa?.intelligenceIndex ?? -1;
    const ib = b.aa?.intelligenceIndex ?? -1;
    if (ib !== ia) return ib - ia;
    const ua = a.orUsage?.rank ?? 999;
    const ub = b.orUsage?.rank ?? 999;
    return ua - ub;
  });

  return {
    generatedAt: now,
    sources: {
      aa:            { count: aaModels.length },
      arenaCode:     { count: arenaCodeResult.models.length },
      arenaText:     { count: arenaTextResult.models.length },
      clawEval:      { count: clawModels.length },
      openRouter:    { count: orModels.length },
      orRankings:    { count: orRankings.length },
      openClawUsage: { count: openClawRankings.length },
    },
    models,
  };
}
