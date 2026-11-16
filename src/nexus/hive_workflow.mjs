/** Provider-free event reducer. No network, model, messaging, scheduler or execution adapter. */
import { createHash } from 'node:crypto';

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const terminal = new Set(['completed', 'blocked', 'failed', 'cancelled', 'budget_exhausted', 'approval_required']);
const fail = code => { throw new Error(code); };
function time(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail('INVALID_TIME');
  if (new Date(value).toISOString() !== value.replace(/(?<!\.\d{3})Z$/, '.000Z')) fail('INVALID_TIME');
  return Date.parse(value);
}
function text(value, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('INVALID_TEXT');
}
function keys(value, expected) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).sort().join() !== [...expected].sort().join()) fail('INVALID_SCHEMA');
}
function integer(value, max) { if (!Number.isInteger(value) || value < 1 || value > max) fail('INVALID_BUDGET'); }

export function createWorkflow(job) {
  keys(job, ['version', 'id', 'question', 'created_at', 'action', 'budget']);
  if (job.version !== '1') fail('INVALID_VERSION');
  text(job.id, 100); text(job.question); text(job.action, 100); time(job.created_at);
  keys(job.budget, ['max_events', 'max_attempts', 'max_seconds', 'max_cost_usd']);
  integer(job.budget.max_events, 16); integer(job.budget.max_attempts, 3); integer(job.budget.max_seconds, 300);
  // This reducer has no paid adapter; it cannot safely budget an unknown external cost.
  if (job.budget.max_cost_usd !== 0) fail('UNSUPPORTED_COST_BUDGET');
  return {job: structuredClone(job), status: job.action === 'research_only' ? 'collecting' : 'approval_required',
    reason: job.action === 'research_only' ? 'AWAIT_HUNTER_EVIDENCE' : 'EXTERNAL_ACTION_NOT_IMPLEMENTED',
    attempts: 0, next_not_before: job.created_at, last_at: job.created_at,
    evidence: [], reviewers: [], events: [], receipts: [], cost_usd: 0, confidence: null};
}

/** principal is adapter context, never read from an untrusted message sender field.
 * The caller must authenticate it; this module supplies no authentication or transport.
 */
export function transition(previous, event, {principal, now}) {
  keys(event, ['version', 'id', 'job_id', 'type', 'payload']);
  if (event.version !== '1' || event.job_id !== previous.job.id) fail('INVALID_ENVELOPE');
  text(event.id, 100); text(principal, 100);
  const nowMs = time(now);
  if (nowMs < time(previous.last_at)) fail('CLOCK_REGRESSION');
  if (!['evidence', 'transient_error', 'permanent_error', 'refusal', 'cancel', 'review', 'outside_eye'].includes(event.type)) fail('UNKNOWN_EVENT');
  if (JSON.stringify(event).length > 110000) fail('MESSAGE_TOO_LARGE');
  if (['cancel', 'refusal', 'permanent_error'].includes(event.type)) keys(event.payload, []);
  const fingerprint = digest({event, principal});
  const duplicate = previous.events.find(x => x.id === event.id);
  if (duplicate) {
    if (duplicate.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT');
    return structuredClone(previous);
  }
  if (terminal.has(previous.status)) fail('TERMINAL_STATE');
  const state = structuredClone(previous);
  const finish = (status, reason) => { state.status = status; state.reason = reason; };
  if (nowMs - time(state.job.created_at) >= state.job.budget.max_seconds * 1000 || state.events.length >= state.job.budget.max_events) {
    finish('budget_exhausted', 'TIME_OR_EVENT_BUDGET');
  } else if (event.type === 'cancel') {
    finish('cancelled', 'USER_CANCELLED');
  } else if (event.type === 'refusal' || event.type === 'permanent_error') {
    finish('blocked', event.type === 'refusal' ? 'REFUSAL_NO_REPROMPT' : 'PERMANENT_ERROR_NO_BYPASS');
  } else if (state.status === 'collecting') {
    if (nowMs < time(state.next_not_before)) fail('BACKOFF_NOT_ELAPSED');
    if (!['evidence', 'transient_error'].includes(event.type)) fail('INVALID_STAGE');
    if (event.type === 'transient_error') {
      keys(event.payload, ['code', 'retry_after_seconds']);
      if (!['TIMEOUT', 'RATE_LIMIT', 'SERVER_ERROR'].includes(event.payload.code)) fail('NOT_RETRYABLE');
      const wait = event.payload.retry_after_seconds;
      if (!Number.isInteger(wait) || wait < 0 || wait > 300) fail('INVALID_RETRY_AFTER');
      state.attempts++;
      if (state.attempts >= state.job.budget.max_attempts) finish('failed', 'ATTEMPTS_EXHAUSTED');
      else {
        const delay = Math.max(wait, 2 ** (state.attempts - 1));
        state.next_not_before = new Date(nowMs + delay * 1000).toISOString();
        state.reason = 'RETRY_SCHEDULED_NO_CALL_EXECUTED';
      }
    } else {
      keys(event.payload, ['sources', 'claim', 'source_ids', 'kind']);
      const p = event.payload;
      text(p.claim);
      if (!['reported_fact', 'inference'].includes(p.kind)) fail('INVALID_CLAIM_KIND');
      if (!Array.isArray(p.sources) || p.sources.length < 1 || p.sources.length > 5) fail('MISSING_EVIDENCE');
      const ids = new Set();
      for (const source of p.sources) {
        keys(source, ['id', 'url', 'accessed_at', 'content', 'sha256']);
        text(source.id, 100); text(source.content, 20000);
        let url; try { url = new URL(source.url); } catch { fail('INVALID_SOURCE_URL'); }
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) fail('INVALID_SOURCE_URL');
        if (ids.has(source.id)) fail('DUPLICATE_SOURCE');
        ids.add(source.id);
        const accessed = time(source.accessed_at);
        if (accessed > nowMs || nowMs - accessed > 86400000) fail('STALE_OR_FUTURE_EVIDENCE');
        const actual = createHash('sha256').update(source.content, 'utf8').digest('hex');
        if (actual !== source.sha256) fail('SOURCE_DIGEST_MISMATCH');
      }
      if (!Array.isArray(p.source_ids) || !p.source_ids.length || p.source_ids.some(id => !ids.has(id))) fail('UNCITED_CLAIM');
      state.attempts++;
      state.evidence = structuredClone(p.sources);
      state.claim = {text: p.claim, kind: p.kind, source_ids: p.source_ids};
      state.collector = principal;
      finish('reviewing', 'AWAIT_SPARTA_REVIEW');
    }
  } else {
    const expected = state.status === 'reviewing' ? 'review' : 'outside_eye';
    if (event.type !== expected) fail('INVALID_STAGE');
    keys(event.payload, ['verdict', 'notes']); text(event.payload.notes);
    if (!['pass', 'veto', 'unknown'].includes(event.payload.verdict)) fail('INVALID_REVIEW');
    if (principal === state.collector || state.reviewers.includes(principal)) fail('REVIEWER_NOT_INDEPENDENT');
    state.reviewers.push(principal);
    if (event.payload.verdict !== 'pass') finish('blocked', 'REVIEW_UNRESOLVED');
    else if (expected === 'review') finish('outside_eye', 'AWAIT_NOVA_OUTSIDE_EYE');
    else finish('completed', 'RESEARCH_STORED_NOT_INDEPENDENTLY_VERIFIED');
  }
  state.last_at = now;
  state.events.push({id: event.id, fingerprint});
  const receipt = {version: '1', job_id: state.job.id, event: structuredClone(event), principal,
    observed_at: now, status: state.status, reason: state.reason,
    state_sha256: digest(Object.fromEntries(Object.entries(state).filter(([k]) => k !== 'receipts'))),
    previous_sha256: state.receipts.at(-1)?.sha256 ?? null};
  state.receipts.push({...receipt, sha256: digest(receipt)});
  return state;
}

export function verifyReceipts(receipts) {
  let previous = null;
  for (const {sha256, ...receipt} of receipts) {
    if (receipt.previous_sha256 !== previous || digest(receipt) !== sha256) return false;
    previous = sha256;
  }
  return true;
}
