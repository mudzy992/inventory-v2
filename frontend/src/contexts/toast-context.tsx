import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../utils/cn';

type ToastVariant = 'error' | 'success' | 'info';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toastError: (message: string) => void;
  toastSuccess: (message: string) => void;
  toastInfo: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 5000;

const variantClass: Record<ToastVariant, string> = {
  error: 'bg-red-50 text-red-900 border-red-200',
  success: 'bg-green-50 text-green-900 border-green-200',
  info: 'bg-blue-50 text-blue-900 border-blue-200',
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((row) => row.id !== id));
  }, []);
  const pushToast = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
    },
    [dismissToast],
  );
  const value = useMemo(
    () => ({
      toastError: (message: string) => pushToast(message, 'error'),
      toastSuccess: (message: string) => pushToast(message, 'success'),
      toastInfo: (message: string) => pushToast(message, 'info'),
    }),
    [pushToast],
  );
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-lg',
              variantClass[toast.variant],
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};
