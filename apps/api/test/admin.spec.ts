import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { apagarUsuariosDeTeste } from './limpeza.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AdminService } from '../src/modules/admin/admin.service.js';
import { AdminGuarda } from '../src/modules/admin/admin.guarda.js';
import { ArmazenamentoService } from '../src/modules/armazenamento/armazenamento.service.js';
import { semCpf } from '../src/modules/notas/notas.service.js';
import type { UsuarioAutenticado } from '../src/comum/usuario-atual.js';

/**
 * Painel administrativo: ofertas, parceiros e triagem de leitura.
 *
 * O que está fixado aqui não é CRUD — é o que não pode escapar quando alguém
 * mexe em dado que aparece para outras pessoas: o selo de patrocinado, a trilha
 * de auditoria e a porta fechada para conta comum.
 */
describe('admin', () => {
  const prisma = new PrismaClient();
  let admin: AdminService;
  let adminId: string;
  let pessoaComum: string;
  let parceiroId: string;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      providers: [AdminService, ArmazenamentoService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    admin = modulo.get(AdminService);
  });

  beforeEach(async () => {
    const marca = `${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;

    const criado = await prisma.user.create({
      data: {
        email: `admin.${marca}@exemplo.test`,
        name: 'Pessoa Admin',
        rankingName: 'Admin',
        role: 'ADMIN',
        emailVerifiedAt: new Date(),
        inviteCode: `A${marca.toUpperCase().slice(-7)}`,
      },
      select: { id: true },
    });
    adminId = criado.id;

    const comum = await prisma.user.create({
      data: {
        email: `comum.${marca}@exemplo.test`,
        name: 'Pessoa Comum',
        rankingName: 'Comum',
        emailVerifiedAt: new Date(),
        inviteCode: `C${marca.toUpperCase().slice(-7)}`,
      },
      select: { id: true },
    });
    pessoaComum = comum.id;

    const parceiro = await admin.criarParceiro(adminId, { name: `Parceiro ${marca}` });
    parceiroId = parceiro.id;
  });

  afterEach(async () => {
    await prisma.offer.deleteMany({ where: { partnerId: parceiroId } });
    await prisma.partner.deleteMany({ where: { id: parceiroId } });
    await apagarUsuariosDeTeste(prisma, [adminId, pessoaComum]);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const periodo = {
    startsAt: new Date('2026-09-25T00:00:00.000Z').toISOString(),
    endsAt: new Date('2026-10-02T00:00:00.000Z').toISOString(),
  };

  describe('quem pode entrar', () => {
    const guarda = new AdminGuarda();

    function contexto(usuario?: UsuarioAutenticado) {
      return {
        switchToHttp: () => ({
          getRequest: () => ({ user: usuario, method: 'GET', url: '/v1/admin/offers' }),
        }),
      } as never;
    }

    it('deixa passar quem é ADMIN', () => {
      expect(
        guarda.canActivate(contexto({ id: 'x', email: 'a@b.test', papel: 'ADMIN' })),
      ).toBe(true);
    });

    it('barra conta comum', () => {
      expect(() =>
        guarda.canActivate(contexto({ id: 'y', email: 'c@d.test', papel: 'USER' })),
      ).toThrow();
    });

    it('barra quem não tem sessão', () => {
      expect(() => guarda.canActivate(contexto())).toThrow();
    });
  });

  describe('ofertas', () => {
    it('oferta com parceiro nasce marcada como patrocinada', async () => {
      const oferta = await admin.criarOferta(adminId, {
        title: 'Café 500 g por R$ 17,98',
        partnerId: parceiroId,
        geohashes: ['6vjyq'],
        priceCents: 1798,
        ...periodo,
      });

      expect(oferta.sponsored).toBe(true);
    });

    it('oferta sem parceiro não é patrocinada', async () => {
      const oferta = await admin.criarOferta(adminId, {
        title: 'Arroz mais barato na região',
        geohashes: ['6vjyq'],
        ...periodo,
      });

      expect(oferta.sponsored).toBe(false);
      await prisma.offer.delete({ where: { id: oferta.id } });
    });

    it('tirar o parceiro tira o selo, e pôr de volta traz o selo', async () => {
      const oferta = await admin.criarOferta(adminId, {
        title: 'Promoção da semana',
        partnerId: parceiroId,
        geohashes: ['6vjyq'],
        ...periodo,
      });

      const semParceiro = await admin.editarOferta(adminId, oferta.id, { partnerId: undefined });
      expect(semParceiro.sponsored).toBe(true); // `undefined` não mexe no campo

      const limpa = await admin.editarOferta(adminId, oferta.id, {
        partnerId: null as unknown as string,
      });
      expect(limpa.sponsored).toBe(false);

      const dePonta = await admin.editarOferta(adminId, oferta.id, { partnerId: parceiroId });
      expect(dePonta.sponsored).toBe(true);
    });

    it('recusa período que termina antes de começar', async () => {
      await expect(
        admin.criarOferta(adminId, {
          title: 'Oferta impossível',
          geohashes: ['6vjyq'],
          startsAt: periodo.endsAt,
          endsAt: periodo.startsAt,
        }),
      ).rejects.toThrow();
    });

    it('recusa parceiro que não existe', async () => {
      await expect(
        admin.criarOferta(adminId, {
          title: 'Oferta órfã',
          partnerId: 'parceiro-que-nao-existe',
          geohashes: ['6vjyq'],
          ...periodo,
        }),
      ).rejects.toThrow();
    });
  });

  describe('auditoria', () => {
    it('criar, editar e excluir deixam rastro com quem fez', async () => {
      const oferta = await admin.criarOferta(adminId, {
        title: 'Oferta que vai e volta',
        geohashes: ['6vjyq'],
        ...periodo,
      });
      await admin.editarOferta(adminId, oferta.id, { title: 'Oferta renomeada' });
      await admin.excluirOferta(adminId, oferta.id);

      const registros = await prisma.adminLog.findMany({
        where: { adminId },
        orderBy: { createdAt: 'asc' },
        select: { action: true, target: true },
      });

      expect(registros.map((r) => r.action)).toEqual([
        'partner.create',
        'offer.create',
        'offer.update',
        'offer.delete',
      ]);
      expect(registros.filter((r) => r.target === oferta.id)).toHaveLength(3);
    });
  });

  describe('página guardada da nota que falhou', () => {
    // Os números aqui são inventados de propósito. A primeira versão deste
    // teste usava o CPF que veio no fixture do app antigo — um CPF de uma
    // pessoa de verdade, num arquivo a caminho de um repositório público.
    it('o CPF sai antes de guardar', () => {
      const html = `<li><strong>CPF: </strong>111.111.111-11</li><li>CPF 12345678901</li>`;
      const limpo = semCpf(html);

      expect(limpo).not.toContain('111.111.111-11');
      expect(limpo).not.toContain('12345678901');
      expect(limpo).toContain('[CPF removido]');
    });

    it('a listagem não expõe a chave de acesso nem quem leu', async () => {
      const lista = await admin.notasQueFalharam(5);

      for (const nota of lista) {
        expect(Object.keys(nota)).not.toContain('accessKey');
        expect(Object.keys(nota)).not.toContain('userId');
        expect(nota.uf).toHaveLength(2);
      }
    });
  });
});
