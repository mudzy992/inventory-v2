import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button (Evidens Surface primitive)', () => {
  it('defaults to type=button so it can never submit a surrounding form', () => {
    render(<Button>Spremi</Button>);
    expect(screen.getByRole('button', { name: 'Spremi' })).toHaveAttribute('type', 'button');
  });

  it('honours an explicit submit type', () => {
    render(
      <form onSubmit={(event) => event.preventDefault()}>
        <Button type="submit">Prijavi se</Button>
      </form>,
    );
    expect(screen.getByRole('button', { name: 'Prijavi se' })).toHaveAttribute('type', 'submit');
  });

  it('uses semantic brand tokens instead of a hardcoded palette', () => {
    render(<Button>Spremi</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-brand');
    expect(button.className).not.toMatch(/bg-(?:blue|slate|gray)-/u);
  });

  it('sets aria-busy, disables itself and shows a hidden spinner while loading', () => {
    render(<Button loading>Spremi</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('never fires onClick while loading or disabled', () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Spremi</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<Button loading onClick={onClick}>Spremi</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('merges caller className without dropping the variant', () => {
    render(<Button variant="danger" className="w-full">Obriši</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('w-full');
    expect(button.className).toContain('bg-danger-ink');
  });
});
