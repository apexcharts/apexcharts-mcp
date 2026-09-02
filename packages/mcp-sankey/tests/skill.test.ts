import { describe, expect, it } from 'vitest';
import * as skill from 'apexsankey-skill';
import { isKnownReference, readKnownFile, REFERENCE_INDEX } from '../src/skill.js';
import {
  expectEveryEntryReadable,
  expectEverythingShippedIsIndexed,
  expectIndexWellFormed,
} from '../../mcp-core/tests/helpers/reference-index.js';

describe('reference index', () => {
  it('is well formed', () => {
    expectIndexWellFormed(REFERENCE_INDEX);
  });

  it('isKnownReference matches the index and rejects unknown files', () => {
    for (const e of REFERENCE_INDEX) expect(isKnownReference(e.file)).toBe(true);
    expect(isKnownReference('does-not-exist.md')).toBe(false);
    expect(isKnownReference('../../../etc/passwd')).toBe(false);
  });

  it('resolves every entry against the installed skill package', async () => {
    await expectEveryEntryReadable(REFERENCE_INDEX, readKnownFile);
  });

  it('indexes every doc the skill package ships', () => {
    expectEverythingShippedIsIndexed(REFERENCE_INDEX, skill);
  });
});

describe('readKnownFile', () => {
  it('rejects unknown filenames', async () => {
    await expect(readKnownFile('nope.md')).rejects.toThrow(/Unknown reference file/);
  });

  it('rejects path traversal attempts', async () => {
    await expect(readKnownFile('../../etc/passwd')).rejects.toThrow(/Unknown reference file/);
  });
});
