/**
 * Shared helpers for the skill version/verification scripts. Reads each
 * bundled `*-skill` package's metadata straight from the package's own exports
 * and its SKILL.md frontmatter — the single source of truth — so no skill facts
 * are duplicated in the scripts themselves.
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** The skill packages this server bundles, one per product. */
export const SKILL_PACKAGES = [
  'apexcharts-skill',
  'apexgantt-skill',
  'apextree-skill',
  'apexsankey-skill',
  'apexgrid-skill',
];

/**
 * Pull a scalar field from a SKILL.md YAML frontmatter `metadata:` block.
 * Deliberately tiny — only flat string values are needed, so no YAML dep.
 * Matches `  <key>: <value>` (value optionally quoted).
 */
export function readMetadataField(skillMarkdown, key) {
  const frontmatter = skillMarkdown.match(/^---\n([\s\S]*?)\n---/);
  const haystack = frontmatter ? frontmatter[1] : skillMarkdown;
  const m = haystack.match(new RegExp(`^\\s+${key}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, 'm'));
  return m ? m[1].trim() : null;
}

/** Strip a semver range operator (>=, ^, ~, =, v) to a bare `x.y.z`. */
export function bareVersion(spec) {
  if (!spec) return null;
  const m = spec.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? m[0] : null;
}

/** Compare bare `x.y.z` strings. Returns >0 if a is newer than b. */
export function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

/** Parse `owner/repo` out of a github.com URL. */
export function parseGithub(url) {
  const m = (url || '').match(/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * Load one skill package's metadata + file locations. Returns the raw exports
 * (skillFile, referencesDir, referenceFiles, referencePath) plus the parsed
 * SKILL.md fields and the installed skill package version.
 */
export async function loadSkill(skillPkg) {
  const mod = await import(skillPkg);
  const { skillFile, referencesDir, referencePath } = mod;
  const referenceFiles = Array.isArray(mod.referenceFiles) ? mod.referenceFiles : [];
  const skillMd = await readFile(skillFile, 'utf8');

  let skillVersion = null;
  try {
    const pkg = JSON.parse(await readFile(join(dirname(skillFile), 'package.json'), 'utf8'));
    skillVersion = pkg.version ?? null;
  } catch {
    /* leave null */
  }

  return {
    skill: skillPkg,
    skillVersion,
    skillFile,
    referencesDir,
    referenceFiles,
    referencePath,
    npm: readMetadataField(skillMd, 'npm'),
    github: readMetadataField(skillMd, 'github'),
    libraryVersion: readMetadataField(skillMd, 'library_version'),
  };
}

/**
 * Load a skill from its local SOURCE repo (a sibling checkout), rather than the
 * installed npm package. This is what the verification workflow targets — you
 * edit and re-pin docs in the source repo, and the published package lags. The
 * source dir is `<srcRoot>/<skill-pkg-name>` by convention (overridable by the
 * caller). Reference files are discovered from `<dir>/references/*.md`.
 * Returns the same shape as `loadSkill`, so `readAllDocs` works on it unchanged.
 */
export async function loadSkillSource(skillPkg, srcRoot) {
  const dir = join(srcRoot, skillPkg);
  const skillFile = join(dir, 'SKILL.md');
  const skillMd = await readFile(skillFile, 'utf8');
  const referencesDir = join(dir, 'references');
  let referenceFiles = [];
  try {
    referenceFiles = (await readdir(referencesDir)).filter((f) => f.endsWith('.md')).sort();
  } catch {
    /* no references dir */
  }
  return {
    skill: skillPkg,
    dir,
    skillFile,
    referencesDir,
    referenceFiles,
    referencePath: (f) => join(referencesDir, f),
    npm: readMetadataField(skillMd, 'npm'),
    github: readMetadataField(skillMd, 'github'),
    libraryVersion: readMetadataField(skillMd, 'library_version'),
  };
}

/** Read SKILL.md + every reference doc for a skill as one concatenated string,
 * each section prefixed with a `\n@@FILE <name>\n` marker for locating hits. */
export async function readAllDocs(skill) {
  const parts = [];
  parts.push(`\n@@FILE SKILL.md\n` + (await readFile(skill.skillFile, 'utf8')));
  for (const f of skill.referenceFiles) {
    try {
      parts.push(`\n@@FILE ${f}\n` + (await readFile(skill.referencePath(f), 'utf8')));
    } catch {
      /* skip unreadable reference */
    }
  }
  return parts.join('\n');
}
