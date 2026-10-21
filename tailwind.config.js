/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // Consistent robot colours (CLAUDE.md rule 6)
        link1: '#3b82f6',
        link2: '#f97316',
        link3: '#22c55e',
        ee: '#ef4444',
        target: '#eab308',
      },
    },
  },
  plugins: [],
};
