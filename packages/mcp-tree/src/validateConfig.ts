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

// 'radial' is new in apextree 2.0 (root at the centre, one ring per depth).
const VALID_DIRECTIONS = new Set(['top', 'bottom', 'left', 'right', 'radial']);
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
 * Encodes the rules from apextree-skill SKILL.md, as checked against the
 * apextree 2.1.1 runtime: a node's `children` may be omitted (the library
 * reads it as `[]`), and `options` / `data` are also per-node fields, so a
 * bare root is recognised by its `id`.
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

  // `options` (style overrides) and `data` (an org-card payload) are per-node
  // fields too, so their presence alone does not mean the wrapper: a node has
  // an `id`, the wrapper does not.
  const wrapped = !('id' in config) && ('data' in config || 'options' in config);
  const data = wrapped ? config.data : config;
  const options = wrapped && isObject(config.options) ? config.options : {};

  checkOptions(options, wrapped ? 'options' : '', issues);

  if (wrapped && data === undefined) {
    issues.push({
      severity: 'error',
      rule: 'missing-data',
      path: 'data',
      message: 'data is required: it holds the root NestedNode.',
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
        message: `direction must be one of top/bottom/left/right/radial. Got ${JSON.stringify(options.direction)}.`,
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
    if (typeof options.theme !== 'string' || options.theme.length === 0) {
      issues.push({
        severity: 'error',
        rule: 'invalid-theme',
        path: px('theme'),
        message: `theme must be a non-empty string. Got ${JSON.stringify(options.theme)}.`,
      });
    } else if (!VALID_THEMES.has(options.theme)) {
      // Since apextree 2.1 any other string names a theme on the registry the
      // Apex family shares (globalThis.__apexcharts_themes__). apextree exports
      // no registerTheme of its own; ApexCharts.registerTheme writes there.
      issues.push({
        severity: 'warning',
        rule: 'unregistered-theme-name',
        path: px('theme'),
        message:
          `theme "${options.theme}" is not a built-in (light/dark/custom). Since apextree 2.1 it names a theme ` +
          'on the registry the Apex family shares; if nothing registered it, the tree falls back to the default palette.',
        fix: `Use light/dark/custom, or register it first with ApexCharts.registerTheme('${options.theme}', { tokens: { ... } }).`,
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

  // The label under the default contentKey 'name'. The default template prints
  // String(value), so a number is fine; a missing name renders a blank card.
  // With contentKey 'data' or custom, name may legitimately be absent.
  const label = node.name;
  if (contentKey === 'name' && !(typeof label === 'number' || (typeof label === 'string' && label.length > 0))) {
    issues.push({
      severity: 'warning',
      rule: 'node-missing-name',
      path: `${here}.name`,
      message: 'This node has no name, which is the label under the default contentKey "name", so its card renders blank.',
      fix: 'Add `name`, or set contentKey to the field that holds the label.',
    });
  }

  if (contentKey === 'data' && node.data === undefined) {
    issues.push({
      severity: 'warning',
      rule: 'contentKey-data-without-payload',
      path: `${here}.data`,
      message:
        'contentKey is "data" (org-card mode) but this node has no `data` payload, so the card renders empty.',
      fix: 'Either populate `node.data: { name, title, subtitle, imageURL, ... }` or change contentKey.',
    });
  }

  // A leaf may omit children (or set it to null): the library reads it as [].
  // A lazy node (hasChildren: true) omits it on purpose.
  const children = node.children;
  if (children === undefined || children === null) return;

  if (!Array.isArray(children)) {
    issues.push({
      severity: 'error',
      rule: 'children-not-array',
      path: `${here}.children`,
      message: 'children must be an array of child nodes; any other value crashes the layout.',
      fix: 'Use `children: [...]`, or omit it for a leaf.',
    });
    return;
  }

  children.forEach((child, i) => {
    checkNode(child, `${here}.children[${i}]`, seenIds, contentKey, issues);
  });
}
