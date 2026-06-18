import { getSetupStepMeta, SETUP_INSTALL_STEP_COUNT } from './setup-step-meta';

interface SetupWizardProgressProps {
  currentStep: number;
}

export const SetupWizardProgress = ({ currentStep }: SetupWizardProgressProps) => {
  const meta = getSetupStepMeta(currentStep);
  const progressPercent = Math.round((currentStep / SETUP_INSTALL_STEP_COUNT) * 100);

  return (
    <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-teal-700 uppercase tracking-wide">
            Korak {currentStep} od {SETUP_INSTALL_STEP_COUNT}
          </p>
          <p className="text-sm font-semibold text-slate-900 truncate">{meta.label}</p>
        </div>
        <span className="text-xs font-medium text-slate-500 tabular-nums shrink-0">{progressPercent}%</span>
      </div>
      <div className="flex gap-1" role="progressbar" aria-valuenow={currentStep} aria-valuemin={1} aria-valuemax={SETUP_INSTALL_STEP_COUNT}>
        {Array.from({ length: SETUP_INSTALL_STEP_COUNT }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
              n < currentStep
                ? 'bg-teal-600'
                : n === currentStep
                  ? 'bg-teal-500 setup-progress-active'
                  : 'bg-slate-200'
            }`}
            title={getSetupStepMeta(n).label}
          />
        ))}
      </div>
    </div>
  );
};
