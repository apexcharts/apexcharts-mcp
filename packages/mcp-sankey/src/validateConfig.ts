export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  severity: Severity;
  rule: string;
  path: string;
  message: string;
  fix?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  issues: ValidationIssue[];
}

type AnyObj = Record<string, unknown>;

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate an ApexSankey config. Accepts:
 *   - the render payload directly: `{ nodes, edges }` (with optional `options`),
 *   - the wrapped shape from generateSankeyConfig: `{ options, data: { nodes, edges } }`, or
 *   - an `ApexSankey.compare` config: `{ before, after, options? }`, each panel a `{ nodes, edges }` graph.
 *
 * Each rule encodes what the library does with the input, checked against the
 * apexsankey source (1.12.2): unique node ids, edges that reference real
 * nodes, non-negative values, no self-loops, no edges that collapse into one.
 * Cycles are not flagged: the layout reverses them and draws a dashed loop.
 * `options.type: 'chord'` changes which edges survive, so it is read here.
 */
export function validateSankeyConfig(config: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isObject(config)) {
    issues.push({
      severity: 'error',
      rule: 'config-not-object',
      path: '',
      message: 'Config must be an object.',
    });
    return finalize(issues);
  }

  const options = isObject(config.options) ? config.options : {};
  const isChord = options.type === 'chord';

  if (isObject(config.before) && isObject(config.after)) {
    checkGraph(config.before, 'before', isChord, issues);
    checkGraph(config.after, 'after', isChord, issues);
    return finalize(issues);
  }

  // Accept either shape: { nodes, edges } directly, or { data: { nodes, edges } }.
  const data = isObject(config.data) ? config.data : config;
  checkGraph(data, isObject(config.data) ? 'data' : '', isChord, issues);
  return finalize(issues);
}

function finalize(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}

function checkGraph(data: AnyObj, basePath: string, isChord: boolean, issues: ValidationIssue[]): void {
  const at = (field: string) => (basePath ? `${basePath}.${field}` : field);
  const nodes = data.nodes;
  const edges = data.edges;
  const before = issues.length;

  if (nodes === undefined) {
    issues.push({
      severity: 'error',
      rule: 'missing-nodes',
      path: at('nodes'),
      message: 'nodes is required.',
      fix: 'Add `nodes: [{ id, title }, ...]`.',
    });
  }
  if (edges === undefined) {
    issues.push({
      severity: 'error',
      rule: 'missing-edges',
      path: at('edges'),
      message: 'edges is required.',
      fix: 'Add `edges: [{ source, target, value }, ...]`.',
    });
  }
  if (issues.length > before) return;

  if (!Array.isArray(nodes)) {
    issues.push({
      severity: 'error',
      rule: 'nodes-not-array',
      path: at('nodes'),
      message: 'nodes must be an array.',
    });
  }
  if (!Array.isArray(edges)) {
    issues.push({
      severity: 'error',
      rule: 'edges-not-array',
      path: at('edges'),
      message: 'edges must be an array.',
    });
  }
  if (issues.length > before) return;

  const declared = checkNodes(nodes as unknown[], at('nodes'), issues);
  const referenced = checkEdges(edges as unknown[], declared, at('edges'), isChord, issues);

  // The sankey layout builds its node set from the edges and only attaches the
  // declared node data to ids an edge created, so a node with no edges is never
  // drawn.
  if (!isChord) {
    declared.forEach((index, id) => {
      if (referenced.has(id)) return;
      issues.push({
        severity: 'warning',
        rule: 'node-unused',
        path: `${at('nodes')}[${index}]`,
        message: `Node "${id}" has no edges, so it is not drawn.`,
        fix: 'Add an edge to or from it, or remove the node.',
      });
    });
  }
}

/** Returns each valid node id with the index of its first declaration. */
function checkNodes(nodes: unknown[], prefix: string, issues: ValidationIssue[]): Map<string, number> {
  const seen = new Map<string, number>();
  const dupes = new Set<string>();
  nodes.forEach((node, i) => {
    if (!isObject(node)) {
      issues.push({
        severity: 'error',
        rule: 'node-not-object',
        path: `${prefix}[${i}]`,
        message: 'Each node must be an object.',
      });
      return;
    }
    const id = node.id;
    if (typeof id !== 'string' || id.length === 0) {
      issues.push({
        severity: 'error',
        rule: 'node-missing-id',
        path: `${prefix}[${i}].id`,
        message: 'node.id is required and must be a non-empty string.',
      });
      return;
    }
    if (seen.has(id)) {
      if (!dupes.has(id)) {
        issues.push({
          severity: 'error',
          rule: 'duplicate-node-id',
          path: `${prefix}[${i}].id`,
          message: `Duplicate node id "${id}". The last declaration overwrites the earlier ones.`,
          fix: 'Give each node its own id, or merge the duplicates into one node.',
        });
        dupes.add(id);
      }
      return;
    }
    seen.set(id, i);
  });
  return seen;
}

/** Returns every node id an edge references. */
function checkEdges(
  edges: unknown[],
  declared: Map<string, number>,
  prefix: string,
  isChord: boolean,
  issues: ValidationIssue[],
): Set<string> {
  const referenced = new Set<string>();
  // The sankey graph keys an edge by (source, target, type): a later edge with
  // the same key replaces the earlier one. Chord diagrams keep every edge.
  const edgeKeys = new Set<string>();
  const values: number[] = [];

  edges.forEach((edge, i) => {
    if (!isObject(edge)) {
      issues.push({
        severity: 'error',
        rule: 'edge-not-object',
        path: `${prefix}[${i}]`,
        message: 'Each edge must be an object.',
      });
      return;
    }

    const { source, target, value, type } = edge;

    for (const [field, id] of [['source', source], ['target', target]] as const) {
      if (typeof id !== 'string' || id.length === 0) {
        issues.push({
          severity: 'error',
          rule: `edge-missing-${field}`,
          path: `${prefix}[${i}].${field}`,
          message: `edge.${field} is required and must be a node id string.`,
        });
        continue;
      }
      referenced.add(id);
      if (!declared.has(id)) {
        issues.push({
          severity: 'error',
          rule: `edge-${field}-unknown`,
          path: `${prefix}[${i}].${field}`,
          message: `edge.${field} "${id}" does not match any node id. ApexSankey draws the flow to an unlabeled phantom node.`,
          fix: 'Add the node to `nodes`, or fix the id.',
        });
      }
    }

    if (value === undefined) {
      issues.push({
        severity: 'error',
        rule: 'edge-missing-value',
        path: `${prefix}[${i}].value`,
        message: 'edge.value is required.',
      });
    } else if (typeof value !== 'number' || !Number.isFinite(value)) {
      issues.push({
        severity: 'error',
        rule: 'edge-value-not-number',
        path: `${prefix}[${i}].value`,
        message: 'edge.value must be a finite number.',
      });
    } else {
      values.push(value);
      if (value < 0) {
        issues.push({
          severity: 'error',
          rule: 'edge-value-not-positive',
          path: `${prefix}[${i}].value`,
          message: `edge.value must not be negative (got ${value}). Negative values break the band geometry.`,
        });
      } else if (value === 0) {
        issues.push({
          severity: 'warning',
          rule: 'edge-value-zero',
          path: `${prefix}[${i}].value`,
          message: isChord
            ? 'edge.value is 0, so the chord diagram drops this flow.'
            : 'edge.value is 0, so the flow is drawn zero-width and a node fed only by it loses its label.',
          fix: 'Remove the edge if the flow is genuinely empty.',
        });
      }
    }

    if (typeof source === 'string' && source === target) {
      issues.push({
        severity: 'error',
        rule: 'self-loop',
        path: `${prefix}[${i}]`,
        message: isChord
          ? `Self-loop edge "${source} → ${source}". The chord diagram drops it.`
          : `Self-loop edge "${source} → ${source}". The sankey inflates the node and the loop itself is invisible.`,
      });
    }

    if (!isChord && typeof source === 'string' && typeof target === 'string') {
      const key = `${source}\u0000${target}\u0000${typeof type === 'string' ? type : ''}`;
      if (edgeKeys.has(key)) {
        const label = typeof type === 'string' && type ? ` with type "${type}"` : '';
        issues.push({
          severity: 'error',
          rule: 'duplicate-edge',
          path: `${prefix}[${i}]`,
          message:
            `Edge "${source} → ${target}"${label} repeats an earlier edge between the same nodes. ` +
            'ApexSankey keeps only the last one, so the earlier value is lost.',
          fix: 'Merge the values into one edge, or give each parallel edge a distinct `type`.',
        });
      }
      edgeKeys.add(key);
    }
  });

  if (values.length > 0 && values.every((v) => v === 0)) {
    issues.push({
      severity: 'error',
      rule: 'edge-values-all-zero',
      path: prefix,
      message: 'Every edge.value is 0, so there is nothing to size the diagram by and the layout produces invalid geometry.',
    });
  }

  return referenced;
}
