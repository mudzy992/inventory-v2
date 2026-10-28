import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppLoadingScreen } from './app-loading-screen';

describe('AppLoadingScreen', () => {
  it('announces loading politely to assistive technology', () => {
    render(<AppLoadingScreen />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Učitavanje…');
  });

  it('supports a contextual label and detail', () => {
    render(<AppLoadingScreen label="Učitavanje podataka…" detail="Priprema okruženja" />);
    expect(screen.getByText('Učitavanje podataka…')).toBeInTheDocument();
    expect(screen.getByText('Priprema okruženja')).toBeInTheDocument();
  });
});
