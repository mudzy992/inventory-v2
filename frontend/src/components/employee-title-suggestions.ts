import type { Employee } from '../types';

const RECENT_LIMIT = 8;
const SEARCH_LIMIT = 12;

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

interface TitleEntry {
  title: string;
  normalized: string;
  count: number;
  lastUsedAt: number;
}

function getEmployeeUpdatedAt(employee: Employee): number {
  const updatedAt = (employee as Employee & { updatedAt?: string }).updatedAt;
  if (!updatedAt) {
    return 0;
  }
  const parsed = Date.parse(updatedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildTitleIndex(employees: readonly Employee[]): TitleEntry[] {
  const map = new Map<string, TitleEntry>();

  for (const employee of employees) {
    const title = employee.title?.trim();
    if (!title) {
      continue;
    }

    const normalized = normalizeTitle(title);
    const updatedAt = getEmployeeUpdatedAt(employee);
    const existing = map.get(normalized);

    if (!existing) {
      map.set(normalized, {
        title,
        normalized,
        count: 1,
        lastUsedAt: updatedAt,
      });
      continue;
    }

    existing.count += 1;
    if (updatedAt >= existing.lastUsedAt) {
      existing.lastUsedAt = updatedAt;
      existing.title = title;
    }
  }

  return [...map.values()];
}

export function getRecentEmployeeTitles(
  employees: readonly Employee[],
  limit = RECENT_LIMIT,
): string[] {
  return buildTitleIndex(employees)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt || b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((entry) => entry.title);
}

export function searchEmployeeTitles(
  employees: readonly Employee[],
  query: string,
  limit = SEARCH_LIMIT,
): string[] {
  const normalizedQuery = normalizeTitle(query);
  if (!normalizedQuery) {
    return getRecentEmployeeTitles(employees, limit);
  }

  const words = normalizedQuery.split(' ').filter(Boolean);

  return buildTitleIndex(employees)
    .filter((entry) => words.every((word) => entry.normalized.includes(word)))
    .sort((a, b) => {
      const aStarts = a.normalized.startsWith(normalizedQuery) ? 1 : 0;
      const bStarts = b.normalized.startsWith(normalizedQuery) ? 1 : 0;
      if (aStarts !== bStarts) {
        return bStarts - aStarts;
      }
      return b.count - a.count || a.title.localeCompare(b.title);
    })
    .slice(0, limit)
    .map((entry) => entry.title);
}

export function resolveCanonicalEmployeeTitle(
  employees: readonly Employee[],
  value: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const normalized = normalizeTitle(trimmed);
  const match = buildTitleIndex(employees).find((entry) => entry.normalized === normalized);
  return match?.title ?? trimmed;
}
