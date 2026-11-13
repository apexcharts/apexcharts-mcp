/**
 * Bounded issue lists for the `*_validate_config` tools.
 *
 * A validator reports one issue per bad row, task, node or point, so a config
 * with half a million bad rows would otherwise report half a million issues:
 * measured on the grid validator, a 1 MB `data` array built 524,269 issues,
 * 73 MB of heap and a 112 MB response, on a hosted server with 256 MB. The
 * list keeps the first {@link MAX_ISSUES_PER_RULE} issues of each rule, counts
 * the rest, and {@link finalizeIssues} reports the count. The first few are
 * all a reader needs to fix the pattern, and `ok` is unchanged: a rule only
 * drops issues once it has listed some.
 */

/** Structurally the same as each product package's `ValidationIssue`. */
export interface IssueLike {
  severity: 'error' | 'warning';
  rule: string;
  path: string;
  message: string;
  fix?: string;
}

/** Issues of one rule listed before the rest are only counted. */
export const MAX_ISSUES_PER_RULE = 25;

type Omitted = Map<string, { severity: IssueLike['severity']; count: number }>;

/** Each list's cap, and how many issues each rule left out. */
const omittedByList = new WeakMap<object, { perRule: number; omitted: Omitted }>();

/**
 * An issue array whose `push` keeps at most `perRule` issues of each rule.
 *
 * @remarks
 * It is a plain array everywhere else, so validator helpers keep their
 * `issues: ValidationIssue[]` parameters and their `issues.push(...)` calls.
 * Pass it to {@link finalizeIssues} to report what was left out.
 */
export function createIssueList<T extends IssueLike>(perRule = MAX_ISSUES_PER_RULE): T[] {
  const list: T[] = [];
  const kept = new Map<string, number>();
  const omitted: Omitted = new Map();
  omittedByList.set(list, { perRule, omitted });
  Object.defineProperty(list, 'push', {
    value(...items: T[]): number {
      for (const issue of items) {
        const n = kept.get(issue.rule) ?? 0;
        if (n < perRule) {
          kept.set(issue.rule, n + 1);
          Array.prototype.push.call(list, issue);
          continue;
        }
        const left = omitted.get(issue.rule);
        if (left) {
          left.count++;
          if (issue.severity === 'error') left.severity = 'error';
        } else {
          omitted.set(issue.rule, { severity: issue.severity, count: 1 });
        }
      }
      return list.length;
    },
    enumerable: false,
  });
  return list;
}

/**
 * The validator result: errors, warnings and every listed issue, plus one
 * issue per rule that left some out, saying how many.
 */
export function finalizeIssues<T extends IssueLike>(
  list: T[],
): { ok: boolean; errors: T[]; warnings: T[]; issues: T[] } {
  const issues = [...list];
  const tracked = omittedByList.get(list);
  for (const [rule, { severity, count }] of tracked?.omitted ?? []) {
    issues.push({
      severity,
      rule,
      path: '',
      message: `${count} more "${rule}" ${count === 1 ? 'issue is' : 'issues are'} not listed; only the first ${tracked?.perRule} are. Fix the pattern above and validate again.`,
    } as T);
  }
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}
