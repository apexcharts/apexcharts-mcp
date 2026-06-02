import { describe, expect, it } from 'vitest';
import { validateTreeConfig } from '../src/validateConfig.js';

const okRoot = {
  id: 'root',
  name: 'Root',
  children: [
    { id: 'a', name: 'A', children: [] },
    { id: 'b', name: 'B', children: [{ id: 'b1', name: 'B1', children: [] }] },
  ],
};

describe('validateTreeConfig — happy path', () => {
  it('accepts a bare root NestedNode', () => {
    const result = validateTreeConfig(okRoot);
    expect(result.ok).toBe(true);
  });

  it('accepts a wrapped { options, data } config', () => {
    const result = validateTreeConfig({ options: { direction: 'top' }, data: okRoot });
    expect(result.ok).toBe(true);
  });
});

describe('validateTreeConfig — top-level', () => {
  it('flags non-object config', () => {
    expect(validateTreeConfig(42).errors[0].rule).toBe('config-not-object');
  });

  it('flags missing data when wrapped', () => {
    const result = validateTreeConfig({ options: {} });
    expect(result.errors.some((e) => e.rule === 'missing-data')).toBe(true);
  });

  it('flags non-object root', () => {
    const result = validateTreeConfig('not a node');
    expect(result.errors[0].rule).toBe('config-not-object');
  });
});

describe('validateTreeConfig — options', () => {
  it('flags invalid direction', () => {
    const result = validateTreeConfig({ options: { direction: 'diagonal' }, data: okRoot });
    expect(result.errors.some((e) => e.rule === 'invalid-direction')).toBe(true);
  });

  it('flags invalid edgeStyle', () => {
    const result = validateTreeConfig({ options: { edgeStyle: 'wavy' }, data: okRoot });
    expect(result.errors.some((e) => e.rule === 'invalid-edgeStyle')).toBe(true);
  });

  it('flags invalid edgeColorMode', () => {
    const result = validateTreeConfig({ options: { edgeColorMode: 'rainbow' }, data: okRoot });
    expect(result.errors.some((e) => e.rule === 'invalid-edgeColorMode')).toBe(true);
  });

  it('flags invalid theme', () => {
    const result = validateTreeConfig({ options: { theme: 'neon' }, data: okRoot });
    expect(result.errors.some((e) => e.rule === 'invalid-theme')).toBe(true);
  });

  it('flags enableSelection: true (must be "single"|"multi"|false)', () => {
    const result = validateTreeConfig({ options: { enableSelection: true }, data: okRoot });
    expect(result.errors.some((e) => e.rule === 'invalid-enableSelection')).toBe(true);
  });

  it('accepts enableSelection: "single", "multi", false', () => {
    for (const v of ['single', 'multi', false] as const) {
      const result = validateTreeConfig({ options: { enableSelection: v }, data: okRoot });
      expect(result.ok).toBe(true);
    }
  });
});

describe('validateTreeConfig — nodes', () => {
  it('flags missing id', () => {
    const result = validateTreeConfig({ name: 'X', children: [] });
    expect(result.errors.some((e) => e.rule === 'node-missing-id')).toBe(true);
  });

  it('flags missing name when contentKey is the default "name"', () => {
    const result = validateTreeConfig({ id: 'x', children: [] });
    expect(result.errors.some((e) => e.rule === 'node-missing-name')).toBe(true);
  });

  it('does NOT require name when contentKey is "data"', () => {
    const result = validateTreeConfig({
      options: { contentKey: 'data' },
      data: { id: 'x', data: { title: 'X' }, children: [] },
    });
    expect(result.ok).toBe(true);
  });

  it('warns when contentKey is "data" but a node has no data payload', () => {
    const result = validateTreeConfig({
      options: { contentKey: 'data' },
      data: { id: 'x', children: [] },
    });
    expect(result.warnings.some((w) => w.rule === 'contentKey-data-without-payload')).toBe(true);
  });

  it('flags missing children', () => {
    const result = validateTreeConfig({ id: 'x', name: 'X' });
    expect(result.errors.some((e) => e.rule === 'children-missing')).toBe(true);
  });

  it('flags children that is not an array', () => {
    const result = validateTreeConfig({ id: 'x', name: 'X', children: null });
    expect(result.errors.some((e) => e.rule === 'children-not-array')).toBe(true);
  });

  it('detects duplicate ids deep in the tree', () => {
    const result = validateTreeConfig({
      id: 'root',
      name: 'R',
      children: [
        { id: 'a', name: 'A', children: [] },
        { id: 'a', name: 'A-dup', children: [] },
      ],
    });
    expect(result.errors.some((e) => e.rule === 'duplicate-id')).toBe(true);
  });
});
