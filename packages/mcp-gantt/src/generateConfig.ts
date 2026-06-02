/**
 * Input shape for apexgantt_generate_config.
 */
export interface GenerateGanttConfigInput {
  /** Task array (`series`). If omitted, a placeholder phase + tasks + milestone is generated. */
  tasks?: unknown;
  /** Optional chart title. */
  title?: string;
  /** Chart height in px (default 600). */
  height?: number;
  /**
   * dayjs format used to parse every `startTime` / `endTime` / `baseline.start|end` string.
   * Default is ApexGantt's own default: `'MM-DD-YYYY'`.
   */
  inputDateFormat?: string;
  /** Highlight the critical path on render. */
  enableCriticalPath?: boolean;
  /** Render a planned-vs-actual baseline track when tasks supply a `baseline`. */
  baseline?: boolean | { color?: string };
  /** Enable selection APIs (`enableSelection: true`). */
  enableSelection?: boolean;
}

/**
 * Build a minimal valid ApexGantt options object.
 *
 * When `tasks` is not supplied, a small placeholder schedule is generated that
 * exercises hierarchy (`parentId`), a dependency, and a milestone — so the
 * returned config renders something visibly useful as-is.
 */
export function generateGanttConfig(
  input: GenerateGanttConfigInput,
): Record<string, unknown> {
  const height = input.height ?? 600;
  const inputDateFormat = input.inputDateFormat ?? 'MM-DD-YYYY';

  const config: Record<string, unknown> = {
    chart: { height },
    inputDateFormat,
    series: input.tasks ?? defaultTasks(inputDateFormat),
  };

  if (input.title) {
    config.title = { text: input.title };
  }

  if (input.enableCriticalPath) {
    config.enableCriticalPath = true;
  }

  if (input.enableSelection) {
    config.enableSelection = true;
  }

  if (input.baseline) {
    config.baseline =
      input.baseline === true ? { enabled: true } : { enabled: true, ...input.baseline };
  }

  return config;
}

function defaultTasks(format: string): unknown[] {
  // Build dates in whatever inputDateFormat the user picked so the placeholder
  // parses immediately. Use the same calendar dates either way (early 2026).
  const d = (mm: string, dd: string, yyyy: string) =>
    format === 'YYYY-MM-DD'
      ? `${yyyy}-${mm}-${dd}`
      : format === 'DD/MM/YYYY'
        ? `${dd}/${mm}/${yyyy}`
        : `${mm}-${dd}-${yyyy}`;

  return [
    {
      id: 'phase1',
      name: 'Phase 1 — Design',
      startTime: d('01', '01', '2026'),
      endTime: d('01', '31', '2026'),
    },
    {
      id: 't1.1',
      name: 'Research',
      parentId: 'phase1',
      startTime: d('01', '01', '2026'),
      endTime: d('01', '15', '2026'),
      progress: 100,
    },
    {
      id: 't1.2',
      name: 'Prototype',
      parentId: 'phase1',
      startTime: d('01', '16', '2026'),
      endTime: d('01', '31', '2026'),
      progress: 60,
      dependency: 't1.1',
    },
    {
      id: 'phase2',
      name: 'Phase 2 — Build',
      startTime: d('02', '01', '2026'),
      endTime: d('03', '15', '2026'),
    },
    {
      id: 't2.1',
      name: 'Backend',
      parentId: 'phase2',
      startTime: d('02', '01', '2026'),
      endTime: d('02', '28', '2026'),
      progress: 20,
      dependency: 't1.2',
    },
    {
      id: 'launch',
      name: 'Launch',
      startTime: d('03', '15', '2026'),
      type: 'milestone',
    },
  ];
}
