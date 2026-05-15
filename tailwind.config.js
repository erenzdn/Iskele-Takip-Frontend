/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          main: 'var(--color-bg-main)',
          surface: 'var(--color-bg-surface)',
          panel: 'var(--color-bg-panel)',
          sidebar: 'var(--color-bg-sidebar)',
          elevated: 'var(--color-bg-elevated)',
          border: 'var(--color-border)',
          'border-muted': 'var(--color-border-muted)',
          'border-strong': 'var(--color-border-strong)',
          hover: 'var(--color-bg-hover)',
        },
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
        info: 'var(--color-info)',
        purple: 'var(--color-purple)',
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          inverse: 'var(--color-text-inverse)',
        },
        ring: {
          primary: 'var(--color-ring)',
        },
        toast: {
          success: {
            bg: 'var(--color-toast-success-bg)',
            border: 'var(--color-toast-success-border)',
            icon: 'var(--color-toast-success-icon)',
          },
          error: {
            bg: 'var(--color-toast-error-bg)',
            border: 'var(--color-toast-error-border)',
            icon: 'var(--color-toast-error-icon)',
          },
          warning: {
            bg: 'var(--color-toast-warning-bg)',
            border: 'var(--color-toast-warning-border)',
            icon: 'var(--color-toast-warning-icon)',
          },
          info: {
            bg: 'var(--color-toast-info-bg)',
            border: 'var(--color-toast-info-border)',
            icon: 'var(--color-toast-info-icon)',
          },
        },
      },
      borderRadius: {
        panel: '12px',
        button: '8px',
        badge: '12px',
        input: '6px',
      },
      keyframes: {
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateX(100%) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'toast-out': {
          '0%': { opacity: '1', transform: 'translateX(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateX(100%) scale(0.95)' },
        },
      },
      animation: {
        'toast-enter': 'toast-in 0.28s ease-out forwards',
        'toast-exit': 'toast-out 0.28s ease-in forwards',
      },
    },
  },
  plugins: [],
}

