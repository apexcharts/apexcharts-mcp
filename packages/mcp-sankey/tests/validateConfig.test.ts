import { describe, expect, it } from 'vitest';
import { validateSankeyConfig } from '../src/validateConfig.js';

const okData = {
  nodes: [
    { id: 'a', title: 'A' },
    { id: 'b', title: 'B' },
    { id: 'c', title: 'C' },
  ],
  edges: [
    { source: 'a', target: 'b', value: 5, type: 'flow' },
    { source: 'b', target: 'c', value: 3, type: 'flow' },
  ],
};

describe('validateSankeyConfig — happy path', () => {
  it('accepts a raw { nodes, edges } payload', () => {
    const result = validateSankeyConfig(okData);
    expect(result.ok).toBe(true);
  });

  it('accepts the wrapped { options, data } shape', () => {
    const result = validateSankeyConfig({ options: {}, data: okData });
    expect(result.ok).toBe(true);
  });
});

describe('validateSankeyConfig — top-level', () => {
  it('flags non-object config', () => {
    expect(validateSankeyConfig(42).errors[0].rule).toBe('config-not-object');
  });

  it('flags missing nodes', () => {
    const result = validateSankeyConfig({ edges: [] });
    expect(result.errors.some((e) => e.rule === 'missing-nodes')).toBe(true);
  });

  it('flags missing edges', () => {
    const result = validateSankeyConfig({ nodes: [] });
    expect(result.errors.some((e) => e.rule === 'missing-edges')).toBe(true);
  });

  it('flags non-array nodes/edges', () => {
    const result = validateSankeyConfig({ nodes: 'oops', edges: 'oops' });
    const rules = result.errors.map((e) => e.rule);
    expect(rules).toContain('nodes-not-array');
    expect(rules).toContain('edges-not-array');
  });
});

describe('validateSankeyConfig — nodes', () => {
  it('flags node missing id', () => {
    const result = validateSankeyConfig({ nodes: [{ title: 'A' }], edges: [] });
    expect(result.errors.some((e) => e.rule === 'node-missing-id')).toBe(true);
  });

  it('flags duplicate node ids', () => {
    const result = validateSankeyConfig({
      nodes: [{ id: 'a', title: 'A' }, { id: 'a', title: 'A2' }],
      edges: [],
    });
    expect(result.errors.some((e) => e.rule === 'duplicate-node-id')).toBe(true);
  });
});

describe('validateSankeyConfig — edges', () => {
  it('flags edge missing source/target', () => {
    const result = validateSankeyConfig({
      nodes: [{ id: 'a', title: 'A' }],
      edges: [{ value: 1, type: 't' }],
    });
    const rules = result.errors.map((e) => e.rule);
    expect(rules).toContain('edge-missing-source');
    expect(rules).toContain('edge-missing-target');
  });

  it('flags edge.source pointing to unknown node', () => {
    const result = validateSankeyConfig({
      nodes: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
      edges: [{ source: 'ghost', target: 'a', value: 1, type: 't' }],
    });
    expect(result.errors.some((e) => e.rule === 'edge-source-unknown')).toBe(true);
  });

  it('flags edge.target pointing to unknown node', () => {
    const result = validateSankeyConfig({
      nodes: [{ id: 'a', title: 'A' }],
      edges: [{ source: 'a', target: 'ghost', value: 1, type: 't' }],
    });
    expect(result.errors.some((e) => e.rule === 'edge-target-unknown')).toBe(true);
  });

  it('errors on a negative edge.value', () => {
    const neg = validateSankeyConfig({
      nodes: okData.nodes,
      edges: [{ source: 'a', target: 'b', value: -5, type: 't' }],
    });
    expect(neg.errors.some((e) => e.rule === 'edge-value-not-positive')).toBe(true);
  });

  it('warns (not errors) on a zero edge.value, and errors when every value is zero', () => {
    const one = validateSankeyConfig({
      nodes: okData.nodes,
      edges: [
        { source: 'a', target: 'b', value: 5 },
        { source: 'b', target: 'c', value: 0 },
      ],
    });
    expect(one.ok).toBe(true);
    expect(one.warnings.map((w) => w.rule)).toContain('edge-value-zero');

    const all = validateSankeyConfig({
      nodes: okData.nodes,
      edges: [{ source: 'a', target: 'b', value: 0 }],
    });
    expect(all.errors.map((e) => e.rule)).toContain('edge-values-all-zero');
  });

  it('flags missing edge.value', () => {
    const result = validateSankeyConfig({
      nodes: okData.nodes,
      edges: [{ source: 'a', target: 'b', type: 't' }],
    });
    expect(result.errors.some((e) => e.rule === 'edge-missing-value')).toBe(true);
  });

  it('accepts edges without a type (it only tells parallel edges apart)', () => {
    const result = validateSankeyConfig({
      nodes: okData.nodes,
      edges: [
        { source: 'a', target: 'b', value: 1 },
        { source: 'b', target: 'c', value: 1 },
      ],
    });
    expect(result.issues).toEqual([]);
  });

  it('errors on parallel edges that collapse into one (same source, target and type)', () => {
    const result = validateSankeyConfig({
      nodes: okData.nodes,
      edges: [
        { source: 'a', target: 'b', value: 10, type: 'x' },
        { source: 'a', target: 'b', value: 1, type: 'x' },
        { source: 'a', target: 'b', value: 4, type: 'y' },
        { source: 'b', target: 'c', value: 3 },
      ],
    });
    const dupes = result.errors.filter((e) => e.rule === 'duplicate-edge');
    expect(dupes).toHaveLength(1);
    expect(dupes[0].path).toBe('edges[1]');
  });

  it('keeps parallel edges in chord mode, where nothing collapses', () => {
    const result = validateSankeyConfig({
      options: { type: 'chord' },
      nodes: okData.nodes,
      edges: [
        { source: 'a', target: 'b', value: 10 },
        { source: 'a', target: 'b', value: 1 },
      ],
    });
    expect(result.issues).toEqual([]);
  });

  it('warns about a declared node that no edge uses', () => {
    const result = validateSankeyConfig({
      nodes: okData.nodes,
      edges: [{ source: 'a', target: 'b', value: 1 }],
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.path)).toEqual(['nodes[2]']);
    expect(result.warnings[0].rule).toBe('node-unused');
  });

  it('validates each panel of an ApexSankey.compare config', () => {
    const result = validateSankeyConfig({
      before: okData,
      after: { nodes: okData.nodes, edges: [{ source: 'a', target: 'ghost', value: 1 }] },
    });
    expect(result.errors.map((e) => `${e.rule}@${e.path}`)).toEqual(['edge-target-unknown@after.edges[0].target']);
  });

  it('flags self-loop edges', () => {
    const result = validateSankeyConfig({
      nodes: okData.nodes,
      edges: [{ source: 'a', target: 'a', value: 1, type: 't' }],
    });
    expect(result.errors.some((e) => e.rule === 'self-loop')).toBe(true);
  });

  it('accepts a cycle (a → b → a): the layout draws it as a dashed loop', () => {
    const result = validateSankeyConfig({
      nodes: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
      edges: [
        { source: 'a', target: 'b', value: 1, type: 't' },
        { source: 'b', target: 'a', value: 1, type: 't' },
      ],
    });
    expect(result.issues).toEqual([]);
  });
});
