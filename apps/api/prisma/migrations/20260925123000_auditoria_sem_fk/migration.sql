-- A trilha de auditoria deixa de depender da conta de quem administrou.
--
-- Com a chave estrangeira, encerrar a conta de um admin ou falhava (RESTRICT)
-- ou levava o registro junto (CASCADE). Uma trilha que some quando o
-- responsavel sai nao responde "quem apagou isso?", que e a unica razao de ela
-- existir. Ver docs/09-SEGURANCA-LGPD.md.
ALTER TABLE "AdminLog" DROP CONSTRAINT IF EXISTS "AdminLog_adminId_fkey";
