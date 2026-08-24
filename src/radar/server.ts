import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';

export interface RadarServerOptions {
  snapshotPath?: string;
  dashboardPath?: string;
  host?: string;
  port?: number;
}

export function createRadarServer(options: RadarServerOptions = {}): Server {
  const snapshotPath = options.snapshotPath ?? './data/runs/latest.json';
  const dashboardPath = options.dashboardPath ?? './dashboard/index.html';
  return createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('cache-control', 'no-store');
    if (path === '/api/radar/latest') {
      try {
        const body = readFileSync(snapshotPath, 'utf8');
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        response.end(body);
      } catch (error) {
        response.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'No verified radar run is available.', detail: (error as Error).message }));
      }
      return;
    }
    if (path === '/health') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (path === '/' || path === '/index.html') {
      try {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(readFileSync(dashboardPath, 'utf8'));
      } catch (error) {
        response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        response.end(`Dashboard unavailable: ${(error as Error).message}`);
      }
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Not found' }));
  });
}

export async function listenRadarServer(server: Server, options: RadarServerOptions = {}): Promise<{ host: string; port: number }> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8787;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') return { host, port };
  return { host, port: address.port };
}
