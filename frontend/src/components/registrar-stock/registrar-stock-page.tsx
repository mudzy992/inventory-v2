import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Package, ChevronRight, ChevronDown, Search, Filter, Eye } from 'lucide-react';
import {
  fetchAssignedStockLotGroupsPageApi,
  fetchAssignedStockLotsPageApi,
  fetchStockLotApi,
  issueStockLotUnitApi,
  updateStockLotSpecApi,
  type StockLotProductGroup,
} from '../../api/warehouse-stock-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { formatDate, getEmployeeFullName, getOrgUnitPath, getStatusLabel } from '../../helpers';
import {
  useInventoryNumberAvailability,
  type AvailabilityStatus,
} from '../../hooks/use-equipment-availability';
import { getStockLotListBadge } from '../../helpers/warehouse-stock.util';
import { fetchEmployeesPageApi } from '../../api/employees-api';
import { fetchAllPaginatedItems } from '../../api/fetch-all-paginated';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useStore, useRefreshData } from '../../useStore';
import { getCurrentUser, isAdmin } from '../../store';
import {
  getScopedParentCategories,
  getScopedSubCategories,
} from '../../helpers/registrar-scope';
import {
  buildParentCategoryStats,
  buildSubCategoryStats,
} from '../../helpers/category-browse-stats.util';
import { CategoryBrowseBreadcrumb } from '../shared/category-browse/category-browse-breadcrumb';
import { CategoryParentGrid } from '../shared/category-browse/category-parent-grid';
import { CategorySubGrid } from '../shared/category-browse/category-sub-grid';
import { useAdminSettings } from '../../contexts/admin-settings-context';
import { resolveEffectiveWarehouseForOrgUnit } from '../../helpers/org-warehouse.util';
import type { Category, Employee, WarehouseStockLot } from '../../types';
import { PageHeaderRow } from '../ui/page-header-row';
import { Button } from '../ui/button';
import { PaginationControls } from '../ui/pagination-controls';
import { cardClass, inputClass, labelClass } from '../ui/form-styles';
import { Badge } from '../ui/badge';
import { SearchableAutocomplete, type SearchableOption } from '../searchable-autocomplete';
import { AvailabilityHint } from './availability-hint';
import { IssueUniqueFieldInput } from './issue-unique-field-input';
import {
  InventoryFreezeActionHint,
  useInventoryFreezeActive,
} from '../inventory-count/inventory-freeze-action-hint';
import { EquipmentCard } from '../EquipmentCard';
import { pageIdToPath, registrarStockLotPath } from '../../routes/app-routes';
import { LotSpecificationSection } from './lot-specification-section';

const buildSpecFields = (category: Category | undefined, unique: boolean) => {
  if (!category) {
    return [];
  }
  return [...category.fields, ...category.optionalFields].filter((field) => field.unique === unique);
};

const LotSectionCard = ({
  title,
  description,
  children,
  footer,
  className = '',
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) => (
  <section className={`${cardClass} border-gray-200 shadow-sm overflow-hidden ${className}`}>
    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/80">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {description ? <p className="text-xs text-gray-500 mt-1">{description}</p> : null}
    </div>
    <div className="p-5">{children}</div>
    {footer ? <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50">{footer}</div> : null}
  </section>
);

type BrowseLevel = 'parents' | 'subcategories' | 'groups';

const isValueAvailabilityValid = (value: string, status: AvailabilityStatus): boolean => {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  return status === 'available';
};

export const RegistrarStockPage = () => {
  const navigate = useNavigate();
  const { lotId: routeLotId } = useParams<{ lotId?: string }>();
  const [state] = useStore();
  const refresh = useRefreshData();
  const admin = isAdmin();
  const { getBoolean } = useAdminSettings();
  const crossWarehouseIssueEnabled = admin && getBoolean('transfer.allow_admin_cross_warehouse_issue', false);
  const { toastError, toastSuccess } = useToast();
  const [scopedEmployees, setScopedEmployees] = useState<Employee[]>([]);
  const isFrozen = useInventoryFreezeActive();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WarehouseStockLot | null>(null);
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [issueOpen, setIssueOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [inventoryNumber, setInventoryNumber] = useState('');
  const [uniqueSpecs, setUniqueSpecs] = useState<Record<string, string>>({});
  const [uniqueAvailability, setUniqueAvailability] = useState<Record<string, AvailabilityStatus>>({});
  const [saving, setSaving] = useState(false);
  const [viewItemId, setViewItemId] = useState<string | null>(null);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());
  const [groupLots, setGroupLots] = useState<Record<string, WarehouseStockLot[]>>({});
  const [loadingGroupKeys, setLoadingGroupKeys] = useState<Set<string>>(new Set());
  const [filterWarehouseId, setFilterWarehouseId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [browseLevel, setBrowseLevel] = useState<BrowseLevel>('parents');
  const [parentId, setParentId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const [statsGroups, setStatsGroups] = useState<StockLotProductGroup[]>([]);
  const user = getCurrentUser();
  const inventoryAvailability = useInventoryNumberAvailability(inventoryNumber);
  const groupsEnabled = browseLevel === 'groups' && Boolean(subCategoryId);
  const groupList = usePaginatedList<
    StockLotProductGroup,
    { warehouseId?: string; categoryId?: string; status?: string }
  >({
    fetchPage: fetchAssignedStockLotGroupsPageApi,
    initialSortBy: 'productName',
    initialSortDir: 'asc',
    enabled: groupsEnabled,
  });
  const groups = groupList.items;
  const scopedParents = useMemo(
    () =>
      getScopedParentCategories(user, state.categories).filter(
        (row) => (row.categoryKind ?? 'ASSET') === 'ASSET',
      ),
    [user, state.categories],
  );
  const scopedSubs = useMemo(
    () =>
      parentId ? getScopedSubCategories(user, state.categories, parentId) : [],
    [parentId, user, state.categories],
  );
  const parentStats = useMemo(
    () => buildParentCategoryStats(statsGroups, state.categories, (group) => group.totalOnHand),
    [statsGroups, state.categories],
  );
  const subStats = useMemo(() => {
    if (!parentId) {
      return new Map();
    }
    return buildSubCategoryStats(
      statsGroups,
      state.categories,
      parentId,
      (group) => group.totalOnHand,
    );
  }, [parentId, statsGroups, state.categories]);
  const browseParent = parentId ? state.categories.find((row) => row.id === parentId) : null;
  const browseSubCategory = subCategoryId
    ? state.categories.find((row) => row.id === subCategoryId)
    : null;
  const loadStatsGroups = useCallback(async () => {
    try {
      const rows = await fetchAllPaginatedItems((params) =>
        fetchAssignedStockLotGroupsPageApi({
          ...params,
          warehouseId: filterWarehouseId || undefined,
          status: filterStatus || undefined,
        }),
      );
      setStatsGroups(rows);
    } catch {
      setStatsGroups([]);
    }
  }, [filterStatus, filterWarehouseId]);
  useEffect(() => {
    void loadStatsGroups();
  }, [loadStatsGroups]);
  useEffect(() => {
    if (!groupsEnabled || !subCategoryId) {
      return;
    }
    groupList.setFilters({
      warehouseId: filterWarehouseId || undefined,
      categoryId: subCategoryId,
      status: filterStatus || undefined,
    });
  }, [filterStatus, filterWarehouseId, groupList.setFilters, groupsEnabled, subCategoryId]);
  const handleFilterWarehouseChange = (value: string) => {
    setFilterWarehouseId(value);
    setBrowseLevel('parents');
    setParentId(null);
    setSubCategoryId(null);
    setExpandedGroupKeys(new Set());
  };
  const handleFilterStatusChange = (value: string) => {
    setFilterStatus(value);
    setBrowseLevel('parents');
    setParentId(null);
    setSubCategoryId(null);
    setExpandedGroupKeys(new Set());
  };
  const handleNavigateBrowseRoot = () => {
    setBrowseLevel('parents');
    setParentId(null);
    setSubCategoryId(null);
    setExpandedGroupKeys(new Set());
  };
  const handleNavigateBrowseParent = () => {
    setBrowseLevel('subcategories');
    setSubCategoryId(null);
    setExpandedGroupKeys(new Set());
  };
  useEffect(() => {
    void fetchAllPaginatedItems((params) => fetchEmployeesPageApi(params), 100)
      .then(setScopedEmployees)
      .catch(() => setScopedEmployees([]));
  }, []);
  const category = useMemo(
    () => (detail ? state.categories.find((row) => row.id === detail.categoryId) : undefined),
    [detail, state.categories],
  );
  const lotFields = useMemo(() => buildSpecFields(category, false), [category]);
  const issueFields = useMemo(() => buildSpecFields(category, true), [category]);
  const crossWarehouseIssueHint = useMemo(() => {
    if (!crossWarehouseIssueEnabled || !detail || !employeeId) {
      return null;
    }
    const employee = scopedEmployees.find((row) => row.id === employeeId);
    if (!employee) {
      return null;
    }
    const destWarehouseId = resolveEffectiveWarehouseForOrgUnit(
      state.orgUnits,
      state.warehouses,
      employee.orgUnitId,
    );
    if (!destWarehouseId || destWarehouseId === detail.warehouseId) {
      return null;
    }
    const destWarehouse = state.warehouses.find((row) => row.id === destWarehouseId);
    return destWarehouse?.name ?? 'ciljno skladište radnika';
  }, [
    crossWarehouseIssueEnabled,
    detail,
    employeeId,
    scopedEmployees,
    state.orgUnits,
    state.warehouses,
  ]);
  const employeeSearchOptions = useMemo((): SearchableOption[] => {
    return scopedEmployees.map((employee) => {
      const orgUnit = state.orgUnits.find((unit) => unit.id === employee.orgUnitId);
      const orgPath = orgUnit ? getOrgUnitPath(state.orgUnits, orgUnit.id) : '—';
      return {
        id: employee.id,
        label: getEmployeeFullName(employee),
        subLabel: `${employee.title || '—'} · ${orgPath}`,
        searchText: `${employee.email ?? ''} ${orgPath}`,
      };
    });
  }, [scopedEmployees, state.orgUnits]);
  const canSubmitIssue = useMemo(() => {
    if (!employeeId || !inventoryNumber.trim()) {
      return false;
    }
    if (!isValueAvailabilityValid(inventoryNumber, inventoryAvailability)) {
      return false;
    }
    for (const field of issueFields) {
      const value = uniqueSpecs[field.id] ?? '';
      if (field.required && !value.trim()) {
        return false;
      }
      if (!isValueAvailabilityValid(value, uniqueAvailability[field.id] ?? 'idle')) {
        return false;
      }
    }
    return true;
  }, [
    employeeId,
    inventoryAvailability,
    inventoryNumber,
    issueFields,
    uniqueAvailability,
    uniqueSpecs,
  ]);
  const handleUniqueAvailabilityChange = useCallback((fieldId: string, status: AvailabilityStatus) => {
    setUniqueAvailability((prev) => ({ ...prev, [fieldId]: status }));
  }, []);
  const loadGroupLots = useCallback(async (groupKey: string) => {
    setLoadingGroupKeys((prev) => new Set(prev).add(groupKey));
    try {
      const response = await fetchAssignedStockLotsPageApi({
        groupKey,
        page: 1,
        pageSize: 100,
        sortBy: 'status',
        sortDir: 'asc',
      });
      setGroupLots((prev) => ({ ...prev, [groupKey]: response.items }));
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri učitavanju lotova');
    } finally {
      setLoadingGroupKeys((prev) => {
        const next = new Set(prev);
        next.delete(groupKey);
        return next;
      });
    }
  }, [toastError]);
  const handleToggleGroup = useCallback((groupKey: string) => {
    setExpandedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
        return next;
      }
      next.add(groupKey);
      if (!groupLots[groupKey]) {
        void loadGroupLots(groupKey);
      }
      return next;
    });
  }, [groupLots, loadGroupLots]);
  const openIssueForm = () => {
    setIssueOpen(true);
    setUniqueAvailability({});
    setUniqueSpecs({});
    setInventoryNumber('');
    setEmployeeId('');
  };
  const loadLotDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    try {
      const row = await fetchStockLotApi(id);
      setDetail(row);
      setSpecs((row.specifications ?? {}) as Record<string, string>);
      setIssueOpen(false);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
      navigate(pageIdToPath('registrar-stock'), { replace: true });
      setSelectedId(null);
      setDetail(null);
    }
  }, [navigate, toastError]);
  useEffect(() => {
    if (!routeLotId) {
      setSelectedId(null);
      setDetail(null);
      return;
    }
    if (routeLotId !== selectedId || !detail) {
      void loadLotDetail(routeLotId);
    }
  }, [routeLotId, selectedId, detail, loadLotDetail]);
  const openDetail = (id: string) => {
    navigate(registrarStockLotPath(id));
  };
  const handleBackFromDetail = () => {
    navigate(pageIdToPath('registrar-stock'));
    setSelectedId(null);
    setDetail(null);
  };
  const handleSaveSpec = async () => {
    if (!detail) {
      return;
    }
    const wasInitialSpec = detail.status === 'ceka_specifikaciju';
    setSaving(true);
    try {
      const updated = await updateStockLotSpecApi(detail.id, specs);
      setDetail(updated);
      toastSuccess(wasInitialSpec ? 'Specifikacija lota je sačuvana' : 'Izmjene specifikacije su sačuvane');
      await groupList.refresh();
      await loadStatsGroups();
      setGroupLots({});
      setExpandedGroupKeys(new Set());
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    } finally {
      setSaving(false);
    }
  };
  const handleIssue = async () => {
    if (!detail || !employeeId || !inventoryNumber.trim()) {
      return;
    }
    setSaving(true);
    try {
      const updated = await issueStockLotUnitApi(detail.id, {
        employeeId,
        inventoryNumber: inventoryNumber.trim(),
        uniqueSpecifications: uniqueSpecs,
      });
      setDetail(updated);
      setIssueOpen(false);
      setInventoryNumber('');
      setUniqueSpecs({});
      setEmployeeId('');
      toastSuccess('Komad je izdat i zadužen');
      await groupList.refresh();
      await loadStatsGroups();
      setGroupLots({});
      setExpandedGroupKeys(new Set());
      await refresh();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri izdavanju');
    } finally {
      setSaving(false);
    }
  };
  if (selectedId && detail) {
    return (
      <div className="space-y-5">
        <section className={`${cardClass} border-gray-200 shadow-sm overflow-hidden`}>
          <div className="px-5 py-4 bg-gradient-to-r from-slate-50 via-white to-blue-50/40">
            <button
              type="button"
              onClick={handleBackFromDetail}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft size={16} />
              Nazad na listu
            </button>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{detail.productName}</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {detail.warehouseName ?? '—'} · {detail.categoryName ?? '—'}
                </p>
              </div>
              <Badge tone={getStockLotListBadge(detail.status, detail.quantityOnHand, detail.quantityReceived).tone}>
                {getStockLotListBadge(detail.status, detail.quantityOnHand, detail.quantityReceived).label}
              </Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full bg-white border border-gray-200 px-3 py-1 text-xs text-gray-600">
                Na skladištu: <span className="ml-1 font-semibold text-gray-900">{detail.quantityOnHand}/{detail.quantityReceived}</span>
              </span>
              {detail.contractNumber ? (
                <span className="inline-flex items-center rounded-full bg-white border border-gray-200 px-3 py-1 text-xs text-gray-600">
                  Ugovor: <span className="ml-1 font-medium text-gray-800">{detail.contractNumber}</span>
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <InventoryFreezeActionHint />

        <LotSpecificationSection
          status={detail.status}
          fields={lotFields}
          specs={specs}
          onSpecsChange={setSpecs}
          onSave={() => void handleSaveSpec()}
          saving={saving}
          isFrozen={isFrozen}
          hasIssuedUnits={Boolean(detail.issuedUnits && detail.issuedUnits.length > 0)}
        />

        {detail.status === 'spremno_za_izdavanje' && detail.quantityOnHand > 0 ? (
          !issueOpen ? (
            <div className="flex justify-start">
              <Button disabled={isFrozen} onClick={openIssueForm}>
                Izdaj 1 komad
              </Button>
            </div>
          ) : (
            <LotSectionCard
              title="Izdavanje komada"
              description="Dodijelite inventurni broj i unikatne podatke za jedan komad iz lota."
              footer={
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" onClick={() => setIssueOpen(false)}>
                    Odustani
                  </Button>
                  <Button disabled={saving || isFrozen || !canSubmitIssue} onClick={() => void handleIssue()}>
                    Potvrdi izdavanje
                  </Button>
                </div>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Radnik *</label>
                  <SearchableAutocomplete
                    options={employeeSearchOptions}
                    value={employeeId}
                    onChange={setEmployeeId}
                    emptyOption={{ id: '', label: '— Odaberi —' }}
                    placeholder="Pretraži radnika…"
                    ariaLabel="Radnik"
                    required
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Prikaz: ime · pozicija · org. putanja.
                  </p>
                  {crossWarehouseIssueHint ? (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Radnik pripada drugom efektivnom skladištu ({crossWarehouseIssueHint}). Oprema će
                      automatski preći na lot tog skladišta nakon izdavanja.
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className={labelClass}>Inventurni broj *</label>
                  <input
                    type="text"
                    value={inventoryNumber}
                    onChange={(event) => setInventoryNumber(event.target.value)}
                    className={inputClass}
                  />
                  <AvailabilityHint status={inventoryAvailability} />
                </div>
                {issueFields.map((field) => (
                  <IssueUniqueFieldInput
                    key={field.id}
                    categoryId={detail.categoryId}
                    field={field}
                    value={uniqueSpecs[field.id] ?? ''}
                    onChange={(next) => setUniqueSpecs({ ...uniqueSpecs, [field.id]: next })}
                    onAvailabilityChange={handleUniqueAvailabilityChange}
                  />
                ))}
              </div>
            </LotSectionCard>
          )
        ) : null}

        {detail.issuedUnits && detail.issuedUnits.length > 0 ? (
          <LotSectionCard title="Izdata oprema" description="Pregled komada izdatih iz ovog lota.">
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                    <th className="px-3 py-2 font-medium">Inv. broj</th>
                    <th className="px-3 py-2 font-medium">Zadužen na</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Datum</th>
                    <th className="px-3 py-2 font-medium text-right">Detalji</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.issuedUnits.map((unit) => {
                    const holder = unit.currentHolder;
                    const holderOrg = holder
                      ? state.orgUnits.find((row) => row.id === holder.orgUnitId)
                      : null;
                    return (
                      <tr key={unit.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/80">
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setViewItemId(unit.id)}
                            className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {unit.inventoryNumber}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">
                          {holder ? (
                            <div>
                              <span className="text-xs text-gray-800">{getEmployeeFullName(holder)}</span>
                              {holderOrg ? (
                                <p className="text-[10px] text-gray-400">{holderOrg.name}</p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">{getStatusLabel(unit.status as 'skladiste' | 'zaduzeno' | 'rashodovano')}</td>
                        <td className="px-3 py-2.5 text-gray-600">{formatDate(unit.createdAt)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setViewItemId(unit.id)}
                            className="inline-flex items-center justify-center p-1 text-gray-500 hover:text-blue-600"
                            title="Pogledaj opremu"
                            aria-label={`Pogledaj opremu ${unit.inventoryNumber}`}
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </LotSectionCard>
        ) : null}
        {viewItemId ? (
          <EquipmentCard equipmentId={viewItemId} onClose={() => setViewItemId(null)} />
        ) : null}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PageHeaderRow
        title="Skladišna roba"
        description="Definišite specifikaciju lotova i izdajte pojedinačne komade na radnike."
      />
      <InventoryFreezeActionHint />
      <div className={`${cardClass} border-gray-200 shadow-sm p-4 mb-4`}>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          {browseLevel === 'groups' ? (
            <div className="relative flex-1 min-w-0">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={groupList.search}
                onChange={(event) => groupList.setSearch(event.target.value)}
                placeholder="Pretraži po nazivu proizvoda…"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Filter size={14} className="text-gray-400 shrink-0" />
            <select
              value={filterWarehouseId}
              onChange={(event) => handleFilterWarehouseChange(event.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Sva skladišta</option>
              {state.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(event) => handleFilterStatusChange(event.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Svi statusi</option>
              <option value="ceka_specifikaciju">Čeka specifikaciju</option>
              <option value="spremno_za_izdavanje">Spremno za izdavanje</option>
            </select>
          </div>
        </div>
      </div>
      <CategoryBrowseBreadcrumb
        parent={browseParent}
        subCategory={browseSubCategory}
        onNavigateRoot={handleNavigateBrowseRoot}
        onNavigateParent={handleNavigateBrowseParent}
      />
      {browseLevel === 'parents' ? (
        <CategoryParentGrid
          parents={scopedParents}
          stats={parentStats}
          getSubCategoryCount={(id) =>
            getScopedSubCategories(user, state.categories, id).length
          }
          onSelect={(id) => {
            setParentId(id);
            setBrowseLevel('subcategories');
          }}
          emptyMessage="Nema kategorija opreme u vašem opsegu."
          countLabel="grupa"
        />
      ) : null}
      {browseLevel === 'subcategories' && parentId ? (
        <CategorySubGrid
          subCategories={scopedSubs}
          stats={subStats}
          onSelect={(id) => {
            setSubCategoryId(id);
            setBrowseLevel('groups');
          }}
          statsSuffix="kom na skladištu"
          countLabel="grupa"
        />
      ) : null}
      {browseLevel === 'groups' && subCategoryId ? (
      <div className={`${cardClass} border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden`}>
        {groups.map((group) => {
          const isExpanded = expandedGroupKeys.has(group.groupKey);
          const lotsInGroup = groupLots[group.groupKey] ?? [];
          const isLoadingLots = loadingGroupKeys.has(group.groupKey);
          return (
            <div key={group.groupKey}>
              <button
                type="button"
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
                onClick={() => handleToggleGroup(group.groupKey)}
                aria-expanded={isExpanded}
              >
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Package size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{group.productName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {group.categoryName} · {group.warehouseCount} skladišt
                    {group.warehouseCount === 1 ? 'e' : 'a'} · {group.totalOnHand}/{group.totalReceived} na skladištu
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {group.awaitingSpecCount > 0 ? (
                    <Badge tone="warning">Čeka spec. ({group.awaitingSpecCount})</Badge>
                  ) : null}
                  {group.readyToIssueCount > 0 ? (
                    <Badge tone="success">Spremno ({group.readyToIssueCount})</Badge>
                  ) : null}
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-400" />
                  )}
                </div>
              </button>
              {isExpanded ? (
                <div className="bg-slate-50/60 border-t border-gray-100 px-4 py-2">
                  {isLoadingLots ? (
                    <p className="text-xs text-gray-400 py-3 text-center">Učitavanje…</p>
                  ) : lotsInGroup.length === 0 ? (
                    <p className="text-xs text-gray-400 py-3 text-center">Nema lotova u grupi.</p>
                  ) : (
                    <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white overflow-hidden">
                      {lotsInGroup.map((lot) => (
                        <button
                          key={lot.id}
                          type="button"
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                          onClick={() => openDetail(lot.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{lot.warehouseName ?? '—'}</p>
                            <p className="text-xs text-gray-500">
                              {lot.quantityOnHand}/{lot.quantityReceived} na skladištu
                              {lot.contractNumber ? ` · Ugovor ${lot.contractNumber}` : ''}
                            </p>
                          </div>
                          <Badge tone={getStockLotListBadge(lot.status, lot.quantityOnHand, lot.quantityReceived).tone}>
                            {getStockLotListBadge(lot.status, lot.quantityOnHand, lot.quantityReceived).label}
                          </Badge>
                          <ChevronRight size={14} className="text-gray-400 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
        {groups.length === 0 && !groupList.isLoading ? (
          <p className="px-4 py-12 text-center text-sm text-gray-400">Nema grupa proizvoda u ovoj podkategoriji.</p>
        ) : null}
      </div>
      ) : null}
      {browseLevel === 'groups' && groupList.meta ? (
        <PaginationControls
          page={groupList.meta.page}
          pageSize={groupList.meta.pageSize}
          total={groupList.meta.total}
          totalPages={groupList.meta.totalPages}
          onPageChange={groupList.setPage}
          onPageSizeChange={groupList.setPageSize}
        />
      ) : null}
    </div>
  );
};
