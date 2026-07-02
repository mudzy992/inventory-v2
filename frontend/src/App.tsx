import { useState, useEffect } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { fetchSetupStatusApi } from './api/setup-api';
import { LoginPage } from './components/LoginPage';
import { SetupWizardPage } from './components/setup/setup-wizard-page';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';
import { AppRouter } from './routes/app-router';
import { PublicEquipmentRoute } from './routes/public-equipment-route';
import { HttpStatusPage } from './components/ui/http-status-page';

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
  const { isLoading: dataLoading, error: dataError, refresh } = useData();
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
    navigate('/', { replace: true });
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
    if (dataError.status === 403) {
      return (
        <HttpStatusPage
          status={403}
          variant="fullscreen"
          description={
            dataError.message || 'Vaš nalog nema dozvolu za učitavanje aplikacije. Kontaktirajte administratora.'
          }
          actionLabel="Odjavi se"
          onAction={() => void handleLogout()}
        />
      );
    }
    return (
      <HttpStatusPage
        status={404}
        variant="fullscreen"
        showCode={false}
        title="Greška pri učitavanju"
        description={dataError.message}
        actionLabel="Pokušaj ponovo"
        onAction={() => void refresh()}
        secondaryActionLabel="Odjavi se"
        onSecondaryAction={() => void handleLogout()}
      />
    );
  }

  return <AppRouter onLogout={() => void handleLogout()} />;
}
