import { describe, expect, it } from 'vitest';

import { checkDesignSwitches } from '../src/designSwitches.js';

describe('checkDesignSwitches', () => {
  it('passes unset and boolean switches', () => {
    expect(checkDesignSwitches({}, 'theme')).toEqual([]);
    expect(checkDesignSwitches({ designSystem: false, tokens: true }, 'theme')).toEqual([]);
  });

  it('warns for a non-boolean switch, with the full path', () => {
    const [issue, ...rest] = checkDesignSwitches({ designSystem: 'false' }, 'theme');
    expect(rest).toEqual([]);
    expect(issue).toMatchObject({
      severity: 'warning',
      rule: 'design-switch-not-boolean',
      path: 'theme.designSystem',
    });
    expect(issue.message).toContain('"false"');
  });

  it('uses the bare key at the root and checks only the named switches', () => {
    const issues = checkDesignSwitches({ designSystem: 'no', tokens: 'no' }, '', ['tokens']);
    expect(issues.map((i) => i.path)).toEqual(['tokens']);
  });
});
