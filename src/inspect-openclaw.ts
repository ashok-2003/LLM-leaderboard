async function main() {
  const url = "https://openrouter.ai/apps?url=https%3A%2F%2Fopenclaw.ai%2F";

  // Next.js App Router streams RSC data. Read the full stream.
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/x-component",
      "RSC": "1",
      "Next-Router-State-Tree": "%5B%22%22%2C%7B%22children%22%3A%5B%5B%22apps%22%2C%7B%22url%22%3A%22https%3A%2F%2Fopenclaw.ai%2F%22%7D%2C%22d%22%5D%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D",
      "Next-Url": "/apps",
    },
    signal: AbortSignal.timeout(30000),
  });

  console.log("Status:", res.status, "Content-Type:", res.headers.get("content-type"));

  // Read as stream to get all chunks
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
  }

  console.log("Full RSC payload size:", full.length);
  console.log("Has model_permaslug:", full.includes("model_permaslug"));
  console.log("Has appModelAnalytics:", full.includes("appModelAnalytics"));
  console.log("Has total_tokens:", full.includes("total_tokens"));

  // Show all lines
  const lines = full.split("\n");
  console.log("Lines:", lines.length);
  for (const line of lines) {
    if (line.includes("model_permaslug") || line.includes("appModelAnalytics") || line.includes("total_tokens")) {
      console.log("DATA LINE:", line.slice(0, 300));
    }
  }

  if (full.length < 20000) {
    console.log("\nFull payload:\n", full);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
