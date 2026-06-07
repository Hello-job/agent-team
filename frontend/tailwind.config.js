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
        base: '#0b0d10',
        surface: '#111317',
        elevated: '#171a1f',
        // Hairline borders — low contrast, never solid black.
        line: 'rgba(255,255,255,0.07)',
        'line-strong': 'rgba(255,255,255,0.12)',
        // Text hierarchy.
        ink: '#e7e9ec',
        'ink-muted': '#9ba1a9',
        'ink-faint': '#646a73',
        // Single accent (cyan-teal). `primary` is retuned in place so every
        // existing `primary-*` utility across the app adopts the new accent.
        // Reads "tech / terminal", glows well on near-black.
        primary: {
          50: '#ecfeff',
          100: '#cef9fd',
          200: '#a2f1f9',
          300: '#67e4f1',
          400: '#2ed3e6',
          500: '#13b6cc',
          600: '#0d93a8',
          700: '#107687',
          800: '#16606e',
          900: '#164e5b',
          950: '#082f3a',
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
