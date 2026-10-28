import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders neutral by default with a ring, not a flat fill', () => {
    render(<Badge>Status</Badge>);
    expect(screen.getByText('Status').className).toContain('ring-1');
    expect(screen.getByText('Status').className).toContain('bg-subtle');
  });

  it('maps each tone to a semantic class', () => {
    for (const [tone, expected] of [
      ['info', 'bg-brand-soft'],
      ['success', 'text-success-ink'],
      ['warning', 'text-warning-ink'],
      ['danger', 'text-danger-ink'],
    ] as const) {
      const { unmount } = render(<Badge tone={tone}>{tone}</Badge>);
      expect(screen.getByText(tone).className).toContain(expected);
      unmount();
    }
  });
});
