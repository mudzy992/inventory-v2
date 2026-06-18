import { useEffect, useState } from 'react';
import { ChevronDown, CheckCircle2, Rocket, Sparkles } from 'lucide-react';
import { AppBrand, EVIDENS_APP_NAME } from '../../ui/app-brand';
import { PremiumAuthLayout } from '../../ui/premium-auth-layout';
import {
  SETUP_INSTALL_PREVIEW,
  SETUP_WELCOME_FEATURES,
  SETUP_WELCOME_INTRO,
  SETUP_WELCOME_TAGLINE,
} from '../setup-features';
import { SETUP_INSTALL_STEPS } from '../setup-step-meta';
import { SetupRevealSection } from './setup-reveal-section';

interface SetupPresentationScrollProps {
  appName?: string;
  onStartInstall: () => void;
}

const PRESENTATION_SECTION_IDS = ['hero', ...SETUP_WELCOME_FEATURES.map((f) => f.id), 'review'];

export const SetupPresentationScroll = ({
  appName = EVIDENS_APP_NAME,
  onStartInstall,
}: SetupPresentationScrollProps) => {
  const [activeSection, setActiveSection] = useState('hero');

  useEffect(() => {
    const elements = PRESENTATION_SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (elements.length === 0) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) {
          setActiveSection(visible.target.id);
        }
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.25, 0.5] },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleNavClick = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <PremiumAuthLayout maxWidth="2xl">
      <nav
        className="hidden lg:flex fixed right-6 top-1/2 -translate-y-1/2 z-20 flex-col gap-2"
        aria-label="Navigacija prezentacije"
      >
        {PRESENTATION_SECTION_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => handleNavClick(id)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              activeSection === id
                ? 'bg-teal-400 scale-125 shadow-lg shadow-teal-500/40'
                : 'bg-white/30 hover:bg-white/50'
            }`}
            aria-label={id === 'hero' ? 'Početak' : id === 'review' ? 'Pregled instalacije' : id}
          />
        ))}
      </nav>

      <div className="setup-presentation">
        <section
          id="hero"
          className="min-h-[100dvh] flex flex-col items-center justify-center text-center px-4 setup-hero-enter"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-teal-200 text-xs font-medium mb-6 backdrop-blur-sm">
            <Sparkles size={14} aria-hidden />
            Dobrodošli u Evidens
          </div>
          <AppBrand name={appName} subtitle={SETUP_WELCOME_TAGLINE} />
          <p className="text-blue-100/90 text-base sm:text-lg mt-6 max-w-xl mx-auto leading-relaxed">
            {SETUP_WELCOME_INTRO}
          </p>
          <p className="text-teal-200/70 text-sm mt-8 flex items-center gap-2 setup-bounce">
            <ChevronDown size={18} aria-hidden />
            Skrolujte za pregled modula
            <ChevronDown size={18} aria-hidden />
          </p>
        </section>

        {SETUP_WELCOME_FEATURES.map((feature, index) => {
          const Icon = feature.icon;
          const isEven = index % 2 === 0;
          const variant = isEven ? 'left' : 'right';

          return (
            <SetupRevealSection
              key={feature.id}
              id={feature.id}
              variant={variant}
              className="min-h-[88dvh] flex items-center py-16 px-2"
            >
              <article className="w-full relative">
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${feature.glow} rounded-3xl blur-3xl opacity-60 pointer-events-none`}
                  aria-hidden
                />
                <div
                  className={`relative grid grid-cols-1 md:grid-cols-2 gap-8 items-center rounded-2xl border border-white/10 bg-white/95 backdrop-blur-md p-6 sm:p-8 shadow-2xl shadow-slate-950/20 ${
                    isEven ? '' : 'md:[direction:rtl] md:*:[direction:ltr]'
                  }`}
                >
                  <div className="flex flex-col items-center md:items-start text-center md:text-left">
                    <span className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-3">
                      Modul {String(index + 1).padStart(2, '0')}
                    </span>
                    <div
                      className={`w-20 h-20 rounded-2xl border flex items-center justify-center mb-4 setup-icon-pulse ${feature.accent}`}
                      aria-hidden
                    >
                      <Icon size={36} strokeWidth={1.75} />
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                      {feature.title}
                    </h2>
                    <p className="text-slate-600 mt-3 leading-relaxed">{feature.description}</p>
                  </div>
                  <ul className="space-y-3 setup-reveal-stagger">
                    {feature.highlights.map((highlight) => (
                      <li
                        key={highlight}
                        className="flex items-start gap-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-700"
                      >
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-teal-500 shrink-0" aria-hidden />
                        {highlight}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </SetupRevealSection>
          );
        })}

        <SetupRevealSection id="review" variant="scale" className="min-h-[100dvh] flex items-center py-20 px-2">
          <section className="w-full rounded-2xl border border-white/15 bg-white/95 backdrop-blur-md shadow-2xl shadow-slate-950/30 overflow-hidden">
            <div className="bg-gradient-to-r from-teal-600 to-blue-700 px-6 py-8 text-white text-center">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Spremni za instalaciju?</h2>
              <p className="text-teal-100 text-sm mt-2 max-w-lg mx-auto">
                Instalacija postavlja minimalne podatke da odmah možete primiti opremu na skladište i izdati prvu jedinicu.
              </p>
            </div>

            <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wide mb-4">
                  Koraci instalacije
                </h3>
                <ol className="space-y-3">
                  {SETUP_INSTALL_STEPS.map((installStep, idx) => {
                    const StepIcon = installStep.icon;
                    return (
                      <li
                        key={installStep.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 setup-reveal-stagger-item"
                        style={{ animationDelay: `${idx * 60}ms` }}
                      >
                        <span className="w-7 h-7 rounded-lg bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {installStep.id}
                        </span>
                        <StepIcon size={16} className="text-slate-400 shrink-0" aria-hidden />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">{installStep.label}</p>
                          <p className="text-xs text-slate-500 truncate">{installStep.description}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wide mb-4">
                  Šta dobijate odmah
                </h3>
                <ul className="space-y-3 mb-8">
                  {SETUP_INSTALL_PREVIEW.map((item, idx) => (
                    <li
                      key={item.title}
                      className="flex gap-3 rounded-xl border border-slate-100 p-3 setup-reveal-stagger-item"
                      style={{ animationDelay: `${idx * 70}ms` }}
                    >
                      <CheckCircle2 size={18} className="text-teal-600 shrink-0 mt-0.5" aria-hidden />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{item.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={onStartInstall}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 text-base font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-500 transition-all shadow-lg shadow-teal-600/30 hover:shadow-xl hover:shadow-teal-600/40 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Započni instalaciju
                  <Rocket size={20} aria-hidden />
                </button>
                <p className="text-xs text-slate-400 text-center mt-3">
                  Instalacija traje nekoliko minuta · 9 koraka
                </p>
              </div>
            </div>
          </section>
        </SetupRevealSection>
      </div>
    </PremiumAuthLayout>
  );
};
