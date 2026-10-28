import type { KeyboardEvent } from 'react';

/** Enter / Space activation for elements that must remain keyboard operable. */
export const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' ';

export const onKeyboardActivate =
  (handler: () => void) =>
  (event: KeyboardEvent<HTMLElement>): void => {
    if (!isActivationKey(event.key)) {
      return;
    }
    event.preventDefault();
    handler();
  };
