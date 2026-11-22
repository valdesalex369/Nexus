/**
 * GDELT DOC 2.0 client — translingual global news coverage + tone.
 *
 * Free, no key, institutional-grade (api.gdeltproject.org). Monitors news
 * in 65 languages with machine translation; updated every ~15 minutes over
 * a rolling 3-month window.
 *
 * Rate limit: ~1 request / 5 seconds per IP; exceeding it earns a ~15 min
 * block. All calls here go through a serialized throttle, and results are
 * cached per (mode, query) for CACHE_TTL_MS.
 *
 * Modes used:
 *  - ArtList      → headlines for GeopoliticalAgent (fallback to WorldMonitor)
 *  - TimelineTone → news-tone time series for AlphaScanner divergence checks
 */

import axios from "axios";
import { config } from "../../shared/config";

export interface GdeltArticle {
  title: string;
  url: string;
  domain: string;
  sourceCountry: string;
  language: string;
  seenAt: number;
}

export interface TonePoint {
  date: number;
  tone: number; // GDELT avg tone, roughly -10 (very negative) .. +10 (very positive)
}

const MIN_REQUEST_GAP_MS = 5_500;
const CACHE_TTL_MS = 10 * 60 * 1000;

let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, { at: number; data: unknown }>();

/** Serialize all GDELT calls and enforce the 1-per-5s IP limit. */
async function throttledGet(params: Record<string, string>): Promise<unknown> {
  const key = JSON.stringify(params);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();

    const { data } = await axios.get(config.hermes.gdeltBase, {
      params: { ...params, format: "json" },
      timeout: 20_000,
    });
    cache.set(key, { at: Date.now(), data });
    return data;
  });

  // keep the chain alive even when a request rejects
  queue = run.catch(() => undefined);
  return run;
}

export async function fetchGdeltArticles(
  query: string,
  timespan = "24h",
  maxRecords = 50
): Promise<GdeltArticle[]> {
  try {
    const data = (await throttledGet({
      query,
      mode: "ArtList",
      timespan,
      maxrecords: String(maxRecords),
      sort: "hybridrel",
    })) as { articles?: Array<Record<string, string>> };

    return (data.articles ?? []).map((a) => ({
      title: a.title ?? "",
      url: a.url ?? "",
      domain: a.domain ?? "",
      sourceCountry: a.sourcecountry ?? "",
      language: a.language ?? "",
      seenAt: parseSeenDate(a.seendate),
    }));
  } catch (err) {
    console.warn("[GDELT] article fetch failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchToneTimeline(query: string, timespan = "3d"): Promise<TonePoint[]> {
  try {
    const data = (await throttledGet({
      query,
      mode: "TimelineTone",
      timespan,
    })) as { timeline?: Array<{ data?: Array<{ date: string; value: number }> }> };

    const series = data.timeline?.[0]?.data ?? [];
    return series
      .map((p) => ({ date: Date.parse(p.date), tone: p.value }))
      .filter((p) => Number.isFinite(p.date) && Number.isFinite(p.tone));
  } catch (err) {
    console.warn("[GDELT] tone fetch failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** GDELT seendate format: "20260713T113900Z" */
function parseSeenDate(s?: string): number {
  if (!s) return Date.now();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
  if (!m) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? Date.now() : t;
  }
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}
