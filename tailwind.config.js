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
          main: '#0f0f1a',
          panel: '#1a1a2e',
          sidebar: '#16162a',
          border: '#1e1e3a',
          hover: '#2a2a4a',
        },
        primary: '#3b82f6',
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#dc2626',
        info: '#60a5fa',
        purple: '#a855f7',
        text: {
          primary: '#ffffff',
          secondary: '#a0a0a0',
        },
      },
      borderRadius: {
        panel: '12px',
        button: '8px',
        badge: '12px',
        input: '6px',
      },
    },
  },
  plugins: [],
}

