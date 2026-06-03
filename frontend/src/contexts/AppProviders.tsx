import type { ReactNode } from 'react';
import { AuthProvider } from './AuthContext';
import { DataProvider } from './DataContext';
import { PublicSettingsProvider } from './public-settings-context';
import { SocketProvider } from './SocketContext';
import { ToastProvider } from './toast-context';

export const AppProviders = ({ children }: { children: ReactNode }) => (
  <PublicSettingsProvider>
  <AuthProvider>
    <DataProvider>
      <SocketProvider>
        <ToastProvider>{children}</ToastProvider>
      </SocketProvider>
    </DataProvider>
  </AuthProvider>
  </PublicSettingsProvider>
);
