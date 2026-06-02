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

const VALID_DIRECTIONS = new Set(['top', 'bottom', 'left', 'right']);
const VALID_EDGE_STYLES = new Set(['orthogonal', 'curved', 'straight']);
const VALID_EDGE_COLOR_MODES = new Set(['default', 'node']);
const VALID_THEMES = new Set(['light', 'dark', 'custom']);

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate an ApexTree config. Accepts either the wrapped
 * `{ options, data }` shape from generateTreeConfig or a bare root NestedNode
 * (in which case `options` is treated as empty).
 *
 * Encodes the rules from apextree-skill SKILL.md §1 critical rules and §2
 * data format.
 */
export function validateTreeConfig(config: unknown): ValidationResult {
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

  const wrapped = isObject(config.options) || ('data' in config && 'options' in config);
  const data = wrapped ? config.data : config;
  const options = wrapped && isObject(config.options) ? config.options : {};

  checkOptions(options, wrapped ? 'options' : '', issues);

  if (wrapped && data === undefined) {
    issues.push({
      severity: 'error',
      rule: 'missing-data',
      path: 'data',
      message: 'data is required — it holds the root NestedNode.',
      fix: 'Add `data: { id, name, children: [] }`.',
    });
    return finalize(issues);
  }

  const seenIds = new Set<string>();
  const contentKey =
    typeof options.contentKey === 'string' ? (options.contentKey as string) : 'name';

  checkNode(data, wrapped ? 'data' : '', seenIds, contentKey, issues);

  return finalize(issues);
}

function finalize(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}

function checkOptions(options: AnyObj, basePath: string, issues: ValidationIssue[]): void {
  const px = (k: string) => (basePath ? `${basePath}.${k}` : k);

  if (options.direction !== undefined) {
    if (typeof options.direction !== 'string' || !VALID_DIRECTIONS.has(options.direction)) {
      issues.push({
        severity: 'error',
        rule: 'invalid-direction',
        path: px('direction'),
        message: `direction must be one of top/bottom/left/right. Got ${JSON.stringify(options.direction)}.`,
      });
    }
  }

  if (options.edgeStyle !== undefined) {
    if (typeof options.edgeStyle !== 'string' || !VALID_EDGE_STYLES.has(options.edgeStyle)) {
      issues.push({
        severity: 'error',
        rule: 'invalid-edgeStyle',
        path: px('edgeStyle'),
        message: `edgeStyle must be one of orthogonal/curved/straight. Got ${JSON.stringify(options.edgeStyle)}.`,
      });
    }
  }

  if (options.edgeColorMode !== undefined) {
    if (typeof options.edgeColorMode !== 'string' || !VALID_EDGE_COLOR_MODES.has(options.edgeColorMode)) {
      issues.push({
        severity: 'error',
        rule: 'invalid-edgeColorMode',
        path: px('edgeColorMode'),
        message: `edgeColorMode must be "default" or "node". Got ${JSON.stringify(options.edgeColorMode)}.`,
      });
    }
  }

  if (options.theme !== undefined) {
    if (typeof options.theme !== 'string' || !VALID_THEMES.has(options.theme)) {
      issues.push({
        severity: 'error',
        rule: 'invalid-theme',
        path: px('theme'),
        message: `theme must be one of light/dark/custom. Got ${JSON.stringify(options.theme)}.`,
      });
    }
  }

  if (options.enableSelection !== undefined) {
    const v = options.enableSelection;
    const ok = v === false || v === 'single' || v === 'multi';
    if (!ok) {
      issues.push({
        severity: 'error',
        rule: 'invalid-enableSelection',
        path: px('enableSelection'),
        message:
          `enableSelection must be "single", "multi", or false (not a boolean true). Got ${JSON.stringify(v)}.`,
        fix: 'Use enableSelection: "single" or "multi" to opt in; false to disable.',
      });
    }
  }
}

function checkNode(
  node: unknown,
  path: string,
  seenIds: Set<string>,
  contentKey: string,
  issues: ValidationIssue[],
): void {
  const here = path || '<root>';
  if (!isObject(node)) {
    issues.push({
      severity: 'error',
      rule: path ? 'node-not-object' : 'root-not-object',
      path: here,
      message: path ? 'Each node must be an object.' : 'Root data must be a NestedNode object.',
    });
    return;
  }

  if (typeof node.id !== 'string' || node.id.length === 0) {
    issues.push({
      severity: 'error',
      rule: 'node-missing-id',
      path: `${here}.id`,
      message: 'node.id is required and must be a non-empty string.',
    });
  } else if (seenIds.has(node.id)) {
    issues.push({
      severity: 'error',
      rule: 'duplicate-id',
      path: `${here}.id`,
      message: `Duplicate node id "${node.id}". ids must be unique across the entire tree (selection, search, and breadcrumb all key off id).`,
    });
  } else {
    seenIds.add(node.id);
  }

  if (typeof node.name !== 'string' || node.name.length === 0) {
    // Only required when the label-rendering contentKey is the default 'name'.
    // When contentKey is 'data' or custom, name may legitimately be absent.
    if (contentKey === 'name') {
      issues.push({
        severity: 'error',
        rule: 'node-missing-name',
        path: `${here}.name`,
        message: 'node.name is required when contentKey is "name" (the default).',
        fix: 'Either set contentKey to a different field and put the label there, or add `name`.',
      });
    }
  }

  if (contentKey === 'data' && node.data === undefined) {
    issues.push({
      severity: 'warning',
      rule: 'contentKey-data-without-payload',
      path: `${here}.data`,
      message:
        'contentKey is "data" (org-card mode) but this node has no `data` payload — the card will render empty.',
      fix: 'Either populate `node.data: { name, title, subtitle, imageURL, ... }` or change contentKey.',
    });
  }

  if (!('children' in node)) {
    issues.push({
      severity: 'error',
      rule: 'children-missing',
      path: `${here}.children`,
      message: 'children is required on every node — use `children: []` for leaves.',
    });
    return;
  }

  if (!Array.isArray(node.children)) {
    issues.push({
      severity: 'error',
      rule: 'children-not-array',
      path: `${here}.children`,
      message: 'children must be an array (empty array for leaves, not undefined).',
    });
    return;
  }

  node.children.forEach((child, i) => {
    checkNode(child, `${here}.children[${i}]`, seenIds, contentKey, issues);
  });
}
