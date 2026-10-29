import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Search } from 'lucide-react';
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
import { cardClass, inputClass } from '../ui/form-styles';
import { PageHeader } from '../ui/page-header';
import { PageTabs } from '../ui/page-tabs';
import { SettingFieldRow } from './setting-field-row';
import { isSettingDependencyMet } from './settings-field.util';

const isVisibleSettingRow = (row: SettingDto): boolean =>
  row.adminEditable || row.display === 'info' || row.display === 'deprecated';

export const SettingsPage = () => {
  const navigate = useNavigate();
  const { refresh: refreshPublic, patchLocal } = usePublicSettings();
  const { refresh: refreshAdmin } = useAdminSettings();
  const { toastSuccess, toastError } = useToast();
  const [rows, setRows] = useState<SettingDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [searchQuery, setSearchQuery] = useState('');

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    try {
      const [publicRows, privateRows] = await Promise.all([
        fetchPublicSettingsApi() as Promise<SettingDto[]>,
        fetchPrivateSettingsApi(),
      ]);
      const merged = [...publicRows, ...privateRows].filter(isVisibleSettingRow);
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

  const valuesByKey = useMemo(() => new Map(rows.map((row) => [row.key, row.value])), [rows]);

  const tabbedContent = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const byTab = new Map<SettingsTabId, Map<SettingUiGroup, SettingDto[]>>();
    for (const row of rows) {
      if (normalizedSearch) {
        const haystack = `${row.label} ${row.description} ${row.detail ?? ''} ${row.key}`.toLowerCase();
        if (!haystack.includes(normalizedSearch)) {
          continue;
        }
      }
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
  }, [rows, searchQuery]);

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
        description="Modularna konfiguracija aplikacije. Zavisne opcije se automatski onemogućavaju dok nadređena postavka nije uključena."
      />
      <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3 border-gray-100 px-4 py-3`}>
        <div className="text-sm text-gray-600">
          <p className="font-medium text-gray-800">E-pošta (SMTP)</p>
          <p>SMTP server (Gmail, Microsoft 365 ili custom), email template-i i dnevnik slanja.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/settings/email')}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-700"
        >
          <Mail size={14} /> Otvori postavke e-pošte
        </button>
      </div>
      {isLoading ? (
        <p className="text-sm text-gray-500">Učitavanje...</p>
      ) : (
        <>
          <PageTabs tabs={visibleTabs} activeTab={activeTab} onChange={setActiveTab} />
          <div className="space-y-3">
            <p className="text-sm text-gray-600">{activeTabMeta.description}</p>
            <div className="relative max-w-md">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Pretraži postavke u ovom tabu…"
                className={`${inputClass} pl-9`}
                aria-label="Pretraži postavke"
              />
            </div>
          </div>
          {activeTab === 'transfers' ? (
            <div className={`${cardClass} border-gray-100 px-4 py-3 text-sm text-gray-600 space-y-2`}>
              <p className="font-medium text-gray-800">Word obrazac prenosnice</p>
              <p>
                Upload .docx obrazca po skladištu (tab Kontekst na skladištu). U dokumentu koristite placeholder-e
                iz sekcije „Placeholderi u Word šablonu” ispod.
              </p>
            </div>
          ) : null}
          <div className="space-y-4">
            {activeSections.length === 0 ? (
              <p className="text-sm text-gray-500">Nema postavki za prikaz.</p>
            ) : (
              activeSections.map((section) => (
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
                        dependencyDisabled={!isSettingDependencyMet(row, valuesByKey)}
                        onChange={(value) => void handleChange(row, value)}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
