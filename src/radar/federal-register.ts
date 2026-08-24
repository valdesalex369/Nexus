import { createHash } from 'node:crypto';
import type {
  FederalRegisterDocument, FederalRegisterEnvelope, RadarMode, SourceEvent,
} from './types.ts';

export const FEDERAL_REGISTER_API = 'https://www.federalregister.gov/api/v1/documents.json';

const SOURCE_CAVEAT = 'FederalRegister.gov API renditions are informational; the linked GovInfo PDF is the official edition and controls legal verification.';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validHttpUrl(value: unknown, host: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host;
  } catch {
    return false;
  }
}

function isValidDocument(value: unknown, now: Date): value is FederalRegisterDocument {
  if (!isObject(value)) return false;
  if (typeof value.title !== 'string' || !value.title.trim()) return false;
  if (typeof value.type !== 'string' || !value.type.trim()) return false;
  if (typeof value.document_number !== 'string' || !value.document_number.trim()) return false;
  if (!validHttpUrl(value.html_url, 'www.federalregister.gov')) return false;
  if (!validHttpUrl(value.pdf_url, 'www.govinfo.gov')) return false;
  if (typeof value.publication_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.publication_date)) return false;
  const published = Date.parse(`${value.publication_date}T00:00:00Z`);
  if (!Number.isFinite(published) || published > now.getTime() + 36 * 60 * 60 * 1000) return false;
  if (!Array.isArray(value.agencies) || value.agencies.some((a) => !isObject(a) || typeof a.name !== 'string')) return false;
  return true;
}

const SIGNALS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\bartificial intelligence\b|\bAI\b/i, weight: 4 },
  { pattern: /\bcompute\b|\bdata cent(?:er|re)\b|\bcloud\b/i, weight: 4 },
  { pattern: /\binfrastructure\b|\bsemiconductor\b|\bcybersecurity\b/i, weight: 3 },
  { pattern: /\brequest for comment\b|\bproposed rule\b|\bnotice\b/i, weight: 2 },
  { pattern: /\bgrant\b|\bprocurement\b|\bfunding\b|\bcontract\b/i, weight: 2 },
];

function relevance(document: FederalRegisterDocument): number {
  const title = document.title;
  const body = `${document.abstract ?? ''} ${document.excerpts ?? ''}`;
  return SIGNALS.reduce((total, signal) => total
    + (signal.pattern.test(title) ? signal.weight * 3 : 0)
    + (signal.pattern.test(body) ? signal.weight : 0), 0);
}

export function parseFederalRegisterPayload(
  raw: string,
  endpoint: string,
  retrievedAt: string,
  mode: RadarMode,
  now = new Date(),
): SourceEvent {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Federal Register returned invalid JSON'); }
  if (!isObject(parsed) || !Array.isArray(parsed.results)) throw new Error('Federal Register response is missing results[]');
  const envelope = parsed as unknown as FederalRegisterEnvelope;
  const unique = new Map<string, FederalRegisterDocument>();
  for (const candidate of envelope.results) {
    if (isValidDocument(candidate, now) && !unique.has(candidate.document_number)) {
      unique.set(candidate.document_number, candidate);
    }
  }
  const documents = [...unique.values()].sort((a, b) => relevance(b) - relevance(a)
    || b.publication_date.localeCompare(a.publication_date)
    || a.document_number.localeCompare(b.document_number));
  const document = documents[0];
  if (!document) throw new Error('Federal Register returned no valid, GovInfo-backed documents');
  const documentDigest = sha256(JSON.stringify(document));
  const entities = [...new Set(document.agencies.map((agency) => agency.name.trim()).filter(Boolean))];
  return {
    mode,
    endpoint,
    retrievedAt,
    rawSha256: sha256(raw),
    source: {
      id: `src_federal_register_${document.document_number.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      kind: 'web',
      provider: 'FederalRegister.gov API',
      url: document.html_url,
      title: document.title,
      author: entities.join(', ') || 'Office of the Federal Register',
      retrievedAt,
      publishedAt: document.publication_date,
      sha256: documentDigest,
      reliability: 0.88,
      reliabilitySignals: [
        'U.S. government-operated public API',
        'stable document number',
        'official GovInfo PDF linked',
        'API rendition is informational rather than the legal edition',
      ],
      flags: [],
    },
    document,
    entities,
    whatChanged: `${entities.join(', ') || 'A federal agency'} published a ${document.type} on ${document.publication_date}: ${document.title}.`,
    sourceCaveat: SOURCE_CAVEAT,
  };
}

export async function fetchFederalRegisterEvent(options: {
  term?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
} = {}): Promise<SourceEvent> {
  const term = options.term ?? 'artificial intelligence infrastructure';
  const endpoint = new URL(FEDERAL_REGISTER_API);
  endpoint.searchParams.set('per_page', '10');
  endpoint.searchParams.set('order', 'newest');
  endpoint.searchParams.set('conditions[term]', term);
  const now = options.now ?? new Date();
  const response = await (options.fetchImpl ?? fetch)(endpoint, {
    headers: { accept: 'application/json', 'user-agent': 'Nexus-Opportunity-Radar/0.1' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Federal Register HTTP ${response.status}`);
  const raw = await response.text();
  return parseFederalRegisterPayload(raw, endpoint.toString(), now.toISOString(), 'LIVE', now);
}
