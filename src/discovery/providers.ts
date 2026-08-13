/**
 * SOURCE PROVIDERS
 *
 * Three are real and need no credentials: GitHub, the npm registry, and
 * crates.io. They cover the directive's "technical intelligence" class —
 * repositories, packages, open-source activity.
 *
 * The rest are declared UNWIRED with the specific reason. That is deliberate:
 * the spec says do not build fake providers, and a stub that returns plausible
 * results is worse than nothing because it launders invention into evidence.
 *
 * Providers do one job — query in, results out, or an honest failure. They never
 * score, interpret, or summarise.
 */
import type {
  SearchOptions, SearchResult, SourceKind, SourceProvider, ProviderStatus,
} from './types.ts';

const UA = 'nexus-discovery/0.2 (+https://github.com/valdesalex369/Nexus)';

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Guard against malformed provider payloads rather than trusting shape. */
function asArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`malformed response: expected array at ${path}`);
  return v;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// ---------------------------------------------------------------------------
// REAL PROVIDERS
// ---------------------------------------------------------------------------

/** GitHub repository search. Unauthenticated: ~10 req/min, which is plenty here. */
export class GitHubProvider implements SourceProvider {
  readonly name = 'github';
  readonly kind: SourceKind = 'github';

  status(): ProviderStatus { return { state: 'live' }; }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    const limit = Math.min(opts.limit ?? 10, 50);
    const url = 'https://api.github.com/search/repositories'
      + `?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`;
    const json = await getJson(url, opts.timeoutMs ?? 20_000) as { items?: unknown };
    const items = asArray(json.items, 'items');

    return items.map((raw) => {
      const it = raw as Record<string, unknown>;
      const owner = it.owner as Record<string, unknown> | undefined;
      return {
        title: str(it.full_name, '(unnamed repository)'),
        url: str(it.html_url),
        snippet: str(it.description, '(no description)'),
        author: str(owner?.login) || undefined,
        publishedAt: str(it.created_at) || undefined,
        signals: {
          stars: num(it.stargazers_count),
          forks: num(it.forks_count),
          openIssues: num(it.open_issues_count),
          ageDays: it.pushed_at
            ? Math.max(0, (Date.now() - Date.parse(str(it.pushed_at))) / 86_400_000)
            : Number.NaN,
        },
        raw,
      };
    });
  }
}

/** npm registry search — ecosystem adoption signal for JS/TS tooling. */
export class NpmProvider implements SourceProvider {
  readonly name = 'npm';
  readonly kind: SourceKind = 'package-registry';

  status(): ProviderStatus { return { state: 'live' }; }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    const limit = Math.min(opts.limit ?? 10, 50);
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`;
    const json = await getJson(url, opts.timeoutMs ?? 20_000) as { objects?: unknown };
    const objects = asArray(json.objects, 'objects');

    return objects.map((raw) => {
      const o = raw as Record<string, unknown>;
      const pkg = (o.package ?? {}) as Record<string, unknown>;
      const score = (o.score ?? {}) as Record<string, unknown>;
      const detail = (score.detail ?? {}) as Record<string, unknown>;
      const publisher = (pkg.publisher ?? {}) as Record<string, unknown>;
      const links = (pkg.links ?? {}) as Record<string, unknown>;
      return {
        title: str(pkg.name, '(unnamed package)'),
        url: str(links.npm) || `https://www.npmjs.com/package/${str(pkg.name)}`,
        snippet: str(pkg.description, '(no description)'),
        author: str(publisher.username) || undefined,
        publishedAt: str(pkg.date) || undefined,
        signals: {
          popularity: num(detail.popularity),
          quality: num(detail.quality),
          maintenance: num(detail.maintenance),
          finalScore: num(score.final),
        },
        raw,
      };
    });
  }
}

/** crates.io — Rust ecosystem signal, useful for infrastructure-shaped questions. */
export class CratesProvider implements SourceProvider {
  readonly name = 'crates';
  readonly kind: SourceKind = 'package-registry';

  status(): ProviderStatus { return { state: 'live' }; }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    const limit = Math.min(opts.limit ?? 10, 50);
    const url = `https://crates.io/api/v1/crates?q=${encodeURIComponent(query)}&per_page=${limit}`;
    const json = await getJson(url, opts.timeoutMs ?? 20_000) as { crates?: unknown };
    const crates = asArray(json.crates, 'crates');

    return crates.map((raw) => {
      const c = raw as Record<string, unknown>;
      return {
        title: str(c.name, '(unnamed crate)'),
        url: `https://crates.io/crates/${str(c.name)}`,
        snippet: str(c.description, '(no description)'),
        publishedAt: str(c.created_at) || undefined,
        signals: {
          downloads: num(c.downloads),
          recentDownloads: num(c.recent_downloads),
        },
        raw,
      };
    });
  }
}

// ---------------------------------------------------------------------------
// UNWIRED PROVIDERS — declared, not faked
// ---------------------------------------------------------------------------

/**
 * A provider we know we want but cannot reach yet. It refuses to search rather
 * than returning anything, so an unwired source can never be mistaken for a
 * source that returned nothing.
 */
export class UnwiredProvider implements SourceProvider {
  readonly name: string;
  readonly kind: SourceKind;
  private reason: string;

  constructor(name: string, kind: SourceKind, reason: string) {
    this.name = name;
    this.kind = kind;
    this.reason = reason;
  }

  status(): ProviderStatus { return { state: 'unwired', reason: this.reason }; }

  async search(): Promise<SearchResult[]> {
    throw new Error(`provider '${this.name}' is UNWIRED: ${this.reason}`);
  }
}

/** Everything the directive asks for that we cannot honestly serve yet. */
export const UNWIRED: SourceProvider[] = [
  new UnwiredProvider('web', 'web',
    'no web-search API key configured (set a search provider key to enable)'),
  new UnwiredProvider('youtube', 'youtube',
    'no YouTube Data API key configured'),
  new UnwiredProvider('jobs', 'jobs',
    'no job-board API configured — the highest-value missing signal, see docs'),
  new UnwiredProvider('reviews', 'reviews',
    'no review-platform API configured (G2/Capterra/app stores)'),
  new UnwiredProvider('community', 'community',
    'HN/StackExchange/Reddit endpoints are blocked by this environment\'s network policy'),
  new UnwiredProvider('papers', 'paper',
    'arXiv endpoint is blocked by this environment\'s network policy'),
  new UnwiredProvider('news', 'news',
    'no news API configured'),
];

export function defaultProviders(): SourceProvider[] {
  return [new GitHubProvider(), new NpmProvider(), new CratesProvider(), ...UNWIRED];
}
