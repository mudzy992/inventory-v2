import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UserMenu } from './user-menu';

const renderMenu = (onLogout = vi.fn()) => {
  const result = render(
    <MemoryRouter>
      <UserMenu
        initials="AM"
        name="Adnan Mujić"
        email="adnan@example.ba"
        title="Referent"
        roleLabel="Administrator"
        isAdmin
        myEquipmentPath="/my-equipment"
        onLogout={onLogout}
      />
    </MemoryRouter>,
  );
  return { ...result, onLogout, trigger: screen.getByRole('button', { name: /Korisnički meni/u }) };
};

describe('UserMenu (F-6)', () => {
  it('exposes correct menu semantics and starts collapsed', () => {
    const { trigger } = renderMenu();
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens on click with aria-expanded and shows identity + role', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Korisnički meni' })).toBeInTheDocument();
    expect(screen.getByText('Adnan Mujić')).toBeInTheDocument();
    expect(screen.getByText('adnan@example.ba')).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
  });

  it('opens with ArrowDown for keyboard users', () => {
    const { trigger } = renderMenu();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on Escape and returns focus to the trigger', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('closes when the user clicks outside the menu', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('navigates to My equipment via a real link and closes', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /Korisnički meni/u }));
    const link = screen.getByRole('menuitem', { name: /Moja oprema/u });
    expect(link).toHaveAttribute('href', '/my-equipment');
    fireEvent.click(link);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('logs out once and closes the menu', () => {
    const { onLogout } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /Korisnički meni/u }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Odjavi se/u }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('never renders an unlabelled full-screen overlay button', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /Korisnički meni/u }));
    const buttons = screen.getAllByRole('button');
    for (const button of buttons) expect(button).toHaveAccessibleName();
  });
});
