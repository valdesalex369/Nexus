/**
 * RoundtableAgent — cross-domain crossfire. The "angles you don't see" engine.
 *
 * The five domain agents are deliberately blind to each other: geopolitics
 * doesn't know what the whales are doing, the alpha scanner doesn't read
 * the news. The Roundtable sits them at one table and looks for what only
 * the COMBINATION reveals:
 *
 *  - CONVERGENCE:    2+ independent domains flag the same subject.
 *                    Independent confirmation = compound signal, boosted
 *                    confidence. (e.g. sanctions headline + whale outflow
 *                    + correlation break, all pointing at the same asset)
 *  - CONTRADICTION:  domains disagree on the same subject's direction.
 *                    Someone is wrong — that gap is a blind spot and often
 *                    the trade.
 *  - LONE WOLF:      a critical/high-threat signal no other domain
 *                    corroborates. Either it's early (edge) or it's noise
 *                    (false positive). Both demand verification.
 *
 * Every finding is posted to the Agora so the swarm debates WITH this
 * context, and emitted as Angle records for the briefing.
 */

import type { Agora } from "../../shared/agora";
import type { Angle, HermesContext, Signal } from "../shared/hermes-types";

// Subjects an agent can be "talking about" — extracted per signal
interface SubjectRef {
  subject: string;
  signal: Signal;
}

export class RoundtableAgent {
  readonly name = "RoundtableAgent";

  convene(ctx: HermesContext, agora: Agora): Angle[] {
    const allSignals: Signal[] = [
      ...ctx.geopolitical,
      ...ctx.alpha,
      ...ctx.industry,
      ...ctx.devIntel,
      ...ctx.smartMoney,
    ];

    if (allSignals.length === 0) {
      console.log(`[${this.name}] Empty table — no signals to cross-examine`);
      return [];
    }

    console.log(`[${this.name}] Convening roundtable over ${allSignals.length} signals...`);

    // Group signals by subject; a signal can speak to several subjects
    const bySubject = new Map<string, SubjectRef[]>();
    for (const signal of allSignals) {
      for (const subject of this.subjectsOf(signal)) {
        const refs = bySubject.get(subject) ?? [];
        refs.push({ subject, signal });
        bySubject.set(subject, refs);
      }
    }

    const angles: Angle[] = [];

    for (const [subject, refs] of bySubject) {
      const domains = new Set(refs.map((r) => r.signal.domain));
      if (domains.size >= 2) {
        const directions = new Set(refs.map((r) => r.signal.direction));
        const hasOpp = directions.has("opportunity");
        const hasThreat = directions.has("threat");

        if (hasOpp && hasThreat) {
          angles.push(this.contradiction(subject, refs, agora));
        } else {
          angles.push(this.convergence(subject, refs, agora));
        }
      }
    }

    // Lone wolves: serious signals nobody else corroborates
    for (const signal of allSignals) {
      if (signal.threatLevel !== "critical" && signal.threatLevel !== "high") continue;
      const corroborated = this.subjectsOf(signal).some((subject) => {
        const refs = bySubject.get(subject) ?? [];
        return new Set(refs.map((r) => r.signal.domain)).size >= 2;
      });
      if (!corroborated) {
        angles.push(this.loneWolf(signal, agora));
      }
    }

    // Strongest angles first
    angles.sort((a, b) => b.confidence - a.confidence);
    console.log(
      `[${this.name}] ${angles.length} angles surfaced ` +
      `(${angles.filter((a) => a.kind === "convergence").length} convergence, ` +
      `${angles.filter((a) => a.kind === "contradiction").length} contradiction, ` +
      `${angles.filter((a) => a.kind === "lone-wolf").length} lone-wolf)`
    );
    return angles;
  }

  // --- angle builders -------------------------------------------------------

  private convergence(subject: string, refs: SubjectRef[], agora: Agora): Angle {
    const domains = [...new Set(refs.map((r) => r.signal.domain))];
    const avgConf = refs.reduce((s, r) => s + r.signal.confidence, 0) / refs.length;
    // Independent confirmation compounds: +10% per extra domain, capped
    const confidence = Math.min(avgConf * (1 + (domains.length - 1) * 0.1), 0.95);
    const direction = refs[0].signal.direction;

    agora.post(
      this.name,
      "all",
      "insight",
      subject,
      `${domains.length} independent domains (${domains.join(", ")}) all flag "${subject}" as ${direction}. Independent confirmation — treat as compound signal.`,
      refs.map((r) => r.signal.id)
    );

    return {
      kind: "convergence",
      title: `${domains.length} domains converge on: ${subject}`,
      insight: `${domains.join(" + ")} independently flag "${subject}" (${direction}). ${refs.map((r) => r.signal.title).slice(0, 3).join("; ")}. Independent sources agreeing is the strongest signal this system produces.`,
      agents: domains,
      signalIds: refs.map((r) => r.signal.id),
      confidence,
    };
  }

  private contradiction(subject: string, refs: SubjectRef[], agora: Agora): Angle {
    const opps = refs.filter((r) => r.signal.direction === "opportunity");
    const threats = refs.filter((r) => r.signal.direction === "threat");
    const oppDomains = [...new Set(opps.map((r) => r.signal.domain))];
    const threatDomains = [...new Set(threats.map((r) => r.signal.domain))];

    agora.post(
      this.name,
      "all",
      "challenge",
      subject,
      `Conflict on "${subject}": ${oppDomains.join(",")} read opportunity while ${threatDomains.join(",")} read threat. One side is early or wrong — resolve before acting.`,
      refs.map((r) => r.signal.id)
    );

    return {
      kind: "contradiction",
      title: `Domains disagree on: ${subject}`,
      insight: `${oppDomains.join(" + ")} see opportunity in "${subject}" but ${threatDomains.join(" + ")} see threat. This gap is a blind spot — whichever side is right, the market likely hasn't priced the other side's information. Investigate before positioning.`,
      agents: [...oppDomains, ...threatDomains],
      signalIds: refs.map((r) => r.signal.id),
      confidence: 0.6,
    };
  }

  private loneWolf(signal: Signal, agora: Agora): Angle {
    agora.post(
      this.name,
      "all",
      "observation",
      signal.title,
      `"${signal.title}" is ${signal.threatLevel} from ${signal.domain} but NO other domain corroborates. Early edge or false positive — verify.`,
      [signal.id]
    );

    return {
      kind: "lone-wolf",
      title: `Uncorroborated ${signal.threatLevel} signal: ${signal.title}`,
      insight: `${signal.domain} flags "${signal.title}" (${signal.threatLevel}) but no other domain sees anything on this subject. If it's real, you're early — that's the edge. If it isn't, it's noise. Verify against a second source before acting.`,
      agents: [signal.domain],
      signalIds: [signal.id],
      confidence: signal.confidence * 0.7, // uncorroborated = discounted
    };
  }

  // --- subject extraction ---------------------------------------------------

  /**
   * What is this signal "about"? Assets, countries, and sectors form the
   * shared vocabulary that lets signals from different domains collide.
   */
  private subjectsOf(signal: Signal): string[] {
    const subjects = new Set<string>();

    const asset = (signal as { asset?: string }).asset;
    if (asset) subjects.add(`asset:${asset.toUpperCase()}`);

    const countries = (signal as { countries?: string[] }).countries;
    for (const c of countries ?? []) subjects.add(`country:${c}`);

    const sector = (signal as { sector?: string }).sector;
    if (sector) subjects.add(`sector:${sector.toLowerCase()}`);

    const technology = (signal as { technology?: string }).technology;
    if (technology) subjects.add(`tech:${technology.toLowerCase()}`);

    for (const s of signal.affectedSectors) {
      if (s !== "all-sectors") subjects.add(`sector:${s.toLowerCase()}`);
    }

    return [...subjects];
  }
}
