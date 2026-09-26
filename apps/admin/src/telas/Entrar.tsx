import { useState } from 'react';
import { Button, Card, TextField } from '@gastemenos/ui';
import { ErroDaApi, api, guardarAcesso } from '../lib/api.js';

/**
 * Acesso ao painel.
 *
 * Usa o mesmo login do app — não existe "conta de admin" separada, com senha
 * própria. Papel é atributo de uma pessoa que já tem conta; conta de sistema
 * com senha compartilhada é como uma equipe inteira vira "admin" no log.
 */
export function Entrar({ aoEntrar }: { aoEntrar: () => void }): React.ReactElement {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent): Promise<void> {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      const resposta = await api.post<{ access: string; user: { role?: string } }>('/auth/login', {
        email,
        password: senha,
      });
      guardarAcesso(resposta.access);

      const eu = await api.get<{ role?: string }>('/me');
      if (eu.role !== 'ADMIN') {
        guardarAcesso(null);
        setErro('Essa conta não tem acesso ao painel.');
        return;
      }

      aoEntrar();
    } catch (falha) {
      setErro(falha instanceof ErroDaApi ? falha.paraOUsuario : 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[420px] flex-col justify-center gap-5 px-6">
      <h1 className="text-title-l text-ink">GasteMenos · Painel</h1>

      <Card>
        <form onSubmit={(evento) => void enviar(evento)} className="flex flex-col gap-4" noValidate>
          <TextField
            label="E-mail"
            type="email"
            inputMode="email"
            autoComplete="username"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
          />
          <TextField
            label="Senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
          />

          {erro ? (
            <p role="alert" className="rounded-m bg-offer-soft px-4 py-3 text-body-s text-offer-ink">
              {erro}
            </p>
          ) : null}

          <Button type="submit" fullWidth disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </Card>

      <p className="text-caption text-ink-muted">
        O acesso é a mesma conta do aplicativo, com papel de admin. Promover alguém é
        <code className="px-1">prisma/promover-admin.mts</code>.
      </p>
    </main>
  );
}
