# GasteMenos — instruções para o Claude Code

GasteMenos é um PWA de controle de gastos no varejo. A pessoa lê o QR code da nota fiscal (NFC-e), o app guarda itens e preços, mostra os gastos do mês, compara cada preço com a média da região (dados coletivos) e recompensa cada nota com pontos, níveis e ranking. Leia `docs/01-PRD.md` antes de qualquer tarefa grande.

## Estado da implementação

`docs/17-MANUAL.md` lista tudo o que a aplicação faz hoje e o que ainda não faz.
Veja `docs/12-PROGRESSO.md` para o que já foi executado, o que falta e as
decisões de ambiente tomadas no caminho. Atualize esse arquivo ao concluir uma
fase.

Resumo: fases 0, 1, 2, 4, 5, 6 e 7 executadas; **recompensa por notas lidas, fase 1, executada** (`docs/18-RECOMPENSAS.md`); fase 8 pronta e medida (falta subir no servidor — `docs/14-DEPLOY.md`); fase 3 implementada mas **não validada contra uma nota real do DF** — leia a seção da fase 3 no progresso antes de confiar no parser.

Para rodar a suíte e2e inteira, suba a API com `RATE_LIMIT_TEST_FACTOR=20 pnpm dev`: os três projetos do Playwright saem do mesmo IP e o limite de produção derruba a segunda metade da suíte.

## Fonte da verdade

1. **Telas**: `referencia/telas/*.dc.html` (34 telas, 390×844). São o visual aprovado: copie espaçamentos, textos e hierarquia delas. O mapa tela → rota está em `docs/05-TELAS-E-ROTAS.md`.
2. **Design system**: `design-system/` (tokens, CSS, preset do Tailwind, especificação dos componentes). Nunca escreva um hexadecimal, tamanho de fonte ou raio solto no código: use os tokens.
3. **Regras de negócio**: `docs/06-NFCE-LEITURA.md`, `docs/07-GAMIFICACAO.md`, `docs/09-SEGURANCA-LGPD.md`. Auditoria de segurança: `docs/16-SEGURANCA-AUDITORIA.md`.
4. **Ordem de trabalho**: `docs/11-ROADMAP-E-PROMPTS.md`. Faça uma fase por vez e só avance quando os critérios de aceite da fase passarem.

## Stack (não trocar sem pedir)

- Monorepo **pnpm workspaces + Turborepo**, TypeScript estrito em tudo.
- `apps/web`: **React 18 + Vite + TypeScript**, React Router 6, TanStack Query 5, Zustand (estado de UI), React Hook Form + Zod, **Tailwind CSS** com o preset `packages/tokens`, `vite-plugin-pwa` (Workbox), leitura de QR com `BarcodeDetector` e fallback `@zxing/browser`.
- `apps/api`: **NestJS 10 + Prisma + PostgreSQL 16**, Redis + BullMQ para a fila de consulta de notas, Passport (JWT + Google OAuth 2.0), class-validator, Swagger em `/docs`.
- `packages/ui`: componentes React do design system (porte em TSX de `design-system/bundle-referencia/`).
- `packages/tokens`: `tokens.json` → `tokens.css` + preset do Tailwind.
- `packages/shared`: schemas Zod e tipos compartilhados entre web e api.
- Recompensa por notas lidas: `docs/18-RECOMPENSAS.md` — **fase 1 EXECUTADA** (livro-razão em centavos de real, marco por notas que viraram dado, gasto no app em dois benefícios, tela `/recompensas`, módulo `apps/api/src/modules/recompensas/`); fases 2 a 5 (carteira, saque em USDC, raiz Merkle, relayer, mainnet) em PLANEJAMENTO. Ao mexer em marco, catálogo ou benefício, atualize esse documento.
- `apps/admin`: painel administrativo (Vite + React), cliente da mesma API — ver `docs/15-CRM.md`.
- `apps/oracle` (fase Solana, separada): ver `docs/10-MODULO-SOLANA.md` — **revisão 2**: feed por SKU, índice da cesta por cidade e mercado de dados por x402, com repasse a quem escaneou. Duas fontes de nota que não se misturam: leitura no app (cria contribuinte) e acervo importado (dá profundidade, não conta como pessoa).
- Testes: Vitest + Testing Library + `vitest-axe` no web; Jest + Supertest na api; Playwright para os fluxos principais.
- Infra: Docker Compose para desenvolvimento; deploy em Coolify (um serviço web estático, um serviço api, Redis). Em produção o Postgres e os arquivos gerados ficam no **Supabase** — só como banco gerenciado e Storage, sem PostgREST e sem Supabase Auth: ver `docs/13-SUPABASE.md`.

## Comandos

```bash
pnpm i
docker compose up -d db redis
pnpm --filter api prisma migrate dev
pnpm dev            # web em :5173, api em :3000
pnpm test           # todos os testes
pnpm lint && pnpm typecheck
pnpm --filter web test:a11y   # axe em todas as rotas
```

## Regras de código

- Português do Brasil em toda a interface e nas mensagens de erro; código, nomes de arquivos e commits em inglês.
- Componentes de tela em `apps/web/src/routes/<rota>/`; componentes reutilizáveis só em `packages/ui`.
- Dinheiro sempre em **centavos (inteiro)** no banco e na API; formate com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Datas em UTC no banco; mostre no fuso `America/Sao_Paulo`.
- Toda rota da API valida entrada com DTO e responde erros no formato `{ code, message }` com `message` em português simples.
- Nenhuma chamada à SEFAZ sai do navegador: o web envia a URL do QR code ou a chave para a API.

## Acessibilidade (critério de aceite de TODA tela)

Leia `docs/08-ACESSIBILIDADE.md`. Em resumo:
- Texto nunca menor que 13px; tamanhos em `rem` (o usuário escolhe Normal, Grande ou Muito grande).
- Contraste 4,5:1 (3:1 para texto de 24px ou mais e bordas de controle) nos temas claro, escuro e alto contraste.
- Alvo de toque mínimo de 44×44.
- Elementos reais: `button`, `a`, `input` com `label`. Nada de `div` clicável.
- Foco visível (`:focus-visible` com o token `focus`).
- Respeite `prefers-reduced-motion` e a opção "Reduzir movimento" do app.
- Significado nunca só pela cor (preço acima/abaixo leva seta e palavra).
- Todo teste de tela roda `axe` e falha com qualquer violação.

## Texto da interface

- Diga "pontos", nunca "XP". Diga "nota fiscal"; "NFC-e" só na ajuda.
- Botões dizem o que acontece ("Salvar alterações"). Erros dizem como resolver ("Digite os 8 números do CEP.").
- Oferta paga sempre mostra o selo "Patrocinado".

## Definição de pronto

Uma tarefa só está pronta quando: bate com a tela de referência, passa lint, typecheck e testes, não tem violação de axe, funciona a 390px e a 320px de largura, funciona com letra "Muito grande" e no tema alto contraste, e os textos estão em português.
