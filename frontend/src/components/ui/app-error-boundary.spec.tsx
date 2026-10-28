import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_RENDER_ERROR_EVENT,
  AppErrorBoundary,
  type AppRenderErrorDetail,
} from './app-error-boundary';

const Boom = ({ crash }: { crash: boolean }): React.ReactNode => {
  if (crash) {
    throw new Error('sensitive internal detail');
  }
  return <p>Stranica radi</p>;
};

const Harness = ({ onError }: { onError?: () => void }) => {
  const [crash, setCrash] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setCrash(false)}>
        Popravi stanje
      </button>
      <AppErrorBoundary onError={onError}>
        <Boom crash={crash} />
      </AppErrorBoundary>
    </>
  );
};

beforeEach(() => {
  // React intentionally logs caught render errors; keep the test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('AppErrorBoundary (F-2)', () => {
  it('contains a render crash in an assertive alert instead of a blank screen', () => {
    render(<Harness />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent('Nešto je pošlo po zlu');
    expect(screen.queryByText('Stranica radi')).not.toBeInTheDocument();
  });

  it('never leaks the raw exception message to the user', () => {
    render(<Harness />);
    expect(screen.queryByText(/sensitive internal detail/u)).not.toBeInTheDocument();
    expect(screen.getByText(/Šifra greške: Error/u)).toBeInTheDocument();
  });

  it('dispatches a PII-free structured signal and calls onError', () => {
    const listener = vi.fn();
    window.addEventListener(APP_RENDER_ERROR_EVENT, listener);
    const onError = vi.fn();
    render(<Harness onError={onError} />);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0][0] as CustomEvent<AppRenderErrorDetail>).detail;
    expect(detail.name).toBe('Error');
    expect(JSON.stringify(detail)).not.toContain('sensitive internal detail');
    window.removeEventListener(APP_RENDER_ERROR_EVENT, listener);
  });

  it('recovers when the underlying error is fixed and the user retries', () => {
    render(<Harness />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Popravi stanje' }));
    fireEvent.click(screen.getByRole('button', { name: /Pokušaj ponovo/u }));
    expect(screen.getByText('Stranica radi')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders children untouched when there is no error', () => {
    render(
      <AppErrorBoundary>
        <p>Sve je u redu</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('Sve je u redu')).toBeInTheDocument();
  });
});
