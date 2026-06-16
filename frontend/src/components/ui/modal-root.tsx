import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MODAL_Z } from '../../constants/modal-z-index';
import { cn } from '../../utils/cn';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-3xl',
  full: 'max-w-5xl',
};

interface ModalRootProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  zIndex?: number;
  size?: ModalSize;
  panelClassName?: string;
  closeOnBackdrop?: boolean;
  enableEscape?: boolean;
}

export const ModalRoot = ({
  open,
  onClose,
  children,
  zIndex = MODAL_Z.base,
  size = 'md',
  panelClassName,
  closeOnBackdrop = false,
  enableEscape = false,
}: ModalRootProps) => {
  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (enableEscape && event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, enableEscape]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4 bg-black/50"
      style={{ zIndex }}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      <div
        className={cn(
          'w-full max-h-[90dvh] overflow-y-auto',
          'rounded-t-xl sm:rounded-xl',
          SIZE_CLASS[size],
          panelClassName,
        )}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};
