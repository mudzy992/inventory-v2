import type { ReactNode } from 'react';
import type { PageId } from './Layout';
import { usePublicSettings } from '../contexts/public-settings-context';
import { isNavPageEnabled } from '../utils/settings-feature.util';
import { ModuleDisabledState } from './settings/module-disabled-state';

interface LayoutNavGateProps {
  pageId: PageId;
  children: ReactNode;
}

export const LayoutNavGate = ({ pageId, children }: LayoutNavGateProps) => {
  const { settings } = usePublicSettings();
  if (!isNavPageEnabled(pageId, settings, settings)) {
    return <ModuleDisabledState />;
  }
  return <>{children}</>;
};
