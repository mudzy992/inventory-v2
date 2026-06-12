import { Suspense, type LazyExoticComponent, type ComponentType } from 'react';
import type { PageId } from '../components/page-id';
import { RoutePageFallback } from '../components/ui/route-page-fallback';
import { ProtectedRoute } from './protected-route';

interface LazyRoutePageProps {
  pageId: PageId;
  Page: LazyExoticComponent<ComponentType<unknown>>;
}

export const LazyRoutePage = ({ pageId, Page }: LazyRoutePageProps) => (
  <ProtectedRoute pageId={pageId}>
    <Suspense fallback={<RoutePageFallback />}>
      <Page />
    </Suspense>
  </ProtectedRoute>
);
