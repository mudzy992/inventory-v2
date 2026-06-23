import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { MODAL_Z } from '../../constants/modal-z-index';
import { cn } from '../../utils/cn';
import { TransferDocumentPanel } from '../TransferDocumentPanel';
import type { TransferRecord } from '../../types';
import type { TransferDocumentPreviewMode } from './use-transfer-document-preview';

interface TransferDocumentDrawerProps {
  transfer: TransferRecord;
  previewMode: TransferDocumentPreviewMode;
  onClose: () => void;
  onSigned?: () => void;
  allowSign?: boolean;
}

export const TransferDocumentDrawer = ({
  transfer,
  previewMode,
  onClose,
  onSigned,
  allowSign = false,
}: TransferDocumentDrawerProps) => {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <DrawerShell onClose={onClose}>
      <div className="flex h-full min-h-0 flex-col">
        <DrawerHeader transfer={transfer} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
          <TransferDocumentPanel
            transfer={transfer}
            onSigned={onSigned}
            allowSign={allowSign}
            layout="drawer"
            autoPreview={previewMode}
          />
        </div>
      </div>
    </DrawerShell>,
    document.body,
  );
};

const DrawerShell = ({ children, onClose }: { children: ReactNode; onClose: () => void }) => (
  <div className="fixed inset-0" style={{ zIndex: MODAL_Z.base }} role="presentation">
    <button
      type="button"
      className="absolute inset-0 bg-black/50"
      aria-label="Zatvori pregled prenosnice"
      onClick={onClose}
    />
    <aside
      className={cn(
        'absolute flex flex-col bg-white shadow-xl',
        'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl',
        'md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:max-h-none md:w-[min(720px,55vw)] md:rounded-none md:rounded-l-2xl',
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Pregled prenosnice"
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </aside>
  </div>
);

const DrawerHeader = ({
  transfer,
  onClose,
}: {
  transfer: TransferRecord;
  onClose: () => void;
}) => (
  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 md:px-5">
    <div className="min-w-0 pr-2">
      <h2 className="truncate text-lg font-semibold text-gray-900">
        Prenosnica {transfer.documentNumber}
      </h2>
      <p className="text-sm text-gray-500">Pregled dokumenta i akcije</p>
    </div>
    <button
      type="button"
      onClick={onClose}
      className="shrink-0 rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-800"
      aria-label="Zatvori"
    >
      <X size={18} />
    </button>
  </div>
);
