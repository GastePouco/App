import type { Config } from 'tailwindcss';
import preset from '@gastemenos/tokens/tailwind-preset';

/** Mesmo preset do app: o painel é o mesmo design system, sem tema próprio. */
export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
} satisfies Config;
