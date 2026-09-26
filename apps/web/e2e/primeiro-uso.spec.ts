import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Aceite da Fase 2 (docs/11-ROADMAP-E-PROMPTS.md):
 * "criar conta, confirmar e-mail, responder as 5 perguntas e cair no Início
 * com 150 pontos; recuperar senha; teste do fluxo com axe."
 *
 * O código de 6 dígitos não chega por e-mail em desenvolvimento — ele vai para
 * o log da API. Para o teste não depender de ler log, buscamos o código pela
 * própria API, por uma rota que só existe fora de produção.
 */

const SEM_VIOLACOES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function conferirAcessibilidade(pagina: Page, ondeEstou: string): Promise<void> {
  const resultado = await new AxeBuilder({ page: pagina }).withTags(SEM_VIOLACOES).analyze();
  expect(resultado.violations, `violações em ${ondeEstou}`).toEqual([]);
}

/**
 * Rotas de acesso têm limite por IP (login 5/15 min, "esqueci a senha"
 * 3/15 min) e os três projetos do Playwright rodam do mesmo IP. Em
 * desenvolvimento `RATE_LIMIT_TEST_FACTOR` multiplica esses limites; o valor
 * de produção é recusado de ser alterado (apps/api/src/comum/configuracao.ts).
 */

/** E-mail único por execução: o cadastro recusa e-mail repetido, com razão. */
function emailDeTeste(): string {
  return `e2e.${Date.now()}.${Math.floor(Math.random() * 1000)}@exemplo.test`;
}

test.describe('primeiro uso', () => {
  test('as três telas de boas-vindas levam ao cadastro', async ({ page }) => {
    await page.goto('/boas-vindas/1');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Leia a nota');
    await conferirAcessibilidade(page, 'boas-vindas 1');

    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('mais barato');
    await conferirAcessibilidade(page, 'boas-vindas 2');

    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ranking');
    await conferirAcessibilidade(page, 'boas-vindas 3');

    await page.getByRole('button', { name: 'Criar minha conta' }).click();
    await expect(page).toHaveURL(/\/criar-conta$/);
  });

  test('"Pular" leva direto para entrar, sem obrigar a ler tudo', async ({ page }) => {
    await page.goto('/boas-vindas/1');
    await page.getByRole('button', { name: 'Pular' }).click();
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test('o botão de criar conta só libera com os termos aceitos', async ({ page }) => {
    await page.goto('/criar-conta');
    await conferirAcessibilidade(page, 'criar conta');

    const criar = page.getByRole('button', { name: 'Criar conta' });
    await expect(criar).toBeDisabled();
    // E diz por quê, em vez de ficar cinza em silêncio.
    await expect(page.getByText('Aceite os termos para continuar')).toBeVisible();

    await page.getByRole('checkbox').check();
    await expect(criar).toBeEnabled();
  });

  test('cadastro, confirmação e as 5 perguntas terminam com 150 pontos', async ({
    page,
    request,
  }) => {
    const email = emailDeTeste();

    await page.goto('/criar-conta');
    await page.getByLabel('Como podemos te chamar?').fill('Pessoa de Teste');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('Economia2026');
    await page.getByLabel('CEP de onde você faz compras').fill('70750-505');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Criar conta' }).click();

    await expect(page).toHaveURL(/\/confirmar-email$/);
    await expect(page.getByText(email)).toBeVisible();
    await conferirAcessibilidade(page, 'confirmar e-mail');

    // Código pela API (rota só de desenvolvimento), não pelo log.
    const resposta = await request.get(`/v1/dev/codigo?email=${encodeURIComponent(email)}`);
    expect(resposta.ok(), 'a rota de código de desenvolvimento precisa existir').toBeTruthy();
    const { code } = (await resposta.json()) as { code: string };

    await page.getByLabel('Código de verificação').fill(code);
    await page.getByRole('button', { name: 'Confirmar' }).click();

    // Confirmar o e-mail já dá os 50 pontos de boas-vindas e leva ao perfil.
    await expect(page).toHaveURL(/\/perfil-de-consumo/);
    await conferirAcessibilidade(page, 'perfil de consumo');

    const respostas = [
      'Família',
      'Supermercado',
      'Toda semana',
      'De R$ 1.000 a R$ 2.000',
      'Preço mais baixo',
    ];

    for (const [indice, escolha] of respostas.entries()) {
      // Texto puro, nao regex: "De R$ 1.000" tem $ e . como metacaracteres.
      // Radio e checkbox nativos, achados pelo rotulo, como a pessoa faz.
      await page.getByLabel(escolha).first().check();
      const rotulo = indice === respostas.length - 1 ? 'Ver meu perfil' : 'Continuar';
      await page.getByRole('button', { name: rotulo }).click();
    }

    await expect(page).toHaveURL(/\/perfil-de-consumo\/pronto$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Família Planejadora');
    await expect(page.getByText('R$ 1.600,00')).toBeVisible();
    await conferirAcessibilidade(page, 'perfil pronto');

    // 50 (boas-vindas) + 100 (perfil) = 150.
    // `page.request` compartilha os cookies da aba, entao o refresh httpOnly
    // vale aqui; o `request` avulso do Playwright nao veria o cookie.
    const renovado = await page.request.post('/v1/auth/refresh');
    expect(renovado.ok()).toBeTruthy();
    const { access } = (await renovado.json()) as { access: string };

    const eu = await page.request.get('/v1/me', {
      headers: { Authorization: `Bearer ${access}` },
    });
    expect(eu.ok()).toBeTruthy();
    const dados = (await eu.json()) as { pointsTotal: number };
    expect(dados.pointsTotal).toBe(150);
  });
});

test.describe('acesso', () => {
  test('entrar mostra e esconde a senha', async ({ page }) => {
    await page.goto('/entrar');
    await conferirAcessibilidade(page, 'entrar');

    const senha = page.getByLabel('Senha', { exact: true });
    await expect(senha).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Mostrar senha' }).click();
    await expect(senha).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: 'Esconder senha' }).click();
    await expect(senha).toHaveAttribute('type', 'password');
  });

  test('senha errada mostra a mensagem, sem dizer se a conta existe', async ({ page }) => {
    await page.goto('/entrar');
    await page.getByLabel('E-mail').fill('nao.existe@exemplo.test');
    await page.getByLabel('Senha', { exact: true }).fill('SenhaErrada1');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos');
  });

  test('a tela de recuperar senha é acessível nos três temas', async ({ page }) => {
    await page.goto('/recuperar-senha');
    await conferirAcessibilidade(page, 'recuperar senha');
    await expect(
      page.getByText(/Entrou com Google\? Use o botão Google/),
    ).toBeVisible();
  });

  test('recuperar senha nunca revela se o e-mail tem conta', async ({ page }) => {

    await page.goto('/recuperar-senha');
    await page.getByLabel('E-mail da conta').fill('nao.existe@exemplo.test');
    await page.getByRole('button', { name: 'Enviar link' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Confira seu e-mail');
    await expect(page.getByText(/Se existir uma conta/)).toBeVisible();
    await conferirAcessibilidade(page, 'recuperar senha enviado');
  });

  test('a tela do Google é do app, não uma imitação da do Google', async ({ page }) => {
    await page.goto('/entrar/google');
    // Diz o que o app recebe ANTES de mandar para o Google.
    await expect(page.getByText('O GasteMenos vai receber')).toBeVisible();
    await expect(page.getByText('Não temos acesso à sua senha')).toBeVisible();
    await conferirAcessibilidade(page, 'entrar com Google');
  });

  /*
   * Sessão criada **no servidor**, sem nenhum javascript do app ter rodado — é
   * exatamente o que acontece na volta do Google: o callback grava o cookie e
   * redireciona. Este teste existe porque uma otimização para evitar um 401 no
   * console quebrou esse caminho: a marca de "já entrou" ficava em
   * localStorage, escrita pelo javascript, e no login com Google ela nunca
   * existia. A pessoa escolhia a conta e voltava para a tela de login.
   */
  test('sessão criada no servidor é reconhecida ao abrir o app', async ({ page, context }) => {
    const entrou = await context.request.post('/v1/auth/login', {
      data: { email: 'camila.alves@email.com', password: 'Economia2026' },
    });
    expect(entrou.ok()).toBeTruthy();

    const cookies = await context.cookies();
    expect(cookies.map((c) => c.name)).toEqual(expect.arrayContaining(['gm_refresh', 'gm_sessao']));

    await page.goto('/inicio');

    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Olá');
  });

  test('rota protegida manda para o login', async ({ page }) => {
    await page.goto('/inicio');
    await expect(page).toHaveURL(/\/entrar$/);
  });
});
