/**
 * NEXUS Express server — serves the dashboard and API endpoints.
 *
 * Endpoints:
 *  GET /api/memory         — current NexusMemory state
 *  GET /api/memory/weights — prediction source weights
 *  GET /api/predictions    — recent predictions (with ?limit=N)
 *  GET /api/status         — system health check
 *  POST /api/cycle         — trigger a manual HubAgent cycle
 */

import express from "express";
import path from "path";
import { NexusMemory } from "../shared/memory/NexusMemory";
import { HubAgent } from "../agents/HubAgent";
import { config } from "../shared/config";

const app = express();
const memory = new NexusMemory();
const hub = new HubAgent();
const PORT = config.server.port;

app.use(express.json());

// Serve dashboard static files
app.use(express.static(path.resolve(__dirname, "../dashboard/dist")));

// --- API Routes ---

app.get("/api/memory", (_req, res) => {
  res.json(memory.getState());
});

app.get("/api/memory/weights", (_req, res) => {
  res.json(memory.getWeights());
});

app.get("/api/predictions", (req, res) => {
  const limit = parseInt((req.query.limit as string) ?? "20", 10);
  const state = memory.getState();
  res.json(state.recentPredictions.slice(0, limit));
});

app.get("/api/status", (_req, res) => {
  const state = memory.getState();
  res.json({
    status: "ok",
    uptime: process.uptime(),
    totalCycles: state.totalCycles,
    winRate: state.winRate,
    lastRecalibration: state.lastRecalibration,
    teamsEnabled: config.teams.enabled,
    timestamp: Date.now(),
  });
});

app.post("/api/cycle", async (_req, res) => {
  try {
    const result = await hub.runCycle();
    res.json({ success: true, cycle: result.cycle, prediction: result.prediction });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(path.resolve(__dirname, "../dashboard/dist/index.html"));
});

app.listen(PORT, () => {
  console.log(`[NEXUS Server] Running on http://localhost:${PORT}`);
  console.log(`[NEXUS Server] API: http://localhost:${PORT}/api/status`);
});
