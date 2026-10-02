/**
 * Códigos de erro da API e o texto que a pessoa lê.
 *
 * A API responde `{ code, message }`; o web mostra `message`. O texto mora
 * aqui, num lugar só, porque o mesmo erro aparece na tela de leitura, na
 * central de notificações e no e-mail — e porque as frases são as aprovadas
 * em docs/06-NFCE-LEITURA.md, não improviso de quem escreveu o endpoint.
 *
 * Regra das mensagens: dizem o que fazer, não o que falhou.
 */

export const MENSAGENS: Record<string, string> = {
  // Leitura de nota
  INVALID_QR: 'Esse QR code não é de uma nota fiscal. Aponte para o código no rodapé da nota.',
  INVALID_KEY: 'A chave precisa ter 44 números. Confira e tente de novo.',
  NOT_NFCE:
    'Essa é uma nota de outro tipo. Por enquanto só lemos notas de compras em lojas (NFC-e).',
  RECEIPT_ALREADY_READ: 'Essa nota já foi lida. Cada nota vale uma vez.',
  NEEDS_QR: 'Não conseguimos abrir essa nota pela chave. Tente ler o QR code.',
  PORTAL_UNAVAILABLE:
    'O site da Secretaria da Fazenda está fora do ar. Guardamos sua nota e vamos tentar de novo sozinhos.',
  PARSE_FAILED: 'Não conseguimos ler os itens dessa nota. Nossa equipe vai olhar e te avisar.',
  RECEIPT_TOO_OLD: 'Essa nota é de mais de 6 meses. Ela entra no seu histórico, mas sem pontos.',
  DAILY_LIMIT_REACHED: 'Você já leu 10 notas com pontos hoje. As próximas entram sem pontos.',

  // Acesso
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  EMAIL_ALREADY_USED: 'Esse e-mail já tem conta. Entre com a sua senha.',
  EMAIL_NOT_VERIFIED: 'Confirme seu e-mail para continuar. Enviamos um código para você.',
  INVALID_CODE: 'Esse código não confere. Peça um novo se ele já passou de 15 minutos.',
  CODE_EXPIRED: 'Esse código expirou. Peça um novo.',
  WEAK_PASSWORD: 'A senha precisa de 8 caracteres, um número e uma letra maiúscula.',
  TOO_MANY_ATTEMPTS: 'Muitas tentativas. Espere 15 minutos e tente de novo.',
  SESSION_EXPIRED: 'Sua sessão expirou. Entre de novo.',
  LAST_AUTH_METHOD: 'Essa é a sua única forma de entrar. Cadastre outra antes de remover esta.',
  GOOGLE_UNAVAILABLE: 'Entrar com o Google não está disponível agora. Use e-mail e senha.',

  // Conta
  ACCOUNT_PAUSED: 'Sua conta está pausada. Reative para continuar.',
  ACCOUNT_PENDING_DELETION: 'Sua conta está marcada para encerrar. Entre para cancelar o pedido.',
  CONFIRMATION_MISMATCH: 'Digite ENCERRAR, em letras maiúsculas, para confirmar.',

  // Dados
  NOT_FOUND: 'Não encontramos o que você procurou.',
  FORBIDDEN: 'Você não tem acesso a isso.',
  VALIDATION_FAILED: 'Confira os campos marcados e tente de novo.',
  REGION_WITHOUT_DATA: 'Ainda juntando preços desta região. Cada nota lida ajuda.',
  RATE_LIMITED: 'Muitos pedidos seguidos. Espere um pouco.',

  // Recompensa
  REWARD_NO_BALANCE: 'Seu saldo ainda não cobre esse item. Ele continua te esperando aqui.',
  INVALID_CPF: 'Confira o CPF: esses números não formam um CPF válido.',
  CPF_ALREADY_USED:
    'Esse CPF já está em outra conta. A recompensa é uma por pessoa — entre com aquela conta ou fale com a gente.',

  // Genérico
  INTERNAL: 'Algo deu errado do nosso lado. Tente de novo em instantes.',
  OFFLINE: 'Sem internet. Mostrando o que já estava salvo.',
};

export type CodigoDeErro = keyof typeof MENSAGENS;

export interface RespostaDeErro {
  code: string;
  message: string;
  /** Preenchido só em VALIDATION_FAILED, para marcar o campo na tela. */
  fields?: Record<string, string>;
}

/** Monta a resposta de erro da API. Nunca inclua dado pessoal na mensagem. */
export function erro(code: string, fields?: Record<string, string>): RespostaDeErro {
  const message = MENSAGENS[code] ?? MENSAGENS.INTERNAL!;
  return fields ? { code, message, fields } : { code, message };
}

/** Texto para a tela a partir de qualquer coisa que o fetch tenha devolvido. */
export function mensagemDoErro(entrada: unknown): string {
  if (typeof entrada === 'string' && MENSAGENS[entrada]) return MENSAGENS[entrada]!;

  if (entrada && typeof entrada === 'object') {
    const code = (entrada as { code?: unknown }).code;
    if (typeof code === 'string' && MENSAGENS[code]) return MENSAGENS[code]!;

    const message = (entrada as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }

  return MENSAGENS.INTERNAL!;
}
