import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from './LoginForm';

const fill = (username = 'adnan', password = 'tajna123') => {
  fireEvent.change(screen.getByLabelText('Korisničko ime'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Lozinka'), { target: { value: password } });
};

describe('LoginForm (redesigned)', () => {
  it('associates both controls with real labels', () => {
    render(<LoginForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Korisničko ime')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Lozinka')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('disables submit until both fields are non-empty', () => {
    render(<LoginForm onSubmit={vi.fn()} />);
    const submit = screen.getByRole('button', { name: 'Prijavi se' });
    expect(submit).toBeDisabled();
    fill('adnan', '');
    expect(submit).toBeDisabled();
    fill('adnan', 'lozinka');
    expect(submit).toBeEnabled();
  });

  it('submits trimmed credentials exactly once', () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);
    fill('  adnan  ', 'lozinka');
    fireEvent.submit(screen.getByRole('button', { name: 'Prijavi se' }).closest('form')!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('adnan', 'lozinka');
  });

  it('announces errors with role=alert and marks the password invalid', () => {
    render(<LoginForm onSubmit={vi.fn()} error="Pogrešna lozinka" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Pogrešna lozinka');
    expect(screen.getByLabelText('Lozinka')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Lozinka')).toHaveAttribute('aria-describedby', alert.id);
  });

  it('does not mark inputs invalid when there is no error', () => {
    render(<LoginForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Lozinka')).not.toHaveAttribute('aria-invalid');
  });

  it('shows a setup success notice as a polite status', () => {
    render(<LoginForm onSubmit={vi.fn()} notice="Postavke su spremljene" />);
    expect(screen.getByRole('status')).toHaveTextContent('Postavke su spremljene');
  });

  it('toggles password visibility with an accessible, pressed button', () => {
    render(<LoginForm onSubmit={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: 'Prikaži lozinku' });
    expect(screen.getByLabelText('Lozinka')).toHaveAttribute('type', 'password');
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Lozinka')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Sakrij lozinku' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('is busy and non-interactive while the request is in flight', () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} isLoading />);
    const submit = screen.getByRole('button', { name: /Prijava…/u });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    fireEvent.submit(submit.closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
