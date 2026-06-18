import type { LucideIcon } from 'lucide-react';

interface SetupStepHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const SetupStepHeader = ({ icon: Icon, title, description }: SetupStepHeaderProps) => (
  <div className="setup-animate-in mb-5">
    <div className="flex items-start gap-3">
      <div
        className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-50 to-teal-100/80 border border-teal-200/60 flex items-center justify-center shrink-0 shadow-sm setup-icon-pulse"
        aria-hidden
      >
        <Icon className="text-teal-700" size={22} strokeWidth={2} />
      </div>
      <div className="min-w-0 pt-0.5">
        <h2 className="text-lg font-semibold text-slate-900 tracking-tight">{title}</h2>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  </div>
);
