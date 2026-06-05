import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPublicSettingsApi } from '../../api/public-settings-api';
import { fetchPrivateSettingsApi, patchSettingApi, type SettingDto } from '../../api/settings-api';
import {
  SETTINGS_UI_GROUP_LABELS,
  SETTINGS_UI_GROUP_ORDER,
  type SettingUiGroup,
} from '../../constants/settings-ui-groups';
import {
  SETTINGS_TAB_META,
  SETTINGS_TAB_ORDER,
  getSettingsTabForGroup,
  type SettingsTabId,
} from '../../constants/settings-ui-tabs';
import { useAdminSettings } from '../../contexts/admin-settings-context';
import { usePublicSettings } from '../../contexts/public-settings-context';
import { useToast } from '../../contexts/toast-context';
import { cardClass } from '../ui/form-styles';
import { PageHeader } from '../ui/page-header';
import { PageTabs } from '../ui/page-tabs';
import { SettingFieldRow } from './setting-field-row';

export const SettingsPage = () => {
  const { refresh: refreshPublic, patchLocal } = usePublicSettings();
  const { refresh: refreshAdmin } = useAdminSettings();
  const { toastSuccess, toastError } = useToast();
  const [rows, setRows] = useState<SettingDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    try {
      const [publicRows, privateRows] = await Promise.all([
        fetchPublicSettingsApi() as Promise<SettingDto[]>,
        fetchPrivateSettingsApi(),
      ]);
      const merged = [...publicRows, ...privateRows].filter((row) => row.adminEditable);
      setRows(merged);
    } catch {
      setRows([]);
      toastError('Greška pri učitavanju postavki');
    } finally {
      setIsLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const tabbedContent = useMemo(() => {
    const byTab = new Map<SettingsTabId, Map<SettingUiGroup, SettingDto[]>>();
    for (const row of rows) {
      const group = (SETTINGS_UI_GROUP_ORDER.includes(row.group as SettingUiGroup)
        ? row.group
        : 'modules') as SettingUiGroup;
      const tab = getSettingsTabForGroup(group);
      const tabMap = byTab.get(tab) ?? new Map<SettingUiGroup, SettingDto[]>();
      const list = tabMap.get(group) ?? [];
      list.push(row);
      tabMap.set(group, list);
      byTab.set(tab, tabMap);
    }
    return SETTINGS_TAB_ORDER.map((tabId) => {
      const groupMap = byTab.get(tabId);
      const sections = SETTINGS_UI_GROUP_ORDER.filter((g) => groupMap?.has(g)).map((g) => ({
        group: g,
        label: SETTINGS_UI_GROUP_LABELS[g],
        items: groupMap?.get(g) ?? [],
      }));
      return { tabId, sections };
    }).filter((entry) => entry.sections.length > 0);
  }, [rows]);

  const visibleTabs = useMemo(
    () =>
      SETTINGS_TAB_ORDER.filter((tabId) =>
        tabbedContent.some((entry) => entry.tabId === tabId),
      ).map((tabId) => ({
        id: tabId,
        label: SETTINGS_TAB_META[tabId].label,
        icon: SETTINGS_TAB_META[tabId].icon,
      })),
    [tabbedContent],
  );

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id ?? 'general');
    }
  }, [visibleTabs, activeTab]);

  const activeSections = useMemo(
    () => tabbedContent.find((entry) => entry.tabId === activeTab)?.sections ?? [],
    [tabbedContent, activeTab],
  );

  const activeTabMeta = SETTINGS_TAB_META[activeTab];

  const handleChange = async (row: SettingDto, value: string | number | boolean) => {
    const previous = row.value;
    setRows((prev) =>
      prev.map((item) => (item.key === row.key ? { ...item, value } : item)),
    );
    setSavingKey(row.key);
    try {
      await patchSettingApi(row.key, value);
      if (row.scope === 'public' || row.key.startsWith('features.')) {
        patchLocal(row.key, value);
      }
      toastSuccess('Postavka sačuvana');
      await Promise.all([refreshPublic(), refreshAdmin()]);
    } catch {
      setRows((prev) =>
        prev.map((item) => (item.key === row.key ? { ...item, value: previous } : item)),
      );
      toastError('Greška pri čuvanju postavke');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Postavke"
        description="Modularna konfiguracija aplikacije. Isključen modul sakriva meni i blokira API promjene."
      />
      {isLoading ? (
        <p className="text-sm text-gray-500">Učitavanje...</p>
      ) : (
        <>
          <PageTabs tabs={visibleTabs} activeTab={activeTab} onChange={setActiveTab} />
          <p className="text-sm text-gray-500">{activeTabMeta.description}</p>
          {activeTab === 'transfers' ? (
            <div className={`${cardClass} border-gray-100 px-4 py-3 text-sm text-gray-600 space-y-2`}>
              <p className="font-medium text-gray-800">Word obrazac prenosnice</p>
              <p>
                Upload .docx obrazca po skladištu (tab Kontekst na skladištu). U dokumentu koristite:
              </p>
              <p className="font-mono text-xs text-gray-700">
                {'{broj_prenosnice}'} {'{predao}'} {'{preuzeo}'} {'{potpisnik}'} {'{inv_broj}'}{' '}
                {'{naziv_opreme}'} {'{obrazlozenje}'}
              </p>
            </div>
          ) : null}
          <div className="space-y-4">
            {activeSections.map((section) => (
              <section key={section.group} className={`${cardClass} border-gray-100`}>
                <div className="px-4 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-800">{section.label}</h2>
                </div>
                <div className="px-4">
                  {section.items.map((row) => (
                    <SettingFieldRow
                      key={row.key}
                      row={row}
                      disabled={savingKey === row.key}
                      onChange={(value) => void handleChange(row, value)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
