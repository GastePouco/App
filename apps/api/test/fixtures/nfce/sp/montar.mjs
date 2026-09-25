// Monta as páginas de teste da NFC-e de São Paulo a partir do texto capturado
// de uma nota **real** (Zaffari, 29/08/2026, 66 itens, R$ 1.901,57), conferida
// contra a página da SEFAZ-SP em 11/09/2026.
//
// O que é real e o que não é, para ninguém se enganar depois:
//
// - **Real**: os itens, as quantidades (inclusive 0,6379 kg de carne moída), os
//   preços, o total, a data, a loja e o CNPJ. É por isso que o teste vale.
// - **Reconstruído**: o HTML em volta, montado com as classes e os rótulos do
//   layout da NFC-e. A página inteira não foi salva na época; o texto foi.
// - **Trocado**: o CPF do consumidor virou 000.000.000-00. O campo fica no
//   lugar porque o parser precisa detectar que ele existia — o número em si
//   nunca entra no repositório nem no banco.
//
// Duas versões, de propósito: uma com as classes do site e outra sem classe
// nenhuma. A segunda é a que prova que o leitor aguenta a SEFAZ trocar o HTML,
// porque aí só sobram os rótulos visíveis ("Qtde.:", "Vl. Unit.:").
//
//   node montar.mjs
//
// Regenerar só é necessário ao mexer no formato; os .html ficam versionados.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const bruto = fs.readFileSync(path.join(aqui, 'itens-da-nota-real.txt'), 'utf8').trim().split('\n');

const itens = [];
for (let i = 0; i < bruto.length; i += 3) {
  const cabecalho = bruto[i];
  const meio = bruto[i + 1];
  const total = bruto[i + 2];

  const nome = cabecalho.slice(0, cabecalho.indexOf('(')).trim();
  const codigo = cabecalho.match(/Código:\s*(\d+)/)[1];
  const qtd = meio.match(/Qtde\.:\s*([\d.,]+)/)[1];
  const un = meio.match(/UN:\s*([A-Z]+)/)[1];
  const unit = meio.match(/Vl\. Unit\.:\s*([\d.,]+)/)[1];

  itens.push({ nome, codigo, qtd, un, unit, total: total.trim() });
}

const comClasses = (it) => `
<tr id="Item + ${it.codigo}">
  <td><h7><span class="txtTit">${it.nome}</span>
  <span class="RCod">(Código: ${it.codigo} )</span>
  <span class="Rqtd">Qtde.:${it.qtd}</span>
  <span class="RUN">UN: ${it.un}</span>
  <span class="RvlUnit">Vl. Unit.:&nbsp;&nbsp;${it.unit}</span></h7></td>
  <td align="right"><span class="txtTit">Vl. Total</span><span class="valor">${it.total}</span></td>
</tr>`;

const semClasses = (it) => `
<tr>
  <td><h7><span>${it.nome}</span>
  <span>(Código: ${it.codigo} )</span>
  <span>Qtde.:${it.qtd}</span>
  <span>UN: ${it.un}</span>
  <span>Vl. Unit.:&nbsp;&nbsp;${it.unit}</span></h7></td>
  <td align="right"><span>Vl. Total</span><span>${it.total}</span></td>
</tr>`;

const pagina = (linha) => `<!DOCTYPE html><html lang="pt-br"><head>
<title>Consulta Resumida NFC-e - Secretaria da Fazenda - Governo do Estado de São Paulo</title></head>
<body><form id="form1">
<div id="u20" class="txtTopo">COMPANHIA ZAFFARI COMERCIO E INDUSTRIA</div>
<div class="text">CNPJ: 93.015.006/0053-44</div>
<div class="text">AV GIOVANNI GRONCHI , 5930 , , VILA ANDRADE , SAO PAULO , SP</div>
<table id="tabResult">${itens.map(linha).join('')}</table>
<div id="totalNota">
  <div id="linhaTotal"><label>Qtd. total de itens:</label><span class="totalNumb">66</span></div>
  <div id="linhaTotal"><label>Valor a pagar R$:</label><span class="totalNumb txtMax">1.901,57</span></div>
  <div id="linhaForma"><label>Forma de pagamento:</label><label>Valor pago R$:</label><span class="totalNumb">1.901,57</span></div>
  <div id="linhaTroco"><label>Troco</label><span class="totalNumb">NaN</span></div>
</div>
<div id="infos"><div><ul><li><strong>Número: </strong>608479
<strong>Série: </strong>113 <strong>Emissão: </strong>29/08/2026 12:20:13 - Via Consumidor</li></ul></div>
<div><h4>Consumidor</h4><ul><li><strong>CPF: </strong>000.000.000-00</li><li><strong>Nome: </strong></li></ul></div></div>
</form></body></html>`;

fs.writeFileSync(path.join(aqui, 'pagina-com-classes.html'), pagina(comClasses));
fs.writeFileSync(path.join(aqui, 'pagina-sem-classes.html'), pagina(semClasses));

const soma = itens.reduce((s, i) => s + Number(i.total.replace('.', '').replace(',', '.')), 0);
console.log(`${itens.length} itens, soma R$ ${soma.toFixed(2)} (a nota diz 1.901,57)`);
