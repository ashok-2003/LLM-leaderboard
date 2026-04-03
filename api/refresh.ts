import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchAll } from "../src/core.js";
import { getApiKey, saveCache } from "./_cache.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const data = await fetchAll(getApiKey());
    saveCache(data);
    return res.status(200).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
