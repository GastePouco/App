/**
 * CPF — validação e máscara.
 *
 * O CPF entra no GasteMenos para **uma** finalidade: garantir uma recompensa por
 * pessoa e permitir casar a nota emitida no CPF de quem a leu
 * (docs/18-RECOMPENSAS.md). Ele **nunca é guardado em claro** — o que vai para o
 * banco é um HMAC com segredo de servidor (docs/09-SEGURANCA-LGPD.md).
 *
 * A validação aqui é de **dígito verificador**, e isso é tudo o que ela é: diz
 * que os números formam um CPF possível, não que ele é de quem digitou. Quem
 * verifica de verdade é a nota fiscal — o portal da SEFAZ mostra o CPF do
 * consumidor, e o hash dele ou bate com o da conta, ou não.
 */

export function limparCpf(entrada: string): string {
  return entrada.replace(/\D/g, '');
}

/**
 * Dígito verificador do CPF (módulo 11), nos dois dígitos.
 *
 * Recusa também as sequências de um só algarismo (`111.111.111-11` e
 * companhia): elas passam no módulo 11 e são o primeiro "CPF" que alguém digita
 * quando quer burlar um formulário.
 */
export function cpfValido(entrada: string): boolean {
  const cpf = limparCpf(entrada);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digito = (ate: number): number => {
    let soma = 0;
    for (let i = 0; i < ate; i++) {
      soma += Number(cpf[i]) * (ate + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

/**
 * `***.***.789-00` — o que a tela mostra de volta para a pessoa se reconhecer.
 *
 * Os três primeiros grupos somem porque é o que identifica; os últimos quatro
 * dígitos bastam para alguém confirmar que cadastrou o CPF certo.
 */
export function cpfMascarado(entrada: string): string {
  const cpf = limparCpf(entrada);
  if (cpf.length !== 11) return '***.***.***-**';
  return `***.***.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

/** `000.000.000-00`, para o campo do formulário. */
export function formatarCpf(entrada: string): string {
  const cpf = limparCpf(entrada).slice(0, 11);
  if (cpf.length <= 3) return cpf;
  if (cpf.length <= 6) return `${cpf.slice(0, 3)}.${cpf.slice(3)}`;
  if (cpf.length <= 9) return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6)}`;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}
