/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          dark: '#0a0e17',
          card: '#111827',
          surface: '#1e293b',
          border: '#1e3a5f',
          primary: '#e2e8f0',
          muted: '#94a3b8',
        },
        accent: {
          'cyber-green': '#10b981',
          'cyber-red': '#ef4444',
          'cyber-amber': '#f59e0b',
        },
        canvas: {
          DEFAULT: '#FAFAFA',
          subtle: '#F4F4F5',
          card: '#FFFFFF',
          raised: '#FFFFFF',
          inset: '#F8F9FA',
          border: '#E4E4E7',
          'border-subtle': '#EAEAEA',
          'border-strong': '#D4D4D8',
        },
        ash: {
          900: '#111113',
          800: '#18181B',
          700: '#27272A',
          600: '#3F3F46',
          500: '#52525B',
          400: '#71717A',
          300: '#A1A1AA',
          200: '#E4E4E7',
          100: '#F4F4F5',
        },
        brand: {
          orange: '#FF5500',
          'orange-hover': '#E64D00',
          'orange-active': '#CC4400',
          'orange-light': '#FFF4EE',
          'orange-border': '#FED7AA',
          'orange-ring': 'rgba(255, 85, 0, 0.25)',
        },
        // Muted semantic pastels for status
        status: {
          safe: '#F0FDF4',
          'safe-border': '#BBF7D0',
          'safe-text': '#15803D',
          alert: '#FEF2F2',
          'alert-border': '#FECACA',
          'alert-text': '#B91C1C',
          warning: '#FFFBEB',
          'warning-border': '#FDE68A',
          'warning-text': '#B45309',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
        sans: ['Plus Jakarta Sans', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      boxShadow: {
        'subtle': '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.02)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.03), 0 2px 4px -2px rgba(0, 0, 0, 0.02)',
        'orange-glow': '0 0 20px -3px rgba(255, 85, 0, 0.22)',
        'alert-glow': '0 0 20px -3px rgba(239, 68, 68, 0.25)',
      },
      animation: {
        'pulse-subtle': 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fall': 'node-fall 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'node-fall': {
          '0%': { transform: 'scale(1)' },
          '20%': { transform: 'scale(1.03) translateY(-2px)' },
          '50%': { transform: 'scale(0.97) translateY(2px)' },
          '100%': { transform: 'scale(1) translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
