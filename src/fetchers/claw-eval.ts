export interface ClawEvalModel {
  id: string;
  name: string;
  org: string;
  avg_score: number;
  pass_rate: number;
  pass_at_3_rate: number;
  pass_all_3_rate: number;
  avg_completion: number;
  avg_robustness: number;
  avg_safety: number;
  tasks_evaluated: number;
}

/**
 * Claw-Eval loads model data from a lazy-loaded benchmark chunk (e.g. benchmark-BhpHf0gT.js).
 * Strategy:
 *   1. Fetch index.html → find main bundle URL
 *   2. Fetch main bundle → find latest version ID and its benchmark chunk filename
 *   3. Fetch the benchmark chunk → parse the models array
 */
export async function fetchClawEvalModels(): Promise<ClawEvalModel[]> {
  try {
    // Step 1: fetch index.html
    const indexRes = await fetch("https://claw-eval.github.io/", {
      signal: AbortSignal.timeout(8000),
    });
    if (!indexRes.ok) throw new Error(`Claw-Eval index error: ${indexRes.status}`);
    const html = await indexRes.text();

    const jsMatch = html.match(/\/assets\/index-[^"']+\.js/);
    if (!jsMatch) throw new Error("Could not find Claw-Eval main bundle URL");

    // Step 2: fetch main bundle to locate the benchmark chunk for the latest version
    const jsRes = await fetch(`https://claw-eval.github.io${jsMatch[0]}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!jsRes.ok) throw new Error(`Claw-Eval bundle error: ${jsRes.status}`);
    const js = await jsRes.text();

    // Find the latest version ID: e.g. {id:"20260408",...latest:!0}
    const latestVersionMatch = js.match(/\{id:"(\d{8})"[^}]*latest:!0/);
    const latestVersion = latestVersionMatch?.[1];

    // Find benchmark chunk for that version:
    // e.g. 20260408:{benchmark:()=>qi(()=>import("./benchmark-BhpHf0gT.js"),...)}
    let benchmarkChunk: string | null = null;
    if (latestVersion) {
      // Match exactly: 20260408:{benchmark:()=>qi(()=>import("./benchmark-XYZ.js")
      const chunkRegex = new RegExp(
        latestVersion + `:\\{benchmark:\\(\\)=>\\w+\\(\\(\\)=>import\\("\\.\\/(benchmark-[^"]+\\.js)"`,
      );
      const chunkMatch = js.match(chunkRegex);
      benchmarkChunk = chunkMatch?.[1] ?? null;
    }

    if (!benchmarkChunk) {
      // Fallback: take the LAST benchmark-*.js reference (likely the newest)
      const allChunks = js.match(/benchmark-[A-Za-z0-9]+\.js/g) ?? [];
      benchmarkChunk = allChunks[allChunks.length - 1] ?? null;
    }

    if (!benchmarkChunk) throw new Error("Could not find Claw-Eval benchmark chunk filename");

    // Step 3: fetch the benchmark chunk
    const benchRes = await fetch(`https://claw-eval.github.io/assets/${benchmarkChunk}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!benchRes.ok) throw new Error(`Claw-Eval benchmark chunk error: ${benchRes.status}`);
    const benchJs = await benchRes.text();

    // Step 4: parse models
    // Chunk starts with: const s={models:[{id:"opus46",name:"Claude Opus 4.6",...},...],...}
    const models: ClawEvalModel[] = [];
    const modelBlocks = benchJs.split(/\{id:"/);

    for (const block of modelBlocks) {
      if (!block.includes('name:"')) continue;

      const id           = block.match(/^([^"]+)"/)?.[1] ?? "";
      const name         = block.match(/name:"([^"]+)"/)?.[1] ?? "";
      const org          = block.match(/org:"([^"]+)"/)?.[1] ?? "";
      const avg_score    = parseFloat(block.match(/avg_score:([\d.]+)/)?.[1] ?? "0");
      const pass_rate    = parseFloat(block.match(/pass_rate:([\d.]+)/)?.[1] ?? "0");
      const pass_at_3    = parseFloat(block.match(/pass_at_3_rate:([\d.]+)/)?.[1] ?? "0");
      const pass_all_3   = parseFloat(block.match(/pass_all_3_rate:([\d.]+)/)?.[1] ?? "0");
      const avg_compl    = parseFloat(block.match(/avg_completion:([\d.]+)/)?.[1] ?? "0");
      const avg_robust   = parseFloat(block.match(/avg_robustness:([\d.]+)/)?.[1] ?? "0");
      const avg_safety   = parseFloat(block.match(/avg_safety:([\d.]+)/)?.[1] ?? "0");
      const tasks_eval   = parseInt(block.match(/tasks_evaluated:(\d+)/)?.[1] ?? "0", 10);

      if (name) {
        models.push({
          id, name, org, avg_score, pass_rate,
          pass_at_3_rate: pass_at_3,
          pass_all_3_rate: pass_all_3,
          avg_completion: avg_compl,
          avg_robustness: avg_robust,
          avg_safety, tasks_evaluated: tasks_eval,
        });
      }
    }

    if (models.length === 0) throw new Error("Could not parse any models from Claw-Eval benchmark chunk");

    console.log(`  Claw-Eval: parsed ${models.length} models from ${benchmarkChunk}`);
    return models;
  } catch (e) {
    console.warn("  Claw-Eval fetch failed:", (e as Error).message);
    return [];
  }
}
