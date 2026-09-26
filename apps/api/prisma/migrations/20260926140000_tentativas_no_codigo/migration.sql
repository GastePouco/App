-- Conta as tentativas erradas em cada codigo de verificacao.
--
-- Seis digitos sao um milhao de combinacoes: pouco para quem tem paciencia. O
-- limite por IP sozinho nao protege de quem distribui entre IPs, e um codigo
-- sem contador aceita tentativa ate expirar. Cinco erros e ele morre.
ALTER TABLE "VerificationCode" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
