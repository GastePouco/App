import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Aceite da Fase 7 (docs/11-ROADMAP-E-PROMPTS.md): perfil, ajustes, ajuda e
 * central de notificações, com axe em cada tela.
 *
 * Tudo acontece em **um** teste por projeto do Playwright. Não é economia de
 * linhas: cada teste com sessão precisa criar uma conta, e criar conta tem
 * limite por IP — três projetos × um teste cada já é o suficiente para o
 * limite real de produção começar a recusar.
 */

const SEM_VIOLACOES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function conferirAcessibilidade(pagina: Page, ondeEstou: string): Promise<void> {
  const resultado = await new AxeBuilder({ page: pagina }).withTags(SEM_VIOLACOES).analyze();
  expect(resultado.violations, `violações em ${ondeEstou}`).toEqual([]);
}

/** Cria a conta pela interface e confirma o e-mail. Devolve com sessão aberta. */
async function entrarComContaNova(pagina: Page, requisicao: APIRequestContext): Promise<void> {
  const email = `e2e.conta.${Date.now()}.${Math.floor(Math.random() * 1000)}@exemplo.test`;

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

test('perfil, ajustes, ajuda e notificações', async ({ page, request }) => {
  await entrarComContaNova(page, request);

  // ------------------------------------------------------------- perfil
  await page.goto('/perfil');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Meu perfil');
  await conferirAcessibilidade(page, 'perfil');

  // -------------------------------------------------------- acessibilidade
  await page.getByRole('link', { name: /Acessibilidade/ }).click();
  await expect(page).toHaveURL(/\/perfil\/acessibilidade$/);

  // A letra cresce no toque, sem esperar a rede.
  await page.getByRole('button', { name: 'Muito grande' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'muito-grande');
  await conferirAcessibilidade(page, 'acessibilidade');

  // E a escolha sobrevive à navegação, porque foi salva no servidor.
  await page.goto('/perfil');
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'muito-grande');
  await page.goto('/perfil/acessibilidade');
  await page.getByRole('button', { name: 'Normal', exact: true }).click();

  // ------------------------------------------------------------- dados
  await page.goto('/perfil/dados');
  // Timeout maior de propósito: com os três projetos em paralelo, a primeira
  // carga de /me disputa a API com as outras execuções.
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Pessoa de Teste', {
    timeout: 15_000,
  });
  // Salvar só acende com alteração.
  await expect(page.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  await page.getByLabel('Nome no ranking').fill('Pessoa Econômica');
  await expect(page.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled();
  await conferirAcessibilidade(page, 'dados pessoais');

  // --------------------------------------------------------- notificações
  await page.goto('/perfil/notificacoes');
  const patrocinadas = page.getByRole('switch', { name: /Ofertas patrocinadas/ });
  // Conteúdo pago por notificação começa desligado, sempre.
  await expect(patrocinadas).toHaveAttribute('aria-checked', 'false');
  await conferirAcessibilidade(page, 'ajustes de notificação');

  // ---------------------------------------------------------- privacidade
  await page.goto('/perfil/privacidade');
  await expect(page.getByRole('switch', { name: /Compartilhar dados agregados/ })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await conferirAcessibilidade(page, 'privacidade');

  // ------------------------------------------------------------ segurança
  await page.goto('/perfil/seguranca');
  await expect(page.getByText('E-mail e senha')).toBeVisible();
  await conferirAcessibilidade(page, 'segurança');

  await page.goto('/perfil/seguranca/senha');
  const salvarSenha = page.getByRole('button', { name: 'Salvar nova senha' });
  await expect(salvarSenha).toBeDisabled();
  await page.getByLabel('Nova senha', { exact: true }).fill('NovaSenha2026');
  await page.getByLabel('Repita a nova senha').fill('NovaSenha2026');
  await expect(salvarSenha).toBeEnabled();
  await conferirAcessibilidade(page, 'alterar senha');

  // -------------------------------------------------------------- pausar
  await page.goto('/perfil/pausar');
  await expect(page.getByRole('button', { name: '1 semana' })).toBeVisible();
  await conferirAcessibilidade(page, 'pausar conta');

  // ------------------------------------------------------------ encerrar
  await page.goto('/perfil/encerrar');
  const encerrar = page.getByRole('button', { name: 'Encerrar minha conta' });
  await expect(encerrar).toBeDisabled();
  // A alternativa de pausar aparece antes do formulário.
  await expect(page.getByRole('link', { name: /Pausar em vez de encerrar/ })).toBeVisible();
  await page.getByLabel('Digite ENCERRAR para confirmar').fill('encerrar');
  await expect(encerrar, 'minúscula não confirma').toBeDisabled();
  await page.getByLabel('Digite ENCERRAR para confirmar').fill('ENCERRAR');
  await expect(encerrar).toBeEnabled();
  await conferirAcessibilidade(page, 'encerrar conta');

  // -------------------------------------------------------------- ajuda
  await page.goto('/ajuda');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ajuda');
  await expect(page.getByRole('button', { name: /A nota não lê/ })).toBeVisible();

  // A pergunta abre e fecha, e o estado vai em aria-expanded.
  const primeira = page.getByRole('button', { name: /A nota não lê/ });
  await expect(primeira).toHaveAttribute('aria-expanded', 'false');
  await primeira.click();
  await expect(primeira).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText(/Limpe a câmera/)).toBeVisible();
  await conferirAcessibilidade(page, 'ajuda');

  // A busca atravessa os tópicos: "pausar" está em Conta e privacidade, e a
  // pessoa acha sem saber disso.
  await page.getByLabel('Buscar na ajuda').fill('pausar');
  await expect(page.getByRole('button', { name: /pausar e encerrar/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /A nota não lê/ })).toBeHidden();

  await page.getByLabel('Buscar na ajuda').fill('xilofone');
  await expect(page.getByText('Não achamos nada com esse termo.')).toBeVisible();
  await conferirAcessibilidade(page, 'ajuda sem resultado');

  // ------------------------------------------- central de notificações
  await page.goto('/notificacoes');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Notificações');
  await expect(page.getByText('Nada por aqui ainda.')).toBeVisible();
  await conferirAcessibilidade(page, 'central de notificações');

  await page.getByRole('button', { name: 'Preços' }).click();
  await expect(page.getByRole('button', { name: 'Preços' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
