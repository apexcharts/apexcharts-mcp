import {
  createReferenceReader,
  readSkillCompatibility,
  type ReferenceEntry,
  type SkillCompatibility,
} from '@apexcharts-mcp/core';
import * as skill from 'apexmaps-skill';

export const REFERENCE_INDEX: ReferenceEntry[] = [
  {
    file: 'SKILL.md',
    description:
      'Top-level ApexMaps skill index: the five series types (choropleth, bubble, marker, arc, line), ' +
      'geometry registry, joins, lifecycle, public API, pitfalls. Read this first.',
  },
  {
    file: 'data-format.md',
    description:
      'Datum shapes per series type, joinBy forms, fuzzyJoin, join diagnostics, normalizeBy, FIPS repair.',
  },
  {
    file: 'geo-and-projections.md',
    description:
      'Geometry registry packs and aliases, custom GeoJSON/TopoJSON, registerMap, projections, spec objects, camera API.',
  },
  {
    file: 'styling-and-interaction.md',
    description:
      'Scales, palettes, legends, tooltips, pattern/image fills, selection, linked maps, drilldown, a11y, theming, licensing.',
  },
  {
    file: 'framework-wrappers.md',
    description: 'React, Vue 3, and Angular integration for ApexMaps.',
  },
];

const reader = createReferenceReader(REFERENCE_INDEX, skill);

export function isKnownReference(file: string): boolean {
  return reader.isKnown(file);
}

export async function readKnownFile(file: string): Promise<string> {
  return reader.read(file);
}

export function readCompatibility(): Promise<SkillCompatibility> {
  return readSkillCompatibility(skill);
}
