export const DISPOSAL_GUARD_MESSAGES = {
  sessionNotDraft: 'Lista za rashod dostupna je samo u nacrtu sesije popisa.',
  removeAdminOnly: 'Samo administrator može povući stavku s liste za rashod.',
  removeListedOnly: 'Moguće je povući samo stavke u statusu na listi.',
  presidentOnlyReview: 'Samo predsjednik komisije rashoda može donijeti odluku.',
} as const;

export interface DisposalGuardResult {
  allowed: boolean;
  reason?: string;
}

export const canMarkDisposalList = (sessionStatus: string): DisposalGuardResult => {
  if (sessionStatus !== 'draft') {
    return { allowed: false, reason: DISPOSAL_GUARD_MESSAGES.sessionNotDraft };
  }
  return { allowed: true };
};

export const canWithdrawDisposalList = (input: {
  isAdmin: boolean;
  sessionStatus: string;
  itemStatus: string;
}): DisposalGuardResult => {
  if (!input.isAdmin) {
    return { allowed: false, reason: DISPOSAL_GUARD_MESSAGES.removeAdminOnly };
  }
  if (input.sessionStatus !== 'draft') {
    return { allowed: false, reason: DISPOSAL_GUARD_MESSAGES.sessionNotDraft };
  }
  if (input.itemStatus !== 'listed') {
    return { allowed: false, reason: DISPOSAL_GUARD_MESSAGES.removeListedOnly };
  }
  return { allowed: true };
};

export const canReviewDisposalApproval = (input: {
  isPresident: boolean;
  isAdmin: boolean;
}): DisposalGuardResult => {
  if (!input.isPresident && !input.isAdmin) {
    return { allowed: false, reason: DISPOSAL_GUARD_MESSAGES.presidentOnlyReview };
  }
  return { allowed: true };
};
