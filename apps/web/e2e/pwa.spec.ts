import { expect, test } from '@playwright/test';

/**
 * PWA: instalável e útil sem rede.
 *
 * O Lighthouse 12 **removeu a categoria PWA** — os audits de "installable" não
 * existem mais, então "Lighthouse PWA 100" virou um critério que nenhuma
 * ferramenta emite. O que importava continua importando, e é o que este arquivo
 * mede diretamente: manifest com o que a instalação exige, service worker no ar
 * e o app abrindo com a rede desligada.
 *
 * Roda contra o **build de produção** em `:4173`, não contra o servidor de
 * desenvolvimento: `devOptions.enabled: false` no vite.config desliga o service
 * worker em desenvolvimento, de propósito — SW no dev serve cache velho e faz
 * perder tempo procurando bug que não existe.
 */

const PREVIEW = 'http://127.0.0.1:4173';

test.use({ baseURL: PREVIEW });

test('o manifest tem o que a instalação exige', async ({ page }) => {
  const resposta = await page.request.get(`${PREVIEW}/manifest.webmanifest`);
  expect(resposta.ok()).toBeTruthy();

  const manifest = (await resposta.json()) as {
    name: string;
    short_name: string;
    start_url: string;
    display: string;
    icons: Array<{ sizes: string; purpose?: string; src: string }>;
  };

  expect(manifest.name).toBe('GasteMenos');
  expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  expect(manifest.start_url).toBe('/');
  expect(manifest.display).toBe('standalone');

  // 192 e 512 são o mínimo do Android; maskable é o que evita o ícone
  // aparecer dentro de um quadrado branco na tela inicial.
  const tamanhos = manifest.icons.map((i) => i.sizes);
  expect(tamanhos).toContain('192x192');
  expect(tamanhos).toContain('512x512');
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);

  for (const icone of manifest.icons) {
    const arquivo = await page.request.get(`${PREVIEW}/${icone.src}`);
    expect(arquivo.ok(), `ícone ${icone.src} precisa existir`).toBeTruthy();
    expect(Number(arquivo.headers()['content-length'] ?? 0)).toBeGreaterThan(500);
  }
});

test('o service worker registra e o app abre sem rede', async ({ page, context }) => {
  await page.goto('/boas-vindas/1');

  await page.waitForFunction(async () => {
    const registro = await navigator.serviceWorker.getRegistration();
    return Boolean(registro?.active);
  }, null, { timeout: 20_000 });

  // Espera o precache terminar antes de cortar a rede: cortar no meio testaria
  // a corrida, não o offline.
  await page.waitForTimeout(1500);

  await context.setOffline(true);
  try {
    await page.reload();

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Leia a nota');
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('sem rede, a faixa avisa em vez de deixar a tela quebrada', async ({ page, context }) => {
  await page.goto('/entrar');
  await page.waitForFunction(async () => Boolean(await navigator.serviceWorker.getRegistration()), null, {
    timeout: 20_000,
  });

  await context.setOffline(true);
  try {
    // O evento é o que o app escuta; `setOffline` sozinho não o dispara.
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    await expect(page.getByText('Sem internet. Mostrando o que já estava salvo.')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
