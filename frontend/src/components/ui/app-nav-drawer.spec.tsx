import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppNavDrawer } from '../app-nav-drawer';

// The real sidebar needs app contexts; the drawer contract (dialog, Escape,
// backdrop, focus) is what this spec protects.
vi.mock('../app-sidebar-nav', () => ({
  AppSidebarNav: () => <div data-testid="sidebar-nav">Navigacija</div>,
}));

const setup = (onClose = vi.fn()) => ({
  onClose,
  ...render(
    <AppNavDrawer
      open
      onClose={onClose}
      onLogout={vi.fn()}
      appName="Evidens"
      appSubtitle="Evidencija"
    />,
  ),
});

describe('AppNavDrawer (F-4/F-6)', () => {
  it('is a modal dialog with an accessible name', () => {
    setup();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('dialog', { name: 'Glavna navigacija' })).toBeInTheDocument();
  });

  it('uses a real labelled button for the backdrop, not a clickable div', () => {
    const { onClose } = setup();
    const backdrop = screen.getAllByRole('button', { name: 'Zatvori navigaciju' })[0];
    expect(backdrop.tagName).toBe('BUTTON');
    expect(backdrop).toHaveAttribute('type', 'button');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('focuses the close button on open', () => {
    setup();
    expect(screen.getAllByRole('button', { name: 'Zatvori navigaciju' })[1]).toHaveFocus();
  });

  it('renders nothing when closed', () => {
    render(
      <AppNavDrawer
        open={false}
        onClose={vi.fn()}
        onLogout={vi.fn()}
        appName="Evidens"
        appSubtitle="Evidencija"
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
