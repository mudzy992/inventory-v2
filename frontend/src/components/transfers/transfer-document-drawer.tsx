import { useEffect, useState } from 'react';
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
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);

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
    <div className="fixed inset-0" style={{ zIndex: MODAL_Z.base }} role="presentation">
      <button
        type="button"
        className={cn(
          'absolute inset-0 bg-black/50 transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0',
        )}
        aria-label="Zatvori pregled prenosnice"
        onClick={onClose}
      />
      <aside
        className={cn(
          'absolute flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-out',
          'inset-x-0 bottom-0 max-h-[95dvh] rounded-t-2xl',
          'md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:max-h-none md:h-full md:w-[min(1000px,85vw)] md:rounded-none md:rounded-l-2xl',
          isOpen ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Pregled prenosnice"
        onClick={(event) => event.stopPropagation()}
      >
        <DrawerHeader transfer={transfer} onClose={onClose} />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TransferDocumentPanel
            transfer={transfer}
            onSigned={onSigned}
            allowSign={allowSign}
            layout="drawer"
            autoPreview={previewMode}
          />
        </div>
      </aside>
    </div>,
    document.body,
  );
};

const DrawerHeader = ({
  transfer,
  onClose,
}: {
  transfer: TransferRecord;
  onClose: () => void;
}) => (
  <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 md:px-5">
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Prenosnica</p>
      <h2 className="truncate text-lg font-semibold text-gray-900">{transfer.documentNumber}</h2>
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
