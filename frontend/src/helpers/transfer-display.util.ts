import { getEmployeeFullName } from '../helpers';
import type { Employee, TransferRecord } from '../types';

export const getTransferEquipmentLabel = (transfer: TransferRecord): string =>
  transfer.equipment?.inventoryNumber ?? transfer.equipmentId;

export const getTransferFromPerson = (transfer: TransferRecord): Pick<Employee, 'firstName' | 'lastName'> | null =>
  transfer.fromPerson ??
  (transfer.fromPersonId ? { firstName: '', lastName: transfer.fromPersonId } : null);

export const getTransferToPerson = (transfer: TransferRecord): Pick<Employee, 'firstName' | 'lastName'> | null =>
  transfer.toPerson ??
  (transfer.toPersonId ? { firstName: '', lastName: transfer.toPersonId } : null);

export const getTransferSigner = (transfer: TransferRecord): Pick<Employee, 'firstName' | 'lastName'> | null =>
  transfer.signer ?? null;

export const getTransferFromPersonName = (transfer: TransferRecord): string => {
  const person = getTransferFromPerson(transfer);
  return person && person.firstName ? getEmployeeFullName(person as Employee) : '';
};

export const getTransferToPersonName = (transfer: TransferRecord): string => {
  const person = getTransferToPerson(transfer);
  return person && person.firstName ? getEmployeeFullName(person as Employee) : '';
};

export const getTransferSignerName = (transfer: TransferRecord): string => {
  const signer = getTransferSigner(transfer);
  return signer ? getEmployeeFullName(signer as Employee) : '';
};

export const getTransferSearchHaystack = (transfer: TransferRecord): string =>
  [
    getTransferEquipmentLabel(transfer),
    getTransferFromPersonName(transfer),
    getTransferToPersonName(transfer),
    transfer.documentNumber,
    transfer.reason ?? '',
  ]
    .join(' ')
    .toLowerCase();
