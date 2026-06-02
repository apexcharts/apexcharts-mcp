import { describe, expect, it } from 'vitest';
import { generateTreeConfig } from '../src/generateConfig.js';

interface Node {
  id: string;
  name: string;
  children: Node[];
}

function walk(node: Node, visit: (n: Node) => void): void {
  visit(node);
  for (const c of node.children) walk(c, visit);
}

describe('generateTreeConfig', () => {
  it('returns { options, data } with sensible defaults', () => {
    const config = generateTreeConfig({});
    expect(config.options).toMatchObject({ width: '100%', height: 'auto', direction: 'top' });
    expect(config.data).toBeTypeOf('object');
  });

  it('placeholder root has id, name, and children: [] even for leaves', () => {
    const config = generateTreeConfig({});
    const root = config.data as Node;
    let count = 0;
    walk(root, (n) => {
      count++;
      expect(typeof n.id).toBe('string');
      expect(typeof n.name).toBe('string');
      expect(Array.isArray(n.children)).toBe(true);
    });
    expect(count).toBeGreaterThan(3);
  });

  it('placeholder ids are unique across the whole tree', () => {
    const config = generateTreeConfig({});
    const seen = new Set<string>();
    walk(config.data as Node, (n) => {
      expect(seen.has(n.id)).toBe(false);
      seen.add(n.id);
    });
  });

  it('passes through supplied root unchanged', () => {
    const root = { id: 'a', name: 'A', children: [] };
    const config = generateTreeConfig({ data: root });
    expect(config.data).toBe(root);
  });

  it('honors direction/contentKey/theme/edgeStyle', () => {
    const config = generateTreeConfig({
      direction: 'left',
      contentKey: 'data',
      theme: 'dark',
      edgeStyle: 'curved',
    });
    expect(config.options).toMatchObject({
      direction: 'left',
      contentKey: 'data',
      theme: 'dark',
      edgeStyle: 'curved',
    });
  });

  it('honors enableSelection: false vs "single"/"multi"', () => {
    expect(generateTreeConfig({ enableSelection: false }).options.enableSelection).toBe(false);
    expect(generateTreeConfig({ enableSelection: 'single' }).options.enableSelection).toBe('single');
    expect(generateTreeConfig({ enableSelection: 'multi' }).options.enableSelection).toBe('multi');
  });

  it('passes node/spacing dimensions through', () => {
    const config = generateTreeConfig({
      nodeWidth: 220,
      nodeHeight: 80,
      siblingSpacing: 40,
      childrenSpacing: 70,
    });
    expect(config.options).toMatchObject({
      nodeWidth: 220,
      nodeHeight: 80,
      siblingSpacing: 40,
      childrenSpacing: 70,
    });
  });
});
