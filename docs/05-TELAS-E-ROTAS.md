# Telas e rotas

As 34 telas aprovadas estão em `referencia/telas/<Nome>.dc.html` (390×844, algumas mais altas para mostrar a página rolada). Elas usam um runtime de protótipo (`<x-dc>`, `{{ }}`, `<sc-if>`, `<sc-for>`): leia o markup e os estilos inline como especificação visual e o bloco `class Component` como especificação de estado/interação. Não copie o runtime para o app.

Links entre telas extraídos dos protótipos (coluna Leva a) viram navegação real do React Router.


## Primeiro uso

| Tela | Rota | O que faz | API | Leva a |
| --- | --- | --- | --- | --- |
| **Boas-vindas 1: ler a nota**<br>`Onboarding1.dc.html` | `/boas-vindas/1` | Ilustração do QR sendo lido; botão AA abre Acessibilidade; Pular vai ao Início. | — | Acessibilidade (`/perfil/acessibilidade`), Main (`/inicio`) |
| **Boas-vindas 2: preços da região**<br>`Onboarding2.dc.html` | `/boas-vindas/2` | Aviso de anonimato dos preços. | — | Main (`/inicio`) |
| **Boas-vindas 3: pontos e ranking**<br>`Onboarding3.dc.html` | `/boas-vindas/3` | Criar minha conta / Já tenho conta. | — | CriarConta (`/criar-conta`), Entrar (`/entrar`) |

## Acesso

| Tela | Rota | O que faz | API | Leva a |
| --- | --- | --- | --- | --- |
| **Criar conta**<br>`CriarConta.dc.html` | `/criar-conta` | Nome, e-mail, senha com medidor, CEP com 'Usar local'; aceite dos termos habilita o botão; Google. | POST /auth/register | Entrar (`/entrar`), GoogleLogin (`/entrar/google`), PerfilConsumo (`/perfil-de-consumo`), VerificarEmail (`/confirmar-email`) |
| **Entrar com Google (confirmação)**<br>`GoogleLogin.dc.html` | `/entrar/google` | Mostra a conta e o que o app recebe; tela do próprio app, não imitar a do Google. | GET /auth/google | Entrar (`/entrar`), PerfilConsumo (`/perfil-de-consumo`) |
| **Confirmar e-mail**<br>`VerificarEmail.dc.html` | `/confirmar-email` | Código de 6 dígitos com colar automático, reenvio com contador. | POST /auth/verify-email, /auth/resend-code | CriarConta (`/criar-conta`), PerfilConsumo (`/perfil-de-consumo`) |
| **Entrar**<br>`Entrar.dc.html` | `/entrar` | E-mail, senha com mostrar/ocultar, Esqueci minha senha, Google, Apple. | POST /auth/login | CriarConta (`/criar-conta`), GoogleLogin (`/entrar/google`), Main (`/inicio`), RecuperarSenha (`/recuperar-senha`) |
| **Recuperar senha**<br>`RecuperarSenha.dc.html` | `/recuperar-senha` | 4 estados: e-mail → link enviado → nova senha (/recuperar-senha/nova?token=) → concluído. | POST /auth/forgot-password, /auth/reset-password | Entrar (`/entrar`) |

## Primeiro uso

| Tela | Rota | O que faz | API | Leva a |
| --- | --- | --- | --- | --- |
| **Perfil de consumo**<br>`PerfilConsumo.dc.html` | `/perfil-de-consumo` | 5 perguntas numa rota com estado (?p=1..5); Continuar só libera com resposta; pergunta 5 aceita até 3. | PUT /me/profile | CriarConta (`/criar-conta`), PerfilPronto (`/perfil-de-consumo/pronto`) |
| **Perfil pronto**<br>`PerfilPronto.dc.html` | `/perfil-de-consumo/pronto` | Persona, respostas, orçamento sugerido com Ajustar, +100 pontos. | GET /me/profile | Escanear (`/ler-nota`), Main (`/inicio`), PerfilConsumo (`/perfil-de-consumo`) |

## App

| Tela | Rota | O que faz | API | Leva a |
| --- | --- | --- | --- | --- |
| **Início**<br>`Main.dc.html` | `/inicio` | Gasto do mês x orçamento, anel de nível, atalhos, últimas notas; avatar abre Perfil; sino abre Notificações. | GET /me, /spending/summary, /game/status, /receipts?limit=2 | CentralNotificacoes (`/notificacoes`), Conquistas (`/conquistas`), DetalheNota (`/notas/:id`), Escanear (`/ler-nota`), Gastos (`/gastos`), Lista (`/lista`), Ofertas (`/ofertas`), Perfil (`/perfil`), Precos (`/produtos/:id/precos`), Ranking (`/ranking`) |
| **Início no modo fácil**<br>`MainFacil.dc.html` | `/inicio (modo fácil)` | Variante quando preferences.easyMode; barra com 3 itens; botão Ouvir. | mesmos do Início | Acessibilidade (`/perfil/acessibilidade`), Ajuda (`/ajuda`), Escanear (`/ler-nota`), Gastos (`/gastos`), Lista (`/lista`), Ofertas (`/ofertas`) |
| **Início no tema escuro**<br>`MainEscuro.dc.html` | `/inicio (tema escuro)` | Referência do tema escuro; não é rota própria. | — | Conquistas (`/conquistas`), Escanear (`/ler-nota`), Gastos (`/gastos`), Lista (`/lista`), Ofertas (`/ofertas`), Precos (`/produtos/:id/precos`), Ranking (`/ranking`) |

## Ler nota

| Tela | Rota | O que faz | API | Leva a |
| --- | --- | --- | --- | --- |
| **Ler nota fiscal**<br>`Escanear.dc.html` | `/ler-nota` | Câmera, lanterna, Galeria, Digitar chave, ajuda; vibra ao ler. | POST /receipts | Ajuda (`/ajuda`), Main (`/inicio`), NotaLida (`/notas/:id/resultado`) |
| **Nota registrada**<br>`NotaLida.dc.html` | `/notas/:id/resultado` | Comemoração (nível novo, selo), resumo com comparação, Compartilhar, Continuar. | GET /receipts/:id | Compartilhar (`/compartilhar`), Main (`/inicio`) |
| **Detalhe da nota**<br>`DetalheNota.dc.html` | `/notas/:id` | Itens com filtro Todos/Mais baratos/Mais caros, repetir na lista, chave, avisar erro, excluir. | GET/DELETE /receipts/:id, POST /lists/current/from-receipt/:id | Compartilhar (`/compartilhar`), Lista (`/lista`), Main (`/inicio`), Precos (`/produtos/:id/precos`) |

## Economia

| Tela | Rota | O que faz | API | Leva a |
| --- | --- | --- | --- | --- |
| **Seus gastos**<br>`Gastos.dc.html` | `/gastos` | Mês/3 meses/Ano, rosca por categoria, barras por semana, destaque do item que mais pesou. | GET /spending/* | Escanear (`/ler-nota`), Main (`/inicio`), Ofertas (`/ofertas`), Precos (`/produtos/:id/precos`), Ranking (`/ranking`) |
| **Histórico de preço**<br>`Precos.dc.html` | `/produtos/:id/precos` | Gráfico 30d/6m/1a com média da região e o que você pagou, lojas mais baratas, alerta, adicionar à lista. | GET /products/:id/prices, /products/:id/stores | Gastos (`/gastos`), Lista (`/lista`) |
| **Lista de compras**<br>`Lista.dc.html` | `/lista` | Itens marcáveis, estimativa, loja mais barata, sugestão de recompra. | GET/PATCH /lists/current | Escanear (`/ler-nota`), Gastos (`/gastos`), Main (`/inicio`), Ofertas (`/ofertas`), Ranking (`/ranking`) |
| **Ofertas**<br>`Ofertas.dc.html` | `/ofertas` | Busca, chips, banner Patrocinado, produtos que baixaram. | GET /offers | Escanear (`/ler-nota`), Gastos (`/gastos`), Main (`/inicio`), Precos (`/produtos/:id/precos`), Ranking (`/ranking`) |

## Jogo

| Tela | Rota | O que faz | API | Leva a |
| --- | --- | --- | --- | --- |
| **Ranking**<br>`Ranking.dc.html` | `/ranking` | Amigos/Região × Mais economizou/Mais compras/Mais pontos, pódio, convite. | GET /game/ranking | Compartilhar (`/compartilhar`), Escanear (`/ler-nota`), Gastos (`/gastos`), Main (`/inicio`), Ofertas (`/ofertas`) |
| **Conquistas e níveis**<br>`Conquistas.dc.html` | `/conquistas` | Trilha de níveis, selos com filtro, como ganhar pontos. | GET /game/status, /game/badges | Compartilhar (`/compartilhar`), Main (`/inicio`), Recompensas (`/recompensas`) |
| **Recompensas**<br>*sem tela de referência* | `/recompensas` | Saldo em reais por marco de notas, progresso até o próximo, loja de benefícios, extrato, e o aviso de que o saque em USDC ainda não existe. Montada só com componentes e tokens existentes — a recompensa nasceu depois do pacote de design (`18-RECOMPENSAS.md`). | GET /rewards, POST /rewards/purchase | Conquistas (`/conquistas`), Perfil (`/perfil`) |
| **Compartilhar conquista**<br>`Compartilhar.dc.html` | `/compartilhar` | Cartão 9:16 gerado em canvas; Stories, Mensagem, Copiar link. | GET /game/share-card | Ranking (`/ranking`) |

## Conta

| Tela | Rota | O que faz | API | Leva a |
| --- | --- | --- | --- | --- |
| **Meu perfil**<br>`Perfil.dc.html` | `/perfil` | Resumo e lista de configurações; tema; sair; pausar; encerrar. | GET /me | Acessibilidade (`/perfil/acessibilidade`), Ajuda (`/ajuda`), Conquistas (`/conquistas`), Recompensas (`/recompensas`), DadosPessoais (`/perfil/dados`), EncerrarConta (`/perfil/encerrar`), Entrar (`/entrar`), Main (`/inicio`), Notificacoes (`/perfil/notificacoes`), PausarConta (`/perfil/pausar`), PerfilConsumo (`/perfil-de-consumo`), Privacidade (`/perfil/privacidade`), Seguranca (`/perfil/seguranca`) |
| **Dados pessoais**<br>`DadosPessoais.dc.html` | `/perfil/dados` | Campos controlados; Salvar só com alteração; toast. | PATCH /me, POST /me/email-change | Perfil (`/perfil`), VerificarEmail (`/confirmar-email`) |
| **Login e segurança**<br>`Seguranca.dc.html` | `/perfil/seguranca` | Formas de entrar, 2 etapas, aparelhos. | GET /me/sessions, /me/auth-accounts | AlterarSenha (`/perfil/seguranca/senha`), Perfil (`/perfil`) |
| **Alterar senha**<br>`AlterarSenha.dc.html` | `/perfil/seguranca/senha` | Regras validadas ao digitar, confirmação igual. | POST /me/password | Perfil (`/perfil`), RecuperarSenha (`/recuperar-senha`), Seguranca (`/perfil/seguranca`) |
| **Notificações (preferências)**<br>`Notificacoes.dc.html` | `/perfil/notificacoes` | Interruptores por grupo; parceiros começa desligado. | PATCH /me/preferences | Perfil (`/perfil`) |
| **Privacidade e dados**<br>`Privacidade.dc.html` | `/perfil/privacidade` | Interruptores de compartilhamento, Baixar meus dados, excluir. | PATCH /me/preferences, POST /me/export | EncerrarConta (`/perfil/encerrar`), Perfil (`/perfil`) |
| **Acessibilidade**<br>`Acessibilidade.dc.html` | `/perfil/acessibilidade` | Tamanho do texto com prévia, alto contraste, modo fácil, voz, movimento, vibrar. | PATCH /me/preferences | MainFacil (`/inicio (modo fácil)`), Perfil (`/perfil`) |
| **Pausar conta**<br>`PausarConta.dc.html` | `/perfil/pausar` | 1 semana/1 mês/3 meses/Sem data; estado Conta pausada com Reativar. | POST /me/pause, /me/resume | Entrar (`/entrar`), Perfil (`/perfil`) |
| **Encerrar conta**<br>`EncerrarConta.dc.html` | `/perfil/encerrar` | O que se perde, alternativa Pausar, motivo opcional, digitar ENCERRAR; pedido recebido (30 dias). | POST /me/delete | PausarConta (`/perfil/pausar`), Perfil (`/perfil`) |

## Outros

| Tela | Rota | O que faz | API | Leva a |
| --- | --- | --- | --- | --- |
| **Central de notificações**<br>`CentralNotificacoes.dc.html` | `/notificacoes` | Todas/Preços/Jogo, Hoje/Esta semana, marcar como lidas. | GET /notifications | Main (`/inicio`), Notificacoes (`/perfil/notificacoes`) |
| **Ajuda**<br>`Ajuda.dc.html` | `/ajuda` | Busca, 4 temas, perguntas que abrem e fecham, chat, e-mail, reportar. | — | Perfil (`/perfil`) |

## Estados que toda tela precisa ter

- **Carregando**: esqueleto com as mesmas formas da tela (sem spinner no meio da tela).
- **Vazio**: texto que diz o próximo passo ("Você ainda não leu nenhuma nota. Toque em Ler nota.") e o botão para isso.
- **Erro**: mensagem do código de erro da API e "Tentar de novo".
- **Sem conexão**: faixa no topo "Sem internet. Mostrando o que já estava salvo."
- **Sem dados da região**: "Ainda juntando preços desta região. Cada nota lida ajuda."
