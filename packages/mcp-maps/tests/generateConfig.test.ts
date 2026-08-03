import { describe, expect, it } from 'vitest';

import { generateMapsConfig } from '../src/generateConfig.js';

describe('generateMapsConfig', () => {
  it('defaults to a world choropleth with placeholder data', () => {
    const config = generateMapsConfig({});
    expect(config.geo).toEqual({ map: 'world/countries' });
    const series = (config.series as Record<string, unknown>[])[0];
    expect(series.type).toBeUndefined(); // choropleth is the library default
    expect(series.joinBy).toEqual(['iso_a3', 'code']);
    expect(Array.isArray(series.data)).toBe(true);
    expect((series.data as unknown[]).length).toBeGreaterThan(3);
  });

  it('placeholder choropleth data includes a null (no-data) value', () => {
    const config = generateMapsConfig({});
    const data = (config.series as { data: { value: unknown }[] }[])[0].data;
    expect(data.some((d) => d.value === null)).toBe(true);
  });

  it('emits the series type for non-choropleth series', () => {
    for (const type of ['bubble', 'marker', 'arc', 'line'] as const) {
      const config = generateMapsConfig({ type });
      const series = (config.series as Record<string, unknown>[])[0];
      expect(series.type).toBe(type);
    }
  });

  it('generates placeholder data in the right datum shape per type', () => {
    const bubble = (generateMapsConfig({ type: 'bubble' }).series as { data: Record<string, unknown>[] }[])[0].data[0];
    expect(typeof bubble.lon).toBe('number');
    expect(typeof bubble.lat).toBe('number');

    const arc = (generateMapsConfig({ type: 'arc' }).series as { data: Record<string, unknown>[] }[])[0].data[0];
    expect(arc.from).toBeDefined();
    expect(arc.to).toBeDefined();

    const line = (generateMapsConfig({ type: 'line' }).series as { data: Record<string, unknown>[] }[])[0].data[0];
    expect(Array.isArray(line.path)).toBe(true);
    expect((line.path as unknown[]).length).toBeGreaterThan(1);
  });

  it('does not emit a placeholder joinBy for non-choropleth types', () => {
    const config = generateMapsConfig({ type: 'bubble' });
    const series = (config.series as Record<string, unknown>[])[0];
    expect(series.joinBy).toBeUndefined();
  });

  it('passes provided data through untouched and skips the placeholder joinBy', () => {
    const data = [{ state: 'CA', value: 1 }];
    const config = generateMapsConfig({ map: 'us', data });
    const series = (config.series as Record<string, unknown>[])[0];
    expect(series.data).toBe(data);
    expect(series.joinBy).toBeUndefined();
    expect((config.geo as Record<string, unknown>).map).toBe('us');
  });

  it('honors an explicit joinBy', () => {
    const config = generateMapsConfig({ joinBy: ['name', 'state'], data: [] });
    const series = (config.series as Record<string, unknown>[])[0];
    expect(series.joinBy).toEqual(['name', 'state']);
  });

  it('routes palette to scale for choropleth and colorScale otherwise', () => {
    const choropleth = (generateMapsConfig({ palette: 'viridis' }).series as Record<string, unknown>[])[0];
    expect(choropleth.scale).toEqual({ palette: 'viridis' });

    const bubble = (generateMapsConfig({ type: 'bubble', palette: 'viridis' }).series as Record<string, unknown>[])[0];
    expect(bubble.colorScale).toEqual({ palette: 'viridis' });
  });

  it('emits projection and theme only when asked', () => {
    const bare = generateMapsConfig({});
    expect((bare.geo as Record<string, unknown>).projection).toBeUndefined();
    expect(bare.theme).toBeUndefined();

    const full = generateMapsConfig({ projection: 'orthographic', themeMode: 'dark', seriesName: 'Sales' });
    expect((full.geo as Record<string, unknown>).projection).toBe('orthographic');
    expect(full.theme).toEqual({ mode: 'dark' });
    expect((full.series as Record<string, unknown>[])[0].name).toBe('Sales');
  });

  it('generated output validates clean', async () => {
    const { validateMapsConfig } = await import('../src/validateConfig.js');
    for (const type of ['choropleth', 'bubble', 'marker', 'arc', 'line'] as const) {
      const result = validateMapsConfig(generateMapsConfig({ type }));
      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
    }
  });
});
