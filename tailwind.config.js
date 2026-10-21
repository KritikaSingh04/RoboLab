/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        heading: ['"Inter Tight"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        pixel: ['Silkscreen', '"IBM Plex Mono"', 'monospace'],
      },
      colors: {
        paper: 'rgb(var(--paper-rgb) / <alpha-value>)',
        sidebar: 'rgb(var(--sidebar-rgb) / <alpha-value>)',
        card: 'rgb(var(--card-rgb) / <alpha-value>)',
        line: 'rgb(var(--line-rgb) / <alpha-value>)',
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
        field: 'rgb(var(--field-rgb) / <alpha-value>)',
        grid: 'rgb(var(--grid-rgb) / <alpha-value>)',
        cobalt: 'rgb(var(--cobalt-rgb) / <alpha-value>)',
        tomato: 'rgb(var(--tomato-rgb) / <alpha-value>)',
        mustard: 'rgb(var(--mustard-rgb) / <alpha-value>)',
        mustardInk: 'rgb(var(--mustard-ink-rgb) / <alpha-value>)',
        leaf: 'rgb(var(--leaf-rgb) / <alpha-value>)',
        teal: 'rgb(var(--teal-rgb) / <alpha-value>)',
        // robot colours (CLAUDE.md rule 6)
        link1: 'rgb(var(--cobalt-rgb) / <alpha-value>)',
        link2: 'rgb(var(--tomato-rgb) / <alpha-value>)',
        link3: 'rgb(var(--leaf-rgb) / <alpha-value>)',
        ee: 'rgb(var(--ink-rgb) / <alpha-value>)',
        target: 'rgb(var(--mustard-rgb) / <alpha-value>)',
      },
      borderRadius: { card: '14px' },
      boxShadow: { card: '0 1px 2px rgba(28, 27, 25, 0.04), 0 4px 14px rgba(28, 27, 25, 0.05)', lift: '0 2px 4px rgba(28, 27, 25, 0.05), 0 10px 24px rgba(28, 27, 25, 0.08)' },
    },
  },
  plugins: [],
};
