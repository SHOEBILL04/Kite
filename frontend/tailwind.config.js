/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        subtle: 'var(--bg-subtle)',
        hover: 'var(--bg-hover)',

        primary: 'var(--text-primary)',
        heading: 'var(--text-heading)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        inverse: 'var(--text-inverse)',

        border: {
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
          focus: 'var(--border-focus)',
        },

        action: {
          primary: 'var(--action-primary)',
          hover: 'var(--action-primary-hover)',
          text: 'var(--action-primary-text)',
        },

        pass: {
          bg: 'var(--status-pass-bg)',
          border: 'var(--status-pass-border)',
          text: 'var(--status-pass-text)',
        },

        warning: {
          bg: 'var(--status-warning-bg)',
          border: 'var(--status-warning-border)',
          text: 'var(--status-warning-text)',
        },

        critical: {
          bg: 'var(--status-critical-bg)',
          border: 'var(--status-critical-border)',
          text: 'var(--status-critical-text)',
        },

        info: {
          bg: 'var(--status-info-bg)',
          border: 'var(--status-info-border)',
          text: 'var(--status-info-text)',
        },

        /* Base Palette Variables */
        'green-950': 'var(--green-950)',
        'green-900': 'var(--green-900)',
        'green-500': 'var(--green-500)',
        'green-200': 'var(--green-200)',
        'green-50': 'var(--green-50)',
        'amber-500': 'var(--amber-500)',
        'red-500': 'var(--red-500)',
        'teal-500': 'var(--teal-500)',
      },
      boxShadow: {
        elevation: 'var(--shadow-elevation)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
