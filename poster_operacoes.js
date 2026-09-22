// poster_operacoes.js — O MOTOR DA ABA "POSTER": uma imagem virando parede.
//
// POR QUE ISTO EXISTE
//   A escola quase nunca tem plotter. O que ela tem e' uma impressora A4 e uma parede
//   vazia. O mapa do Brasil para a aula de Geografia, a tabela periodica, a linha do
//   tempo, o cartaz da feira de ciencias, a foto da turma para a formatura: tudo isso
//   precisa sair grande, e sai numa folha pequena.
//
//   O jeito conhecido de resolver isso e' um site que corta a imagem em varias folhas e
//   devolve um PDF. E de novo o preco e' subir o arquivo: a foto da turma, com o rosto de
//   trinta criancas, passa a existir no servidor de um terceiro que a escola nao
//   autorizou (ver CONFORMIDADE-SEDUC.md).
//
//   Aqui o corte acontece no aparelho, como nas outras duas abas.
//
// O QUE TEM AQUI
//   Duas contas, as duas puras — sem <canvas>, sem DOM, sem internet — para poderem ser
//   medidas com numero fora do navegador (ver testes/teste-poster.js):
//
//   1. O LADRILHAMENTO. Dado o tamanho da imagem, o papel, a margem e o quanto se quer de
//      poster, decide quantas folhas, de que pedaco da imagem cada folha cuida e onde
//      esse pedaco cai dentro da folha. E' aqui que mora a sobreposicao (a aba de papel
//      que se cola) e o motivo de a ultima folha da fileira sair menor.
//
//   2. O RETICULADO (halftone). Transforma a imagem numa grade de pontos: cada ponto
//      cresce conforme o escuro do pedaco que ele representa. E' o que permite ampliar
//      vinte vezes sem a imagem virar um quadriculado borrado — de perto sao bolinhas, de
//      longe e' a figura. Tambem e' o que faz o cartaz gastar pouca tinta.
//
//   A montagem do PDF em si mora em poster.js, porque depende do pdf-lib.

(function () {
'use strict';

// Tamanhos de papel em pontos (1 pt = 1/72"). Sao os mesmos de pdf_operacoes.js — e um
// teste confere que continuam iguais. A tabela e' repetida aqui de proposito: este
// arquivo precisa rodar sozinho, sem o motor de PDF carregado.
const PAPEIS = {
    A3: [841.89, 1190.55], A4: [595.28, 841.89], A5: [419.53, 595.28],
    Carta: [612, 792], Oficio: [612, 1008], Tabloide: [792, 1224], B5: [498.9, 708.66]
};

const PT_POR_CM = 72 / 2.54;        // 28.3465
const PT_POR_POL = 72;

function paginaEmPontos(papel, orientacao) {
    const base = PAPEIS[papel] || PAPEIS.A4;
    const deitado = orientacao === 'paisagem';
    return { largura: deitado ? base[1] : base[0], altura: deitado ? base[0] : base[1] };
}

// ---------------------------------------------------------------------------
// 1. O LADRILHAMENTO
// ---------------------------------------------------------------------------
//
// O vocabulario, porque sem ele a conta abaixo nao se le:
//
//   margem         a borda da folha que a impressora nao alcanca (e onde ficam as marcas
//                  de corte). O desenho acontece so' dentro do que sobra.
//   area util      o retangulo de desenho de UMA folha: papel menos as duas margens.
//   sobreposicao   quanto de imagem duas folhas vizinhas repetem. Quem vai COLAR precisa
//                  disso (sem repeticao, o menor erro de tesoura vira uma fresta branca).
//                  Quem vai encostar as folhas topo a topo usa zero.
//   passo          quanto o poster anda de uma folha para a proxima: area util menos a
//                  sobreposicao. E' o passo — e nao a area util — que multiplica.
//
// Dai a conta de quantas folhas cabem num poster de largura P:
//
//   P = folhas * util - (folhas - 1) * sobreposicao
//     = folhas * passo + sobreposicao
//   folhas = arredondarParaCima((P - sobreposicao) / passo)
//
// E' o "+ sobreposicao" que costuma ser esquecido, e' ele que faz a conta ingenua pedir
// uma folha a mais numa ponta e uma a menos na outra.

function planejarPoster(opcoes) {
    const o = opcoes || {};
    const origemL = Number(o.larguraOrigem);
    const origemA = Number(o.alturaOrigem);
    if (!(origemL > 0) || !(origemA > 0)) throw new Error('a imagem de origem precisa de largura e altura');

    const pagina = paginaEmPontos(o.papel || 'A4', o.orientacao || 'retrato');
    const margem = Math.max(0, Number(o.margem == null ? 28 : o.margem));   // ~1 cm
    const utilL = pagina.largura - 2 * margem;
    const utilA = pagina.altura - 2 * margem;
    if (!(utilL > 0) || !(utilA > 0)) {
        throw new Error('a margem nao deixa espaco nenhum para desenhar nesta folha');
    }

    // A sobreposicao nao pode comer a folha inteira: se ela chegasse na area util, o
    // passo seria zero e o numero de folhas, infinito. O teto de metade garante que cada
    // folha nova sempre adianta pelo menos metade de si mesma.
    const tetoSobra = Math.min(utilL, utilA) / 2;
    const sobreposicao = Math.min(Math.max(0, Number(o.sobreposicao || 0)), tetoSobra);
    const passoL = utilL - sobreposicao;
    const passoA = utilA - sobreposicao;

    // Quanto de poster se quer. Dois jeitos de pedir, porque sao duas perguntas
    // diferentes: "quero que caiba naquela parede" (tamanho) e "tenho seis folhas"
    // (folhas). O outro lado sai da proporcao da imagem — poster nao distorce.
    const proporcao = origemA / origemL;
    let posterL;
    if (o.modo === 'folhas') {
        const folhas = Math.max(1, Math.round(Number(o.folhas) || 1));
        if (o.eixo === 'altura') {
            const posterA = folhas * passoA + sobreposicao;
            posterL = posterA / proporcao;
        } else {
            posterL = folhas * passoL + sobreposicao;
        }
    } else {
        const medida = Math.max(1, Number(o.medida) || 100);
        const emPontos = (o.unidade === 'pol') ? medida * PT_POR_POL : medida * PT_POR_CM;
        posterL = (o.eixo === 'altura') ? emPontos / proporcao : emPontos;
    }
    const posterA = posterL * proporcao;

    const colunas = Math.max(1, Math.ceil((posterL - sobreposicao) / passoL - 1e-9));
    const linhas = Math.max(1, Math.ceil((posterA - sobreposicao) / passoA - 1e-9));

    // De pontos de poster para pixels da imagem. Todo recorte passa por aqui.
    const pxPorPonto = origemL / posterL;

    const folhasLista = [];
    for (let linha = 0; linha < linhas; linha++) {
        for (let coluna = 0; coluna < colunas; coluna++) {
            // Onde esta folha comeca e termina, medido no poster inteiro. A ultima da
            // fileira e' cortada no fim do poster: ela sai menor, e e' assim mesmo.
            const x0 = coluna * passoL;
            const y0 = linha * passoA;
            const x1 = Math.min(posterL, x0 + utilL);
            const y1 = Math.min(posterA, y0 + utilA);
            const larguraDesenho = x1 - x0;
            const alturaDesenho = y1 - y0;
            if (larguraDesenho <= 0.01 || alturaDesenho <= 0.01) continue;

            folhasLista.push({
                indice: folhasLista.length,
                linha: linha,
                coluna: coluna,
                // O pedaco do poster de que esta folha cuida (em pontos, canto superior
                // esquerdo do poster na origem).
                poster: { x: x0, y: y0, largura: larguraDesenho, altura: alturaDesenho },
                // O mesmo pedaco, medido em pixels da imagem de origem — e' o recorte.
                recorte: {
                    x: x0 * pxPorPonto,
                    y: y0 * pxPorPonto,
                    largura: larguraDesenho * pxPorPonto,
                    altura: alturaDesenho * pxPorPonto
                },
                // Onde desenhar dentro da folha. O eixo y do PDF cresce para CIMA, entao
                // o topo do desenho fica em (altura da pagina - margem - altura).
                destino: {
                    x: margem,
                    y: pagina.altura - margem - alturaDesenho,
                    largura: larguraDesenho,
                    altura: alturaDesenho
                },
                // Estas bordas encostam em outra folha: sao as que levam cola, e as que
                // NAO devem receber marca de corte (cortar ali comeria a sobreposicao).
                colaDireita: coluna < colunas - 1,
                colaAbaixo: linha < linhas - 1
            });
        }
    }

    return {
        pagina: pagina,
        margem: margem,
        sobreposicao: sobreposicao,
        utilL: utilL,
        utilA: utilA,
        colunas: colunas,
        linhas: linhas,
        total: folhasLista.length,
        posterLargura: posterL,
        posterAltura: posterA,
        posterLarguraCm: posterL / PT_POR_CM,
        posterAlturaCm: posterA / PT_POR_CM,
        pxPorPonto: pxPorPonto,
        // Quantos pixels de imagem sobram por polegada impressa. Abaixo de ~60 a foto
        // impressa fica visivelmente mole; no reticulado isso nao importa, porque o que
        // se imprime sao pontos e nao a foto.
        dpiEfetivo: (origemL / posterL) * 72,
        folhas: folhasLista
    };
}

// ---------------------------------------------------------------------------
// 2. O RETICULADO (halftone)
// ---------------------------------------------------------------------------
//
// A imagem vira uma grade de pontos. Cada ponto representa um quadradinho da imagem e
// cresce conforme o escuro daquele quadradinho.
//
// O RAIO SAI DA RAIZ do escuro, e nao do escuro direto. O olho le AREA, nao raio: um
// ponto com o dobro do raio cobre quatro vezes mais papel. Usar o escuro como raio
// escureceria o cartaz inteiro — os meios-tons sairiam quase pretos. Com a raiz, a area
// coberta fica proporcional ao escuro, que e' o que faz o cartaz visto de longe ter o
// mesmo tom da foto.

// Luminancia perceptual. Os pesos nao sao 1/3 cada porque o olho enxerga muito mais o
// verde que o azul: um azul puro e um verde puro com a mesma "media RGB" nao parecem nem
// de longe igualmente claros.
function luminancia(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Tabela de somas acumuladas (imagem integral). Com ela, a media de QUALQUER retangulo
// sai em quatro consultas, em vez de percorrer o retangulo inteiro. Sem isso, um cartaz
// de vinte mil pontos sobre uma foto de doze megapixels percorreria a foto vinte mil
// vezes — e a aba travaria por minutos.
function tabelaDeSomas(img) {
    const L = img.largura, A = img.altura, d = img.dados;
    // (L+1) x (A+1) com uma linha e uma coluna de zeros na frente: evita testar borda
    // dentro do laco, que e' onde este tipo de codigo costuma errar por um.
    const passo = L + 1;
    const somaLum = new Float64Array(passo * (A + 1));
    const somaR = new Float64Array(passo * (A + 1));
    const somaG = new Float64Array(passo * (A + 1));
    const somaB = new Float64Array(passo * (A + 1));

    for (let y = 0; y < A; y++) {
        let linhaLum = 0, linhaR = 0, linhaG = 0, linhaB = 0;
        const acima = y * passo;
        const atual = (y + 1) * passo;
        for (let x = 0; x < L; x++) {
            const o = (y * L + x) * 4;
            const alfa = d[o + 3] / 255;
            // Pixel transparente conta como papel: senao o fundo vazio de um PNG
            // recortado viraria uma mancha preta de tinta no cartaz.
            const r = d[o] * alfa + 255 * (1 - alfa);
            const g = d[o + 1] * alfa + 255 * (1 - alfa);
            const b = d[o + 2] * alfa + 255 * (1 - alfa);
            linhaLum += luminancia(r, g, b); linhaR += r; linhaG += g; linhaB += b;
            somaLum[atual + x + 1] = somaLum[acima + x + 1] + linhaLum;
            somaR[atual + x + 1] = somaR[acima + x + 1] + linhaR;
            somaG[atual + x + 1] = somaG[acima + x + 1] + linhaG;
            somaB[atual + x + 1] = somaB[acima + x + 1] + linhaB;
        }
    }
    return { passo: passo, largura: L, altura: A, lum: somaLum, r: somaR, g: somaG, b: somaB };
}

// A media de um retangulo, em quatro consultas.
function mediaDoRetangulo(tabela, x0, y0, x1, y1) {
    const L = tabela.largura, A = tabela.altura, p = tabela.passo;
    x0 = Math.max(0, Math.min(L, Math.floor(x0)));
    y0 = Math.max(0, Math.min(A, Math.floor(y0)));
    x1 = Math.max(0, Math.min(L, Math.ceil(x1)));
    y1 = Math.max(0, Math.min(A, Math.ceil(y1)));
    // Um retangulo que cai entre dois pixels nao pode devolver "nada": vira o pixel mais
    // proximo. Acontece de verdade quando o cartaz tem mais pontos do que a imagem tem
    // pixels — ampliar uma figura pequena e' justamente o caso desta aba.
    if (x1 <= x0) { x0 = Math.max(0, Math.min(L - 1, x0)); x1 = x0 + 1; }
    if (y1 <= y0) { y0 = Math.max(0, Math.min(A - 1, y0)); y1 = y0 + 1; }

    const n = (x1 - x0) * (y1 - y0);
    const canto = (soma) => (soma[y1 * p + x1] - soma[y0 * p + x1] - soma[y1 * p + x0] + soma[y0 * p + x0]) / n;
    return { lum: canto(tabela.lum), r: canto(tabela.r), g: canto(tabela.g), b: canto(tabela.b) };
}

// Gera os pontos do cartaz inteiro, em coordenadas de POSTER (pontos de PDF, com o canto
// superior esquerdo na origem). Quem corta isso em folhas e' pontosDaFolha().
//
// opcoes: { passo, tamanhoPonto, cor, corFixa, contraste, invertido }
//   passo         distancia entre centros de pontos, em pt. Menor = mais detalhe, mais
//                 pontos, PDF maior e impressao mais lenta.
//   tamanhoPonto  1 = o ponto mais escuro encosta nos vizinhos; acima de 1 eles se
//                 fundem no preto (bom para texto), abaixo, o cartaz fica mais claro.
//   cor           'preto' | 'original' | 'fixa'
function gerarPontos(img, plano, opcoes) {
    const o = opcoes || {};
    const passo = Math.max(1, Number(o.passo) || 10);
    const tamanhoPonto = Math.max(0.1, Number(o.tamanhoPonto == null ? 1 : o.tamanhoPonto));
    const contraste = Number(o.contraste == null ? 1 : o.contraste);
    const invertido = !!o.invertido;
    const modoCor = o.cor || 'preto';

    // Raio maximo: um circulo de raio passo/sqrt(pi) tem a area de um quadrado de lado
    // passo. E' o ponto que, no preto total, cobre exatamente o quadradinho dele — o
    // ponto de referencia a partir do qual `tamanhoPonto` aumenta ou diminui.
    const raioMaximo = (passo / Math.sqrt(Math.PI)) * tamanhoPonto;

    const tabela = tabelaDeSomas(img);
    const colunas = Math.max(1, Math.ceil(plano.posterLargura / passo));
    const linhas = Math.max(1, Math.ceil(plano.posterAltura / passo));
    const pxPorPonto = plano.pxPorPonto;

    const pontos = [];
    for (let j = 0; j < linhas; j++) {
        for (let i = 0; i < colunas; i++) {
            const cx = (i + 0.5) * passo;
            const cy = (j + 0.5) * passo;
            if (cx > plano.posterLargura || cy > plano.posterAltura) continue;

            const media = mediaDoRetangulo(tabela,
                (cx - passo / 2) * pxPorPonto, (cy - passo / 2) * pxPorPonto,
                (cx + passo / 2) * pxPorPonto, (cy + passo / 2) * pxPorPonto);

            let escuro = 1 - media.lum / 255;
            if (invertido) escuro = 1 - escuro;
            if (contraste !== 1) {
                escuro = Math.pow(Math.max(0, Math.min(1, escuro)), 1 / Math.max(0.01, contraste));
            }
            escuro = Math.max(0, Math.min(1, escuro));
            // Ponto que sairia menor que um fio de caneta nao vale o byte nem o risco de
            // virar sujeira na impressao: some.
            const raio = raioMaximo * Math.sqrt(escuro);
            if (raio < 0.12) continue;

            const ponto = { x: cx, y: cy, raio: raio };
            if (modoCor === 'original') {
                // No modo colorido o TOM vem da imagem e o TAMANHO continua vindo do
                // escuro. Um amarelo claro vira um ponto amarelo pequeno, nao um ponto
                // amarelo gigante que apagaria o desenho.
                ponto.cor = [
                    Math.round(Math.max(0, Math.min(255, media.r))),
                    Math.round(Math.max(0, Math.min(255, media.g))),
                    Math.round(Math.max(0, Math.min(255, media.b)))
                ];
            }
            pontos.push(ponto);
        }
    }

    return {
        pontos: pontos,
        passo: passo,
        raioMaximo: raioMaximo,
        colunas: colunas,
        linhas: linhas,
        // Quanto de tinta o cartaz inteiro gasta, em fracao de papel coberto. Serve para
        // avisar antes de alguem mandar 30 folhas quase pretas para a impressora da escola.
        coberturaMedia: pontos.reduce((s, p) => s + Math.PI * p.raio * p.raio, 0) /
                        Math.max(1, plano.posterLargura * plano.posterAltura)
    };
}

// Os pontos de UMA folha, ja' convertidos para as coordenadas daquela pagina do PDF.
//
// A folga de um raio maximo em volta e' obrigatoria: o ponto cujo CENTRO caiu na folha
// vizinha, mas cuja barriga entra nesta, precisa ser desenhado aqui tambem — senao
// aparece uma fresta clara em toda emenda do cartaz.
function pontosDaFolha(reticulado, folha, plano) {
    const folga = reticulado.raioMaximo + 0.5;
    const p = folha.poster;
    const saida = [];
    for (let k = 0; k < reticulado.pontos.length; k++) {
        const ponto = reticulado.pontos[k];
        if (ponto.x < p.x - folga || ponto.x > p.x + p.largura + folga) continue;
        if (ponto.y < p.y - folga || ponto.y > p.y + p.altura + folga) continue;
        saida.push({
            // Dentro da folha, medido a partir do canto de desenho...
            x: folha.destino.x + (ponto.x - p.x),
            // ...e com o y virado, porque no PDF o zero fica embaixo.
            y: folha.destino.y + folha.destino.altura - (ponto.y - p.y),
            raio: ponto.raio,
            cor: ponto.cor
        });
    }
    return saida;
}

// ---------------------------------------------------------------------------
// Avisos antes de gastar papel
// ---------------------------------------------------------------------------
// Um cartaz de 40 folhas e' meia resma. Um PDF de 300 mil pontos trava a impressora da
// secretaria. Estas contas existem para a tela poder dizer isso ANTES.

const FOLHAS_MUITAS = 24;
const PONTOS_DEMAIS = 260000;
const DPI_BAIXO = 55;

function conferirPlano(plano, reticulado) {
    const avisos = [];
    if (plano.total > FOLHAS_MUITAS) {
        avisos.push({
            grau: 'atencao',
            texto: 'São ' + plano.total + ' folhas (' + plano.colunas + ' × ' + plano.linhas +
                   '). Isso é bastante papel e bastante fita — confira antes de mandar imprimir.'
        });
    }
    if (reticulado && reticulado.pontos.length > PONTOS_DEMAIS) {
        avisos.push({
            grau: 'atencao',
            texto: 'O cartaz tem ' + reticulado.pontos.length.toLocaleString('pt-BR') + ' pontos. ' +
                   'O arquivo vai ficar pesado e a impressora pode demorar muito. ' +
                   'Aumentar a distância entre os pontos resolve.'
        });
    }
    if (reticulado && reticulado.coberturaMedia > 0.62) {
        avisos.push({
            grau: 'atencao',
            texto: 'O cartaz ficou muito escuro (cerca de ' + Math.round(reticulado.coberturaMedia * 100) +
                   '% do papel coberto de tinta). Diminuir o tamanho do ponto economiza muita tinta.'
        });
    }
    if (!reticulado && plano.dpiEfetivo < DPI_BAIXO) {
        avisos.push({
            grau: 'informacao',
            texto: 'Neste tamanho a imagem tem só ' + Math.round(plano.dpiEfetivo) + ' pontos por polegada, ' +
                   'então de perto vai parecer borrada. O modo de pontos não tem esse problema — ' +
                   'ele foi feito justamente para ampliar muito.'
        });
    }
    return avisos;
}

const POSTEROPS = {
    PAPEIS: PAPEIS,
    PT_POR_CM: PT_POR_CM,
    PT_POR_POL: PT_POR_POL,
    paginaEmPontos: paginaEmPontos,
    planejarPoster: planejarPoster,
    luminancia: luminancia,
    tabelaDeSomas: tabelaDeSomas,
    mediaDoRetangulo: mediaDoRetangulo,
    gerarPontos: gerarPontos,
    pontosDaFolha: pontosDaFolha,
    conferirPlano: conferirPlano,
    FOLHAS_MUITAS: FOLHAS_MUITAS,
    PONTOS_DEMAIS: PONTOS_DEMAIS
};

if (typeof window !== 'undefined') window.POSTEROPS = POSTEROPS;
if (typeof module !== 'undefined' && module.exports) module.exports = POSTEROPS;

})();
