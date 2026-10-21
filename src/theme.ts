/**
 * Design-system colours for canvas, SVG and three.js drawing.
 * The same values are defined as CSS variables in index.css and as Tailwind tokens.
 */
export const theme = {
  paper: '#F4F1EA',
  sidebar: '#EFEBE3',
  card: '#FFFFFF',
  line: '#E6E1D6',
  ink: '#1C1B19',
  muted: '#8A857A',
  field: '#FBFAF7',
  grid: '#E8E4DA',
  gridStrong: '#D9D3C6',
  cobalt: '#2F5FD0',
  tomato: '#E5533D',
  mustard: '#F2B33D',
  mustardInk: '#A8740F',
  leaf: '#3F9B57',
  teal: '#1F8A8A',
  brown: '#8B5E3C',
  stone: '#6B665C',
} as const;

/** Robot link colours in order (link 1 … 4). */
export const LINK_COLORS = [theme.cobalt, theme.tomato, theme.leaf, theme.mustard] as const;
/** End-effector / tool marker. */
export const EE_COLOR = theme.ink;
/** Target marker. */
export const TARGET_COLOR = theme.mustard;
/** Categorical series palette for plots and clusters. */
export const SERIES = [theme.cobalt, theme.tomato, theme.leaf, theme.mustard, theme.teal, theme.brown, theme.stone, theme.ink] as const;

export const rgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};
