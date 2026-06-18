import { SETUP_INSTALL_STEP_COUNT } from './setup-step-meta';

export { SETUP_INSTALL_STEP_COUNT };

export interface SetupEmployeeFields {
  firstName: string;
  lastName: string;
  title: string;
}

export interface SetupRoleAccountFields {
  employee: SetupEmployeeFields;
  username: string;
  password: string;
  passwordConfirm: string;
}

export interface SetupWizardState {
  companyName: string;
  companyAddress: string;
  companyCity: string;
  companyPostalCode: string;
  companyPhone: string;
  companyEmail: string;
  companyTaxId: string;
  cantonName: string;
  cities: string;
  childUnitName: string;
  childUnitType: string;
  warehouseName: string;
  warehouseAddress: string;
  categoryParentName: string;
  categoryLeafName: string;
  catalogName: string;
  catalogCode: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminUsername: string;
  adminPassword: string;
  adminPasswordConfirm: string;
  evidenticar: SetupRoleAccountFields;
  skladistar: SetupRoleAccountFields;
  popisKoordinator: SetupRoleAccountFields;
  user: SetupRoleAccountFields;
  directorFirstName: string;
  directorLastName: string;
  directorTitle: string;
  setupToken: string;
}

export const createEmptyRoleAccount = (): SetupRoleAccountFields => ({
  employee: { firstName: '', lastName: '', title: '' },
  username: '',
  password: '',
  passwordConfirm: '',
});

export const createInitialSetupWizardState = (): SetupWizardState => ({
  companyName: '',
  companyAddress: '',
  companyCity: '',
  companyPostalCode: '',
  companyPhone: '',
  companyEmail: '',
  companyTaxId: '',
  cantonName: '',
  cities: '',
  childUnitName: '',
  childUnitType: 'distribucija',
  warehouseName: 'Glavno skladište',
  warehouseAddress: '',
  categoryParentName: 'Oprema',
  categoryLeafName: 'Opšta oprema',
  catalogName: 'Opšta stavka',
  catalogCode: 'OP-001',
  adminFirstName: '',
  adminLastName: '',
  adminEmail: '',
  adminUsername: 'admin',
  adminPassword: '',
  adminPasswordConfirm: '',
  evidenticar: createEmptyRoleAccount(),
  skladistar: createEmptyRoleAccount(),
  popisKoordinator: createEmptyRoleAccount(),
  user: createEmptyRoleAccount(),
  directorFirstName: '',
  directorLastName: '',
  directorTitle: 'Direktor',
  setupToken: '',
});

const isRoleAccountValid = (account: SetupRoleAccountFields): boolean =>
  account.employee.firstName.trim().length > 0 &&
  account.employee.lastName.trim().length > 0 &&
  account.employee.title.trim().length > 0 &&
  account.username.trim().length >= 3 &&
  account.password.length >= 8 &&
  account.password === account.passwordConfirm;

export const canProceedSetupStep = (step: number, state: SetupWizardState): boolean => {
  switch (step) {
    case 1:
      return Boolean(state.companyName.trim() && state.companyAddress.trim() && state.companyCity.trim());
    case 2:
      return Boolean(state.cantonName.trim() && state.cities.trim());
    case 3:
      return true;
    case 4:
      return Boolean(state.warehouseName.trim());
    case 5:
      return Boolean(
        state.categoryParentName.trim() &&
          state.categoryLeafName.trim() &&
          state.catalogName.trim(),
      );
    case 6:
      return Boolean(
        state.adminFirstName.trim() &&
          state.adminLastName.trim() &&
          state.adminUsername.trim().length >= 3 &&
          state.adminPassword.length >= 8 &&
          state.adminPassword === state.adminPasswordConfirm,
      );
    case 7:
      return (
        isRoleAccountValid(state.evidenticar) &&
        isRoleAccountValid(state.skladistar) &&
        isRoleAccountValid(state.popisKoordinator) &&
        isRoleAccountValid(state.user)
      );
    case 8:
      return Boolean(
        state.directorFirstName.trim() &&
          state.directorLastName.trim() &&
          state.directorTitle.trim(),
      );
    case 9:
      return true;
    default:
      return false;
  }
};

export const setupInputClass =
  'mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none';
