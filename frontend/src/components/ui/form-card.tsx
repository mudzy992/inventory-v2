import type { ReactNode } from 'react';
import { cardClass } from './form-styles';

interface FormCardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export const FormCard = ({ title, children, className = '' }: FormCardProps) => (
  <div className={`${cardClass} p-4 space-y-3 ${className}`}>
    <h2 className="font-medium text-gray-900">{title}</h2>
    {children}
  </div>
);
