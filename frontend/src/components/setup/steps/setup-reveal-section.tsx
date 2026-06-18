import type { ReactNode } from 'react';
import { cn } from '../../../utils/cn';
import { useRevealOnScroll } from '../../../hooks/use-reveal-on-scroll';

interface SetupRevealSectionProps {
  id: string;
  children: ReactNode;
  className?: string;
  variant?: 'up' | 'left' | 'right' | 'scale';
}

const variantClass: Record<NonNullable<SetupRevealSectionProps['variant']>, string> = {
  up: 'setup-reveal-up',
  left: 'setup-reveal-left',
  right: 'setup-reveal-right',
  scale: 'setup-reveal-scale',
};

export const SetupRevealSection = ({
  id,
  children,
  className,
  variant = 'up',
}: SetupRevealSectionProps) => {
  const { ref, isVisible } = useRevealOnScroll();

  return (
    <div
      id={id}
      ref={ref}
      className={cn(
        'setup-reveal',
        variantClass[variant],
        isVisible && 'setup-reveal-visible',
        className,
      )}
    >
      {children}
    </div>
  );
};
