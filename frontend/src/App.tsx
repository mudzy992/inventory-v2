import { useState, useEffect } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { fetchSetupStatusApi } from './api/setup-api';
import { LoginPage } from './components/LoginPage';
import { SetupWizardPage } from './components/setup/setup-wizard-page';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';
import { getDefaultPathForRole } from './routes/app-routes';
import { AppRouter } from './routes/app-router';
import { PublicEquipmentRoute } from './routes/public-equipment-route';

export default function App() {
  return (
    <Routes>
      <Route path="/equipment/:equipmentId" element={<PublicEquipmentRoute />} />
      <Route path="*" element={<AppShell />} />
    </Routes>
  );
}

function AppShell() {
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { isLoading: dataLoading, error: dataError } = useData();
  const navigate = useNavigate();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [setupSuccessMessage, setSetupSuccessMessage] = useState<string | undefined>();

  useEffect(() => {
    const loadSetupStatus = async () => {
      try {
        const status = await fetchSetupStatusApi();
        setNeedsSetup(status.needsSetup);
      } catch {
        setNeedsSetup(false);
      }
    };
    void loadSetupStatus();
  }, []);

  const handleLoginSuccess = () => {
    navigate(getDefaultPathForRole(), { replace: true });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  if (needsSetup === null || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
        Učitavanje...
      </div>
    );
  }

  if (needsSetup) {
    return (
      <SetupWizardPage
        onComplete={(message) => {
          setNeedsSetup(false);
          setSetupSuccessMessage(message);
        }}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginPage
        onLoginSuccess={handleLoginSuccess}
        setupSuccessMessage={setupSuccessMessage}
      />
    );
  }

  if (dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
        Učitavanje podataka...
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white border border-red-200 rounded-xl p-6 max-w-md text-center">
          <p className="text-red-600 font-medium mb-2">Greška pri učitavanju</p>
          <p className="text-sm text-gray-600">{dataError}</p>
        </div>
      </div>
    );
  }

  return <AppRouter onLogout={() => void handleLogout()} />;
}
