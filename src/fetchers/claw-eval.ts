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

export async function fetchClawEvalModels(): Promise<ClawEvalModel[]> {
  // Step 1: fetch the index.html to find the JS bundle filename
  const indexRes = await fetch("https://claw-eval.github.io/");
  if (!indexRes.ok) throw new Error(`Claw-Eval index error: ${indexRes.status}`);
  const html = await indexRes.text();

  // Find the JS bundle URL (e.g., /assets/index-Ce-Gc2wr.js)
  const jsMatch = html.match(/\/assets\/index-[^"']+\.js/);
  if (!jsMatch) throw new Error("Could not find Claw-Eval JS bundle URL");

  // Step 2: fetch the JS bundle
  const jsRes = await fetch(`https://claw-eval.github.io${jsMatch[0]}`);
  if (!jsRes.ok) throw new Error(`Claw-Eval JS error: ${jsRes.status}`);
  const js = await jsRes.text();

  // Step 3: extract the embedded model data
  // The data is in a pattern like: wo={models:[{id:"sonnet46",name:"Claude Sonnet 4.6",...},...]
  // We need to find and parse this object
  const modelsMatch = js.match(/models:\s*\[\s*\{id:"[^"]+",name:"[^"]+"[\s\S]*?\}\s*\]/);
  if (!modelsMatch) throw new Error("Could not find embedded model data in Claw-Eval JS");

  // Parse by extracting each model object
  const modelsStr = modelsMatch[0];
  const models: ClawEvalModel[] = [];

  // Match each model block: {id:"...",name:"...",org:"...",...}
  // We use a simpler approach: extract key fields with regex
  const modelBlocks = modelsStr.split(/\{id:"/);

  for (const block of modelBlocks) {
    if (!block.includes('name:"')) continue;

    const id = block.match(/^([^"]+)"/)?.[1] ?? "";
    const name = block.match(/name:"([^"]+)"/)?.[1] ?? "";
    const org = block.match(/org:"([^"]+)"/)?.[1] ?? "";
    const avg_score = parseFloat(block.match(/avg_score:([\d.]+)/)?.[1] ?? "0");
    const pass_rate = parseFloat(block.match(/pass_rate:([\d.]+)/)?.[1] ?? "0");
    const pass_at_3_rate = parseFloat(block.match(/pass_at_3_rate:([\d.]+)/)?.[1] ?? "0");
    const pass_all_3_rate = parseFloat(block.match(/pass_all_3_rate:([\d.]+)/)?.[1] ?? "0");
    const avg_completion = parseFloat(block.match(/avg_completion:([\d.]+)/)?.[1] ?? "0");
    const avg_robustness = parseFloat(block.match(/avg_robustness:([\d.]+)/)?.[1] ?? "0");
    const avg_safety = parseFloat(block.match(/avg_safety:([\d.]+)/)?.[1] ?? "0");
    const tasks_evaluated = parseInt(block.match(/tasks_evaluated:(\d+)/)?.[1] ?? "0");

    if (name) {
      models.push({
        id, name, org, avg_score, pass_rate, pass_at_3_rate,
        pass_all_3_rate, avg_completion, avg_robustness, avg_safety,
        tasks_evaluated,
      });
    }
  }

  return models;
}
