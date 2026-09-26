import { defineConfig, devices } from '@playwright/test';

/**
 * Os fluxos principais rodam nas 3 combinações exigidas por
 * docs/08-ACESSIBILIDADE.md: (claro, Normal, 390px), (escuro, Grande, 390px) e
 * (contraste, Muito grande, 320px). A largura de 320 é a que quebra layout —
 * por isso ela está aqui desde o começo, e não no fim do projeto.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  // Um pouco mais de folga que o padrão de 5 s: os três projetos rodam juntos e
  // disputam a mesma API.
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.APP_URL ?? 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    {
      name: 'claro-normal-390',
      // Um pouco mais de folga que o padrão de 5 s: os três projetos rodam juntos e
  // disputam a mesma API.
  expect: { timeout: 10_000 },
  use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, colorScheme: 'light' },
    },
    {
      name: 'escuro-grande-390',
      // Um pouco mais de folga que o padrão de 5 s: os três projetos rodam juntos e
  // disputam a mesma API.
  expect: { timeout: 10_000 },
  use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, colorScheme: 'dark' },
    },
    {
      name: 'contraste-muito-grande-320',
      // Um pouco mais de folga que o padrão de 5 s: os três projetos rodam juntos e
  // disputam a mesma API.
  expect: { timeout: 10_000 },
  use: { ...devices['Pixel 7'], viewport: { width: 320, height: 844 } },
    },
  ],
  // Dois servidores: o de desenvolvimento, onde roda quase tudo, e o preview do
  // build, onde o service worker existe de verdade (em dev ele fica desligado
  // de propósito). O e2e de PWA só faz sentido no segundo.
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm build && pnpm exec vite preview --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
