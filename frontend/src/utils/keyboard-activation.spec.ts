import { describe, expect, it, vi } from 'vitest';
import type { KeyboardEvent } from 'react';
import { isActivationKey, onKeyboardActivate } from './keyboard-activation';

const event = (key: string) =>
  ({ key, preventDefault: vi.fn() }) as unknown as KeyboardEvent<HTMLElement>;

describe('keyboard activation helper (a11y gate companion)', () => {
  it('accepts Enter and Space only', () => {
    expect(isActivationKey('Enter')).toBe(true);
    expect(isActivationKey(' ')).toBe(true);
    for (const key of ['Escape', 'Tab', 'ArrowDown', 'e', '']) {
      expect(isActivationKey(key)).toBe(false);
    }
  });

  it('prevents the default scroll on Space before invoking the handler', () => {
    const handler = vi.fn();
    const keyboardEvent = event(' ');
    onKeyboardActivate(handler)(keyboardEvent);
    expect(keyboardEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores unrelated keys without calling the handler', () => {
    const handler = vi.fn();
    const keyboardEvent = event('Escape');
    onKeyboardActivate(handler)(keyboardEvent);
    expect(keyboardEvent.preventDefault).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('works with Enter as well', () => {
    const handler = vi.fn();
    onKeyboardActivate(handler)(event('Enter'));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
