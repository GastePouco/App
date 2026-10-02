import type { ReactElement } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { ExigeSessao } from './sessao.js';
import { TelaDeErro } from './TelaDeErro.js';
import { Inicio } from '../rotas/inicio/Inicio.js';
import { DevUI } from '../rotas/dev-ui/DevUI.js';
import { BoasVindas } from '../rotas/boas-vindas/BoasVindas.js';
import { Entrar } from '../rotas/acesso/Entrar.js';
import { CriarConta } from '../rotas/acesso/CriarConta.js';
import { ConfirmarEmail } from '../rotas/acesso/ConfirmarEmail.js';
import { RecuperarSenha } from '../rotas/acesso/RecuperarSenha.js';
import { EntrarComGoogle } from '../rotas/acesso/EntrarComGoogle.js';
import { PerfilDeConsumo } from '../rotas/perfil-de-consumo/PerfilDeConsumo.js';
import { PerfilPronto } from '../rotas/perfil-de-consumo/PerfilPronto.js';
import { Escanear } from '../rotas/ler-nota/Escanear.js';
import { NotaLida } from '../rotas/notas/NotaLida.js';
import { DetalheNota } from '../rotas/notas/DetalheNota.js';
import { Gastos } from '../rotas/gastos/Gastos.js';
import { Precos } from '../rotas/precos/Precos.js';
import { Lista } from '../rotas/lista/Lista.js';
import { Ofertas } from '../rotas/ofertas/Ofertas.js';
import { Ranking } from '../rotas/ranking/Ranking.js';
import { Conquistas } from '../rotas/conquistas/Conquistas.js';
import { Recompensas } from '../rotas/recompensas/Recompensas.js';
import { Compartilhar } from '../rotas/compartilhar/Compartilhar.js';
import { Perfil } from '../rotas/perfil/Perfil.js';
import { Acessibilidade } from '../rotas/perfil/Acessibilidade.js';
import { DadosPessoais } from '../rotas/perfil/DadosPessoais.js';
import { AlterarSenha, Seguranca } from '../rotas/perfil/Seguranca.js';
import { Notificacoes, Privacidade } from '../rotas/perfil/Privacidade.js';
import { EncerrarConta, PausarConta } from '../rotas/perfil/EncerrarConta.js';
import { CentralDeNotificacoes } from '../rotas/notificacoes/CentralDeNotificacoes.js';
import { Ajuda } from '../rotas/ajuda/Ajuda.js';

/**
 * Mapa de rotas (docs/05-TELAS-E-ROTAS.md). Os caminhos estão em português
 * porque aparecem na barra de endereço para a pessoa.
 *
 * Quem chega em `/` sem sessão começa pelas boas-vindas; `ExigeSessao` cuida do
 * resto e leva ao login guardando de onde veio.
 */

/**
 * Rota que só existe com sessão.
 *
 * `errorElement` em toda rota: sem ele, um erro em qualquer tela deixa a página
 * em branco, que é a pior resposta possível para quem está do outro lado.
 */
function comSessao(path: string, tela: ReactElement): RouteObject {
  return { path, element: <ExigeSessao>{tela}</ExigeSessao>, errorElement: <TelaDeErro /> };
}

export const rotas: RouteObject[] = [
  { path: '/', element: <Navigate to="/boas-vindas/1" replace />, errorElement: <TelaDeErro /> },

  // Primeiro uso e acesso — sem sessão.
  { errorElement: <TelaDeErro />, path: '/boas-vindas/:passo', element: <BoasVindas /> },
  { errorElement: <TelaDeErro />, path: '/criar-conta', element: <CriarConta /> },
  { errorElement: <TelaDeErro />, path: '/confirmar-email', element: <ConfirmarEmail /> },
  { errorElement: <TelaDeErro />, path: '/entrar', element: <Entrar /> },
  { errorElement: <TelaDeErro />, path: '/entrar/google', element: <EntrarComGoogle /> },
  { errorElement: <TelaDeErro />, path: '/recuperar-senha', element: <RecuperarSenha /> },
  { errorElement: <TelaDeErro />, path: '/recuperar-senha/nova', element: <RecuperarSenha /> },

  // Com sessão.
  comSessao('/perfil-de-consumo', <PerfilDeConsumo />),
  comSessao('/perfil-de-consumo/pronto', <PerfilPronto />),
  comSessao('/ler-nota', <Escanear />),
  comSessao('/notas/:id/resultado', <NotaLida />),
  comSessao('/notas/:id', <DetalheNota />),
  comSessao('/gastos', <Gastos />),
  comSessao('/produtos/:id/precos', <Precos />),
  comSessao('/lista', <Lista />),
  comSessao('/ofertas', <Ofertas />),
  comSessao('/ranking', <Ranking />),
  comSessao('/conquistas', <Conquistas />),
  comSessao('/recompensas', <Recompensas />),
  comSessao('/compartilhar', <Compartilhar />),
  comSessao('/notificacoes', <CentralDeNotificacoes />),
  comSessao('/ajuda', <Ajuda />),
  comSessao('/inicio', <Inicio />),

  // Perfil e ajustes.
  comSessao('/perfil', <Perfil />),
  comSessao('/perfil/dados', <DadosPessoais />),
  comSessao('/perfil/seguranca', <Seguranca />),
  comSessao('/perfil/seguranca/senha', <AlterarSenha />),
  comSessao('/perfil/notificacoes', <Notificacoes />),
  comSessao('/perfil/privacidade', <Privacidade />),
  comSessao('/perfil/acessibilidade', <Acessibilidade />),
  comSessao('/perfil/pausar', <PausarConta />),
  comSessao('/perfil/encerrar', <EncerrarConta />),

  // Conferência do design system. `import.meta.env.DEV` some no build de
  // produção, então a rota não vai para o ar junto com o app.
  ...(import.meta.env.DEV ? [{ path: '/dev/ui', element: <DevUI /> }] : []),

  // Endereço que não existe cai aqui, com saída — não numa tela em branco.
  { path: '*', element: <TelaDeErro /> },
];
