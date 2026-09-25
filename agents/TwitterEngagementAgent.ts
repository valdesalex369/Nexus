/**
 * TwitterEngagementAgent — Monitors @Xelarocket mentions and drafts replies.
 *
 * Runs every 30 minutes. All replies require Telegram /approve before posting.
 */

import axios from "axios";
import { BaseAgent } from "./BaseAgent";
import { config } from "../shared/config";
import { requestApproval } from "../shared/telegram";
import type { AgentContext } from "../shared/types";

interface Mention {
  tweetId: string;
  authorUsername: string;
  text: string;
  createdAt: string;
}

interface DraftReply {
  mention: Mention;
  replyText: string;
  approved: boolean;
}

export class TwitterEngagementAgent extends BaseAgent {
  constructor() {
    super("TwitterEngagementAgent", "engagement");
  }

  protected async execute(_ctx: AgentContext): Promise<{
    mentions: Mention[];
    draftReplies: DraftReply[];
  }> {
    const mentions = await this.fetchMentions();
    const draftReplies: DraftReply[] = [];

    for (const mention of mentions) {
      const replyText = this.draftReply(mention);
      const approved = await requestApproval(
        `reply-${mention.tweetId}`,
        `Reply to @${mention.authorUsername}:\n"${mention.text}"\n\nDraft reply:\n"${replyText}"`
      );
      draftReplies.push({ mention, replyText, approved });
    }

    return { mentions, draftReplies };
  }

  private async fetchMentions(): Promise<Mention[]> {
    if (!config.twitter.bearerToken) {
      console.warn("[TwitterEngagement] No TWITTER_BEARER_TOKEN — skipping");
      return [];
    }

    try {
      // Search recent mentions of the configured username
      const { data } = await axios.get(
        "https://api.twitter.com/2/tweets/search/recent",
        {
          params: {
            query: `@${config.twitter.username}`,
            max_results: 10,
            "tweet.fields": "author_id,created_at,text",
            expansions: "author_id",
          },
          headers: { Authorization: `Bearer ${config.twitter.bearerToken}` },
          timeout: 10_000,
        }
      );

      const users = new Map<string, string>();
      for (const u of data?.includes?.users ?? []) {
        users.set(u.id, u.username);
      }

      return (data?.data ?? []).map((tweet: any) => ({
        tweetId: tweet.id,
        authorUsername: users.get(tweet.author_id) ?? "unknown",
        text: tweet.text,
        createdAt: tweet.created_at,
      }));
    } catch (err) {
      console.error("[TwitterEngagement] fetchMentions failed:", err);
      return [];
    }
  }

  private draftReply(mention: Mention): string {
    // Simple template-based replies — replace with LLM call for production
    const text = mention.text.toLowerCase();
    if (text.includes("price") || text.includes("prediction")) {
      return `@${mention.authorUsername} Check out our latest NEXUS signal for real-time AI-driven predictions! 🚀`;
    }
    if (text.includes("alpha") || text.includes("call")) {
      return `@${mention.authorUsername} Follow for daily AI-powered market intel. NEXUS never sleeps. 🤖`;
    }
    return `@${mention.authorUsername} Thanks for the mention! Stay tuned for more insights. 💡`;
  }

  override fallback() {
    return { mentions: [], draftReplies: [] };
  }
}
