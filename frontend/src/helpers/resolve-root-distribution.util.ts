import type { OrgUnit } from '../types';

/** Jedina krovna distribucija — direktno pod direkcijom, ili jedina u stablu. */
export const resolveRootDistributionOrgUnit = (orgUnits: OrgUnit[]): OrgUnit | null => {
  const distributions = orgUnits.filter((ou) => ou.type === 'distribucija');
  if (distributions.length === 0) {
    return null;
  }
  if (distributions.length === 1) {
    return distributions[0] ?? null;
  }
  const underDirekcija = distributions.filter((ou) => {
    if (!ou.parentId) {
      return false;
    }
    const parent = orgUnits.find((row) => row.id === ou.parentId);
    return parent?.type === 'direkcija';
  });
  if (underDirekcija.length === 1) {
    return underDirekcija[0] ?? null;
  }
  return null;
};
