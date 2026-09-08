import { createHash } from 'node:crypto';
import { rankSource } from '../discovery/claims.ts';
import type { Source } from '../discovery/types.ts';
import { scan } from '../intake/index.ts';
import type { OperationsDataMode } from './types.ts';

export const FEDERAL_REGISTER_API = 'https://www.federalregister.gov/api/v1/documents.json';
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const SOURCE_CAVEAT = 'FederalRegister.gov API renditions are informational. The GovInfo PDF URI was supplied by the API but was not fetched or hash-verified in this run.';

export interface FederalRegisterAgency {
  name: string;
  raw_name?: string;
  id?: number;
  url?: string;
}

export interface FederalRegisterDocument {
  title: string;
  type: string;
  abstract: string | null;
  document_number: string;
  html_url: string;
  pdf_url: string;
  public_inspection_pdf_url?: string | null;
  publication_date: string;
  agencies: FederalRegisterAgency[];
  excerpts?: string | null;
  comments_close_on?: string | null;
}

interface FederalRegisterEnvelope {
  results: unknown[];
}

export interface FederalRegisterSourceEvent {
  mode: Extract<OperationsDataMode, 'LIVE' | 'FIXTURE'>;
  endpoint: string;
  retrievedAt: string;
  rawSha256: string;
  documentSha256: string;
  source: Source;
  document: FederalRegisterDocument;
  entities: string[];
  whatChanged: string;
  sourceCaveat: string;
}

export interface FederalRegisterRead {
  raw: string;
  event: FederalRegisterSourceEvent;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validHttpsUrl(value: unknown, hostname: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validGovInfoPdf(value: unknown, documentNumber: string, publicationDate: string): value is string {
  if (!validHttpsUrl(value, 'www.govinfo.gov')) return false;
  const escapedDate = publicationDate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedNumber = documentNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^/content/pkg/FR-${escapedDate}/pdf/${escapedNumber}\\.pdf$`)
    .test(new URL(value).pathname);
}

function validDocument(value: unknown, now: Date): value is FederalRegisterDocument {
  if (!isObject(value)) return false;
  if (typeof value.title !== 'string' || !value.title.trim()) return false;
  if (typeof value.type !== 'string' || !value.type.trim()) return false;
  if (typeof value.document_number !== 'string' || !value.document_number.trim()) return false;
  if (typeof value.publication_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.publication_date)) return false;
  if (!validHttpsUrl(value.html_url, 'www.federalregister.gov')) return false;
  if (!validGovInfoPdf(value.pdf_url, value.document_number, value.publication_date)) return false;
  const published = Date.parse(`${value.publication_date}T00:00:00Z`);
  if (!Number.isFinite(published) || published > now.getTime() + 36 * 60 * 60 * 1000) return false;
  if (!Array.isArray(value.agencies)
      || value.agencies.some((agency) => !isObject(agency) || typeof agency.name !== 'string')) return false;
  return true;
}

const RELEVANCE_SIGNALS: Array<{ pattern: RegExp; titleWeight: number; bodyWeight: number }> = [
  { pattern: /\bartificial intelligence\b|\bAI\b/i, titleWeight: 12, bodyWeight: 4 },
  { pattern: /\bcompute\b|\bdata cent(?:er|re)\b|\bcloud\b/i, titleWeight: 12, bodyWeight: 4 },
  { pattern: /\binfrastructure\b|\bsemiconductor\b|\bcybersecurity\b/i, titleWeight: 9, bodyWeight: 3 },
  { pattern: /\brequest for comment\b|\bproposed rule\b|\bnotice\b/i, titleWeight: 6, bodyWeight: 2 },
  { pattern: /\bgrant\b|\bprocurement\b|\bfunding\b|\bcontract\b/i, titleWeight: 6, bodyWeight: 2 },
];

function relevance(document: FederalRegisterDocument): number {
  const body = `${document.abstract ?? ''} ${document.excerpts ?? ''}`;
  return RELEVANCE_SIGNALS.reduce((total, signal) => total
    + (signal.pattern.test(document.title) ? signal.titleWeight : 0)
    + (signal.pattern.test(body) ? signal.bodyWeight : 0), 0);
}

export function parseFederalRegisterPayload(
  raw: string,
  endpoint: string,
  retrievedAt: string,
  mode: Extract<OperationsDataMode, 'LIVE' | 'FIXTURE'>,
  now = new Date(),
): FederalRegisterSourceEvent {
  if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error('Federal Register response exceeded the 2 MiB limit');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Federal Register returned invalid JSON');
  }
  if (!isObject(parsed) || !Array.isArray(parsed.results)) {
    throw new Error('Federal Register response is missing results[]');
  }
  const envelope = parsed as unknown as FederalRegisterEnvelope;
  const unique = new Map<string, FederalRegisterDocument>();
  for (const candidate of envelope.results) {
    if (validDocument(candidate, now) && !unique.has(candidate.document_number)) {
      unique.set(candidate.document_number, candidate);
    }
  }
  const documents = [...unique.values()].sort((left, right) => relevance(right) - relevance(left)
    || right.publication_date.localeCompare(left.publication_date)
    || left.document_number.localeCompare(right.document_number));
  const document = documents[0];
  if (!document) throw new Error('Federal Register returned no valid documents with a canonical GovInfo PDF URI');

  const rawSha256 = sha256(raw);
  const documentSha256 = sha256(JSON.stringify(document));
  const entities = [...new Set(document.agencies.map((agency) => agency.name.trim()).filter(Boolean))];
  const selectedText = `${document.title}\n${document.abstract ?? ''}\n${document.excerpts ?? ''}`;
  const flags = scan(selectedText);
  const ranked = rankSource({
    title: document.title,
    url: document.html_url,
    snippet: document.abstract ?? document.excerpts ?? '',
    author: entities.join(', ') || 'Office of the Federal Register',
    publishedAt: document.publication_date,
    raw: document,
  }, 'docs', now.getTime());
  const reliability = flags.length > 0 ? Math.min(ranked.reliability, 0.3) : ranked.reliability;
  const sourceId = `src_federal_register_${document.document_number.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${rawSha256.slice(0, 12)}`;

  return {
    mode,
    endpoint,
    retrievedAt,
    rawSha256,
    documentSha256,
    source: {
      id: sourceId,
      kind: 'docs',
      provider: 'FederalRegister.gov API',
      url: document.html_url,
      title: document.title,
      author: entities.join(', ') || 'Office of the Federal Register',
      retrievedAt,
      publishedAt: document.publication_date,
      sha256: rawSha256,
      reliability,
      reliabilitySignals: flags.length > 0
        ? [...ranked.signals, `FLAGGED: ${flags.join(', ')}`]
        : [...ranked.signals, 'Canonical GovInfo PDF URI supplied by API (not fetched; not score-adjusted)'],
      flags,
    },
    document,
    entities,
    whatChanged: `${entities.join(', ') || 'A federal agency'} published a ${document.type} on ${document.publication_date}: ${document.title}.`,
    sourceCaveat: SOURCE_CAVEAT,
  };
}

export async function fetchFederalRegister(options: {
  term?: string;
  now?: Date;
} = {}): Promise<FederalRegisterRead> {
  const term = options.term ?? 'artificial intelligence infrastructure';
  const endpoint = new URL(FEDERAL_REGISTER_API);
  endpoint.searchParams.set('per_page', '10');
  endpoint.searchParams.set('order', 'newest');
  endpoint.searchParams.set('conditions[term]', term);
  const now = options.now ?? new Date();
  const response = await fetch(endpoint, {
    headers: { accept: 'application/json', 'user-agent': 'Nexus-Operations-Live-Loop/0.1' },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Federal Register HTTP ${response.status}`);
  const raw = await readBoundedResponse(response);
  return {
    raw,
    event: parseFederalRegisterPayload(raw, endpoint.toString(), now.toISOString(), 'LIVE', now),
  };
}

export async function readBoundedResponse(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error('Federal Register response exceeded the 2 MiB limit');
  }
  if (!response.body) throw new Error('Federal Register returned an empty response body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel('response exceeded the 2 MiB limit');
      throw new Error('Federal Register response exceeded the 2 MiB limit');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total).toString('utf8');
}
