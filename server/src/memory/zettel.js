const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.resolve(__dirname, '../../data/memory');

class ZettelMemory {
  constructor() {
    this.notes = new Map();
    this._ensureDir();
    this._loadFromDisk();
  }

  _ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  _loadFromDisk() {
    const indexPath = path.join(DATA_DIR, 'index.json');
    if (!fs.existsSync(indexPath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      for (const note of data) {
        this.notes.set(note.id, note);
      }
    } catch { /* start fresh on corrupt data */ }
  }

  _saveToDisk() {
    const indexPath = path.join(DATA_DIR, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify([...this.notes.values()], null, 2));
  }

  add(content, tags = [], links = [], meta = {}) {
    const id = uuidv4().slice(0, 8);
    const note = {
      id,
      content,
      tags,
      links,
      meta: { ...meta, agent: meta.agent || 'unknown' },
      createdAt: new Date().toISOString(),
    };
    this.notes.set(id, note);

    for (const linkId of links) {
      const linked = this.notes.get(linkId);
      if (linked && !linked.links.includes(id)) {
        linked.links.push(id);
      }
    }

    this._saveToDisk();
    return note;
  }

  get(id) {
    return this.notes.get(id) || null;
  }

  search(query, limit = 10) {
    const q = query.toLowerCase();
    const results = [];
    for (const note of this.notes.values()) {
      const text = `${note.content} ${note.tags.join(' ')} ${JSON.stringify(note.meta)}`.toLowerCase();
      if (text.includes(q)) results.push(note);
      if (results.length >= limit) break;
    }
    return results;
  }

  getByTag(tag, limit = 20) {
    const results = [];
    for (const note of this.notes.values()) {
      if (note.tags.includes(tag)) results.push(note);
      if (results.length >= limit) break;
    }
    return results;
  }

  getByAgent(agentName, limit = 20) {
    const results = [];
    for (const note of this.notes.values()) {
      if (note.meta.agent === agentName) results.push(note);
      if (results.length >= limit) break;
    }
    return results;
  }

  getLinked(id) {
    const note = this.notes.get(id);
    if (!note) return [];
    return note.links.map((lid) => this.notes.get(lid)).filter(Boolean);
  }

  getRecent(limit = 10) {
    return [...this.notes.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  stats() {
    const tagCounts = {};
    const agentCounts = {};
    for (const note of this.notes.values()) {
      for (const tag of note.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
      const a = note.meta.agent || 'unknown';
      agentCounts[a] = (agentCounts[a] || 0) + 1;
    }
    return {
      totalNotes: this.notes.size,
      tags: tagCounts,
      byAgent: agentCounts,
    };
  }

  toContext(query, maxTokens = 2000) {
    const relevant = this.search(query, 5);
    if (relevant.length === 0) return '';

    let context = '=== MEMORY CONTEXT ===\n';
    let charCount = 0;
    for (const note of relevant) {
      const entry = `[${note.id}] (${note.tags.join(', ')}) ${note.content}\n`;
      if (charCount + entry.length > maxTokens * 4) break;
      context += entry;
      charCount += entry.length;
    }
    return context;
  }
}

const memory = new ZettelMemory();
module.exports = memory;
