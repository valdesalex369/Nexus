import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith(`..${sep}`)
    && rel !== '..' && !isAbsolute(rel));
}

function nearestExisting(target: string): string {
  let cursor = target;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return cursor;
}

/** Resolve a prospective write path and reject lexical or symlink escapes. */
export function confinedPath(runtimeRoot: string, value: string, label: string): string {
  if (value === ':memory:') return value;
  const root = resolve(runtimeRoot);
  if (!existsSync(root)) throw new Error(`runtime root does not exist: ${root}`);
  const target = isAbsolute(value) ? resolve(value) : resolve(root, value);
  if (!isWithin(root, target)) throw new Error(`${label} must stay within runtime root ${root}`);
  const realRoot = realpathSync(root);
  const realAncestor = realpathSync(nearestExisting(target));
  if (!isWithin(realRoot, realAncestor)) {
    throw new Error(`${label} resolves through a path outside runtime root ${root}`);
  }
  return target;
}
