import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Aceite da Fase 8: **todas** as rotas passam por axe, nas três combinações de
 * tema, tamanho de texto e largura que `docs/08-ACESSIBILIDADE.md` exige.
 *
 * Os outros arquivos de e2e já cobrem fluxo — este cobre superfície. São coisas
 * diferentes: um fluxo passa por dez telas e deixa vinte de fora, e é
 * justamente na tela que ninguém percorre que a violação fica.
 *
 * Um teste por projeto do Playwright, percorrendo a lista inteira: criar conta
 * tem limite por IP, e três projetos × vinte rotas seria abuso do próprio
 * limite que a gente escreveu.
 */

const SEM_VIOLACOES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Rotas sem sessão. */
const PUBLICAS = [
  '/boas-vindas/1',
  '/boas-vindas/2',
  '/boas-vindas/3',
  '/criar-conta',
  '/entrar',
  '/entrar/google',
  '/recuperar-senha',
];

/** Rotas com sessão. O `:id` sai de dados criados no caminho. */
const PRIVADAS = [
  '/inicio',
  '/gastos',
  '/lista',
  '/ofertas',
  '/ranking',
  '/conquistas',
  '/compartilhar',
  '/notificacoes',
  '/ajuda',
  '/ler-nota',
  '/perfil',
  '/perfil/dados',
  '/perfil/seguranca',
  '/perfil/seguranca/senha',
  '/perfil/notificacoes',
  '/perfil/privacidade',
  '/perfil/acessibilidade',
  '/perfil/pausar',
  '/perfil/encerrar',
  '/perfil-de-consumo',
];

async function conferir(pagina: Page, rota: string): Promise<void> {
  const resultado = await new AxeBuilder({ page: pagina }).withTags(SEM_VIOLACOES).analyze();

  const resumo = resultado.violations.map(
    (v) => `${v.id} (${v.nodes.length}): ${v.help}\n    ${v.nodes[0]?.html?.slice(0, 120) ?? ''}`,
  );

  expect(resumo, `violações em ${rota}`).toEqual([]);
}

async function entrarComContaNova(pagina: Page, requisicao: APIRequestContext): Promise<void> {
  const email = `e2e.a11y.${Date.now()}.${Math.floor(Math.random() * 1000)}@exemplo.test`;

  await pagina.goto('/criar-conta');
  await pagina.getByLabel('Como podemos te chamar?').fill('Pessoa de Teste');
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByLabel('Senha', { exact: true }).fill('Economia2026');
  await pagina.getByLabel('CEP de onde você faz compras').fill('70750-505');
  await pagina.getByRole('checkbox').check();
  await pagina.getByRole('button', { name: 'Criar conta' }).click();

  await expect(pagina).toHaveURL(/\/confirmar-email$/);

  const resposta = await requisicao.get(`/v1/dev/codigo?email=${encodeURIComponent(email)}`);
  const { code } = (await resposta.json()) as { code: string };

  await pagina.getByLabel('Código de verificação').fill(code);
  await pagina.getByRole('button', { name: 'Confirmar' }).click();
  await expect(pagina).toHaveURL(/\/perfil-de-consumo/);
}

test('todas as rotas passam por axe', async ({ page, request }) => {
  // Vinte e sete rotas, três projetos em paralelo: o teto padrão não dá conta.
  test.setTimeout(240_000);

  for (const rota of PUBLICAS) {
    await page.goto(rota);
    await conferir(page, rota);
  }

  await entrarComContaNova(page, request);

  for (const rota of PRIVADAS) {
    await page.goto(rota);
    // Espera o título aparecer, não `networkidle`: com service worker e
    // consultas em segundo plano, a rede quase nunca fica ociosa — e medir axe
    // numa tela ainda em branco não prova nada.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await conferir(page, rota);
  }
});

test('a tela de conferência do design system não tem violação', async ({ page }) => {
  await page.goto('/dev/ui');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  await conferir(page, '/dev/ui');
});
