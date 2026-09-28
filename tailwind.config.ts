import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    '*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', ...defaultTheme.fontFamily.sans],
        heading: ['var(--font-oswald)', ...defaultTheme.fontFamily.sans],
        label: ['var(--font-oswald)', ...defaultTheme.fontFamily.sans],
        mono: ['var(--font-geist-mono)', ...defaultTheme.fontFamily.mono],
      },
      // Token Typo Figma, approssimati alla scala Tailwind del progetto.
      fontSize: {
        display: defaultTheme.fontSize['6xl'],
        title: defaultTheme.fontSize['5xl'],
        'section-title': defaultTheme.fontSize['4xl'],
        'body-xl': defaultTheme.fontSize['3xl'],
        'body-lg': defaultTheme.fontSize['2xl'],
        body: defaultTheme.fontSize.lg,
        label: defaultTheme.fontSize.sm,
        caption: defaultTheme.fontSize.xs,
      },
      colors: {
        ds: {
          background: 'hsl(var(--ds-background) / <alpha-value>)',
          'background-second': 'hsl(var(--ds-background-second) / <alpha-value>)',
          cheddar: 'hsl(var(--ds-cheddar) / <alpha-value>)',
          buttons: 'hsl(var(--ds-buttons) / <alpha-value>)',
          confirm: 'hsl(var(--ds-confirm) / <alpha-value>)',
          'text-primary': 'hsl(var(--ds-text-primary) / <alpha-value>)',
          'text-secondary': 'hsl(var(--ds-text-secondary) / <alpha-value>)',
          accent: 'hsl(var(--ds-accent) / <alpha-value>)',
          cards: 'hsl(var(--ds-cards) / <alpha-value>)',
          error: 'hsl(var(--ds-error) / <alpha-value>)',
          'card-border': 'hsl(var(--ds-card-border) / <alpha-value>)',
        },
        offer: {
          surface: 'hsl(var(--offer-surface) / <alpha-value>)',
          section: 'hsl(var(--offer-section) / <alpha-value>)',
          cheddar: 'hsl(var(--offer-cheddar) / <alpha-value>)',
          button: 'hsl(var(--offer-button) / <alpha-value>)',
          badge: 'hsl(var(--offer-badge) / <alpha-value>)',
          foreground: 'hsl(var(--offer-foreground) / <alpha-value>)',
          white: 'hsl(var(--offer-white) / <alpha-value>)',
        },
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
