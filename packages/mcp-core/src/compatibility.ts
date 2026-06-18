import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { SkillPackage } from './skill-loader.js';

/**
 * Version compatibility for one product's bundled skill, derived entirely from
 * the skill npm package (no values hand-maintained in this repo):
 *
 *   - `skillVersion`     the installed `<product>-skill` package version
 *   - `library`          the upstream library's npm name (SKILL.md `metadata.npm`)
 *   - `verifiedAgainst`  the library version the docs were last verified against
 *                        (SKILL.md `metadata.library_version`)
 *
 * `scripts/check-versions.mjs` reads the same SKILL.md fields to flag drift
 * against the npm registry; this surfaces them at runtime so an AI client can
 * self-report which library version its guidance was written for.
 */
export interface SkillCompatibility {
  skillVersion: string | null;
  library: string | null;
  verifiedAgainst: string | null;
}

/**
 * Pull a scalar field from a SKILL.md YAML frontmatter `metadata:` block.
 * Intentionally minimal — only flat string values are needed, so no YAML
 * dependency. Matches `  <key>: <value>` (value optionally quoted).
 */
function readMetadataField(skillMarkdown: string, key: string): string | null {
  const frontmatter = skillMarkdown.match(/^---\n([\s\S]*?)\n---/);
  const haystack = frontmatter ? frontmatter[1] : skillMarkdown;
  const m = haystack.match(new RegExp(`^\\s+${key}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, 'm'));
  return m ? m[1].trim() : null;
}

/** Read the compatibility metadata for a skill package. Best-effort: any field
 * that can't be resolved comes back `null` rather than throwing. */
export async function readSkillCompatibility(skill: SkillPackage): Promise<SkillCompatibility> {
  let skillVersion: string | null = null;
  let library: string | null = null;
  let verifiedAgainst: string | null = null;

  try {
    const markdown = await readFile(skill.skillFile, 'utf8');
    library = readMetadataField(markdown, 'npm');
    verifiedAgainst = readMetadataField(markdown, 'library_version');
  } catch {
    /* skill markdown unreadable — leave fields null */
  }

  try {
    const pkgPath = join(dirname(skill.skillFile), 'package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { version?: string };
    skillVersion = pkg.version ?? null;
  } catch {
    /* package.json unreadable — leave skillVersion null */
  }

  return { skillVersion, library, verifiedAgainst };
}
