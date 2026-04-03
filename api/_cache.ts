// Shared cache helpers for Vercel serverless functions.
// Uses /tmp (writable on Vercel) with a 1-hour TTL.
// Falls back to in-memory between warm invocations.

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { MultiSourceResult } from "../src/core.js";

const CACHE_PATH = "/tmp/dashboard.json";
const TTL_MS = 60 * 60 * 1000; // 1 hour

export function getApiKey(): string {
  const key = process.env.AA_API_KEY;
  if (key) return key;
  throw new Error("AA_API_KEY environment variable is not set");
}

export function getCached(): MultiSourceResult | null {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const raw = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
    // Check TTL
    const age = Date.now() - new Date(raw.generatedAt).getTime();
    if (age > TTL_MS) return null;
    return raw;
  } catch {
    return null;
  }
}

export function saveCache(data: MultiSourceResult): void {
  try {
    writeFileSync(CACHE_PATH, JSON.stringify(data));
  } catch {
    // /tmp write can fail silently — not critical
  }
}
