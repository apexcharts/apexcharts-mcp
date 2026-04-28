import { describe, expect, it } from 'vitest';
import {
  isKnownReference,
  readKnownFile,
  readReference,
  readSkill,
  REFERENCE_INDEX,
} from '../src/skill.js';

describe('reference index', () => {
  it('starts with SKILL.md', () => {
    expect(REFERENCE_INDEX[0].file).toBe('SKILL.md');
  });

  it('has unique filenames and a description per entry', () => {
    const files = REFERENCE_INDEX.map((e) => e.file);
    expect(new Set(files).size).toBe(files.length);
    for (const e of REFERENCE_INDEX) {
      expect(e.description.length).toBeGreaterThan(20);
    }
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
    const text = await readKnownFile('SKILL.md');
    expect(text).toMatch(/ApexCharts AI Skill/);
  });

  it('reads a per-family reference', async () => {
    const text = await readKnownFile('circular-charts.md');
    expect(text).toMatch(/Circular Charts Reference/i);
  });

  it('rejects unknown filenames', async () => {
    await expect(readKnownFile('nope.md')).rejects.toThrow(/Unknown reference file/);
  });

  it('rejects path traversal attempts', async () => {
    await expect(readKnownFile('../../etc/passwd')).rejects.toThrow(/Unknown reference file/);
  });
});

describe('low-level helpers still work', () => {
  it('readSkill returns SKILL.md', async () => {
    expect(await readSkill()).toMatch(/ApexCharts AI Skill/);
  });

  it('readReference returns a known reference', async () => {
    expect(await readReference('bar-charts.md')).toMatch(/Bar Charts Reference|bar/i);
  });
});
