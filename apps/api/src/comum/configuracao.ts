import { Logger } from '@nestjs/common';
import { RECOMPENSA_PADRAO, type RegraDaRecompensa } from '@gastemenos/shared';

/**
 * Configuração lida do ambiente, conferida uma vez na subida.
 *
 * Segredo faltando é erro de implantação, não de requisição: melhor o processo
 * não subir do que subir e assinar tokens com "undefined". Em produção isto
 * derruba o boot; em desenvolvimento avisa e usa um valor local.
 */
const logger = new Logger('Configuração');

function obrigatorio(nome: string, padraoDeDesenvolvimento?: string): string {
  const valor = process.env[nome];
  if (valor) return valor;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`A variável de ambiente ${nome} é obrigatória em produção.`);
  }

  if (padraoDeDesenvolvimento) {
    logger.warn(`${nome} não definida; usando valor local só para desenvolvimento.`);
    return padraoDeDesenvolvimento;
  }

  throw new Error(`A variável de ambiente ${nome} é obrigatória.`);
}

/**
 * Inteiro positivo lido do ambiente.
 *
 * Valor inválido (letra, negativo, zero) cai no padrão e **avisa**: um teto
 * mensal que virou `NaN` silenciosamente pagaria recompensa sem limite.
 */
function inteiroPositivo(nome: string, padrao: number): number {
  const bruto = process.env[nome];
  if (!bruto) return padrao;

  const valor = Number(bruto);
  if (!Number.isInteger(valor) || valor <= 0) {
    logger.warn(`${nome}="${bruto}" não é inteiro positivo; usando ${padrao}.`);
    return padrao;
  }
  return valor;
}

export const configuracao = {
  ambiente: process.env.NODE_ENV ?? 'development',
  get ehProducao(): boolean {
    return this.ambiente === 'production';
  },
  enderecoDoApp: process.env.APP_URL ?? 'http://127.0.0.1:5173',

  jwt: {
    get segredo(): string {
      return obrigatorio('JWT_SECRET', 'segredo-local-de-desenvolvimento-32+');
    },
    get segredoDeRefresh(): string {
      return obrigatorio('JWT_REFRESH_SECRET', 'refresh-local-de-desenvolvimento-32+');
    },
    /** Curto de propósito: o refresh rotativo é quem mantém a sessão viva. */
    validadeDoAcesso: '15m',
    validadeDoRefreshEmDias: 30,
  },

  get segredoDoHashDeUsuario(): string {
    return obrigatorio('USER_HASH_SECRET', 'hash-local-de-desenvolvimento');
  },

  /**
   * Segredo do hash do CPF — **separado** do hash de usuário, de propósito.
   *
   * O espaço de CPFs válidos é pequeno (cerca de 10^9): com o segredo na mão,
   * qualquer hash volta a ser CPF por força bruta em pouco tempo. Então o
   * segredo é o que protege o dado, e ele não pode ser o mesmo que protege as
   * observações de preço: vazar um não pode custar os dois.
   *
   * Ele mora fora do banco (variável de ambiente / gerenciador de segredos).
   * Trocá-lo invalida os CPFs já vinculados — as pessoas precisariam vincular
   * de novo (docs/09-SEGURANCA-LGPD.md).
   */
  get segredoDoHashDeCpf(): string {
    return obrigatorio('CPF_HASH_SECRET', 'cpf-local-de-desenvolvimento');
  },

  /**
   * Multiplicador dos limites de requisição, só para a suíte automatizada.
   *
   * Os três projetos do Playwright rodam do mesmo IP e o limite é por IP:
   * sem isto, a segunda execução da suíte no mesmo quarto de hora falha em
   * rotas que estão funcionando. Afrouxar o limite em desenvolvimento é
   * aceitável; em produção não é, então o boot recusa.
   *
   * O limite em si é testado à parte, com o valor de produção.
   */
  get fatorDeLimite(): number {
    const bruto = Number(process.env.RATE_LIMIT_TEST_FACTOR ?? 1);
    const fator = Number.isFinite(bruto) && bruto >= 1 ? bruto : 1;

    if (fator !== 1 && process.env.NODE_ENV === 'production') {
      throw new Error('RATE_LIMIT_TEST_FACTOR não pode ser usado em produção.');
    }
    return fator;
  },

  /**
   * Recompensa por notas lidas (docs/18-RECOMPENSAS.md).
   *
   * Em getter e lido do ambiente porque campanha muda: o limite do primeiro
   * marco, o valor e o teto mensal são parâmetros de operação, não de código —
   * trocar campanha não pode exigir deploy. O padrão é o que vai ao ar.
   */
  recompensas: {
    get regra(): RegraDaRecompensa {
      return {
        primeiroMarco: inteiroPositivo('REWARD_FIRST_MILESTONE', RECOMPENSA_PADRAO.primeiroMarco),
        passo: inteiroPositivo('REWARD_MILESTONE_STEP', RECOMPENSA_PADRAO.passo),
        valorDoMarcoCentavos: inteiroPositivo(
          'REWARD_MILESTONE_CENTS',
          RECOMPENSA_PADRAO.valorDoMarcoCentavos,
        ),
        orcamentoMensalCentavos: inteiroPositivo(
          'REWARD_MONTHLY_BUDGET_CENTS',
          RECOMPENSA_PADRAO.orcamentoMensalCentavos,
        ),
      };
    },
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? 'http://127.0.0.1:3001/v1/auth/google/callback',
    get configurado(): boolean {
      return Boolean(this.clientId && this.clientSecret);
    },
  },

  email: {
    de: process.env.MAIL_FROM ?? 'GasteMenos <nao-responda@gastemenos.com.br>',
    smtp: process.env.SMTP_URL ?? '',
  },

  /**
   * Onde ficam os arquivos que a API gera — hoje, o ZIP de "Baixar meus dados".
   *
   * Sem as credenciais do Supabase, disco local: é o que serve em
   * desenvolvimento e nos testes. Com elas, Supabase Storage, porque o disco do
   * container é efêmero e um deploy no meio do caminho apagaria o arquivo que a
   * pessoa acabou de pedir (docs/13-SUPABASE.md).
   */
  armazenamento: {
    // Tudo em getter: lido na hora do uso, não na hora do import. É o que
    // permite o teste trocar o destino sem recarregar o módulo — e o que evita
    // uma variável definida tarde demais passar despercebida.
    get pasta(): string {
      return process.env.EXPORT_DIR ?? './exportacoes';
    },
    get url(): string {
      return process.env.SUPABASE_URL ?? '';
    },
    /**
     * `SUPABASE_SECRET_KEY` é o nome atual (chaves `sb_secret_…`);
     * `SUPABASE_SERVICE_ROLE_KEY` é o nome antigo, aceito para não quebrar
     * ambiente já configurado. Nos dois casos: só servidor, nunca no web.
     */
    get chaveDeServico(): string {
      return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    },
    get balde(): string {
      return process.env.SUPABASE_STORAGE_BUCKET ?? 'exportacoes';
    },
    get noSupabase(): boolean {
      return Boolean(this.url && this.chaveDeServico);
    },
  },
} as const;
