const TelegramBot = require('node-telegram-bot-api');
const { EventEmitter } = require('events');

class TelegramService extends EventEmitter {
  constructor() {
    super();
    this.bot = null;
    this.chatId = null;
    this.enabled = false;
    this.pendingApprovals = new Map(); // id -> { resolve, reject, agent, action, timeout }
    this.approvalCounter = 0;
  }

  init() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || token === 'your_telegram_bot_token_here' ||
        !chatId || chatId === 'your_telegram_chat_id_here') {
      console.log('[Telegram] Bot disabled — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
      return this;
    }

    this.chatId = chatId;
    this.enabled = true;
    this.bot = new TelegramBot(token, { polling: true });

    this.bot.onText(/\/approve(?:\s+(\S+))?/, (msg, match) => {
      if (String(msg.chat.id) !== String(this.chatId)) return;
      this._handleApprovalResponse(msg, match?.[1], true);
    });

    this.bot.onText(/\/deny(?:\s+(\S+))?/, (msg, match) => {
      if (String(msg.chat.id) !== String(this.chatId)) return;
      this._handleApprovalResponse(msg, match?.[1], false);
    });

    this.bot.onText(/\/status/, (msg) => {
      if (String(msg.chat.id) !== String(this.chatId)) return;
      this._handleStatus(msg);
    });

    this.bot.onText(/\/pending/, (msg) => {
      if (String(msg.chat.id) !== String(this.chatId)) return;
      this._handlePending(msg);
    });

    this.bot.on('polling_error', (err) => {
      console.error('[Telegram] Polling error:', err.message);
    });

    console.log('[Telegram] Bot connected and listening');
    return this;
  }

  // ── Notification Methods ──────────────────────────────────

  async notifyTaskStart(agentName, task) {
    return this._send(
      `🚀 *${this._esc(agentName)}* started a task\n\n` +
      `📋 *Task:* ${this._esc(this._truncate(task, 300))}`
    );
  }

  async notifyTaskComplete(agentName, task, result) {
    return this._send(
      `✅ *${this._esc(agentName)}* completed a task\n\n` +
      `📋 *Task:* ${this._esc(this._truncate(task, 200))}\n\n` +
      `📊 *Result:*\n${this._esc(this._truncate(result, 500))}`
    );
  }

  async notifyError(agentName, task, error) {
    return this._send(
      `🚨 *${this._esc(agentName)}* needs help\\!\n\n` +
      `📋 *Task:* ${this._esc(this._truncate(task, 200))}\n\n` +
      `❌ *Error:* ${this._esc(error)}`
    );
  }

  // ── Approval System ───────────────────────────────────────

  async requestApproval(agentName, action, details) {
    if (!this.enabled) {
      console.log(`[Telegram] Approval auto-granted (bot disabled): ${agentName} — ${action}`);
      return true;
    }

    const id = String(++this.approvalCounter);

    await this._send(
      `⚠️ *APPROVAL REQUIRED*\n\n` +
      `🤖 *Agent:* ${this._esc(agentName)}\n` +
      `🎯 *Action:* ${this._esc(action)}\n` +
      `📝 *Details:* ${this._esc(this._truncate(details, 400))}\n\n` +
      `Reply with:\n` +
      `/approve ${id}  — to authorize\n` +
      `/deny ${id}  — to reject\n\n` +
      `⏱ _Auto\\-denied in 5 minutes if no response_`
    );

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingApprovals.delete(id);
        this._send(`⏱ Approval \\#${id} for *${this._esc(agentName)}* timed out \\(auto\\-denied\\)`);
        resolve(false);
      }, 5 * 60 * 1000);

      this.pendingApprovals.set(id, {
        resolve,
        timeout,
        agent: agentName,
        action,
        details,
        createdAt: new Date().toISOString(),
      });
    });
  }

  // ── Internal ──────────────────────────────────────────────

  _handleApprovalResponse(msg, id, approved) {
    // If no ID given, approve/deny the most recent pending
    if (!id) {
      const keys = [...this.pendingApprovals.keys()];
      id = keys[keys.length - 1];
    }

    if (!id || !this.pendingApprovals.has(id)) {
      this.bot.sendMessage(msg.chat.id, '⚠️ No matching pending approval found.');
      return;
    }

    const entry = this.pendingApprovals.get(id);
    clearTimeout(entry.timeout);
    this.pendingApprovals.delete(id);

    const action = approved ? 'APPROVED ✅' : 'DENIED ❌';
    this.bot.sendMessage(
      msg.chat.id,
      `${action} — #${id} for ${entry.agent}: ${entry.action}`,
    );

    entry.resolve(approved);
  }

  _handleStatus(msg) {
    const agents = require('./agents');
    const lines = Object.values(agents)
      .map((a) => `• *${this._esc(a.name)}* — ${a.status} (runs: ${a.history.length})`)
      .join('\n');

    this.bot.sendMessage(msg.chat.id, `📊 *Agent Status*\n\n${lines}`, { parse_mode: 'MarkdownV2' });
  }

  _handlePending(msg) {
    if (this.pendingApprovals.size === 0) {
      this.bot.sendMessage(msg.chat.id, '✅ No pending approvals.');
      return;
    }

    const lines = [...this.pendingApprovals.entries()]
      .map(([id, e]) => `• \\#${id} *${this._esc(e.agent)}* — ${this._esc(e.action)}`)
      .join('\n');

    this.bot.sendMessage(
      msg.chat.id,
      `⏳ *Pending Approvals*\n\n${lines}\n\nUse /approve ID or /deny ID`,
      { parse_mode: 'MarkdownV2' },
    );
  }

  async _send(text) {
    if (!this.enabled || !this.bot) return null;
    try {
      return await this.bot.sendMessage(this.chatId, text, { parse_mode: 'MarkdownV2' });
    } catch (err) {
      console.error('[Telegram] Send failed:', err.message);
      // Retry without markdown if parse fails
      try {
        return await this.bot.sendMessage(this.chatId, text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, ''));
      } catch (retryErr) {
        console.error('[Telegram] Retry failed:', retryErr.message);
        return null;
      }
    }
  }

  _esc(text) {
    if (!text) return '';
    return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
  }

  _truncate(text, maxLen) {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
  }
}

// Singleton
const telegram = new TelegramService();
module.exports = telegram;
