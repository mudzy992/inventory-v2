import type { ReactNode } from 'react';
import { AuthProvider } from './AuthContext';
import { DataProvider } from './DataContext';
import { AdminSettingsProvider } from './admin-settings-context';
import { PublicSettingsProvider } from './public-settings-context';
import { SocketProvider } from './SocketContext';
import { ToastProvider } from './toast-context';

export const AppProviders = ({ children }: { children: ReactNode }) => (
  <PublicSettingsProvider>
    <AuthProvider>
      <AdminSettingsProvider>
        <DataProvider>
          <SocketProvider>
            <ToastProvider>{children}</ToastProvider>
          </SocketProvider>
        </DataProvider>
      </AdminSettingsProvider>
    </AuthProvider>
  </PublicSettingsProvider>
);
