import { describe, expect, it } from 'vitest';
import { getRoleBadgeClass, getRoleLabel } from './role-display.util';

describe('role display', () => {
  it('translates every backend role into Bosnian', () => {
    expect(getRoleLabel('admin')).toBe('Administrator');
    expect(getRoleLabel('popis_koordinator')).toBe('Koordinator popisa');
    expect(getRoleLabel('unknown')).toBe('Korisnik');
  });

  it('role badges use light surfaces with an inset ring (no dark-background fill)', () => {
    for (const role of ['admin', 'moderator', 'evidenticar', 'skladistar', 'user']) {
      const classes = getRoleBadgeClass(role);
      expect(classes).toContain('ring-1');
      expect(classes).not.toMatch(/bg-(?:amber|orange|purple|indigo|teal|gray)-500/u);
    }
  });
});
