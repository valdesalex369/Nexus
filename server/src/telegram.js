const TelegramBot = require('node-telegram-bot-api');
const { EventEmitter } = require('events');

class TelegramService extends EventEmitter {
  constructor() {
    super();
    this.bot = null;
    this.chatId = null;
    this.enabled = false;
    this.pendingApprovals = new Map();
    this.approvalCounter = 0;
  }

  init() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || token === 'your_telegram_bot_token_here' ||
        !chatId || chatId === 'your_telegram_chat_id_here') {
      console.log('[Telegram] Bot disabled — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env');
      return this;
    }

    this.chatId = chatId;
    this.enabled = true;
    this.bot = new TelegramBot(token, { polling: true });

    this._registerCommands();

    this.bot.on('polling_error', (err) => {
      if (err.code === 'ETELEGRAM' && err.message.includes('409')) return; // ignore duplicate polling
      console.error('[Telegram] Polling error:', err.message);
    });

    console.log('[Telegram] Bot connected and polling');
    return this;
  }

  // ── Send startup test message ─────────────────────────────

  async sendStartupTest() {
    if (!this.enabled) return false;
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const ok = await this._send(
      `🟢 *NEXUS Online*\n\n` +
      `All agents connected to Telegram conductor\\.\n` +
      `Timestamp: ${this._esc(ts)}\n\n` +
      `Commands:\n` +
      `/status — agent status\n` +
      `/pending — pending approvals\n` +
      `/agents — list all agents\n` +
      `/approve \\[id\\] — approve action\n` +
      `/deny \\[id\\] — deny action`
    );
    if (ok) console.log('[Telegram] Startup test message sent successfully');
    return !!ok;
  }

  // ── Notification Methods (exact format requested) ─────────

  async notifyStart(agentName, task) {
    return this._send(
      `🟡 *${this._esc(agentName)}* starting: ${this._esc(this._trunc(task, 400))}`
    );
  }

  async notifyComplete(agentName, task, result) {
    return this._send(
      `✅ *${this._esc(agentName)}* done: ${this._esc(this._trunc(result, 600))}`
    );
  }

  async notifyError(agentName, task, error) {
    return this._send(
      `🚨 *${this._esc(agentName)}* needs help: ${this._esc(this._trunc(error, 400))}\n\n` +
      `Task was: ${this._esc(this._trunc(task, 200))}`
    );
  }

  async notifyApprovalNeeded(agentName, action, details) {
    // This is the notification-only part — called by requestApproval
  }

  // ── Approval System ───────────────────────────────────────
  // BLOCKS until you respond in Telegram. Never auto-grants for
  // money or public posts — if bot is disabled, it hard-denies.

  async requestApproval(agentName, action, details) {
    if (!this.enabled) {
      console.log(`[Telegram] DENIED (bot offline) — ${agentName} wanted: ${action}`);
      return { approved: false, reason: 'Telegram bot offline — cannot approve without human' };
    }

    const id = String(++this.approvalCounter);

    await this._send(
      `⚠️ *${this._esc(agentName)}* needs your OK: ${this._esc(action)}\n\n` +
      `📝 ${this._esc(this._trunc(details, 500))}\n\n` +
      `Reply /approve ${id} or /deny ${id}\n` +
      `⏱ _Auto\\-denied in 10 minutes_`
    );

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingApprovals.delete(id);
        this._send(`⏱ Approval \\#${id} timed out — *${this._esc(agentName)}* auto\\-denied`);
        resolve({ approved: false, reason: 'Timed out after 10 minutes' });
      }, 10 * 60 * 1000);

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

  // ── Command Registration ──────────────────────────────────

  _registerCommands() {
    // /approve [id] — approve most recent or specific pending action
    this.bot.onText(/\/approve(?:\s+(\S+))?/, (msg, match) => {
      if (!this._isAuthorized(msg)) return;
      this._resolveApproval(msg, match?.[1], true);
    });

    // /deny [id] — deny most recent or specific pending action
    this.bot.onText(/\/deny(?:\s+(\S+))?/, (msg, match) => {
      if (!this._isAuthorized(msg)) return;
      this._resolveApproval(msg, match?.[1], false);
    });

    // /status — show all agent statuses
    this.bot.onText(/\/status$/, (msg) => {
      if (!this._isAuthorized(msg)) return;
      this._cmdStatus(msg);
    });

    // /pending — list pending approvals
    this.bot.onText(/\/pending$/, (msg) => {
      if (!this._isAuthorized(msg)) return;
      this._cmdPending(msg);
    });

    // /agents — list all registered agents
    this.bot.onText(/\/agents$/, (msg) => {
      if (!this._isAuthorized(msg)) return;
      this._cmdAgents(msg);
    });
  }

  _isAuthorized(msg) {
    return String(msg.chat.id) === String(this.chatId);
  }

  _resolveApproval(msg, id, approved) {
    if (!id) {
      const keys = [...this.pendingApprovals.keys()];
      id = keys[keys.length - 1];
    }

    if (!id || !this.pendingApprovals.has(id)) {
      this.bot.sendMessage(msg.chat.id, '⚠️ No matching pending approval. Use /pending to see the queue.');
      return;
    }

    const entry = this.pendingApprovals.get(id);
    clearTimeout(entry.timeout);
    this.pendingApprovals.delete(id);

    const verdict = approved ? '✅ APPROVED' : '❌ DENIED';
    this.bot.sendMessage(msg.chat.id, `${verdict} #${id} — ${entry.agent}: ${entry.action}`);
    entry.resolve({ approved, reason: approved ? 'Human approved via Telegram' : 'Human denied via Telegram' });
  }

  _cmdStatus(msg) {
    let agents;
    try { agents = require('./agents'); } catch { agents = {}; }
    const lines = Object.values(agents)
      .map((a) => {
        const icon = a.status === 'running' ? '🟡' : a.status === 'error' ? '🔴' : '🟢';
        return `${icon} ${a.name} — ${a.status} (${a.history.length} runs)`;
      })
      .join('\n');

    this.bot.sendMessage(msg.chat.id, `📊 Agent Status\n\n${lines || 'No agents loaded'}`);
  }

  _cmdPending(msg) {
    if (this.pendingApprovals.size === 0) {
      this.bot.sendMessage(msg.chat.id, '✅ No pending approvals.');
      return;
    }

    const lines = [...this.pendingApprovals.entries()]
      .map(([id, e]) => `#${id} — ${e.agent}: ${e.action}\n    ${e.details.slice(0, 100)}`)
      .join('\n\n');

    this.bot.sendMessage(msg.chat.id, `⏳ Pending Approvals\n\n${lines}\n\nReply /approve ID or /deny ID`);
  }

  _cmdAgents(msg) {
    let agents;
    try { agents = require('./agents'); } catch { agents = {}; }
    const lines = Object.values(agents)
      .map((a) => `• ${a.name} [${a.role}] — ${a.status}`)
      .join('\n');

    this.bot.sendMessage(msg.chat.id, `🤖 Registered Agents\n\n${lines || 'None'}`);
  }

  // ── Internal Helpers ──────────────────────────────────────

  async _send(text) {
    if (!this.enabled || !this.bot) return null;
    try {
      return await this.bot.sendMessage(this.chatId, text, {
        parse_mode: 'MarkdownV2',
        disable_notification: false,  // always ping — even at 3am
      });
    } catch (err) {
      console.error('[Telegram] MarkdownV2 send failed:', err.message);
      // Fallback: strip markdown and resend as plain text
      try {
        const plain = text.replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1');
        return await this.bot.sendMessage(this.chatId, plain, {
          disable_notification: false,
        });
      } catch (retryErr) {
        console.error('[Telegram] Plain text fallback also failed:', retryErr.message);
        return null;
      }
    }
  }

  _esc(text) {
    if (!text) return '';
    return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
  }

  _trunc(text, max) {
    if (!text) return '';
    const s = String(text);
    return s.length > max ? s.slice(0, max) + '…' : s;
  }
}

const telegram = new TelegramService();
module.exports = telegram;
