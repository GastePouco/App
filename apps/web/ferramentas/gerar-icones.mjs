/**
 * Gera os ícones do PWA a partir de `design-system/logos/gastemenos-mark.svg`.
 *
 * Por que desenhar em vez de converter: o SVG do logo é simples (um retângulo
 * arredondado e dois traços), e converter exigiria uma biblioteca nativa —
 * `sharp` ou `resvg` — só para produzir cinco arquivos que quase nunca mudam.
 * Aqui são cem linhas de aritmética, `zlib` da biblioteca padrão e nenhum
 * binário para instalar em cada máquina e em cada CI.
 *
 * O traço é desenhado carimbando discos ao longo dos segmentos: é o que dá
 * junta e ponta arredondadas de graça, que é como o logo é. Renderiza a 4× e
 * reduz, para não sair serrilhado.
 *
 *   node ferramentas/gerar-icones.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const publico = path.join(aqui, '..', 'public');
const logos = path.join(aqui, '..', '..', '..', 'design-system', 'logos');

// Cores do design system: `brand` no fundo, `brand-accent` no traço.
const FUNDO = [0x0e, 0x4d, 0x3a];
const TRACO = [0xd4, 0xf3, 0x6b];

/** O desenho em coordenadas de 96×96, como no SVG. */
const NOTA = [
  [28, 18],
  [68, 18],
  [68, 78],
  [58, 71.5],
  [48, 78],
  [38, 71.5],
  [28, 78],
  [28, 18],
];
const SETA_HASTE = [
  [48, 34],
  [48, 54],
];
const SETA_PONTA = [
  [40, 46],
  [48, 54],
  [56, 46],
];
const ESPESSURA = 6;
const RAIO_DO_CANTO = 28;

function distanciaAteSegmento(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const comprimento = dx * dx + dy * dy;
  const t = comprimento === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / comprimento));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function dentroDoTraco(x, y, caminhos, espessura) {
  const raio = espessura / 2;
  for (const caminho of caminhos) {
    for (let i = 0; i < caminho.length - 1; i++) {
      if (distanciaAteSegmento(x, y, caminho[i], caminho[i + 1]) <= raio) return true;
    }
  }
  return false;
}

/** Retângulo arredondado. `raio = 0` preenche tudo (ícone maskable). */
function dentroDoFundo(x, y, lado, raio) {
  if (raio <= 0) return true;

  const cx = Math.min(Math.max(x, raio), lado - raio);
  const cy = Math.min(Math.max(y, raio), lado - raio);
  return Math.hypot(x - cx, y - cy) <= raio || (x >= raio && x <= lado - raio) || (y >= raio && y <= lado - raio);
}

/**
 * @param tamanho lado do PNG em pixels
 * @param escala fração do lado ocupada pelo desenho (maskable pede folga)
 * @param arredondar cantos arredondados no fundo
 */
function desenhar(tamanho, { escala = 1, arredondar = true } = {}) {
  const AMOSTRAS = 4;
  const pixels = Buffer.alloc(tamanho * tamanho * 4);

  const lado = tamanho;
  const raioDoCanto = arredondar ? (RAIO_DO_CANTO / 96) * lado : 0;
  const deslocamento = ((1 - escala) / 2) * lado;
  const fator = (escala * lado) / 96;

  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      let fundo = 0;
      let traco = 0;

      for (let sy = 0; sy < AMOSTRAS; sy++) {
        for (let sx = 0; sx < AMOSTRAS; sx++) {
          const px = x + (sx + 0.5) / AMOSTRAS;
          const py = y + (sy + 0.5) / AMOSTRAS;

          if (!dentroDoFundo(px, py, lado, raioDoCanto)) continue;
          fundo += 1;

          // Volta para o espaço 96×96 do logo.
          const lx = (px - deslocamento) / fator;
          const ly = (py - deslocamento) / fator;

          if (
            dentroDoTraco(lx, ly, [NOTA], ESPESSURA) ||
            dentroDoTraco(lx, ly, [SETA_HASTE, SETA_PONTA], ESPESSURA)
          ) {
            traco += 1;
          }
        }
      }

      const total = AMOSTRAS * AMOSTRAS;
      const alfa = fundo / total;
      const proporcaoDoTraco = fundo === 0 ? 0 : traco / fundo;

      const i = (y * tamanho + x) * 4;
      for (let canal = 0; canal < 3; canal++) {
        pixels[i + canal] = Math.round(
          FUNDO[canal] * (1 - proporcaoDoTraco) + TRACO[canal] * proporcaoDoTraco,
        );
      }
      pixels[i + 3] = Math.round(alfa * 255);
    }
  }

  return pixels;
}

// ------------------------------------------------------------------- PNG

function crc32(buffer) {
  let c = ~0;
  for (const byte of buffer) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pedaco(tipo, dados) {
  const nome = Buffer.from(tipo, 'ascii');
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const soma = Buffer.alloc(4);
  soma.writeUInt32BE(crc32(Buffer.concat([nome, dados])));
  return Buffer.concat([tamanho, nome, dados, soma]);
}

function paraPng(pixels, tamanho) {
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(tamanho, 0);
  cabecalho.writeUInt32BE(tamanho, 4);
  cabecalho[8] = 8; // bits por canal
  cabecalho[9] = 6; // RGBA
  // 10, 11, 12 = compressão, filtro e entrelaçamento padrão (zero)

  // Cada linha começa com o byte do filtro; 0 = nenhum.
  const linhas = Buffer.alloc((tamanho * 4 + 1) * tamanho);
  for (let y = 0; y < tamanho; y++) {
    const inicio = y * (tamanho * 4 + 1);
    linhas[inicio] = 0;
    pixels.copy(linhas, inicio + 1, y * tamanho * 4, (y + 1) * tamanho * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', cabecalho),
    pedaco('IDAT', deflateSync(linhas, { level: 9 })),
    pedaco('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ saída

mkdirSync(publico, { recursive: true });

const arquivos = [
  ['icone-192.png', 192, { escala: 1, arredondar: true }],
  ['icone-512.png', 512, { escala: 1, arredondar: true }],
  // Maskable: o sistema recorta em círculo, então o desenho encolhe para caber
  // na zona segura e o fundo sangra até a borda.
  ['icone-512-mascara.png', 512, { escala: 0.62, arredondar: false }],
  ['apple-touch-icon.png', 180, { escala: 1, arredondar: true }],
];

for (const [nome, tamanho, opcoes] of arquivos) {
  writeFileSync(path.join(publico, nome), paraPng(desenhar(tamanho, opcoes), tamanho));
  console.log(`${nome} (${tamanho}×${tamanho})`);
}

copyFileSync(path.join(logos, 'gastemenos-mark.svg'), path.join(publico, 'favicon.svg'));
console.log('favicon.svg (cópia do logo)');
