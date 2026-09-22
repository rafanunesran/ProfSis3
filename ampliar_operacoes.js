// ampliar_operacoes.js — O MOTOR DA FERRAMENTA "AMPLIAR".
//
// POR QUE ISTO EXISTE
//   O professor recebe a foto do documento pelo WhatsApp: 640x480, borrada, cheia de
//   quadradinho de JPEG. Dali ele precisa tirar uma imagem que de' para ler na ata, no
//   mural, no relatorio impresso. O caminho de sempre e' um site gratuito de "melhorar
//   imagem" — e de novo o arquivo (muitas vezes o rosto ou o documento de uma crianca)
//   sobe para o servidor de um terceiro que a escola nao autorizou.
//
//   Este arquivo faz o mesmo trabalho SEM enviar nada. As contas acontecem aqui, em
//   JavaScript, sobre os bytes que ja' estao na memoria do navegador.
//
// O QUE TEM AQUI
//   Um redimensionador Lanczos de verdade (nao o "desenhar maior no canvas", que e'
//   bilinear e borra), um redutor de ruido bilateral (que apaga o granulado do JPEG sem
//   comer a borda das letras), um limitador de estouro (Lanczos cria auréola em volta de
//   borda forte; aqui ela e' cortada) e um realce de borda com trava.
//
//   Nada disso depende de <canvas>, de DOM ou de internet: as funcoes recebem e devolvem
//   { largura, altura, dados } com `dados` em RGBA, do mesmo formato do ImageData. E' o
//   que permite testar as contas fora do navegador (ver testes/teste-ampliar.js).
//
//   A rede neural (o motor "IA", opcional) NAO mora aqui — ela vive em ampliar.js, porque
//   depende de baixar modelo. Este arquivo e' o motor que funciona sempre, inclusive sem
//   internet nenhuma.

(function () {
'use strict';

// ---------------------------------------------------------------------------
// O tipo de imagem que circula por aqui
// ---------------------------------------------------------------------------
// { largura, altura, dados } — dados e' RGBA, 4 bytes por pixel, linha a linha.
// E' exatamente a forma de um ImageData, de proposito: no navegador da' para entregar
// um ImageData direto para estas funcoes, e devolver o resultado para um canvas sem
// converter nada no meio.

function criarImagem(largura, altura) {
    return { largura: largura, altura: altura, dados: new Uint8ClampedArray(largura * altura * 4) };
}

function clonarImagem(img) {
    return { largura: img.largura, altura: img.altura, dados: new Uint8ClampedArray(img.dados) };
}

function validarImagem(img) {
    if (!img || !img.dados) throw new Error('imagem vazia');
    if (!(img.largura > 0) || !(img.altura > 0)) throw new Error('imagem sem tamanho');
    if (img.dados.length !== img.largura * img.altura * 4) {
        throw new Error('imagem com tamanho incoerente: ' + img.dados.length + ' bytes para ' +
                        img.largura + 'x' + img.altura);
    }
    return img;
}

// ---------------------------------------------------------------------------
// Lanczos
// ---------------------------------------------------------------------------
// O nucleo. `a` e' o numero de lobulos: 3 e' o padrao de quem amplia foto, 2 borra um
// pouco menos de ringing, 4 fica mais nitido e mais propenso a auréola.
//
//   L(x) = a * sen(pi x) * sen(pi x / a) / (pi x)^2 ,  para |x| < a
//   L(0) = 1 ; L(x) = 0 fora
function nucleoLanczos(x, a) {
    x = x < 0 ? -x : x;
    if (x < 1e-7) return 1;
    if (x >= a) return 0;
    const px = Math.PI * x;
    return (a * Math.sin(px) * Math.sin(px / a)) / (px * px);
}

// Tabela de pesos de UMA dimensao. Calculada uma vez por eixo e reusada em todas as
// linhas (ou colunas): e' o que transforma o filtro de O(n^2) ingenuo em algo que roda
// numa foto de celular sem travar a aba.
//
// Ao REDUZIR, o filtro precisa enxergar mais pixels de origem por pixel de destino,
// senao aparece serrilha (aliasing). Por isso o suporte cresce com 1/escala.
function tabelaPesos(origem, destino, lobulos) {
    const escala = destino / origem;
    const reduzindo = escala < 1;
    const suporte = reduzindo ? lobulos / escala : lobulos;
    const passo = reduzindo ? escala : 1;
    const tabela = new Array(destino);

    for (let i = 0; i < destino; i++) {
        // Centro do pixel de destino, medido no sistema de coordenadas da origem.
        const centro = (i + 0.5) / escala - 0.5;
        let inicio = Math.ceil(centro - suporte);
        let fim = Math.floor(centro + suporte);
        if (inicio < 0) inicio = 0;
        if (fim > origem - 1) fim = origem - 1;
        if (fim < inicio) { inicio = fim = Math.min(origem - 1, Math.max(0, Math.round(centro))); }

        const pesos = new Float32Array(fim - inicio + 1);
        let soma = 0;
        for (let j = inicio; j <= fim; j++) {
            const p = nucleoLanczos((j - centro) * passo, lobulos);
            pesos[j - inicio] = p;
            soma += p;
        }
        // Normalizar e' obrigatorio: sem isso a borda da imagem escurece, porque la' o
        // nucleo foi cortado e a soma dos pesos nao da' 1.
        if (soma > 1e-7 || soma < -1e-7) {
            for (let k = 0; k < pesos.length; k++) pesos[k] /= soma;
        } else {
            pesos.fill(0);
            pesos[Math.min(pesos.length - 1, Math.max(0, Math.round(centro) - inicio))] = 1;
        }
        tabela[i] = { inicio: inicio, pesos: pesos };
    }
    return tabela;
}

// Redimensiona com Lanczos separavel: primeiro na horizontal, depois na vertical.
//
// O alfa entra PRE-MULTIPLICADO. Sem isso, a cor de um pixel totalmente transparente
// (que costuma ser preto, ou lixo) vaza para dentro do pixel opaco vizinho e a figura
// recortada ganha uma orla escura ao ser ampliada.
function redimensionar(img, novaLargura, novaAltura, lobulos) {
    validarImagem(img);
    novaLargura = Math.max(1, Math.round(novaLargura));
    novaAltura = Math.max(1, Math.round(novaAltura));
    lobulos = lobulos || 3;
    if (novaLargura === img.largura && novaAltura === img.altura) return clonarImagem(img);

    const L = img.largura, A = img.altura, d = img.dados;

    // Passo 1: horizontal. Sai um intermediario em Float32 (novaLargura x A), ja' com
    // alfa pre-multiplicado, para nao arredondar duas vezes.
    const pesosX = tabelaPesos(L, novaLargura, lobulos);
    const meio = new Float32Array(novaLargura * A * 4);
    for (let y = 0; y < A; y++) {
        const baseLinha = y * L * 4;
        const baseSaida = y * novaLargura * 4;
        for (let x = 0; x < novaLargura; x++) {
            const t = pesosX[x], pesos = t.pesos, ini = t.inicio;
            let r = 0, g = 0, b = 0, al = 0;
            for (let k = 0; k < pesos.length; k++) {
                const p = pesos[k];
                if (p === 0) continue;
                const o = baseLinha + (ini + k) * 4;
                const a255 = d[o + 3];
                const fa = a255 / 255;
                r += d[o] * fa * p;
                g += d[o + 1] * fa * p;
                b += d[o + 2] * fa * p;
                al += a255 * p;
            }
            const s = baseSaida + x * 4;
            meio[s] = r; meio[s + 1] = g; meio[s + 2] = b; meio[s + 3] = al;
        }
    }

    // Passo 2: vertical, sobre o intermediario. Aqui o alfa e' desfeito.
    const pesosY = tabelaPesos(A, novaAltura, lobulos);
    const saida = criarImagem(novaLargura, novaAltura);
    const sd = saida.dados;
    for (let y = 0; y < novaAltura; y++) {
        const t = pesosY[y], pesos = t.pesos, ini = t.inicio;
        const baseSaida = y * novaLargura * 4;
        for (let x = 0; x < novaLargura; x++) {
            let r = 0, g = 0, b = 0, al = 0;
            for (let k = 0; k < pesos.length; k++) {
                const p = pesos[k];
                if (p === 0) continue;
                const o = ((ini + k) * novaLargura + x) * 4;
                r += meio[o] * p;
                g += meio[o + 1] * p;
                b += meio[o + 2] * p;
                al += meio[o + 3] * p;
            }
            const s = baseSaida + x * 4;
            const alfa = al < 0 ? 0 : (al > 255 ? 255 : al);
            if (alfa < 0.5) {
                sd[s] = 0; sd[s + 1] = 0; sd[s + 2] = 0; sd[s + 3] = 0;
            } else {
                const fa = 255 / alfa;
                sd[s] = r * fa; sd[s + 1] = g * fa; sd[s + 2] = b * fa;
                sd[s + 3] = alfa;
            }
        }
    }
    return saida;
}

// ---------------------------------------------------------------------------
// Limitador de estouro (anti-ringing)
// ---------------------------------------------------------------------------
// Lanczos tem lobulo negativo — e' dele que vem a nitidez. O preco e' o "overshoot":
// em volta de uma borda forte (letra preta em papel branco) aparece uma linha mais
// clara que o branco e outra mais escura que o preto. Numa foto de documento isso e'
// exatamente o que o olho chama de "borda suja".
//
// A correcao classica: nenhum pixel ampliado pode ficar fora do intervalo de cores que
// existia na vizinhanca de onde ele veio. A borda continua nitida; so' a auréola some.
function limitarEstouro(saida, origem, forca) {
    validarImagem(saida); validarImagem(origem);
    if (forca == null) forca = 1;
    if (forca <= 0) return saida;
    if (forca > 1) forca = 1;

    const escalaX = origem.largura / saida.largura;
    const escalaY = origem.altura / saida.altura;
    const od = origem.dados, sd = saida.dados;
    const OL = origem.largura, OA = origem.altura;

    for (let y = 0; y < saida.altura; y++) {
        const cy = Math.min(OA - 1, Math.max(0, Math.floor((y + 0.5) * escalaY)));
        const y0 = cy > 0 ? cy - 1 : 0, y1 = cy < OA - 1 ? cy + 1 : OA - 1;
        for (let x = 0; x < saida.largura; x++) {
            const cx = Math.min(OL - 1, Math.max(0, Math.floor((x + 0.5) * escalaX)));
            const x0 = cx > 0 ? cx - 1 : 0, x1 = cx < OL - 1 ? cx + 1 : OL - 1;

            let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0;
            for (let j = y0; j <= y1; j++) {
                for (let i = x0; i <= x1; i++) {
                    const o = (j * OL + i) * 4;
                    const r = od[o], g = od[o + 1], b = od[o + 2];
                    if (r < minR) minR = r; if (r > maxR) maxR = r;
                    if (g < minG) minG = g; if (g > maxG) maxG = g;
                    if (b < minB) minB = b; if (b > maxB) maxB = b;
                }
            }
            const s = (y * saida.largura + x) * 4;
            sd[s]     = _travar(sd[s], minR, maxR, forca);
            sd[s + 1] = _travar(sd[s + 1], minG, maxG, forca);
            sd[s + 2] = _travar(sd[s + 2], minB, maxB, forca);
        }
    }
    return saida;
}

function _travar(valor, minimo, maximo, forca) {
    const preso = valor < minimo ? minimo : (valor > maximo ? maximo : valor);
    return preso === valor ? valor : valor + (preso - valor) * forca;
}

// ---------------------------------------------------------------------------
// Reducao de ruido (filtro bilateral)
// ---------------------------------------------------------------------------
// O borrao comum (media, gaussiana) tira o granulado e leva junto a borda da letra.
// O bilateral pesa cada vizinho por DUAS coisas: a distancia no plano e a distancia na
// cor. Vizinho perto e parecido pesa muito; vizinho perto mas de cor bem diferente —
// isto e', do outro lado de uma borda — quase nao pesa. Resultado: o quadradinho de
// JPEG dentro da area lisa e' alisado, e a letra continua letra.
//
// nivel: 0 (nada) a 3 (forte). Os numeros foram escolhidos olhando foto de documento
// tirada de celular, que e' o caso real desta tela.
const RUIDO = [
    null,
    { raio: 1, sigmaEspacial: 1.2, sigmaCor: 18 },
    { raio: 2, sigmaEspacial: 1.8, sigmaCor: 32 },
    { raio: 3, sigmaEspacial: 2.6, sigmaCor: 52 }
];

function reduzirRuido(img, nivel) {
    validarImagem(img);
    nivel = Math.round(nivel || 0);
    if (nivel <= 0) return clonarImagem(img);
    const cfg = RUIDO[Math.min(3, nivel)];
    const raio = cfg.raio;
    const L = img.largura, A = img.altura, d = img.dados;
    const saida = criarImagem(L, A);
    const sd = saida.dados;

    // Peso espacial: uma tabelinha (2r+1)^2, calculada uma vez.
    const lado = raio * 2 + 1;
    const pesoEspacial = new Float32Array(lado * lado);
    const doisSigma2 = 2 * cfg.sigmaEspacial * cfg.sigmaEspacial;
    for (let j = -raio; j <= raio; j++) {
        for (let i = -raio; i <= raio; i++) {
            pesoEspacial[(j + raio) * lado + (i + raio)] = Math.exp(-(i * i + j * j) / doisSigma2);
        }
    }

    // Peso de cor: tabela indexada pela soma das diferencas absolutas dos tres canais
    // (0..765). Consultar a tabela custa um acesso; calcular Math.exp por vizinho, numa
    // foto de 12 megapixels, custa a tarde inteira.
    const pesoCor = new Float32Array(766);
    const doisSigmaCor2 = 2 * cfg.sigmaCor * cfg.sigmaCor * 3;
    for (let k = 0; k < 766; k++) pesoCor[k] = Math.exp(-(k * k) / doisSigmaCor2);

    for (let y = 0; y < A; y++) {
        const jIni = Math.max(0, y - raio), jFim = Math.min(A - 1, y + raio);
        for (let x = 0; x < L; x++) {
            const c = (y * L + x) * 4;
            const cr = d[c], cg = d[c + 1], cb = d[c + 2];
            const iIni = Math.max(0, x - raio), iFim = Math.min(L - 1, x + raio);
            let somaR = 0, somaG = 0, somaB = 0, somaP = 0;
            for (let j = jIni; j <= jFim; j++) {
                const linhaPeso = (j - y + raio) * lado + raio;
                const linhaImg = j * L;
                for (let i = iIni; i <= iFim; i++) {
                    const o = (linhaImg + i) * 4;
                    const dr = d[o] - cr, dg = d[o + 1] - cg, db = d[o + 2] - cb;
                    const dist = (dr < 0 ? -dr : dr) + (dg < 0 ? -dg : dg) + (db < 0 ? -db : db);
                    const p = pesoEspacial[linhaPeso + (i - x)] * pesoCor[dist];
                    somaR += d[o] * p; somaG += d[o + 1] * p; somaB += d[o + 2] * p;
                    somaP += p;
                }
            }
            if (somaP > 0) {
                sd[c] = somaR / somaP; sd[c + 1] = somaG / somaP; sd[c + 2] = somaB / somaP;
            } else {
                sd[c] = cr; sd[c + 1] = cg; sd[c + 2] = cb;
            }
            sd[c + 3] = d[c + 3];   // o alfa passa intacto: ruido de transparencia nao existe
        }
    }
    return saida;
}

// ---------------------------------------------------------------------------
// Realce de borda com trava
// ---------------------------------------------------------------------------
// Mascara de nitidez (unsharp mask): o resultado e' a imagem mais a diferenca entre ela
// e uma versao borrada dela.
//
// Duas coisas aqui sao facilmente erradas, e as duas custam o efeito inteiro:
//
//   O RAIO DO BORRAO tem de acompanhar o tamanho do detalhe. Um borrao de 3x3 so'
//   enxerga diferenca em detalhe de 1 pixel; numa imagem que acabou de ser ampliada 4x,
//   a borda de uma letra tem 4 pixels de largura e o borrao estreito devolve quase a
//   propria imagem — a conta roda, a diferenca da' ~1, e nada acontece na tela. Por isso
//   `raio` existe e por isso a receita completa cresce ele junto com a ampliacao.
//
//   A TRAVA tem de olhar a mesma vizinhanca que o borrao. Travar no 3x3 enquanto se
//   borra num raio maior prende todo pixel entre os dois vizinhos imediatos, e nada
//   passa. A trava certa e' o intervalo de cores da janela do proprio borrao: da' espaco
//   para a borda ficar mais curta e continua proibindo o pixel de inventar um tom que
//   nao existia ali — que e' a aureola do "recortado com tesoura".
const NITIDEZ = [0, 0.4, 0.8, 1.3];

function realcarBordas(img, nivel, raio) {
    validarImagem(img);
    nivel = Math.round(nivel || 0);
    if (nivel <= 0) return clonarImagem(img);
    const intensidade = NITIDEZ[Math.min(3, nivel)];
    raio = Math.min(6, Math.max(1, Math.round(raio || 1)));

    const L = img.largura, A = img.altura, d = img.dados;
    const borrada = _borrarGauss(img, raio * 0.8, raio);
    const bd = borrada.dados;
    const saida = criarImagem(L, A);
    const sd = saida.dados;

    for (let y = 0; y < A; y++) {
        const y0 = Math.max(0, y - raio), y1 = Math.min(A - 1, y + raio);
        for (let x = 0; x < L; x++) {
            const x0 = Math.max(0, x - raio), x1 = Math.min(L - 1, x + raio);
            const c = (y * L + x) * 4;

            // O intervalo da janela, os tres canais de uma vez: percorrer a janela uma
            // vez por canal triplicaria o trabalho da parte mais cara da funcao.
            let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0;
            for (let j = y0; j <= y1; j++) {
                const linha = j * L;
                for (let i = x0; i <= x1; i++) {
                    const o = (linha + i) * 4;
                    const r = d[o], g = d[o + 1], b = d[o + 2];
                    if (r < minR) minR = r; if (r > maxR) maxR = r;
                    if (g < minG) minG = g; if (g > maxG) maxG = g;
                    if (b < minB) minB = b; if (b > maxB) maxB = b;
                }
            }

            const vr = d[c] + intensidade * (d[c] - bd[c]);
            const vg = d[c + 1] + intensidade * (d[c + 1] - bd[c + 1]);
            const vb = d[c + 2] + intensidade * (d[c + 2] - bd[c + 2]);
            sd[c]     = vr < minR ? minR : (vr > maxR ? maxR : vr);
            sd[c + 1] = vg < minG ? minG : (vg > maxG ? maxG : vg);
            sd[c + 2] = vb < minB ? minB : (vb > maxB ? maxB : vb);
            sd[c + 3] = d[c + 3];   // o alfa passa intacto
        }
    }
    return saida;
}

// Gaussiana separavel de raio livre. Borda por repeticao do pixel (o mesmo que o Photoshop
// faz): espelhar ou zerar criaria artefato na moldura da imagem.
function _borrarGauss(img, sigma, raio) {
    const L = img.largura, A = img.altura, d = img.dados;
    const lado = raio * 2 + 1;
    const nucleo = new Float32Array(lado);
    const doisSigma2 = 2 * sigma * sigma;
    let soma = 0;
    for (let k = -raio; k <= raio; k++) {
        const p = Math.exp(-(k * k) / doisSigma2);
        nucleo[k + raio] = p;
        soma += p;
    }
    for (let k = 0; k < lado; k++) nucleo[k] /= soma;

    const meio = new Float32Array(L * A * 4);
    for (let y = 0; y < A; y++) {
        const linha = y * L;
        for (let x = 0; x < L; x++) {
            const destino = (linha + x) * 4;
            let r = 0, g = 0, b = 0, a = 0;
            for (let k = -raio; k <= raio; k++) {
                const xi = x + k < 0 ? 0 : (x + k > L - 1 ? L - 1 : x + k);
                const o = (linha + xi) * 4;
                const p = nucleo[k + raio];
                r += d[o] * p; g += d[o + 1] * p; b += d[o + 2] * p; a += d[o + 3] * p;
            }
            meio[destino] = r; meio[destino + 1] = g; meio[destino + 2] = b; meio[destino + 3] = a;
        }
    }

    const saida = criarImagem(L, A);
    const sd = saida.dados;
    for (let y = 0; y < A; y++) {
        for (let x = 0; x < L; x++) {
            const destino = (y * L + x) * 4;
            let r = 0, g = 0, b = 0, a = 0;
            for (let k = -raio; k <= raio; k++) {
                const yi = y + k < 0 ? 0 : (y + k > A - 1 ? A - 1 : y + k);
                const o = (yi * L + x) * 4;
                const p = nucleo[k + raio];
                r += meio[o] * p; g += meio[o + 1] * p; b += meio[o + 2] * p; a += meio[o + 3] * p;
            }
            sd[destino] = r; sd[destino + 1] = g; sd[destino + 2] = b; sd[destino + 3] = a;
        }
    }
    return saida;
}

// ---------------------------------------------------------------------------
// A receita completa
// ---------------------------------------------------------------------------
// A ordem importa, e e' a mesma que um bom ampliador usa:
//
//   1. LIMPAR ANTES de ampliar. Ruido ampliado vira mancha: o filtro passa a enxergar o
//      quadradinho de JPEG como se fosse detalhe legitimo e o preserva com carinho.
//   2. AMPLIAR EM PASSOS DE 2x. Ir de 1x para 4x de uma vez com Lanczos inventa detalhe
//      que nao existe; dois passos de 2x, cada um seguido do limitador de estouro,
//      chegam mais limpos ao mesmo tamanho.
//   3. REALCAR DEPOIS. O realce e' a ultima palavra, ja' no tamanho final.
//
// `aoProgredir(fracao, etapa)` e' chamado entre os passos, e o `await` entre eles devolve
// o controle para o navegador — senao a aba congela e o Chrome oferece fechar a pagina.
async function ampliar(img, opcoes, aoProgredir) {
    validarImagem(img);
    opcoes = opcoes || {};
    const escala = opcoes.escala == null ? 2 : Number(opcoes.escala);
    const ruido = Math.round(opcoes.ruido || 0);
    const nitidez = Math.round(opcoes.nitidez == null ? 1 : opcoes.nitidez);
    const lobulos = opcoes.lobulos || 3;
    if (!(escala > 0)) throw new Error('escala invalida');

    const passos = planejarPassos(escala);
    const total = (ruido > 0 ? 1 : 0) + passos.length + (nitidez > 0 ? 1 : 0);
    let feitos = 0;
    // Desistir e' verificado nos intervalos entre as etapas — que sao justamente os
    // momentos em que o navegador volta a responder ao clique de quem desistiu.
    const conferirDesistencia = () => {
        if (typeof opcoes.cancelado === 'function' && opcoes.cancelado()) throw erroDeCancelamento();
    };
    const avisar = async (etapa) => {
        feitos++;
        if (typeof aoProgredir === 'function') aoProgredir(total ? feitos / total : 1, etapa);
        await _respirar();
        conferirDesistencia();
    };
    conferirDesistencia();

    let atual = img;
    if (typeof aoProgredir === 'function') aoProgredir(0, 'comecando');

    if (ruido > 0) {
        atual = reduzirRuido(atual, ruido);
        await avisar('ruido');
    }

    for (let i = 0; i < passos.length; i++) {
        const fator = passos[i];
        const antes = atual;
        atual = redimensionar(antes, Math.round(antes.largura * fator), Math.round(antes.altura * fator), lobulos);
        // O limitador so' faz sentido ao AMPLIAR: ao reduzir, o intervalo da vizinhanca
        // de origem e' largo demais para travar coisa alguma.
        if (fator > 1) limitarEstouro(atual, antes, 1);
        await avisar('ampliando');
    }

    if (nitidez > 0) {
        // O detalhe cresceu junto com a imagem: numa ampliacao de 4x, a borda de uma
        // letra que tinha 1 pixel agora tem 4. O raio do realce acompanha, senao o
        // filtro procura detalhe de 1 pixel numa imagem que nao tem mais nenhum.
        atual = realcarBordas(atual, nitidez, Math.min(4, Math.max(1, Math.round(escala))));
        await avisar('nitidez');
    }

    if (typeof aoProgredir === 'function') aoProgredir(1, 'pronto');
    return atual;
}

// 4x vira [2, 2]; 3x vira [2, 1.5]; 1.6x vira [1.6]; 0.5x vira [0.5].
// Cada passo de 2x e' onde o limitador de estouro age, e e' por isso que a conta e'
// quebrada assim em vez de um salto unico.
function planejarPassos(escala) {
    if (escala <= 1) return escala === 1 ? [] : [escala];
    const passos = [];
    let restante = escala;
    while (restante > 2 + 1e-9) { passos.push(2); restante /= 2; }
    if (restante > 1 + 1e-9) passos.push(restante);
    return passos.length ? passos : [];
}

// Desistir nao e' falha: a tela precisa distinguir "deu errado" de "o professor mudou de
// ideia" para nao mostrar uma tarja vermelha de erro por causa de um clique em Cancelar.
function erroDeCancelamento() {
    const e = new Error('cancelado');
    e.cancelado = true;
    return e;
}

function ehCancelamento(erro) {
    return !!(erro && (erro.cancelado || erro.name === 'AbortError'));
}

// Devolve o controle ao navegador entre as etapas pesadas.
function _respirar() {
    return new Promise(ok => setTimeout(ok, 0));
}

// ---------------------------------------------------------------------------
// Ajudas de tela
// ---------------------------------------------------------------------------

function formatarTamanho(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
}

// Quanto da' para ampliar sem o navegador cair. O limite nao e' o disco nem a rede: e' a
// memoria do canvas. Cada pixel do resultado custa 4 bytes, e o navegador guarda mais de
// uma copia durante a conta. Acima de ~40 megapixels o celular simplesmente mata a aba —
// e' melhor avisar antes do que perder o trabalho no meio.
const MAX_PIXELS_SAIDA = 40 * 1000 * 1000;

function cabeNaMemoria(largura, altura, escala) {
    return (largura * escala) * (altura * escala) <= MAX_PIXELS_SAIDA;
}

// A maior escala (entre as oferecidas) que ainda cabe, para a tela poder desabilitar o
// resto em vez de deixar o professor escolher e quebrar.
function maiorEscalaPossivel(largura, altura, escalas) {
    const lista = (escalas || [1, 2, 4, 8]).slice().sort((a, b) => b - a);
    for (let i = 0; i < lista.length; i++) {
        if (cabeNaMemoria(largura, altura, lista[i])) return lista[i];
    }
    return 1;
}

const AMPLIAROPS = {
    criarImagem: criarImagem,
    clonarImagem: clonarImagem,
    validarImagem: validarImagem,
    nucleoLanczos: nucleoLanczos,
    tabelaPesos: tabelaPesos,
    redimensionar: redimensionar,
    limitarEstouro: limitarEstouro,
    reduzirRuido: reduzirRuido,
    realcarBordas: realcarBordas,
    ampliar: ampliar,
    planejarPassos: planejarPassos,
    erroDeCancelamento: erroDeCancelamento,
    ehCancelamento: ehCancelamento,
    formatarTamanho: formatarTamanho,
    cabeNaMemoria: cabeNaMemoria,
    maiorEscalaPossivel: maiorEscalaPossivel,
    MAX_PIXELS_SAIDA: MAX_PIXELS_SAIDA
};

if (typeof window !== 'undefined') window.AMPLIAROPS = AMPLIAROPS;
if (typeof module !== 'undefined' && module.exports) module.exports = AMPLIAROPS;

})();
