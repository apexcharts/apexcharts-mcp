import { describe, expect, it } from 'vitest';
import * as skill from 'apexstock-skill';
import { isKnownReference, readKnownFile, REFERENCE_INDEX } from '../src/skill.js';
import {
  expectEveryEntryReadable,
  expectEverythingShippedIsIndexed,
  expectIndexWellFormed,
} from '../../mcp-core/tests/helpers/reference-index.js';

describe('reference index', () => {
  it('starts with SKILL.md', () => {
    expect(REFERENCE_INDEX[0].file).toBe('SKILL.md');
  });

  it('has unique filenames and a description per entry', () => {
    expectIndexWellFormed(REFERENCE_INDEX);
  });

  it('resolves every entry against the installed skill package', async () => {
    await expectEveryEntryReadable(REFERENCE_INDEX, readKnownFile);
  });

  it('indexes every doc the skill package ships', () => {
    expectEverythingShippedIsIndexed(REFERENCE_INDEX, skill);
  });

  it('isKnownReference matches the index and rejects unknown files', () => {
    for (const e of REFERENCE_INDEX) {
      expect(isKnownReference(e.file)).toBe(true);
    }
    expect(isKnownReference('does-not-exist.md')).toBe(false);
    expect(isKnownReference('../../../etc/passwd')).toBe(false);
  });
});

describe('readKnownFile', () => {
  it('reads SKILL.md', async () => {
    expect(await readKnownFile('SKILL.md')).toMatch(/ApexStock AI Skill/);
  });

  it('rejects unknown filenames', async () => {
    await expect(readKnownFile('nope.md')).rejects.toThrow(/Unknown reference file/);
  });

  it('rejects path traversal attempts', async () => {
    await expect(readKnownFile('../../etc/passwd')).rejects.toThrow(/Unknown reference file/);
  });
});
