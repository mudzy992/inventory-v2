import { useEffect, useState } from 'react';
import type { SettingDto } from '../../api/settings-api';

export const isSettingDependencyMet = (
  row: SettingDto,
  valuesByKey: Map<string, SettingDto['value']>,
): boolean => {
  if (!row.dependsOn) {
    return true;
  }
  const parentValue = valuesByKey.get(row.dependsOn.key);
  if (row.dependsOn.equals === undefined) {
    return Boolean(parentValue);
  }
  return parentValue === row.dependsOn.equals;
};

export const useDebouncedSettingValue = (
  value: string | number | boolean,
  onCommit: (value: string | number | boolean) => void,
): {
  draft: string | number | boolean;
  setDraft: (next: string | number | boolean) => void;
  commitDraft: () => void;
} => {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const commitDraft = () => {
    if (draft !== value) {
      onCommit(draft);
    }
  };
  return { draft, setDraft, commitDraft };
};
