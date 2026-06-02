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
 * Validate an ApexSankey config. Accepts either:
 *   - the render payload directly: `{ nodes, edges }` (with optional `options`), or
 *   - the wrapped shape from generateSankeyConfig: `{ options, data: { nodes, edges } }`.
 *
 * Encodes the data-format rules from apexsankey-skill SKILL.md §2 (DAG, unique
 * node ids, edge value > 0, edges reference real node ids).
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

  // Accept either shape: { nodes, edges } directly, or { data: { nodes, edges } }.
  const data: AnyObj = isObject(config.data) ? config.data : config;

  const nodes = data.nodes;
  const edges = data.edges;

  if (nodes === undefined) {
    issues.push({
      severity: 'error',
      rule: 'missing-nodes',
      path: pathFor(config, 'nodes'),
      message: 'nodes is required.',
      fix: 'Add `nodes: [{ id, title }, ...]`.',
    });
  }
  if (edges === undefined) {
    issues.push({
      severity: 'error',
      rule: 'missing-edges',
      path: pathFor(config, 'edges'),
      message: 'edges is required.',
      fix: 'Add `edges: [{ source, target, value, type }, ...]`.',
    });
  }
  if (issues.length > 0) return finalize(issues);

  if (!Array.isArray(nodes)) {
    issues.push({
      severity: 'error',
      rule: 'nodes-not-array',
      path: pathFor(config, 'nodes'),
      message: 'nodes must be an array.',
    });
  }
  if (!Array.isArray(edges)) {
    issues.push({
      severity: 'error',
      rule: 'edges-not-array',
      path: pathFor(config, 'edges'),
      message: 'edges must be an array.',
    });
  }
  if (issues.length > 0) return finalize(issues);

  const basePath = isObject(config.data) ? 'data' : '';
  const nodeIds = checkNodes(nodes as unknown[], basePath, issues);
  checkEdges(edges as unknown[], nodeIds, basePath, issues);

  return finalize(issues);
}

function pathFor(config: AnyObj, field: 'nodes' | 'edges'): string {
  return isObject(config.data) ? `data.${field}` : field;
}

function finalize(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}

function checkNodes(nodes: unknown[], basePath: string, issues: ValidationIssue[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  const prefix = basePath ? `${basePath}.nodes` : 'nodes';
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
    if (seen.has(id) && !dupes.has(id)) {
      issues.push({
        severity: 'error',
        rule: 'duplicate-node-id',
        path: `${prefix}[${i}].id`,
        message: `Duplicate node id "${id}". Duplicates are silently dropped at layout.`,
      });
      dupes.add(id);
    }
    seen.add(id);
  });
  return seen;
}

function checkEdges(
  edges: unknown[],
  nodeIds: Set<string>,
  basePath: string,
  issues: ValidationIssue[],
): void {
  const prefix = basePath ? `${basePath}.edges` : 'edges';

  // Build adjacency for cycle detection along the way.
  const graph = new Map<string, string[]>();

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

    const source = edge.source;
    const target = edge.target;
    const value = edge.value;
    const type = edge.type;

    if (typeof source !== 'string' || source.length === 0) {
      issues.push({
        severity: 'error',
        rule: 'edge-missing-source',
        path: `${prefix}[${i}].source`,
        message: 'edge.source is required and must be a node id string.',
      });
    } else if (!nodeIds.has(source)) {
      issues.push({
        severity: 'error',
        rule: 'edge-source-unknown',
        path: `${prefix}[${i}].source`,
        message: `edge.source "${source}" does not match any node id. The edge will be silently dropped.`,
      });
    }

    if (typeof target !== 'string' || target.length === 0) {
      issues.push({
        severity: 'error',
        rule: 'edge-missing-target',
        path: `${prefix}[${i}].target`,
        message: 'edge.target is required and must be a node id string.',
      });
    } else if (!nodeIds.has(target)) {
      issues.push({
        severity: 'error',
        rule: 'edge-target-unknown',
        path: `${prefix}[${i}].target`,
        message: `edge.target "${target}" does not match any node id. The edge will be silently dropped.`,
      });
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
    } else if (value <= 0) {
      issues.push({
        severity: 'error',
        rule: 'edge-value-not-positive',
        path: `${prefix}[${i}].value`,
        message: `edge.value must be > 0 (got ${value}). Zero or negative values produce zero-width bands.`,
      });
    }

    if (typeof type !== 'string' || type.length === 0) {
      issues.push({
        severity: 'warning',
        rule: 'edge-missing-type',
        path: `${prefix}[${i}].type`,
        message:
          'edge.type is used as a grouping key in tooltips and styling. Provide a string so edges that belong together share a value.',
      });
    }

    if (typeof source === 'string' && source === target) {
      issues.push({
        severity: 'error',
        rule: 'self-loop',
        path: `${prefix}[${i}]`,
        message:
          `Self-loop edge "${source} → ${source}". ApexSankey is a layered DAG and cannot route self-loops.`,
      });
    }

    if (typeof source === 'string' && typeof target === 'string' && source !== target) {
      const list = graph.get(source) ?? [];
      list.push(target);
      graph.set(source, list);
    }
  });

  detectCycle(graph, prefix, issues);
}

function detectCycle(
  graph: Map<string, string[]>,
  prefix: string,
  issues: ValidationIssue[],
): void {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of graph.keys()) color.set(id, WHITE);

  const reported = new Set<string>();

  function dfs(node: string, path: string[]): void {
    color.set(node, GRAY);
    path.push(node);
    for (const next of graph.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const start = path.indexOf(next);
        const cycle = path.slice(start).concat(next).join(' → ');
        if (!reported.has(cycle)) {
          issues.push({
            severity: 'error',
            rule: 'cycle-detected',
            path: prefix,
            message: `Cycle detected: ${cycle}. ApexSankey is a layered DAG — cycles cause layout to fail or route oddly.`,
            fix: 'Break the cycle, or use a different visualization (e.g. apexcharts network/chord).',
          });
          reported.add(cycle);
        }
      } else if (c === WHITE) {
        color.set(next, WHITE);
        if (!graph.has(next)) color.set(next, BLACK);
        dfs(next, path);
      }
    }
    path.pop();
    color.set(node, BLACK);
  }

  for (const start of graph.keys()) {
    if (color.get(start) === WHITE) dfs(start, []);
  }
}
