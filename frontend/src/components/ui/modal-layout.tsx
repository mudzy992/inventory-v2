import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface ModalHeaderProps {
  title: string;
  onClose?: () => void;
  closeDisabled?: boolean;
  className?: string;
}

export const ModalHeader = ({ title, onClose, closeDisabled, className }: ModalHeaderProps) => (
  <div className={cn('flex items-start justify-between gap-3 border-b border-gray-100 p-6', className)}>
    <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
    {onClose ? (
      <button
        type="button"
        onClick={onClose}
        className="rounded p-1 text-gray-400 hover:text-gray-600"
        aria-label="Zatvori"
        disabled={closeDisabled}
      >
        <X size={20} />
      </button>
    ) : null}
  </div>
);

interface ModalBodyProps {
  children: ReactNode;
  className?: string;
}

export const ModalBody = ({ children, className }: ModalBodyProps) => (
  <div className={cn('space-y-4 p-6', className)}>{children}</div>
);

interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

export const ModalFooter = ({ children, className }: ModalFooterProps) => (
  <div className={cn('flex justify-end gap-3 border-t border-gray-100 p-6', className)}>{children}</div>
);
