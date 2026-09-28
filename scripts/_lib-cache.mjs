/**
 * Isolated install cache for the upstream libraries the skills document.
 *
 * Every accuracy layer here needs the same thing: the REAL shipped package at
 * one exact version, kept out of this repo's own dependency tree. verify-skills
 * needs the pinned version; the surface checks need the pinned version and the
 * latest one side by side, which is why the cache directory is a parameter
 * rather than a constant: two versions of the same package cannot share a
 * `node_modules`.
 */
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Install `<npm>@<version>` into `cacheDir` if it is not already there at that
 * exact version, and return the installed package directory. Idempotent: a
 * second call with the same pair is a package.json read, not a network hit.
 */
export async function ensureInstalled(npm, version, cacheDir) {
  const installDir = join(cacheDir, 'node_modules', npm);
  const pkgPath = join(installDir, 'package.json');
  if (await exists(pkgPath)) {
    const cur = JSON.parse(await readFile(pkgPath, 'utf8')).version;
    if (cur === version) return installDir;
  }
  await mkdir(cacheDir, { recursive: true });
  const rootPkg = join(cacheDir, 'package.json');
  if (!(await exists(rootPkg))) {
    await writeFile(rootPkg, JSON.stringify({ name: 'skill-verify-cache', private: true }) + '\n');
  }
  await run(
    'npm',
    ['install', '--prefix', cacheDir, '--no-audit', '--no-fund', '--silent', `${npm}@${version}`],
    { timeout: 120_000 },
  );
  return installDir;
}

/**
 * The entry `.d.ts` a package declares, resolved from its own manifest rather
 * than from a hardcoded path per product: `types`, `typings`, or the `types`
 * condition of the `.` export (which may sit under `import`/`require`).
 *
 * Returns null when the package declares none. Callers must treat that as a
 * hard failure. Guessing a path is how a surface check quietly starts
 * measuring nothing.
 */
export async function resolveEntryDts(installDir) {
  const pkg = JSON.parse(await readFile(join(installDir, 'package.json'), 'utf8'));
  const dot = pkg.exports?.['.'];
  const fromExports =
    typeof dot === 'object' && dot !== null
      ? (dot.types ?? dot.import?.types ?? dot.require?.types ?? dot.default?.types)
      : null;
  const rel = pkg.types ?? pkg.typings ?? fromExports;
  if (!rel) return null;
  const abs = join(installDir, rel);
  return (await exists(abs)) ? abs : null;
}

/** Newest version of a package on the npm registry. */
export async function latestVersion(npm) {
  const { stdout } = await run('npm', ['view', npm, 'version'], { timeout: 30_000 });
  return stdout.trim();
}
