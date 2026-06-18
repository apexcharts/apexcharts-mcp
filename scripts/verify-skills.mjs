#!/usr/bin/env node
/**
 * Mechanical API-surface SIGNAL for the skill docs (NOT a gate).
 *
 * For each skill it installs the exact library version that skill's SKILL.md
 * pins (`metadata.library_version`), loads the library's shipped `.d.ts` type
 * surface, then reports — as an informational signal — where the skill's doc
 * code examples reference names the pinned library doesn't appear to have:
 *
 *   - imports   `import X from '<npm>'` / `{ a }` vs the library's real exports
 *   - methods   methods called on a *library instance* (`new ApexCharts()` …)
 *               or static class (`ApexTree.setLicense()`) not in the type surface
 *   - keys      config-object keys not found in the types
 *
 * Why a signal and not a gate: doc examples mix in other libraries (Vue, Express,
 * React), use untyped sub-entry points (`apexcharts/ssr`), and call methods on
 * returned sub-objects — all of which a regex can't reliably attribute. So this
 * NEVER fails the build; it surfaces candidates for a human/agent to confirm.
 * The authoritative "are the docs still accurate?" check is the agent review,
 * which understands polyglot examples and semantics. This just narrows where to
 * look. To reduce noise, method checks are scoped to detected library instances.
 *
 * Reads the SOURCE skill repos (sibling checkouts you actually edit), NOT the
 * installed npm packages. Source root defaults to the parent of this repo;
 * override with SKILL_SRC_ROOT=/path.
 *
 * Usage:
 *   node scripts/verify-skills.mjs            # signal for all skills (always exit 0)
 *   node scripts/verify-skills.mjs --json     # machine-readable
 *   node scripts/verify-skills.mjs charts     # one product (skill pkg prefix)
 */
import { readFile, readdir, mkdir, writeFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { SKILL_PACKAGES, loadSkillSource, readAllDocs, bareVersion } from './_skill-meta.mjs';

const run = promisify(execFile);
const jsonOnly = process.argv.includes('--json');
const filter = process.argv.slice(2).find((a) => !a.startsWith('-'));

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(REPO_ROOT, 'node_modules/.cache/skill-verify');
const SRC_ROOT = process.env.SKILL_SRC_ROOT || join(REPO_ROOT, '..');

/** Object-literal keys that are language/structure noise, not library options. */
const KEY_STOPLIST = new Set([
  'type','default','const','let','var','function','return','class','extends','import','export',
  'true','false','null','undefined','this','new','async','await','if','else','for','while','case',
]);

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

/** Install <npm>@<version> into the isolated cache prefix if not already there. */
async function ensureInstalled(npm, version) {
  const installDir = join(CACHE, 'node_modules', npm);
  const pkgPath = join(installDir, 'package.json');
  if (await exists(pkgPath)) {
    const cur = JSON.parse(await readFile(pkgPath, 'utf8')).version;
    if (cur === version) return installDir;
  }
  await mkdir(CACHE, { recursive: true });
  const rootPkg = join(CACHE, 'package.json');
  if (!(await exists(rootPkg))) {
    await writeFile(rootPkg, JSON.stringify({ name: 'skill-verify-cache', private: true }) + '\n');
  }
  await run('npm', ['install', '--prefix', CACHE, '--no-audit', '--no-fund', '--silent', `${npm}@${version}`], {
    timeout: 120_000,
  });
  return installDir;
}

/** Recursively read and concatenate every *.d.ts under a directory. */
async function collectDts(dir) {
  let out = '';
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue;
      out += await collectDts(full);
    } else if (e.name.endsWith('.d.ts')) {
      out += '\n' + (await readFile(full, 'utf8'));
    }
  }
  return out;
}

/** Build the valid-identifier set + class names + default-export flag from .d.ts. */
function buildTypeSurface(dts) {
  const names = new Set();
  const classes = new Set();
  const memberRe =
    /^\s*(?:readonly\s+|static\s+|public\s+|private\s+|protected\s+|abstract\s+|get\s+|set\s+|async\s+)*([A-Za-z_$][\w$]*)\s*[?!]?\s*[:(]/gm;
  for (const m of dts.matchAll(memberRe)) names.add(m[1]);
  const declRe =
    /\b(?:export\s+)?declare\s+(?:abstract\s+)?(class|interface|function|const|let|var|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/g;
  for (const m of dts.matchAll(declRe)) {
    names.add(m[2]);
    if (m[1] === 'class') classes.add(m[2]);
  }
  for (const m of dts.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  // `export default X` and CommonJS `export = X` both make a default import valid.
  const hasDefaultExport = /export\s+default\b/.test(dts) || /export\s*=\s*/.test(dts);
  return { names, classes, hasDefaultExport };
}

/** Split concatenated docs (with @@FILE markers) into {file, code} blocks. */
function extractCodeBlocks(docs) {
  const sections = docs.split(/\n@@FILE (.+)\n/);
  const blocks = [];
  for (let i = 1; i < sections.length; i += 2) {
    const file = sections[i];
    const body = sections[i + 1] || '';
    for (const m of body.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)) {
      blocks.push({ file, code: m[1] });
    }
  }
  return blocks;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function verifySkill(skill, surface, blocks) {
  const allCode = blocks.map((b) => b.code).join('\n');

  // Receivers we trust to be THIS library: its exported classes (for static
  // calls) + any variable assigned `new <ExportedClass>(…)` (instance calls).
  const receivers = new Set(surface.classes);
  for (const cls of surface.classes) {
    const re = new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*new\\s+${escapeRe(cls)}\\b`, 'g');
    for (const m of allCode.matchAll(re)) receivers.add(m[1]);
  }

  const methodHits = new Map();
  const keyHits = new Map();
  const importDefault = new Map();
  const importNamed = new Map();
  const npmRe = new RegExp(`['"]${escapeRe(skill.npm)}['"]`);
  const track = (map, name, file) => (map.get(name) ?? map.set(name, new Set()).get(name)).add(file);

  for (const { file, code } of blocks) {
    for (const line of code.split('\n')) {
      if (npmRe.test(line) && /\bimport\b|\brequire\b/.test(line)) {
        const def = line.match(/import\s+([A-Za-z_$][\w$]*)\s*(?:,|\s+from)/);
        if (def) track(importDefault, def[1], file);
        const named = line.match(/import\s+(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}/);
        if (named)
          for (const n of named[1].split(',')) {
            const name = n.trim().split(/\s+as\s+/)[0]?.trim();
            if (name) track(importNamed, name, file);
          }
      }
    }
    // Methods — only when called on a trusted library receiver.
    for (const recv of receivers) {
      const re = new RegExp(`\\b${escapeRe(recv)}\\.([A-Za-z_$][\\w$]*)\\s*\\(`, 'g');
      for (const m of code.matchAll(re)) track(methodHits, m[1], file);
    }
    for (const m of code.matchAll(/(?:^|[{,]\s*)([A-Za-z_$][\w$]*)\s*:/gm)) {
      if (!KEY_STOPLIST.has(m[1])) track(keyHits, m[1], file);
    }
  }

  const collect = (map, pred) =>
    [...map.entries()].filter(([n]) => pred(n)).map(([name, files]) => ({ name, files: [...files] }));

  return {
    receivers: [...receivers],
    importIssues: [
      ...collect(importDefault, () => !surface.hasDefaultExport).map((x) => ({ ...x, kind: 'default-import' })),
      ...collect(importNamed, (n) => !surface.names.has(n)).map((x) => ({ ...x, kind: 'named-import' })),
    ],
    methodMisses: collect(methodHits, (n) => !surface.names.has(n)),
    keyMisses: collect(keyHits, (n) => !surface.names.has(n)),
  };
}

const targets = SKILL_PACKAGES.filter((p) => !filter || p.startsWith(filter));

const results = [];
for (const pkg of targets) {
  const r = { skill: pkg, npm: null, version: null, error: null };
  try {
    const skill = await loadSkillSource(pkg, SRC_ROOT);
    r.npm = skill.npm;
    r.version = bareVersion(skill.libraryVersion);
    if (!skill.npm || !r.version) throw new Error('SKILL.md missing metadata.npm or metadata.library_version');
    const installDir = await ensureInstalled(skill.npm, r.version);
    const dts = await collectDts(installDir);
    if (!dts.trim()) throw new Error(`no .d.ts found in ${skill.npm}@${r.version}`);
    const surface = buildTypeSurface(dts);
    const blocks = extractCodeBlocks(await readAllDocs(skill));
    Object.assign(r, { blocks: blocks.length, ...verifySkill(skill, surface, blocks) });
  } catch (err) {
    r.error = err.shortMessage || err.message;
  }
  results.push(r);
}

if (jsonOnly) {
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  process.exit(0);
}

for (const r of results) {
  console.log(`\n▸ ${r.npm ?? r.skill}@${r.version ?? '?'}`);
  if (r.error) {
    console.log(`    ⚠ ${r.error}`);
    continue;
  }
  const imports = r.importIssues ?? [];
  const methods = r.methodMisses ?? [];
  const keys = r.keyMisses ?? [];
  if (imports.length) {
    console.log(`  ⚑ imports not matching exports:`);
    for (const i of imports) console.log(`      ${i.name} [${i.kind}] — ${i.files.join(', ')}`);
  }
  if (methods.length) {
    console.log(`  ⚑ instance/static methods not in type surface:`);
    for (const m of methods) console.log(`      .${m.name}() — ${m.files.join(', ')}`);
  }
  if (keys.length) {
    console.log(`  ⚑ config keys not in type surface (${keys.length}): ${keys.map((k) => k.name).join(', ')}`);
  }
  if (!imports.length && !methods.length && !keys.length) {
    console.log(`  ✓ ${r.blocks} code blocks — no surface mismatches against ${r.npm}@${r.version}`);
  } else {
    console.log(`  (${r.blocks} code blocks scanned; receivers: ${(r.receivers ?? []).join(', ') || 'none'})`);
  }
}

console.log(
  `\nSignal only — candidates to confirm, not failures. Some are other libraries in examples,\n` +
    `untyped sub-entry points, or sub-object methods. Run the agent review for the authoritative check.`,
);
process.exit(0);
