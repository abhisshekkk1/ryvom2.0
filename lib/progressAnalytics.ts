import { CheckIn, MetricSummary, PeriodComparisonData, PerformanceLog, PerformanceWithLogs, ClientWithCheckIn } from "./types";

/**
 * Format number safely, returning "-" if null/undefined/NaN/Infinite.
 */
export function formatNum(
  val: number | null | undefined,
  decimals: number = 1,
  prefix: string = "",
  suffix: string = ""
): string {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) {
    return "-";
  }
  const formatted = val.toFixed(decimals);
  // Strip trailing zeros if decimals > 0 and ends in .0
  const clean = decimals === 1 && formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted;
  return `${prefix}${clean}${suffix}`;
}

/**
 * Format signed difference with + or - symbol.
 */
export function formatDiff(
  val: number | null | undefined,
  decimals: number = 1,
  unit: string = ""
): string {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) {
    return "-";
  }
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(decimals)}${unit ? " " + unit : ""}`;
}

/**
 * Sort check-ins chronologically (oldest to newest).
 */
export function sortCheckInsChronologically(checkIns: CheckIn[]): CheckIn[] {
  return [...checkIns].sort(
    (a, b) => new Date(a.week_ending).getTime() - new Date(b.week_ending).getTime()
  );
}

/**
 * Filter check-ins based on date range preset or custom dates.
 */
export function filterCheckInsByRange(
  checkIns: CheckIn[],
  preset: "4w" | "8w" | "12w" | "6m" | "1y" | "all" | "custom",
  customStart?: string,
  customEnd?: string
): CheckIn[] {
  const sorted = sortCheckInsChronologically(checkIns);
  if (sorted.length === 0) return [];
  if (preset === "all") return sorted;

  if (preset === "custom") {
    if (!customStart && !customEnd) return sorted;
    const startMs = customStart ? new Date(customStart).getTime() : 0;
    const endMs = customEnd ? new Date(customEnd).getTime() + 86400000 : Infinity;
    return sorted.filter((c) => {
      const ms = new Date(c.week_ending).getTime();
      return ms >= startMs && ms <= endMs;
    });
  }

  // Calculate cutoff based on weeks/months from latest check-in or now
  const anchorDate = new Date();
  let daysBack = 28;
  switch (preset) {
    case "4w":
      daysBack = 28;
      break;
    case "8w":
      daysBack = 56;
      break;
    case "12w":
      daysBack = 84;
      break;
    case "6m":
      daysBack = 182;
      break;
    case "1y":
      daysBack = 365;
      break;
  }

  const cutoffMs = anchorDate.getTime() - daysBack * 86400000;
  const filtered = sorted.filter((c) => new Date(c.week_ending).getTime() >= cutoffMs);
  return filtered.length > 0 ? filtered : sorted.slice(-Math.min(sorted.length, daysBack / 7));
}

/**
 * Safely compute summary stats for any numeric field across check-ins.
 * Ignores null/undefined/missing values.
 */
export function computeMetricSummary(
  checkIns: CheckIn[],
  field: keyof CheckIn
): MetricSummary {
  const values: { date: string; val: number }[] = [];

  for (const c of checkIns) {
    const v = c[field];
    if (typeof v === "number" && !isNaN(v) && isFinite(v)) {
      values.push({ date: c.week_ending, val: v });
    }
  }

  if (values.length === 0) {
    return {
      first: null,
      latest: null,
      highest: null,
      lowest: null,
      average: null,
      absoluteChange: null,
      percentageChange: null,
      count: 0,
    };
  }

  const first = values[0].val;
  const latest = values[values.length - 1].val;
  const nums = values.map((v) => v.val);
  const highest = Math.max(...nums);
  const lowest = Math.min(...nums);
  const sum = nums.reduce((acc, curr) => acc + curr, 0);
  const average = sum / values.length;
  const absoluteChange = latest - first;
  const percentageChange = first !== 0 ? ((latest - first) / Math.abs(first)) * 100 : null;

  return {
    first,
    latest,
    highest,
    lowest,
    average,
    absoluteChange,
    percentageChange,
    count: values.length,
  };
}

/**
 * Period comparison (e.g., Current 4 weeks vs Previous 4 weeks).
 */
export function computePeriodComparison(
  allCheckIns: CheckIn[],
  preset: "4w" | "8w" | "12w" | "6m" | "1y" | "all" | "custom"
): PeriodComparisonData {
  const sorted = sortCheckInsChronologically(allCheckIns);
  let days = 28;
  let label = "4 Weeks";

  if (preset === "8w") {
    days = 56;
    label = "8 Weeks";
  } else if (preset === "12w") {
    days = 84;
    label = "12 Weeks";
  } else if (preset === "6m") {
    days = 182;
    label = "6 Months";
  } else if (preset === "1y") {
    days = 365;
    label = "1 Year";
  }

  const now = new Date().getTime();
  const currentStart = now - days * 86400000;
  const previousStart = now - days * 2 * 86400000;

  const currentCheckIns = sorted.filter((c) => {
    const ms = new Date(c.week_ending).getTime();
    return ms >= currentStart;
  });

  const previousCheckIns = sorted.filter((c) => {
    const ms = new Date(c.week_ending).getTime();
    return ms >= previousStart && ms < currentStart;
  });

  const fields: { key: keyof CheckIn; label: string; unit: string; decimals: number }[] = [
    { key: "weight", label: "Average Weight", unit: "kg", decimals: 1 },
    { key: "waist_cm", label: "Waist", unit: "cm", decimals: 1 },
    { key: "diet_adherence", label: "Diet Adherence", unit: "%", decimals: 0 },
    { key: "training_adherence", label: "Training Adherence", unit: "%", decimals: 0 },
    { key: "average_steps", label: "Steps", unit: "steps", decimals: 0 },
    { key: "sleep_hours", label: "Sleep", unit: "h", decimals: 1 },
    { key: "hunger", label: "Hunger (1-10)", unit: "/10", decimals: 1 },
    { key: "energy", label: "Energy (1-10)", unit: "/10", decimals: 1 },
    { key: "stress", label: "Stress (1-10)", unit: "/10", decimals: 1 },
  ];

  const metrics = fields.map(({ key, label, unit }) => {
    const curSummary = computeMetricSummary(currentCheckIns, key);
    const prevSummary = computeMetricSummary(previousCheckIns, key);

    const curVal = curSummary.average;
    const prevVal = prevSummary.average;

    const diff = curVal !== null && prevVal !== null ? curVal - prevVal : null;
    const pctDiff =
      curVal !== null && prevVal !== null && prevVal !== 0
        ? ((curVal - prevVal) / Math.abs(prevVal)) * 100
        : null;

    return {
      label,
      unit,
      currentValue: curVal,
      previousValue: prevVal,
      difference: diff,
      percentageDifference: pctDiff,
    };
  });

  return {
    currentPeriodLabel: `Current ${label}`,
    previousPeriodLabel: `Previous ${label}`,
    metrics,
  };
}

/**
 * Compute performance metrics with PR / best value calculations.
 */
export function computePerformancePRs(
  metric: PerformanceWithLogs
): PerformanceWithLogs {
  const sortedLogs = [...metric.logs].sort(
    (a, b) => new Date(a.logged_date).getTime() - new Date(b.logged_date).getTime()
  );

  if (sortedLogs.length === 0) {
    return {
      ...metric,
      logs: sortedLogs,
      starting_value: null,
      current_value: null,
      best_value: null,
      absolute_change: null,
      percentage_change: null,
    };
  }

  const starting = sortedLogs[0].value;
  const current = sortedLogs[sortedLogs.length - 1].value;
  const values = sortedLogs.map((l) => l.value);

  // Best value: For time-based metrics (pace/time), lowest might be better,
  // but let's default to max for strength/weight/reps/distance and allow coach context.
  const best = metric.metric_type === "time" ? Math.min(...values) : Math.max(...values);
  const diff = current - starting;
  const pct = starting !== 0 ? ((current - starting) / Math.abs(starting)) * 100 : null;

  return {
    ...metric,
    logs: sortedLogs,
    starting_value: starting,
    current_value: current,
    best_value: best,
    absolute_change: diff,
    percentage_change: pct,
  };
}

/**
 * Check clients needing attention based on heuristic rules:
 * - Overdue check-in (> 7 days since last check-in)
 * - Significant weight change (> 2kg in a week)
 * - Significant drop in training adherence (< 70% or > 20% drop from prev week)
 * - Significant drop in diet adherence (< 70% or > 20% drop from prev week)
 * - Low sleep or high stress (< 5h sleep or >= 8 stress)
 */
export function evaluateClientAttention(
  client: ClientWithCheckIn,
  allCheckInsForClient: CheckIn[]
): string[] {
  const flags: string[] = [];
  const sorted = sortCheckInsChronologically(allCheckInsForClient);

  if (sorted.length === 0) {
    flags.push("No check-ins submitted yet");
    return flags;
  }

  const latest = sorted[sorted.length - 1];
  const daysSinceLatest = Math.floor(
    (Date.now() - new Date(latest.week_ending).getTime()) / 86400000
  );

  if (daysSinceLatest > 9) {
    flags.push(`Check-in overdue (${daysSinceLatest}d ago)`);
  }

  if (latest.status === "pending") {
    flags.push("Check-in awaiting coach review");
  }

  if (sorted.length >= 2) {
    const prev = sorted[sorted.length - 2];

    // Weight shift
    if (latest.weight !== null && prev.weight !== null) {
      const wDiff = Math.abs(latest.weight - prev.weight);
      if (wDiff >= 2.0) {
        flags.push(`Significant weight change: ${(latest.weight - prev.weight) > 0 ? "+" : ""}${(latest.weight - prev.weight).toFixed(1)}kg`);
      }
    }

    // Adherence drop
    if (latest.diet_adherence !== null && prev.diet_adherence !== null) {
      if (prev.diet_adherence - latest.diet_adherence >= 20 || latest.diet_adherence < 65) {
        flags.push(`Diet adherence dropped to ${latest.diet_adherence}%`);
      }
    }

    if (latest.training_adherence !== null && prev.training_adherence !== null) {
      if (prev.training_adherence - latest.training_adherence >= 20 || latest.training_adherence < 65) {
        flags.push(`Training adherence dropped to ${latest.training_adherence}%`);
      }
    }
  } else {
    // Single check-in checks
    if (latest.diet_adherence !== null && latest.diet_adherence < 65) {
      flags.push(`Low diet adherence (${latest.diet_adherence}%)`);
    }
    if (latest.training_adherence !== null && latest.training_adherence < 65) {
      flags.push(`Low training adherence (${latest.training_adherence}%)`);
    }
  }

  // Recovery checks
  if (latest.sleep_hours !== null && latest.sleep_hours < 5.5) {
    flags.push(`Low sleep recorded (${latest.sleep_hours}h)`);
  }
  if (latest.stress !== null && latest.stress >= 8) {
    flags.push(`High stress recorded (${latest.stress}/10)`);
  }

  return flags;
}
