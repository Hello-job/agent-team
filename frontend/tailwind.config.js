export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Native, premium, zero-network on macOS. No web-font round-trip.
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Inter"',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          '"SF Mono"',
          '"JetBrains Mono"',
          'Menlo',
          'monospace',
        ],
        // Legacy keys kept so any not-yet-migrated page still compiles; they
        // fall back to system fonts (the pixel webfont link is removed).
        pixel: ['"Pixelify Sans"', 'system-ui', 'sans-serif'],
        press: ['"Press Start 2P"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Surfaces — calm, near-black, one step of elevation at a time.
        base: 'rgb(var(--color-base) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        elevated: 'rgb(var(--color-elevated) / <alpha-value>)',
        sidebar: 'rgb(var(--color-sidebar) / <alpha-value>)',
        // Hairline borders — low contrast, never solid black.
        line: 'var(--color-line)',
        'line-strong': 'var(--color-line-strong)',
        // Text hierarchy.
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--color-ink-muted) / <alpha-value>)',
        'ink-faint': 'rgb(var(--color-ink-faint) / <alpha-value>)',
        // Single accent (cyan-teal). `primary` is retuned in place so every
        // existing `primary-*` utility across the app adopts the new accent.
        // Reads "tech / terminal", glows well on near-black.
        primary: {
          50: 'rgb(var(--primary-50) / <alpha-value>)',
          100: 'rgb(var(--primary-100) / <alpha-value>)',
          200: 'rgb(var(--primary-200) / <alpha-value>)',
          300: 'rgb(var(--primary-300) / <alpha-value>)',
          400: 'rgb(var(--primary-400) / <alpha-value>)',
          500: 'rgb(var(--primary-500) / <alpha-value>)',
          600: 'rgb(var(--primary-600) / <alpha-value>)',
          700: 'rgb(var(--primary-700) / <alpha-value>)',
          800: 'rgb(var(--primary-800) / <alpha-value>)',
          900: 'rgb(var(--primary-900) / <alpha-value>)',
          950: 'rgb(var(--primary-950) / <alpha-value>)',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.35), 0 12px 32px rgba(0,0,0,0.28)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.21, 0.6, 0.35, 1) both',
      },
    },
  },
  plugins: [],
}
