export interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
}

export const parseMonthDay = (value: string): { month: number; day: number } => {
  const match = /^(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid MM-DD date: ${value}`);
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid MM-DD date: ${value}`);
  }
  return { month, day };
};

export const getZonedCalendarParts = (date: Date, timeZone: string): CalendarDateParts => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((row) => row.type === 'year')?.value);
  const month = Number(parts.find((row) => row.type === 'month')?.value);
  const day = Number(parts.find((row) => row.type === 'day')?.value);
  return { year, month, day };
};

export const compareMonthDay = (
  left: { month: number; day: number },
  right: { month: number; day: number },
): number => {
  if (left.month !== right.month) {
    return left.month - right.month;
  }
  return left.day - right.day;
};

export const isOnOrAfterMonthDay = (
  current: { month: number; day: number },
  threshold: { month: number; day: number },
): boolean => compareMonthDay(current, threshold) >= 0;

export const isOnMonthDay = (
  current: { month: number; day: number },
  target: { month: number; day: number },
): boolean => current.month === target.month && current.day === target.day;
