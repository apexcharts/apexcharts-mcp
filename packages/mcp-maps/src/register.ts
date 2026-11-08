import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { READ_ONLY_TOOL } from '@apexcharts-mcp/core';

import { generateMapsConfig } from './generateConfig.js';
import { isKnownReference, readKnownFile, REFERENCE_INDEX } from './skill.js';
import { validateMapsConfig } from './validateConfig.js';

export function registerMapsTools(server: McpServer): void {
  server.registerTool(
    'apexmaps_generate_config',
    {
      title: 'Generate ApexMaps config',
      annotations: { ...READ_ONLY_TOOL, title: 'Generate ApexMaps config' },
      description:
        'Build a minimal valid ApexMaps options object for a geographic visualization. ' +
        'Supports the seven series types: choropleth (default), bubble, marker, arc, line, hexbin, pixel. ' +
        'Geometry comes from the built-in registry (e.g. "world/countries", "us", "eu/nuts2"), ' +
        'so no GeoJSON is needed. Generates a small placeholder dataset when data is omitted. ' +
        'Use the result with `new ApexMaps(el, options)` then `await map.render()`.',
      inputSchema: {
        type: z
          .enum(['choropleth', 'bubble', 'marker', 'arc', 'line', 'hexbin', 'pixel'])
          .optional()
          .describe(
            'Series type. Default "choropleth". "hexbin" bins points into a hex lattice ' +
              '(density); it takes points, never region-keyed rows. "pixel" is a choropleth ' +
              'drawn as a lattice of dots: the same region-keyed rows, join and scale.',
          ),
        map: z
          .string()
          .optional()
          .describe(
            'Geometry registry pack id or alias: "world/countries", "us", "us/counties", ' +
              '"eu/nuts2", "jp/prefectures", ... Default "world/countries".',
          ),
        seriesName: z.string().optional().describe('Series display name (legend / tooltip).'),
        data: z
          .array(z.unknown())
          .optional()
          .describe(
            'Data array in the datum shape of `type`: choropleth and pixel rows `{ <key>, value }`, ' +
              'bubble/marker `{ lon, lat, ... }`, arc `{ from, to }`, line `{ path: [[lon,lat],...] }`, ' +
              'hexbin `{ lon, lat, value? }`. Omit for a placeholder dataset.',
          ),
        joinBy: z
          .union([z.string(), z.tuple([z.string(), z.string()]), z.record(z.string())])
          .optional()
          .describe(
            'Join spec: "field", ["geoField", "dataField"], or { geo, data }. ' +
              'Omit to use key auto-detection (the placeholder emits ["iso_a3", "code"]).',
          ),
        palette: z
          .string()
          .optional()
          .describe('Palette name for the value scale (e.g. "blues", "viridis", "okabeIto").'),
        projection: z
          .union([z.string(), z.record(z.unknown())])
          .optional()
          .describe(
            'Projection name or spec object. Omit to use the pack default (recommended: ' +
              'packs like "us" already pick albersUsa).',
          ),
        themeMode: z
          .enum(['light', 'dark', 'auto'])
          .optional()
          .describe(
            'Theme mode. Omit to leave theme out of the config, so the library default applies and an Ignite UI add-on can pick its own light or dark variant.',
          ),
      },
    },
    async (input) => {
      const config = generateMapsConfig(input as Parameters<typeof generateMapsConfig>[0]);
      return {
        content: [{ type: 'text', text: JSON.stringify(config, null, 2) }],
      };
    },
  );

  server.registerTool(
    'apexmaps_validate_config',
    {
      title: 'Validate ApexMaps config',
      annotations: { ...READ_ONLY_TOOL, title: 'Validate ApexMaps config' },
      description:
        'Check an ApexMaps options object against what the library does with it: geo.map present ' +
        'and a built-in map id (or a URL / inline geometry), hex layouts only where one exists, ' +
        'a frameable geo.view.fit, geo.tiles with a url on a webMercator projection, known series types, ' +
        'arc from/to endpoints, line paths, bubble/marker coordinates or something to join on, ' +
        'hexbin point positions and aggregates (a hexbin has no joinBy), pixel shape / grid / lattice / spacing, ' +
        '[lon, lat] ordering, joinBy shape, null (not undefined) for missing ' +
        'values, known scale / projection / palette names, and boolean ' +
        'theme.tokens / theme.designSystem. Returns structured issues ' +
        'with stable rule ids, severity, path, and a fix when there is a one-shot remedy.',
      inputSchema: {
        config: z.record(z.string(), z.unknown()).describe('The ApexMaps options object to validate.'),
      },
    },
    async ({ config }) => {
      const result = validateMapsConfig(config);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    'apexmaps_get_reference',
    {
      title: 'Get ApexMaps reference doc',
      annotations: { ...READ_ONLY_TOOL, title: 'Get ApexMaps reference doc' },
      description:
        'Read authoritative ApexMaps documentation from the bundled apexmaps-skill ' +
        'knowledge base. Call with no arguments to list available files; call with `file` ' +
        'to fetch markdown. Use this for series datum shapes, joins, the geometry registry, ' +
        'projections, scales, drilldown, theming, or framework integration.',
      inputSchema: {
        file: z
          .string()
          .optional()
          .describe('Filename to read (e.g. "SKILL.md", "data-format.md"). Omit to list available files.'),
      },
    },
    async ({ file }) => {
      if (!file) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: REFERENCE_INDEX.length, files: REFERENCE_INDEX }, null, 2),
            },
          ],
        };
      }

      if (!isKnownReference(file)) {
        const known = REFERENCE_INDEX.map((e) => e.file).join(', ');
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown reference file "${file}". Available: ${known}.` }],
        };
      }

      const text = await readKnownFile(file);
      return { content: [{ type: 'text', text }] };
    },
  );
}
