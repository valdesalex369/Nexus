/**
 * Telegram conductor — sends alerts and handles /approve /deny commands.
 *
 * All trading actions and social posts go through Telegram approval first.
 */

import TelegramBot from "node-telegram-bot-api";
import { config } from "./config";
import { sanitizeOutput } from "./security";
import type { TelegramAction } from "./types";

let bot: TelegramBot | null = null;

// Pending actions awaiting /approve or /deny
const pendingActions = new Map<string, TelegramAction>();
const actionCallbacks = new Map<
  string,
  { resolve: (approved: boolean) => void }
>();

export function initTelegram(): TelegramBot | null {
  if (!config.telegram.botToken) {
    console.warn("[Telegram] No TELEGRAM_BOT_TOKEN set — running without Telegram");
    return null;
  }

  bot = new TelegramBot(config.telegram.botToken, { polling: true });

  bot.onText(/\/approve (.+)/, (_msg, match) => {
    const id = match?.[1]?.trim();
    if (id && actionCallbacks.has(id)) {
      actionCallbacks.get(id)!.resolve(true);
      actionCallbacks.delete(id);
      pendingActions.delete(id);
      sendMessage(`✅ Approved: ${id}`);
    }
  });

  bot.onText(/\/deny (.+)/, (_msg, match) => {
    const id = match?.[1]?.trim();
    if (id && actionCallbacks.has(id)) {
      actionCallbacks.get(id)!.resolve(false);
      actionCallbacks.delete(id);
      pendingActions.delete(id);
      sendMessage(`❌ Denied: ${id}`);
    }
  });

  bot.onText(/\/status/, () => {
    const pending = Array.from(pendingActions.keys());
    const msg = pending.length
      ? `Pending actions:\n${pending.map((id) => `• ${id}`).join("\n")}`
      : "No pending actions.";
    sendMessage(msg);
  });

  console.log("[Telegram] Bot initialized and polling");
  return bot;
}

export async function sendMessage(text: string): Promise<void> {
  // SecurityLayer: sanitize every outbound message before it leaves the process
  const safe = sanitizeOutput(text);

  if (!bot || !config.telegram.chatId) {
    console.log("[Telegram][offline]", safe);
    return;
  }
  try {
    await bot.sendMessage(config.telegram.chatId, safe, {
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error("[Telegram] Send failed:", err);
  }
}

/**
 * Request approval via Telegram. Returns a promise that resolves
 * to true (approved) or false (denied).
 *
 * If no Telegram is configured, auto-denies for safety.
 */
export function requestApproval(
  actionId: string,
  description: string
): Promise<boolean> {
  // SecurityLayer: scrub secrets from approval descriptions
  const safeDesc = sanitizeOutput(description);

  if (!bot || !config.telegram.chatId) {
    console.warn(
      `[Telegram] No bot configured — auto-denying action: ${actionId}`
    );
    return Promise.resolve(false);
  }

  const action: TelegramAction = {
    type: "approve",
    target: actionId,
    payload: safeDesc,
    requestedAt: Date.now(),
  };
  pendingActions.set(actionId, action);

  sendMessage(
    `🔔 *Approval Required*\n\n${safeDesc}\n\n` +
      `Reply:\n/approve ${actionId}\n/deny ${actionId}`
  );

  return new Promise<boolean>((resolve) => {
    actionCallbacks.set(actionId, { resolve });
  });
}

export function getPendingActions(): TelegramAction[] {
  return Array.from(pendingActions.values());
}
