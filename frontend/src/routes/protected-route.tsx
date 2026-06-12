import type { ReactNode } from 'react';
import type { PageId } from '../components/page-id';
import { RequirePageEnabled } from './require-page-enabled';
import { RequireRole } from './require-role';

interface ProtectedRouteProps {
  pageId: PageId;
  children: ReactNode;
}

export const ProtectedRoute = ({ pageId, children }: ProtectedRouteProps) => (
  <RequireRole pageId={pageId}>
    <RequirePageEnabled pageId={pageId}>{children}</RequirePageEnabled>
  </RequireRole>
);
