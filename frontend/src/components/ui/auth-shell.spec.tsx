import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthShell } from './auth-shell';

describe('AuthShell', () => {
  it('enables full-page scrolling with body.auth-flow while mounted', () => {
    const { unmount } = render(
      <AuthShell appName="Evidens">
        <p>Forma</p>
      </AuthShell>,
    );
    expect(document.body.classList.contains('auth-flow')).toBe(true);
    unmount();
    expect(document.body.classList.contains('auth-flow')).toBe(false);
  });

  it('provides a labelled main landmark and honest product highlights', () => {
    render(
      <AuthShell appName="Evidens" appSubtitle="Evidencija opreme">
        <p>Forma</p>
      </AuthShell>,
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByText(/Jedno mjesto za opremu/u)).toBeInTheDocument();
    expect(screen.getByText('Forma')).toBeInTheDocument();
  });

  it('accepts custom highlights without inventing metrics', () => {
    render(
      <AuthShell highlights={['Prva stavka']}>
        <p>Forma</p>
      </AuthShell>,
    );
    expect(screen.getByText('Prva stavka')).toBeInTheDocument();
    expect(screen.queryByText(/Jedno mjesto za opremu/u)).not.toBeInTheDocument();
  });
});
