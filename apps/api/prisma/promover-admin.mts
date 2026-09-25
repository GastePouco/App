/**
 * Dá (ou tira) o papel de ADMIN de uma conta que já existe.
 *
 * Em produção não há conta de admin plantada: a pessoa se cadastra pelo app,
 * como qualquer um, e alguém com acesso ao banco promove aquele e-mail. Assim
 * não existe senha de admin conhecida de antemão, que é o tipo de coisa que
 * sobrevive anos num repositório.
 *
 *   npx dotenv -e ../../.env.supabase -- npx tsx prisma/promover-admin.mts alguem@exemplo.com
 *   npx dotenv -e ../../.env.supabase -- npx tsx prisma/promover-admin.mts alguem@exemplo.com --tirar
 *
 * A mudança vale na requisição seguinte: o papel é lido do banco a cada
 * chamada, não do token (ver JwtEstrategia).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const email = process.argv[2];
const tirar = process.argv.includes('--tirar');

if (!email) {
  console.error('Informe o e-mail: npx tsx prisma/promover-admin.mts alguem@exemplo.com');
  process.exit(1);
}

const conta = await prisma.user.findUnique({
  where: { email },
  select: { id: true, name: true, role: true },
});

if (!conta) {
  console.error(`Não existe conta com o e-mail ${email}. Cadastre-se pelo app primeiro.`);
  process.exit(1);
}

const papel = tirar ? 'USER' : 'ADMIN';

if (conta.role === papel) {
  console.log(`${conta.name} já é ${papel}. Nada a fazer.`);
} else {
  await prisma.user.update({ where: { id: conta.id }, data: { role: papel } });
  console.log(`${conta.name} (${email}) agora é ${papel}.`);
}

await prisma.$disconnect();
