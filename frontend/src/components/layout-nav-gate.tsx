import type { ReactNode } from 'react';
import type { PageId } from './Layout';
import { useAdminSettings } from '../contexts/admin-settings-context';
import { usePublicSettings } from '../contexts/public-settings-context';
import { isNavPageEnabled } from '../utils/settings-feature.util';
import { ModuleDisabledState } from './settings/module-disabled-state';

interface LayoutNavGateProps {
  pageId: PageId;
  children: ReactNode;
}

export const LayoutNavGate = ({ pageId, children }: LayoutNavGateProps) => {
  const { settings: publicSettings } = usePublicSettings();
  const { settings: adminSettings } = useAdminSettings();
  if (!isNavPageEnabled(pageId, publicSettings, adminSettings)) {
    return <ModuleDisabledState />;
  }
  return <>{children}</>;
};
