import { expect } from 'vitest';
import type { ReferenceEntry } from '../../src/index.js';

/**
 * Shared invariants every product's REFERENCE_INDEX must hold against the
 * `*-skill` npm package it is paired with.
 *
 * These exist because the two halves drift independently: the index lives here,
 * the docs live in the skill package, and `createReferenceReader` resolves a
 * filename through the *package's* own `referenceFiles`. So an upstream rename
 * makes `get_reference` throw at runtime, and an upstream addition makes a doc
 * unreachable — neither of which any other test noticed. Both actually
 * happened: apexcharts-skill 3.0.0 renamed `v6-features.md`, and apexgantt /
 * apexgrid shipped four docs the index never listed.
 *
 * Not a `*.test.ts` file, so vitest does not collect it directly.
 */
export interface SkillModule {
  referenceFiles: string[];
  referencePath(filename: string): string;
  skillFile: string;
}

/**
 * Every entry in the index resolves and reads. Catches an upstream rename or a
 * dependency that has not been bumped yet.
 */
export async function expectEveryEntryReadable(
  index: ReferenceEntry[],
  readKnownFile: (file: string) => Promise<string>,
): Promise<void> {
  expect(index.length).toBeGreaterThan(1);
  expect(index[0].file).toBe('SKILL.md');
  for (const entry of index) {
    const text = await readKnownFile(entry.file);
    expect(text.length, `${entry.file} should be non-trivial`).toBeGreaterThan(200);
  }
}

/**
 * Every doc the skill package ships is listed in the index. Catches a doc added
 * upstream that no `get_reference` call can reach.
 */
export function expectEverythingShippedIsIndexed(
  index: ReferenceEntry[],
  skill: SkillModule,
): void {
  const indexed = new Set(index.map((e) => e.file).filter((f) => f !== 'SKILL.md'));
  const notIndexed = skill.referenceFiles.filter((f) => !indexed.has(f));
  expect(
    notIndexed,
    `these files ship in the skill package but no get_reference call can read them: ${notIndexed.join(', ')}`,
  ).toEqual([]);
}

/** Index entries are unique and each carries a usable description. */
export function expectIndexWellFormed(index: ReferenceEntry[]): void {
  const files = index.map((e) => e.file);
  expect(new Set(files).size, 'duplicate index entries').toBe(files.length);
  for (const entry of index) {
    expect(entry.description.length, `${entry.file} needs a description`).toBeGreaterThan(20);
  }
}
