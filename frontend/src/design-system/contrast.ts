/** WCAG 2.2 relative luminance + contrast ratio (pure, dependency free). */
const parseHex = (value: string): [number, number, number] => {
  const raw = value.trim().replace(/^#/u, '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((char) => char + char)
          .join('')
      : raw;
  if (!/^[0-9a-f]{6}$/iu.test(full)) {
    throw new Error(`Not a hex colour: ${value}`);
  }
  return [
    Number.parseInt(full.slice(0, 2), 16) / 255,
    Number.parseInt(full.slice(2, 4), 16) / 255,
    Number.parseInt(full.slice(4, 6), 16) / 255,
  ];
};

const linearize = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

export const relativeLuminance = (hex: string): number => {
  const [r, g, b] = parseHex(hex).map(linearize) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Ratio in the range 1..21, rounded to 2 decimals. */
export const contrastRatio = (first: string, second: string): number => {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
};

export const meetsWcagAA = (
  foreground: string,
  background: string,
  largeText = false,
): boolean => contrastRatio(foreground, background) >= (largeText ? 3 : 4.5);
