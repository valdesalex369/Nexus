/**
 * Agora — the room where agents talk to each other.
 *
 * A per-cycle, in-memory message bus. Agents post observations, challenge
 * each other's reads, announce revisions, and record emergent insights.
 * The transcript is part of the cycle's output: it is HOW the system
 * reached its conclusion, not just the conclusion.
 *
 * Deliberately synchronous and deterministic — deliberation must be
 * replayable from the same signals. No network, no persistence here;
 * anything worth keeping flows into NexusMemory via the orchestrators
 * (and through sanitizeOutput like everything else).
 */

import type { AgoraMessage, AgoraMessageKind } from "../hermes/shared/hermes-types";

export class Agora {
  private messages: AgoraMessage[] = [];

  post(
    from: string,
    to: string,
    kind: AgoraMessageKind,
    subject: string,
    body: string,
    refs: string[] = []
  ): AgoraMessage {
    const msg: AgoraMessage = { from, to, kind, subject, body, refs, timestamp: Date.now() };
    this.messages.push(msg);
    return msg;
  }

  /** Everything addressed to this agent (directly or broadcast), oldest first. */
  inbox(agentId: string): AgoraMessage[] {
    return this.messages.filter((m) => m.to === agentId || m.to === "all");
  }

  byKind(kind: AgoraMessageKind): AgoraMessage[] {
    return this.messages.filter((m) => m.kind === kind);
  }

  transcript(): AgoraMessage[] {
    return [...this.messages];
  }

  /** Human-readable debate log for briefings and console output. */
  narrate(limit = 12): string[] {
    return this.messages.slice(0, limit).map((m) => {
      const arrow = m.to === "all" ? "→ all" : `→ ${m.to}`;
      return `[${m.kind}] ${m.from} ${arrow}: ${m.body}`;
    });
  }

  get size(): number {
    return this.messages.length;
  }
}
