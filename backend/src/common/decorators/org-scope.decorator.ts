import { SetMetadata } from '@nestjs/common';

export const ORG_SCOPE_KEY = 'orgScope';

/** Marks handlers that filter data by evidenticar managed org units (phase 2+). */
export const OrgScope = () => SetMetadata(ORG_SCOPE_KEY, true);
