// A aba "Poster" (poster_operacoes.js): a imagem virando parede.
//
// Este teste NAO abre navegador. As duas contas que importam — o ladrilhamento e o
// reticulado — foram escritas sem <canvas>, sem DOM e sem internet justamente para
// poderem ser medidas com numero aqui. "Ficou bom?" um teste nao responde; "as folhas
// cobrem o cartaz inteiro sem buraco?" e "a area de tinta bate com o escuro da foto?"
// ele responde, e sao essas que quebram na pratica.
//
// O que este teste cobre:
//   1. a tabela de somas devolve a mesma media que a forca bruta (e' a base de tudo);
//   2. o ladrilhamento: numero de folhas, proporcao mantida, a uniao das folhas cobre o
//      cartaz exatamente, a ultima da fileira sai menor, e os dois jeitos de pedir
//      tamanho (por folhas e por centimetros) concordam entre si;
//   3. a SOBREPOSICAO: folhas vizinhas repetem exatamente o pedido, e uma sobreposicao
//      absurda e' aparada em vez de pedir folhas ate' o fim do mundo;
//   4. o reticulado: area de tinta proporcional ao escuro (a raiz quadrada, que e' o
//      erro classico de quem escreve halftone), branco nao gasta tinta, transparente
//      conta como papel, e as tres formas de cor;
//   5. as EMENDAS: nenhum ponto some entre duas folhas, e o ponto da divisa sai nas duas
//      (senao aparece uma fresta clara em cada emenda do cartaz);
//   6. os avisos que existem para ninguem descobrir com 40 folhas ja' impressas.
//
// Como rodar:  node testes/teste-poster.js

const P = require('../poster_operacoes.js');

let falhas = 0, total = 0;
function ok(nome, condicao, detalhe) {
    total++;
    if (!condicao) falhas++;
    console.log((condicao ? '  ok  ' : ' FALHA') + ' | ' + nome + (detalhe ? '  -> ' + detalhe : ''));
}

// --- ajudas -----------------------------------------------------------------

function imagem(largura, altura, fn) {
    const dados = new Uint8ClampedArray(largura * altura * 4);
    for (let y = 0; y < altura; y++) {
        for (let x = 0; x < largura; x++) {
            const c = (y * largura + x) * 4;
            const p = fn(x, y);
            dados[c] = p[0]; dados[c + 1] = p[1]; dados[c + 2] = p[2];
            dados[c + 3] = p[3] == null ? 255 : p[3];
        }
    }
    return { largura: largura, altura: altura, dados: dados };
}

const solido = (l, a, v, alfa) => imagem(l, a, () => [v, v, v, alfa]);

function sorteador(semente) {
    let s = semente;
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % 256; };
}

const planoBase = (extra) => P.planejarPoster(Object.assign({
    larguraOrigem: 1000, alturaOrigem: 750, papel: 'A4', orientacao: 'retrato',
    margem: 28, sobreposicao: 0, modo: 'folhas', folhas: 3, eixo: 'largura'
}, extra || {}));

// ---------------------------------------------------------------------------
console.log('\n1. A tabela de somas (a base de tudo)');
// ---------------------------------------------------------------------------

const sortear = sorteador(97);
const ruidosa = imagem(37, 23, () => [sortear(), sortear(), sortear()]);
const tabela = P.tabelaDeSomas(ruidosa);

function mediaBruta(img, x0, y0, x1, y1) {
    let soma = 0, n = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const o = (y * img.largura + x) * 4;
            soma += P.luminancia(img.dados[o], img.dados[o + 1], img.dados[o + 2]);
            n++;
        }
    }
    return soma / n;
}

let piorErro = 0;
[[0, 0, 37, 23], [3, 4, 10, 9], [0, 0, 1, 1], [30, 20, 37, 23], [5, 5, 6, 6], [12, 0, 13, 23]]
    .forEach(([a, b, c, d]) => {
        piorErro = Math.max(piorErro, Math.abs(P.mediaDoRetangulo(tabela, a, b, c, d).lum - mediaBruta(ruidosa, a, b, c, d)));
    });
ok('a media por tabela bate com a forca bruta', piorErro < 1e-9, 'pior erro ' + piorErro.toExponential(1));

// Um retangulo menor que um pixel acontece de verdade: e' o caso de ampliar uma figura
// pequena, quando o cartaz tem mais pontos do que a imagem tem pixels.
const minusculo = P.mediaDoRetangulo(tabela, 5.2, 4.3, 5.4, 4.6);
ok('retangulo menor que um pixel devolve o pixel, nao NaN',
   isFinite(minusculo.lum) && minusculo.lum >= 0 && minusculo.lum <= 255, String(minusculo.lum.toFixed(1)));
const foraDaBorda = P.mediaDoRetangulo(tabela, 36.5, 22.5, 99, 99);
ok('retangulo estourando a borda nao quebra', isFinite(foraDaBorda.lum));

// O verde pesa mais que o azul porque o olho enxerga assim.
ok('a luminancia e perceptual, nao a media dos tres canais',
   P.luminancia(0, 255, 0) > P.luminancia(0, 0, 255) * 5,
   'verde ' + P.luminancia(0, 255, 0).toFixed(0) + ' vs azul ' + P.luminancia(0, 0, 255).toFixed(0));

// ---------------------------------------------------------------------------
console.log('\n2. O ladrilhamento');
// ---------------------------------------------------------------------------

const plano = planoBase();
ok('3 folhas na largura dao 3 colunas', plano.colunas === 3);
ok('e as linhas saem da proporcao da imagem', plano.linhas === 2, plano.colunas + 'x' + plano.linhas);
ok('o total bate com colunas x linhas', plano.total === plano.colunas * plano.linhas, String(plano.total));
ok('o poster mantem a proporcao da imagem',
   Math.abs(plano.posterAltura / plano.posterLargura - 750 / 1000) < 1e-9);
ok('a area util e o papel menos as duas margens',
   Math.abs(plano.utilL - (plano.pagina.largura - 2 * 28)) < 1e-9 &&
   Math.abs(plano.utilA - (plano.pagina.altura - 2 * 28)) < 1e-9);

// A uniao das folhas tem de cobrir o cartaz inteiro, sem buraco e sem passar do fim.
const fileira = plano.folhas.filter(f => f.linha === 0).sort((a, b) => a.poster.x - b.poster.x);
let emenda = true;
for (let i = 1; i < fileira.length; i++) {
    if (Math.abs(fileira[i].poster.x - (fileira[i - 1].poster.x + fileira[i - 1].poster.largura)) > 1e-6) emenda = false;
}
ok('sem sobreposicao, uma folha comeca onde a outra acaba', emenda);
const ultima = fileira[fileira.length - 1];
ok('a ultima folha termina exatamente no fim do poster',
   Math.abs(ultima.poster.x + ultima.poster.largura - plano.posterLargura) < 1e-6);
ok('nenhuma folha passa do fim do poster',
   plano.folhas.every(f => f.poster.x + f.poster.largura <= plano.posterLargura + 1e-6 &&
                           f.poster.y + f.poster.altura <= plano.posterAltura + 1e-6));

// A ultima fileira costuma ser mais baixa que as outras — e' assim mesmo.
const coluna0 = plano.folhas.filter(f => f.coluna === 0).sort((a, b) => a.poster.y - b.poster.y);
ok('a ultima fileira sai mais baixa (o poster nao e multiplo exato da folha)',
   coluna0[coluna0.length - 1].poster.altura < coluna0[0].poster.altura + 1e-6);

// O destino fica DENTRO do papel, e o y do PDF cresce para cima.
ok('o desenho cabe dentro do papel, com a margem respeitada',
   plano.folhas.every(f => f.destino.x >= 28 - 1e-9 &&
                           f.destino.y >= 28 - 1e-6 &&
                           f.destino.x + f.destino.largura <= plano.pagina.largura - 28 + 1e-6 &&
                           f.destino.y + f.destino.altura <= plano.pagina.altura - 28 + 1e-6));
ok('o topo do desenho encosta na margem de cima (y do PDF cresce para cima)',
   plano.folhas.every(f => Math.abs(f.destino.y + f.destino.altura - (plano.pagina.altura - 28)) < 1e-6));

// O recorte em pixels tem de cobrir a imagem inteira.
const recorteFim = plano.folhas.reduce((m, f) => Math.max(m, f.recorte.x + f.recorte.largura), 0);
ok('os recortes cobrem a imagem ate o ultimo pixel', Math.abs(recorteFim - 1000) < 1e-6,
   recorteFim.toFixed(3) + ' de 1000');

// As bordas que levam cola sao as que tem vizinho.
ok('so as bordas com vizinho sao marcadas como cola',
   plano.folhas.every(f => f.colaDireita === (f.coluna < plano.colunas - 1) &&
                           f.colaAbaixo === (f.linha < plano.linhas - 1)));

// ---------------------------------------------------------------------------
console.log('\n3. Os dois jeitos de pedir tamanho');
// ---------------------------------------------------------------------------

const porAltura = planoBase({ eixo: 'altura', folhas: 2 });
ok('pedir por altura tambem funciona', porAltura.linhas === 2, porAltura.colunas + 'x' + porAltura.linhas);

const porCm = planoBase({ modo: 'tamanho', medida: 100, unidade: 'cm', eixo: 'largura' });
ok('pedir 100 cm devolve 100 cm de poster', Math.abs(porCm.posterLarguraCm - 100) < 1e-6,
   porCm.posterLarguraCm.toFixed(3) + ' cm');
ok('e as folhas necessarias sao calculadas', porCm.colunas >= 1 && porCm.linhas >= 1,
   porCm.colunas + 'x' + porCm.linhas);

// Os dois modos tem de concordar: se "por folhas" diz que 3 folhas dao X cm, entao pedir
// X cm tem de devolver 3 folhas.
const cmDeTresFolhas = planoBase({ folhas: 3 }).posterLarguraCm;
const voltando = planoBase({ modo: 'tamanho', medida: cmDeTresFolhas, unidade: 'cm' });
ok('os dois modos concordam entre si', voltando.colunas === 3,
   cmDeTresFolhas.toFixed(1) + ' cm -> ' + voltando.colunas + ' colunas');

const emPolegadas = planoBase({ modo: 'tamanho', medida: 10, unidade: 'pol' });
ok('polegada tambem vale', Math.abs(emPolegadas.posterLargura - 720) < 1e-6,
   emPolegadas.posterLargura.toFixed(1) + ' pt (10 pol = 720 pt)');

const deitado = planoBase({ orientacao: 'paisagem' });
ok('papel deitado troca largura por altura',
   Math.abs(deitado.pagina.largura - plano.pagina.altura) < 1e-9);

// ---------------------------------------------------------------------------
console.log('\n4. A sobreposicao (a aba que se cola)');
// ---------------------------------------------------------------------------

const comSobra = planoBase({ sobreposicao: 20 });
const fileiraS = comSobra.folhas.filter(f => f.linha === 0).sort((a, b) => a.poster.x - b.poster.x);
let repeticaoCerta = fileiraS.length > 1;
for (let i = 1; i < fileiraS.length; i++) {
    const repete = (fileiraS[i - 1].poster.x + fileiraS[i - 1].poster.largura) - fileiraS[i].poster.x;
    if (Math.abs(repete - 20) > 1e-6) repeticaoCerta = false;
}
ok('folhas vizinhas repetem exatamente o pedido', repeticaoCerta, '20 pt');
ok('com sobreposicao o poster fica menor que sem (a mesma contagem de folhas rende menos)',
   comSobra.posterLargura < plano.posterLargura,
   comSobra.posterLargura.toFixed(0) + ' vs ' + plano.posterLargura.toFixed(0) + ' pt');

// Uma sobreposicao maior que a folha faria o passo ser zero e as folhas, infinitas.
const absurda = planoBase({ sobreposicao: 99999 });
ok('sobreposicao absurda e aparada em vez de travar',
   absurda.sobreposicao <= Math.min(absurda.utilL, absurda.utilA) / 2 + 1e-9 && absurda.total < 500,
   'aparada para ' + absurda.sobreposicao.toFixed(1) + ' pt, ' + absurda.total + ' folhas');

let recusouMargem = false;
try { planoBase({ margem: 400 }); } catch (_) { recusouMargem = true; }
ok('margem que nao deixa espaco e recusada com explicacao', recusouMargem);

let recusouImagem = false;
try { P.planejarPoster({ larguraOrigem: 0, alturaOrigem: 10 }); } catch (_) { recusouImagem = true; }
ok('imagem sem tamanho e recusada', recusouImagem);

// ---------------------------------------------------------------------------
console.log('\n5. O reticulado');
// ---------------------------------------------------------------------------

const planoUm = P.planejarPoster({ larguraOrigem: 200, alturaOrigem: 200, papel: 'A4', margem: 28,
                                   modo: 'folhas', folhas: 1, eixo: 'largura' });

const branco = P.gerarPontos(solido(200, 200, 255), planoUm, { passo: 10 });
ok('papel branco nao gasta ponto nenhum', branco.pontos.length === 0);

const preto = P.gerarPontos(solido(200, 200, 0), planoUm, { passo: 10, tamanhoPonto: 1 });
ok('preto total enche a grade', preto.pontos.length > 2000, String(preto.pontos.length));
ok('e cobre o papel inteiro de tinta', Math.abs(preto.coberturaMedia - 1) < 0.02,
   (preto.coberturaMedia * 100).toFixed(1) + '%');

// O CORACAO do halftone: a AREA do ponto tem de ser proporcional ao escuro, nao o raio.
// Quem usa o escuro como raio entrega um cartaz muito mais escuro que a foto.
let proporcional = true;
[[255, 0], [192, 0.25], [128, 0.5], [64, 0.75], [0, 1]].forEach(([tom, escuroEsperado]) => {
    const r = P.gerarPontos(solido(200, 200, tom), planoUm, { passo: 10, tamanhoPonto: 1 });
    const area = r.pontos.length ? Math.PI * Math.pow(r.pontos[0].raio, 2) : 0;
    const fracao = area / (10 * 10);
    if (Math.abs(fracao - escuroEsperado) > 0.02) proporcional = false;
    ok('  escuro ' + Math.round(escuroEsperado * 100) + '% -> ' + Math.round(fracao * 100) + '% de tinta',
       Math.abs(fracao - escuroEsperado) <= 0.02);
});
ok('a area do ponto e proporcional ao escuro (raio pela RAIZ)', proporcional);

const transparente = P.gerarPontos(solido(200, 200, 0, 0), planoUm, { passo: 10 });
ok('pixel transparente conta como papel, nao como tinta', transparente.pontos.length === 0);

const meioTransparente = P.gerarPontos(solido(200, 200, 0, 128), planoUm, { passo: 10, tamanhoPonto: 1 });
ok('e meio transparente vira meio tom',
   meioTransparente.pontos.length > 0 && meioTransparente.coberturaMedia > 0.4 && meioTransparente.coberturaMedia < 0.6,
   (meioTransparente.coberturaMedia * 100).toFixed(0) + '% de tinta');

const vermelho = P.gerarPontos(imagem(200, 200, () => [200, 30, 40]), planoUm, { passo: 10, cor: 'original' });
ok('no modo colorido o ponto guarda a cor da imagem',
   String(vermelho.pontos[0].cor) === '200,30,40', String(vermelho.pontos[0].cor));
const semCor = P.gerarPontos(imagem(200, 200, () => [200, 30, 40]), planoUm, { passo: 10, cor: 'preto' });
ok('e no modo preto nao guarda cor nenhuma', semCor.pontos[0].cor === undefined);
ok('mas o TAMANHO do ponto e o mesmo nos dois (o tom nao vira tamanho)',
   Math.abs(vermelho.pontos[0].raio - semCor.pontos[0].raio) < 1e-9);

const claro = P.gerarPontos(solido(200, 200, 200), planoUm, { passo: 10, tamanhoPonto: 1 });
const claroInvertido = P.gerarPontos(solido(200, 200, 200), planoUm, { passo: 10, tamanhoPonto: 1, invertido: true });
ok('inverter troca claro por escuro', claroInvertido.coberturaMedia > claro.coberturaMedia,
   (claro.coberturaMedia * 100).toFixed(0) + '% -> ' + (claroInvertido.coberturaMedia * 100).toFixed(0) + '%');

const passoGrande = P.gerarPontos(solido(200, 200, 128), planoUm, { passo: 20 });
const passoPequeno = P.gerarPontos(solido(200, 200, 128), planoUm, { passo: 5 });
ok('ponto mais junto = mais pontos', passoPequeno.pontos.length > passoGrande.pontos.length * 3,
   passoGrande.pontos.length + ' -> ' + passoPequeno.pontos.length);
ok('mas a tinta gasta continua a mesma (o tom nao muda com a distancia)',
   Math.abs(passoPequeno.coberturaMedia - passoGrande.coberturaMedia) < 0.03,
   (passoGrande.coberturaMedia * 100).toFixed(0) + '% vs ' + (passoPequeno.coberturaMedia * 100).toFixed(0) + '%');

// ---------------------------------------------------------------------------
console.log('\n6. As emendas (onde o cartaz falha na vida real)');
// ---------------------------------------------------------------------------

const planoEmenda = planoBase({ folhas: 3 });
const retEmenda = P.gerarPontos(solido(1000, 750, 80), planoEmenda, { passo: 12, tamanhoPonto: 1 });
const porFolha = planoEmenda.folhas.map(f => P.pontosDaFolha(retEmenda, f, planoEmenda));

// Nenhum ponto pode sumir entre duas folhas.
const folga = retEmenda.raioMaximo + 0.5;
const alcancados = new Set();
planoEmenda.folhas.forEach(f => {
    retEmenda.pontos.forEach((p, k) => {
        const q = f.poster;
        if (p.x >= q.x - folga && p.x <= q.x + q.largura + folga &&
            p.y >= q.y - folga && p.y <= q.y + q.altura + folga) alcancados.add(k);
    });
});
ok('nenhum ponto some entre as folhas', alcancados.size === retEmenda.pontos.length,
   (retEmenda.pontos.length - alcancados.size) + ' perdidos');

const somaFolhas = porFolha.reduce((s, p) => s + p.length, 0);
ok('o ponto da divisa sai nas DUAS folhas (senao a emenda fica com fresta)',
   somaFolhas > retEmenda.pontos.length,
   (somaFolhas - retEmenda.pontos.length) + ' pontos repetidos de proposito');

let foraDoPapel = 0;
porFolha.forEach(pts => pts.forEach(p => {
    if (p.x < -folga || p.x > planoEmenda.pagina.largura + folga) foraDoPapel++;
    if (p.y < -folga || p.y > planoEmenda.pagina.altura + folga) foraDoPapel++;
}));
ok('e nenhum ponto cai fora do papel', foraDoPapel === 0, String(foraDoPapel));

// O y vira: o ponto do TOPO do poster tem de sair na parte de CIMA da folha (y grande,
// porque no PDF o zero fica embaixo). Trocar isso imprime o cartaz de cabeca para baixo.
const folhaTopo = planoEmenda.folhas.find(f => f.linha === 0 && f.coluna === 0);
const doTopo = P.pontosDaFolha(retEmenda, folhaTopo, planoEmenda)
    .reduce((melhor, p) => (!melhor || p.y > melhor.y) ? p : melhor, null);
ok('o topo do poster sai no topo da folha (o eixo y do PDF esta virado)',
   doTopo.y > planoEmenda.pagina.altura / 2, 'y = ' + doTopo.y.toFixed(0) +
   ' de ' + planoEmenda.pagina.altura.toFixed(0));

// ---------------------------------------------------------------------------
console.log('\n7. Os avisos (antes de gastar a resma)');
// ---------------------------------------------------------------------------

const pequeno = planoBase({ folhas: 2 });
ok('um cartaz pequeno nao enche a tela de aviso',
   P.conferirPlano(pequeno, P.gerarPontos(solido(1000, 750, 200), pequeno, { passo: 12 })).length === 0);

const enorme = planoBase({ folhas: 8 });
const avisosEnorme = P.conferirPlano(enorme, P.gerarPontos(solido(1000, 750, 20), enorme, { passo: 6 }));
ok('muitas folhas viram aviso', avisosEnorme.some(a => /folhas/.test(a.texto)), String(enorme.total) + ' folhas');
ok('pontos demais viram aviso', avisosEnorme.some(a => /pontos/.test(a.texto)));
ok('cartaz encharcado de tinta vira aviso', avisosEnorme.some(a => /escuro/.test(a.texto)));

const fotoEsticada = planoBase({ folhas: 6 });
ok('no modo foto, ampliar demais avisa do borrao',
   P.conferirPlano(fotoEsticada, null).some(a => /polegada/.test(a.texto)),
   Math.round(fotoEsticada.dpiEfetivo) + ' DPI');
ok('e no modo pontos esse aviso nao aparece (o reticulado nao borra)',
   !P.conferirPlano(fotoEsticada, P.gerarPontos(solido(1000, 750, 200), fotoEsticada, { passo: 12 }))
     .some(a => /polegada/.test(a.texto)));

console.log('\n' + (falhas ? falhas + ' FALHA(S) de ' + total : 'todos os ' + total + ' testes passaram'));
process.exit(falhas ? 1 : 0);
