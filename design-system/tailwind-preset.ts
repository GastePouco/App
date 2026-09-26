// Gerado de design-system/tokens.json. Não edite à mão: rode o script de tokens.
// Uso: presets: [require('@gastemenos/tokens/tailwind-preset')] e importe tokens.css no app.
import type { Config } from 'tailwindcss';

const preset: Partial<Config> = {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    colors: {
      "surface": 'var(--surface)',
      "surface-raised": 'var(--surface-raised)',
      "surface-sunken": 'var(--surface-sunken)',
      "line": 'var(--line)',
      "line-strong": 'var(--line-strong)',
      "ink": 'var(--ink)',
      "ink-muted": 'var(--ink-muted)',
      "brand": 'var(--brand)',
      "on-brand": 'var(--on-brand)',
      "brand-soft": 'var(--brand-soft)',
      "lime": 'var(--lime)',
      "points": 'var(--points)',
      "points-ink": 'var(--points-ink)',
      "points-soft": 'var(--points-soft)',
      "on-points": 'var(--on-points)',
      "offer": 'var(--offer)',
      "offer-ink": 'var(--offer-ink)',
      "offer-soft": 'var(--offer-soft)',
      "success": 'var(--success)',
      "danger": 'var(--danger)',
      "on-danger": 'var(--on-danger)',
      "focus": 'var(--focus)',
      "scrim": 'var(--scrim)',
      "camera": 'var(--camera)',
      "on-camera": 'var(--on-camera)',
      "chart-1": 'var(--chart-1)',
      "chart-2": 'var(--chart-2)',
      "chart-3": 'var(--chart-3)',
      "chart-4": 'var(--chart-4)',
      "chart-5": 'var(--chart-5)',
      transparent: 'transparent',
      current: 'currentColor',
    },
    spacing: { 0: '0px', px: '1px', ...{"1": 'var(--space-1)', "2": 'var(--space-2)', "3": 'var(--space-3)', "4": 'var(--space-4)', "5": 'var(--space-5)', "6": 'var(--space-6)', "8": 'var(--space-8)', "10": 'var(--space-10)'} },
    borderRadius: { none: '0px', ...{"s": 'var(--radius-s)', "m": 'var(--radius-m)', "l": 'var(--radius-l)', "xl": 'var(--radius-xl)', "pill": 'var(--radius-pill)'} },
    boxShadow: { none: 'none', ...{"fab": 'var(--shadow-fab)', "pop": 'var(--shadow-pop)'} },
    fontFamily: { display: ['var(--font-display)'], body: ['var(--font-body)'] },
    fontSize: {
      "money-xl": [
            "2.875rem",
            {
                  "lineHeight": "3rem",
                  "fontWeight": "800",
                  "letterSpacing": "-0.03em"
            }
      ],
      "title-xl": [
            "2rem",
            {
                  "lineHeight": "2.25rem",
                  "fontWeight": "800",
                  "letterSpacing": "-0.02em"
            }
      ],
      "title-l": [
            "1.75rem",
            {
                  "lineHeight": "2rem",
                  "fontWeight": "800",
                  "letterSpacing": "-0.02em"
            }
      ],
      "title-m": [
            "1.375rem",
            {
                  "lineHeight": "1.75rem",
                  "fontWeight": "800",
                  "letterSpacing": "-0.01em"
            }
      ],
      "title-s": [
            "1.125rem",
            {
                  "lineHeight": "1.5rem",
                  "fontWeight": "800",
                  "letterSpacing": "-0.01em"
            }
      ],
      "body-l": [
            "1rem",
            {
                  "lineHeight": "1.5rem",
                  "fontWeight": "400"
            }
      ],
      "body-m": [
            "0.9375rem",
            {
                  "lineHeight": "1.375rem",
                  "fontWeight": "500"
            }
      ],
      "body-s": [
            "0.875rem",
            {
                  "lineHeight": "1.25rem",
                  "fontWeight": "400"
            }
      ],
      "label": [
            "0.8125rem",
            {
                  "lineHeight": "1.125rem",
                  "fontWeight": "700"
            }
      ],
      "caption": [
            "0.8125rem",
            {
                  "lineHeight": "1.125rem",
                  "fontWeight": "400"
            }
      ],
      "overline": [
            "0.8125rem",
            {
                  "lineHeight": "1rem",
                  "fontWeight": "800",
                  "letterSpacing": "0.08em"
            }
      ],
      "easy-title": [
            "1.875rem",
            {
                  "lineHeight": "2.25rem",
                  "fontWeight": "800"
            }
      ],
      "easy-action": [
            "1.25rem",
            {
                  "lineHeight": "1.625rem",
                  "fontWeight": "800"
            }
      ],
      "easy-body": [
            "1.188rem",
            {
                  "lineHeight": "1.75rem",
                  "fontWeight": "400"
            }
      ]
},
    extend: {
      minHeight: { touch: 'var(--touch-min)', button: 'var(--button-h)', easy: 'var(--easy-button-h)', field: 'var(--field-h)' },
      minWidth: { touch: 'var(--touch-min)' },
      height: { nav: 'var(--nav-h)', fab: 'var(--fab)' },
      width: { fab: 'var(--fab)' },
    },
  },
};

export default preset;
