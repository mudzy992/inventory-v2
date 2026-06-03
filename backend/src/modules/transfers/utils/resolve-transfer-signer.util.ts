import type { TransferType } from '../../../../generated/prisma/client';
import type { SignerResolutionService } from '../../../common/services/signer-resolution.service';

interface ResolveTransferSignerInput {
  type: TransferType;
  fromPersonId?: string | null;
  toPersonId?: string | null;
}

export const resolveTransferSignerId = async (
  signerResolution: SignerResolutionService,
  input: ResolveTransferSignerInput,
): Promise<string | null> => {
  if (input.type === 'zaduzenje' && input.toPersonId) {
    return signerResolution.getEffectiveSignerForEmployee(input.toPersonId);
  }
  if (input.type === 'prenos' && input.toPersonId) {
    return signerResolution.getEffectiveSignerForEmployee(input.toPersonId);
  }
  if (input.type === 'razduzenje' && input.fromPersonId) {
    return signerResolution.getEffectiveSignerForEmployee(input.fromPersonId);
  }
  if (input.type === 'rashodovanje' && input.fromPersonId) {
    return signerResolution.getEffectiveSignerForEmployee(input.fromPersonId);
  }
  return null;
};
