async function main() {
  const indexRes = await fetch("https://claw-eval.github.io/", { signal: AbortSignal.timeout(8000) });
  const html = await indexRes.text();
  const jsMatch = html.match(/\/assets\/index-[^"']+\.js/);

  const jsRes = await fetch("https://claw-eval.github.io" + jsMatch![0], { signal: AbortSignal.timeout(10000) });
  const js = await jsRes.text();

  // Replicate the exact logic from the fetcher
  const latestVersionMatch = js.match(/\{id:"(\d{8})"[^}]*latest:!0/);
  console.log("Latest version match:", latestVersionMatch?.[0]);
  const latestVersion = latestVersionMatch?.[1];
  console.log("Latest version:", latestVersion);

  let benchmarkChunk: string | null = null;
  if (latestVersion) {
    const chunkRegex = new RegExp(
      latestVersion + `[^}]{0,200}benchmark[^}]{0,200}import\\("\\./([^"]+\\.js)"`,
    );
    console.log("Chunk regex:", chunkRegex);
    const chunkMatch = js.match(chunkRegex);
    console.log("Chunk match:", chunkMatch?.[0]?.slice(0, 100));
    benchmarkChunk = chunkMatch?.[1] ?? null;
  }

  if (!benchmarkChunk) {
    const allChunks = js.match(/benchmark-[A-Za-z0-9]+\.js/g) ?? [];
    console.log("Fallback chunks:", allChunks);
    benchmarkChunk = allChunks[allChunks.length - 1] ?? null;
  }

  console.log("Resolved chunk:", benchmarkChunk);

  if (!benchmarkChunk) { console.log("NO CHUNK FOUND"); return; }

  const benchRes = await fetch(`https://claw-eval.github.io/assets/${benchmarkChunk}`, { signal: AbortSignal.timeout(15000) });
  const benchJs = await benchRes.text();
  console.log("Chunk size:", benchJs.length);
  console.log("First 300 chars:", benchJs.slice(0, 300));

  const modelBlocks = benchJs.split(/\{id:"/);
  console.log("Block count after split:", modelBlocks.length);
  console.log("First block:", modelBlocks[0]?.slice(0, 100));
  console.log("Second block:", modelBlocks[1]?.slice(0, 150));

  // Try the parse
  let count = 0;
  for (const block of modelBlocks) {
    if (!block.includes('name:"')) continue;
    const name = block.match(/name:"([^"]+)"/)?.[1];
    if (name) count++;
  }
  console.log("Models parsed:", count);
}

main().catch(e => { console.error(e.message); process.exit(1); });
