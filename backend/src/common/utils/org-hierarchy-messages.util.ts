import type { OrgUnitType } from '../../../generated/prisma/client';

const TYPE_LABELS: Record<OrgUnitType, string> = {
  direkcija: 'Direkcija',
  distribucija: 'Distribucija',
  podrucje: 'Područje',
  podruznica: 'Podružnica',
  poslovna_jedinica: 'Poslovna jedinica',
  sektor: 'Sektor',
  sluzba: 'Služba',
  odjeljenje: 'Odjeljenje',
};

export const getOrgUnitTypeLabelBs = (type: OrgUnitType): string => TYPE_LABELS[type];

export const formatInvalidParentChildMessage = (
  parentType: OrgUnitType,
  childType: OrgUnitType,
  allowedChildTypes: readonly OrgUnitType[],
): string => {
  const allowedLabels = allowedChildTypes.map(getOrgUnitTypeLabelBs).join(', ');
  return `Tip „${getOrgUnitTypeLabelBs(childType)}” nije dozvoljen ispod „${getOrgUnitTypeLabelBs(parentType)}”. Dozvoljeno: ${allowedLabels || '—'}.`;
};

export const ORG_HIERARCHY_MESSAGES = {
  selfParent: 'Organizacijska jedinica ne može biti vlastiti nadređeni.',
  cycle: 'Odabir nadređene jedinice stvara ciklus u hijerarhiji.',
  deleteHasChildren: 'Nije moguće obrisati jedinicu koja ima podjedinice.',
  deleteHasEmployees: 'Nije moguće obrisati jedinicu koja ima zaposlenike.',
  childIncompatible: (childName: string, childType: OrgUnitType, parentType: OrgUnitType) =>
    `Podjedinica „${childName}” (${getOrgUnitTypeLabelBs(childType)}) nije dozvoljena ispod tipa „${getOrgUnitTypeLabelBs(parentType)}”.`,
  cityNotFound: 'Grad nije pronađen.',
  signerNotFound: 'Potpisnik (radnik) nije pronađen.',
  notFound: 'Organizacijska jedinica nije pronađena.',
} as const;
