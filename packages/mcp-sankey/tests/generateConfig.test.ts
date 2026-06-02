import { describe, expect, it } from 'vitest';
import { generateSankeyConfig } from '../src/generateConfig.js';

describe('generateSankeyConfig', () => {
  it('builds options + data placeholders by default', () => {
    const config = generateSankeyConfig({});
    expect(config.options).toMatchObject({ width: '100%', height: 'auto' });
    expect(config.data.nodes.length).toBeGreaterThanOrEqual(4);
    expect(config.data.edges.length).toBeGreaterThanOrEqual(3);
  });

  it('placeholder edges reference placeholder nodes', () => {
    const config = generateSankeyConfig({});
    const ids = new Set(
      (config.data.nodes as Array<{ id: string }>).map((n) => n.id),
    );
    for (const edge of config.data.edges as Array<{ source: string; target: string }>) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });

  it('placeholder edges all have positive value', () => {
    const config = generateSankeyConfig({});
    for (const edge of config.data.edges as Array<{ value: number }>) {
      expect(edge.value).toBeGreaterThan(0);
    }
  });

  it('passes through supplied nodes/edges', () => {
    const nodes = [{ id: 'a', title: 'A' }];
    const edges = [{ source: 'a', target: 'a', value: 1, type: 't' }];
    const config = generateSankeyConfig({ nodes, edges });
    expect(config.data.nodes).toBe(nodes);
    expect(config.data.edges).toBe(edges);
  });

  it('honors width/height/spacing/nodeWidth', () => {
    const config = generateSankeyConfig({ width: 800, height: 500, spacing: 60, nodeWidth: 24 });
    expect(config.options).toMatchObject({ width: 800, height: 500, spacing: 60, nodeWidth: 24 });
  });

  it('encodes animation: false as { enabled: false }', () => {
    const off = generateSankeyConfig({ animation: false });
    expect(off.options.animation).toEqual({ enabled: false });
    const on = generateSankeyConfig({ animation: true });
    expect(on.options.animation).toBeUndefined();
  });

  it('passes tooltipTheme through', () => {
    const config = generateSankeyConfig({ tooltipTheme: 'dark' });
    expect(config.options.tooltipTheme).toBe('dark');
  });
});
