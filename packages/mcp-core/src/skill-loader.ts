import { readFile } from 'node:fs/promises';

export interface ReferenceEntry {
  /** Filename used to request this doc (e.g. "SKILL.md", "data-format.md"). */
  file: string;
  /** Short, one-line summary of what's inside. */
  description: string;
}

/** Minimum surface a skill npm package must expose to be readable here. */
export interface SkillPackage {
  skillFile: string;
  referencesDir: string;
  referencePath(filename: string): string;
}

export interface ReferenceReader {
  readonly index: ReferenceEntry[];
  isKnown(file: string): boolean;
  read(file: string): Promise<string>;
}

/**
 * Build a reader for a product's reference docs. `index` lists files in
 * display order (SKILL.md first); `skill` is the imported skill npm package.
 *
 * SKILL.md is read from `skill.skillFile`; any other entry is read from
 * `skill.referencePath(filename)`. Unknown filenames throw rather than read
 * arbitrary paths.
 */
export function createReferenceReader(
  index: ReferenceEntry[],
  skill: SkillPackage,
): ReferenceReader {
  const known = new Set(index.map((e) => e.file));
  return {
    index,
    isKnown(file: string): boolean {
      return known.has(file);
    },
    async read(file: string): Promise<string> {
      if (!known.has(file)) {
        throw new Error(
          `Unknown reference file "${file}". Available: ${index.map((e) => e.file).join(', ')}`,
        );
      }
      if (file === 'SKILL.md') return readFile(skill.skillFile, 'utf8');
      return readFile(skill.referencePath(file), 'utf8');
    },
  };
}
