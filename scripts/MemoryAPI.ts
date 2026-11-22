/**
 * MemoryAPI — Quick standalone endpoint to inspect NEXUS memory.
 *
 * GET /api/memory — returns current NexusMemory state.
 * Normally this is served by the main Express server; this script
 * is a standalone alternative for debugging.
 */

import express from "express";
import { NexusMemory } from "../shared/memory/NexusMemory";

const app = express();
const memory = new NexusMemory();
const PORT = parseInt(process.env.MEMORY_API_PORT ?? "3002", 10);

app.get("/api/memory", (_req, res) => {
  res.json(memory.getState());
});

app.get("/api/memory/weights", (_req, res) => {
  res.json(memory.getWeights());
});

app.get("/api/memory/predictions", (_req, res) => {
  const limit = parseInt((_req.query.limit as string) ?? "20", 10);
  const state = memory.getState();
  res.json(state.recentPredictions.slice(0, limit));
});

app.listen(PORT, () => {
  console.log(`[MemoryAPI] Listening on http://localhost:${PORT}/api/memory`);
});
