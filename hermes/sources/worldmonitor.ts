/**
 * WorldMonitor client — structured world-event intelligence.
 *
 * worldmonitor.app aggregates 500+ feeds / 65+ providers (incl. ACLED + UCDP),
 * normalizes events into a common schema, geolocates, deduplicates, and
 * pre-scores escalation. Public REST API is free with no key; Pro adds
 * faster refresh via the X-WorldMonitor-Key header.
 *
 * NOTE: public-tier rate limits are undocumented — responses are cached
 * per process for CACHE_TTL_MS and every failure degrades to [] so the
 * GeopoliticalAgent falls through to GDELT / NewsAPI.
 *
 * Endpoint paths are probed from CANDIDATE_PATHS because the OpenAPI spec
 * (github.com/koala73/worldmonitor, docs/api/worldmonitor.openapi.yaml)
 * could not be fetched from this environment. Verify against the spec and
 * pin WORLDMONITOR_EVENTS_PATH in .env once confirmed.
 */

import axios from "axios";
import { config } from "../../shared/config";

/** Normalized world event — tolerant of upstream schema drift. */
export interface WorldEvent {
  id: string;
  title: string;
  summary: string;
  category: string;
  escalationScore: number; // 0-1 (normalized from whatever scale upstream uses)
  corroborated: boolean;   // true when flagged as multi-source "breaking"
  countries: string[];
  url: string;
  provider: string;
  timestamp: number;
}

const CANDIDATE_PATHS = ["/v1/events", "/events", "/v1/alerts", "/alerts"];
const CACHE_TTL_MS = 10 * 60 * 1000;

let cache: { at: number; events: WorldEvent[] } | null = null;
let resolvedPath: string | null = null;

export async function fetchWorldEvents(): Promise<WorldEvent[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.events;

  const base = config.hermes.worldMonitorBase.replace(/\/$/, "");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.hermes.worldMonitorKey) {
    headers["X-WorldMonitor-Key"] = config.hermes.worldMonitorKey;
  }

  const paths = config.hermes.worldMonitorEventsPath
    ? [config.hermes.worldMonitorEventsPath]
    : resolvedPath
      ? [resolvedPath]
      : CANDIDATE_PATHS;

  for (const path of paths) {
    try {
      const { data } = await axios.get(`${base}${path}`, { headers, timeout: 15_000 });
      const raw = extractEventArray(data);
      if (!raw) continue;

      resolvedPath = path;
      const events = raw.map(normalizeEvent).filter((e): e is WorldEvent => e !== null);
      cache = { at: Date.now(), events };
      console.log(`[WorldMonitor] ${events.length} events via ${path}`);
      return events;
    } catch {
      // try next candidate path; final failure degrades to []
    }
  }

  console.warn("[WorldMonitor] unreachable — degrading to GDELT/NewsAPI");
  return [];
}

/** Upstream may return a bare array or wrap it in {events|items|data|results}. */
function extractEventArray(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const key of ["events", "items", "data", "results", "alerts"]) {
      const v = (data as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v;
    }
  }
  return null;
}

function normalizeEvent(raw: unknown): WorldEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, any>;

  const title = str(e.title ?? e.headline ?? e.name);
  if (!title) return null;

  const rawScore = num(e.escalationScore ?? e.escalation ?? e.severity ?? e.score);
  return {
    id: str(e.id ?? e.eventId ?? e.uid) || `wm-${hash(title)}`,
    title,
    summary: str(e.summary ?? e.description ?? e.details) || title,
    category: str(e.category ?? e.type ?? e.eventType ?? e.kind).toLowerCase(),
    escalationScore: rawScore > 1 ? Math.min(rawScore / 100, 1) : Math.max(rawScore, 0),
    corroborated: Boolean(e.corroborated ?? e.breaking ?? e.verified),
    countries: strArray(e.countries ?? e.country ?? e.locations),
    url: str(e.url ?? e.link ?? e.sourceUrl),
    provider: str(e.provider ?? e.source) || "WorldMonitor",
    timestamp: toMs(e.timestamp ?? e.time ?? e.publishedAt ?? e.date),
  };
}

// --- tolerant coercion helpers ---

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

function strArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string" && v) return [v];
  return [];
}

function toMs(v: unknown): number {
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
