import { describe, expect, it } from 'vitest';

import { createIssueList, finalizeIssues, type IssueLike, MAX_ISSUES_PER_RULE } from '../src/issues.js';

const issue = (rule: string, severity: IssueLike['severity'] = 'error', path = 'x'): IssueLike => ({
  severity,
  rule,
  path,
  message: `${rule} at ${path}`,
});

describe('createIssueList', () => {
  it('keeps the first issues of each rule and counts the rest', () => {
    const list = createIssueList<IssueLike>();
    for (let i = 0; i < 1000; i++) list.push(issue('row-not-object', 'error', `data[${i}]`));
    list.push(issue('other'));
    expect(list).toHaveLength(MAX_ISSUES_PER_RULE + 1);
    expect(list[0].path).toBe('data[0]');

    const result = finalizeIssues(list);
    const summary = result.issues.at(-1);
    expect(summary).toMatchObject({ severity: 'error', rule: 'row-not-object', path: '' });
    expect(summary?.message).toBe(
      `975 more "row-not-object" issues are not listed; only the first ${MAX_ISSUES_PER_RULE} are. Fix the pattern above and validate again.`,
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(MAX_ISSUES_PER_RULE + 2);
  });

  it('takes several issues in one push, as a spread does', () => {
    const list = createIssueList<IssueLike>(2);
    list.push(issue('a'), issue('a'), issue('a'), issue('b'));
    expect(list.map((i) => i.rule)).toEqual(['a', 'a', 'b']);
    expect(finalizeIssues(list).issues.at(-1)?.message).toMatch(/^1 more "a" issue is not listed; only the first 2 are/);
  });

  it('reports a left-out error as an error even when the listed ones are warnings', () => {
    const list = createIssueList<IssueLike>(1);
    list.push(issue('mixed', 'warning'), issue('mixed', 'warning'), issue('mixed', 'error'));
    const result = finalizeIssues(list);
    expect(result.ok).toBe(false);
    expect(result.errors.map((i) => i.path)).toEqual(['']);
  });

  it('adds nothing when no rule reached the cap, and stays a plain array', () => {
    const list = createIssueList<IssueLike>();
    list.push(issue('a', 'warning'));
    expect(JSON.parse(JSON.stringify(list))).toEqual([issue('a', 'warning')]);
    expect(finalizeIssues(list)).toEqual({
      ok: true,
      errors: [],
      warnings: [issue('a', 'warning')],
      issues: [issue('a', 'warning')],
    });
  });
});
