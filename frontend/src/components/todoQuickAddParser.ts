import type { Priority } from '../types';

export interface QuickAddParseResult {
  title: string;
  startDate: string | null;
  priority: Priority | null;
  labels: string[];
}

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function formatDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function atStartOfDay(value: Date): Date {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function resolveNextWeek(referenceDate: Date): string {
  const date = atStartOfDay(referenceDate);
  const currentDay = date.getDay();
  const daysUntilNextMonday = ((8 - currentDay) % 7) || 7;
  return formatDateKey(addDays(date, daysUntilNextMonday));
}

function resolveWeekday(referenceDate: Date, weekday: number): string {
  const date = atStartOfDay(referenceDate);
  const delta = (weekday - date.getDay() + 7) % 7;
  return formatDateKey(addDays(date, delta));
}

function normalizePriority(token: string): Priority | null {
  const normalized = token.toLowerCase();
  if (normalized === 'p1' || normalized === 'high') return 'high';
  if (normalized === 'p2' || normalized === 'medium') return 'medium';
  if (normalized === 'p3' || normalized === 'low') return 'low';
  return null;
}

export function parseQuickAddInput(
  input: string,
  referenceDate: Date = new Date(),
): QuickAddParseResult {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const titleTokens: string[] = [];
  const labelSet = new Set<string>();
  let startDate: string | null = null;
  let priority: Priority | null = null;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const current = token.toLowerCase();
    const next = tokens[index + 1]?.toLowerCase();

    if (current === 'tomorrow' && startDate === null) {
      startDate = formatDateKey(addDays(atStartOfDay(referenceDate), 1));
      continue;
    }

    if (current === 'next' && next === 'week' && startDate === null) {
      startDate = resolveNextWeek(referenceDate);
      index += 1;
      continue;
    }

    if (current in WEEKDAY_INDEX && startDate === null) {
      startDate = resolveWeekday(referenceDate, WEEKDAY_INDEX[current]);
      continue;
    }

    const parsedPriority = normalizePriority(current);
    if (parsedPriority && priority === null) {
      priority = parsedPriority;
      continue;
    }

    if (current.startsWith('#') && current.length > 1) {
      const label = token.slice(1).replace(/[^\w-]+$/g, '');
      if (label) {
        labelSet.add(label);
        continue;
      }
    }

    titleTokens.push(tokens[index]);
  }

  return {
    title: titleTokens.join(' ').trim(),
    startDate,
    priority,
    labels: [...labelSet],
  };
}
