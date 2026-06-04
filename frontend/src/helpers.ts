import type { OrgUnit, Employee, AppState, City, Canton } from './types';

export function getCityLabel(cities: City[], cityId: string | null | undefined): string {
  if (!cityId) {
    return '—';
  }
  const city = cities.find((row) => row.id === cityId);
  if (!city) {
    return '—';
  }
  const cantonName = city.canton?.name;
  return cantonName ? `${city.name} (${cantonName})` : city.name;
}

export function getEffectiveCityForOrgUnit(orgUnits: OrgUnit[], unitId: string): string | null {
  let current = orgUnits.find((unit) => unit.id === unitId);
  while (current) {
    if (current.effectiveLocationCityId) {
      return current.effectiveLocationCityId;
    }
    if (current.locationCityId) {
      return current.locationCityId;
    }
    current = orgUnits.find((unit) => unit.id === current!.parentId);
  }
  return null;
}

export function getEffectiveSignerForOrgUnit(
  orgUnits: OrgUnit[],
  employees: Employee[],
  unitId: string,
): Employee | null {
  let current = orgUnits.find((unit) => unit.id === unitId);
  while (current) {
    if (current.effectiveSignerId) {
      return employees.find((employee) => employee.id === current!.effectiveSignerId) ?? null;
    }
    if (current.signerId) {
      return employees.find((employee) => employee.id === current!.signerId) ?? null;
    }
    current = orgUnits.find((unit) => unit.id === current!.parentId);
  }
  return null;
}

export function getOrgUnitPath(orgUnits: OrgUnit[], unitId: string): string {
  const parts: string[] = [];
  let current = orgUnits.find(o => o.id === unitId);
  while (current) {
    parts.unshift(current.name);
    current = orgUnits.find(o => o.id === current!.parentId);
  }
  return parts.join(' → ');
}

export function getOrgUnitChildren(orgUnits: OrgUnit[], parentId: string | null): OrgUnit[] {
  return orgUnits.filter(o => o.parentId === parentId);
}

export function getEmployeesForUnit(employees: Employee[], unitId: string): Employee[] {
  return employees.filter(e => e.orgUnitId === unitId);
}

export function getEmployeeFullName(emp: Employee): string {
  return `${emp.firstName} ${emp.lastName}`;
}

export function getSignerForEmployee(state: AppState, employeeId: string): Employee | undefined {
  const emp = state.employees.find(e => e.id === employeeId);
  if (!emp) return undefined;
  
  let current = state.orgUnits.find(o => o.id === emp.orgUnitId);
  while (current) {
    if (current.signerId) {
      return state.employees.find(e => e.id === current!.signerId);
    }
    current = state.orgUnits.find(o => o.id === current!.parentId);
  }
  return undefined;
}

export function getOrgUnitTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    direkcija: 'Direkcija',
    distribucija: 'Distribucija',
    podrucje: 'Područje',
    podruznica: 'Podružnica',
    poslovna_jedinica: 'Poslovna jedinica',
    sektor: 'Sektor',
    sluzba: 'Služba',
    odjeljenje: 'Odjeljenje',
  };
  return labels[type] || type;
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    skladiste: 'Na skladištu',
    zaduzeno: 'Zaduženo',
    rashodovano: 'Rashodovano',
    raw: 'RAW (čeka potpis)',
    potpisan: 'Potpisan',
    zaduzenje: 'Zaduženje',
    razduzenje: 'Razduženje',
    rashodovanje: 'Rashodovanje',
    prenos: 'Prenos (osoba→osoba)',
  };
  return labels[status] || status;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    skladiste: 'bg-blue-100 text-blue-800',
    zaduzeno: 'bg-green-100 text-green-800',
    rashodovano: 'bg-red-100 text-red-800',
    raw: 'bg-yellow-100 text-yellow-800',
    potpisan: 'bg-green-100 text-green-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('bs-BA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function getAllDescendantUnitIds(orgUnits: OrgUnit[], parentId: string): string[] {
  const result: string[] = [parentId];
  const children = orgUnits.filter(o => o.parentId === parentId);
  for (const child of children) {
    result.push(...getAllDescendantUnitIds(orgUnits, child.id));
  }
  return result;
}
