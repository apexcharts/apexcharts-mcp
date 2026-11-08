/**
 * The design-system switches the Apex family reads: `tokens` (CSS custom
 * property theming) and `designSystem` (a design system's stylesheet on the
 * page, read only while that product's Ignite UI add-on is loaded). The
 * option-object products turn a switch off only for the boolean `false`
 * (`!== false`); ApexGrid's properties turn off for any falsy value. Either
 * way a string such as "false" leaves the switch on.
 */
export const DESIGN_SWITCHES = ['designSystem', 'tokens'] as const;

export type DesignSwitch = (typeof DESIGN_SWITCHES)[number];

/** Structurally the same as each product package's `ValidationIssue`. */
export interface DesignSwitchIssue {
  severity: 'warning';
  rule: 'design-switch-not-boolean';
  path: string;
  message: string;
  fix: string;
}

/**
 * Warn for each switch on `owner` that is set to anything but a boolean.
 *
 * @param owner The object holding the switches (a `theme` object, or the
 *   top-level options for tree, sankey, gantt and grid).
 * @param basePath Path of `owner` in the config, '' for the root.
 * @param switches Which switches this product reads (default both).
 */
export function checkDesignSwitches(
  owner: Record<string, unknown>,
  basePath: string,
  switches: readonly DesignSwitch[] = DESIGN_SWITCHES,
): DesignSwitchIssue[] {
  const issues: DesignSwitchIssue[] = [];
  for (const key of switches) {
    const value = owner[key];
    if (value === undefined || typeof value === 'boolean') continue;
    const path = basePath ? `${basePath}.${key}` : key;
    issues.push({
      severity: 'warning',
      rule: 'design-switch-not-boolean',
      path,
      message:
        `${path} is ${JSON.stringify(value) ?? String(value)}, not a boolean. ` +
        'Use the boolean false to turn this switch off; a string such as "false" leaves it on.',
      fix: `Set ${path} to true or false (a boolean, not a string), or remove it to keep the default (on).`,
    });
  }
  return issues;
}
