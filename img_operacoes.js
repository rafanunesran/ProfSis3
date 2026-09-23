// img_operacoes.js — O MOTOR DA ABA "IMG": as contas das ferramentas de imagem.
//
// POR QUE ISTO EXISTE
//   A aba IMG (img.js) faz, dentro do sistema, o que o professor faria num site como o
//   iLoveIMG: comprimir, redimensionar, cortar, converter, girar, pôr marca d'água, tirar
//   o fundo, desfocar um rosto. Naquele site cada uma dessas coisas e' um ENVIO — e a
//   foto, aqui, costuma ter o rosto ou o documento de um estudante (ver
//   CONFORMIDADE-SEDUC.md). Aqui a conta acontece no aparelho.
//
// COMO E' FEITO
//   Tudo o que e' conta de pixel mora aqui, sem tocar em DOM nem em <canvas>: a imagem e'
//   sempre { largura, altura, dados } com `dados` em RGBA (Uint8ClampedArray), o mesmo
//   formato de ampliar_operacoes.js. Isso permite testar tudo fora do navegador (ver
//   testes/teste-img.js). O que depende do navegador — ler o arquivo, escrever JPG/PNG/WebP,
//   desenhar texto — fica em img.js.
//
//   Os formatos que o navegador NAO sabe escrever (GIF e BMP) sao escritos aqui, a mao.

(function (raiz) {
'use strict';

function novaImagem(largura, altura) {
    return { largura: largura, altura: altura, dados: new Uint8ClampedArray(largura * altura * 4) };
}

function copiar(img) {
    return { largura: img.largura, altura: img.altura, dados: new Uint8ClampedArray(img.dados) };
}

function limitar(v, min, max) { return v < min ? min : (v > max ? max : v); }

// ---------------------------------------------------------------------------
// Girar e espelhar
// ---------------------------------------------------------------------------
// `graus` em multiplos de 90, no sentido horario. Qualquer outro valor e' arredondado para
// o multiplo mais proximo: girar 45 graus deixaria cantos vazios, e o que o professor quer
// e' endireitar a foto que o celular gravou deitada.
function girar(img, graus) {
    const g = ((Math.round((Number(graus) || 0) / 90) * 90) % 360 + 360) % 360;
    if (g === 0) return copiar(img);
    const L = img.largura, A = img.altura, d = img.dados;
    const saida = g === 180 ? novaImagem(L, A) : novaImagem(A, L);
    const s = saida.dados, SL = saida.largura;
    for (let y = 0; y < A; y++) {
        for (let x = 0; x < L; x++) {
            let nx, ny;
            if (g === 90) { nx = A - 1 - y; ny = x; }
            else if (g === 180) { nx = L - 1 - x; ny = A - 1 - y; }
            else { nx = y; ny = L - 1 - x; }
            const o = (y * L + x) * 4, n = (ny * SL + nx) * 4;
            s[n] = d[o]; s[n + 1] = d[o + 1]; s[n + 2] = d[o + 2]; s[n + 3] = d[o + 3];
        }
    }
    return saida;
}

function espelhar(img, horizontal, vertical) {
    const L = img.largura, A = img.altura, d = img.dados;
    const saida = novaImagem(L, A), s = saida.dados;
    for (let y = 0; y < A; y++) {
        const sy = vertical ? A - 1 - y : y;
        for (let x = 0; x < L; x++) {
            const sx = horizontal ? L - 1 - x : x;
            const o = (sy * L + sx) * 4, n = (y * L + x) * 4;
            s[n] = d[o]; s[n + 1] = d[o + 1]; s[n + 2] = d[o + 2]; s[n + 3] = d[o + 3];
        }
    }
    return saida;
}

// ---------------------------------------------------------------------------
// Cortar
// ---------------------------------------------------------------------------
// O retangulo e' conferido contra a imagem: um corte que passa da borda e' aparado, e um
// corte vazio e' recusado com explicacao (em vez de devolver uma imagem de 0 pixel que o
// navegador depois nao consegue salvar).
function recortar(img, x, y, largura, altura) {
    const x0 = limitar(Math.round(x), 0, img.largura);
    const y0 = limitar(Math.round(y), 0, img.altura);
    const x1 = limitar(Math.round(x + largura), 0, img.largura);
    const y1 = limitar(Math.round(y + altura), 0, img.altura);
    const L = x1 - x0, A = y1 - y0;
    if (L < 1 || A < 1) throw new Error('A área de corte ficou vazia. Marque um pedaço da imagem.');
    const saida = novaImagem(L, A);
    for (let yy = 0; yy < A; yy++) {
        const ini = ((y0 + yy) * img.largura + x0) * 4;
        saida.dados.set(img.dados.subarray(ini, ini + L * 4), yy * L * 4);
    }
    return saida;
}

// ---------------------------------------------------------------------------
// Redimensionar
// ---------------------------------------------------------------------------
// A conta do tamanho novo, separada do trabalho de pixel porque a tela precisa dela antes
// (para mostrar "vai ficar 800 x 600") e porque e' onde mora o erro facil de cometer.
//
//   modo 'pixels'   largura/altura em px; com `proporcao`, o campo vazio (ou o que
//                   estourar) e' calculado pelo outro — a foto nunca sai achatada;
//   modo 'porcento' `porcento` da largura e da altura;
//   `naoAmpliar`    nao deixa passar do tamanho original (reduzir e' o caso comum, e
//                   ampliar sem querer so' deixa o arquivo maior e borrado).
function calcularTamanho(largura, altura, op) {
    op = op || {};
    let L, A;
    if (op.modo === 'porcento') {
        const p = Math.max(1, Number(op.porcento) || 100) / 100;
        L = largura * p; A = altura * p;
    } else {
        const pedidoL = Number(op.largura) || 0;
        const pedidoA = Number(op.altura) || 0;
        if (op.proporcao !== false) {
            if (pedidoL && pedidoA) {
                // Cabe dentro da caixa pedida, sem deformar.
                const f = Math.min(pedidoL / largura, pedidoA / altura);
                L = largura * f; A = altura * f;
            } else if (pedidoL) { L = pedidoL; A = altura * pedidoL / largura; }
            else if (pedidoA) { A = pedidoA; L = largura * pedidoA / altura; }
            else { L = largura; A = altura; }
        } else {
            L = pedidoL || largura; A = pedidoA || altura;
        }
    }
    if (op.naoAmpliar && (L > largura || A > altura)) {
        const f = Math.min(largura / L, altura / A);
        L *= f; A *= f;
    }
    return { largura: Math.max(1, Math.round(L)), altura: Math.max(1, Math.round(A)) };
}

// Reduzir e ampliar sao contas diferentes. Ao REDUZIR, cada pixel novo e' a media da area
// que ele cobre na imagem original (sem isso, letras finas somem e aparece serrilha). Ao
// AMPLIAR, interpolacao bilinear. A media e' feita em alfa pre-multiplicado: sem isso, o
// fundo transparente "vaza" cor escura para a borda do desenho.
function redimensionar(img, novaL, novaA) {
    novaL = Math.max(1, Math.round(novaL));
    novaA = Math.max(1, Math.round(novaA));
    if (novaL === img.largura && novaA === img.altura) return copiar(img);
    const L = img.largura, A = img.altura, d = img.dados;
    const saida = novaImagem(novaL, novaA), s = saida.dados;
    const fx = L / novaL, fy = A / novaA;

    if (fx >= 1 && fy >= 1) {
        for (let y = 0; y < novaA; y++) {
            const y0 = y * fy, y1 = y0 + fy;
            for (let x = 0; x < novaL; x++) {
                const x0 = x * fx, x1 = x0 + fx;
                let r = 0, g = 0, b = 0, a = 0, peso = 0;
                for (let sy = Math.floor(y0); sy < Math.ceil(y1) && sy < A; sy++) {
                    const py = Math.min(y1, sy + 1) - Math.max(y0, sy);
                    for (let sx = Math.floor(x0); sx < Math.ceil(x1) && sx < L; sx++) {
                        const p = py * (Math.min(x1, sx + 1) - Math.max(x0, sx));
                        const o = (sy * L + sx) * 4;
                        const al = d[o + 3] * p;
                        r += d[o] * al; g += d[o + 1] * al; b += d[o + 2] * al; a += al; peso += p;
                    }
                }
                const n = (y * novaL + x) * 4;
                if (a > 0) { s[n] = r / a; s[n + 1] = g / a; s[n + 2] = b / a; }
                s[n + 3] = peso > 0 ? a / peso : 0;
            }
        }
        return saida;
    }

    for (let y = 0; y < novaA; y++) {
        const sy = limitar((y + 0.5) * fy - 0.5, 0, A - 1);
        const y0 = Math.floor(sy), y1 = Math.min(A - 1, y0 + 1), ty = sy - y0;
        for (let x = 0; x < novaL; x++) {
            const sx = limitar((x + 0.5) * fx - 0.5, 0, L - 1);
            const x0 = Math.floor(sx), x1 = Math.min(L - 1, x0 + 1), tx = sx - x0;
            const o00 = (y0 * L + x0) * 4, o10 = (y0 * L + x1) * 4, o01 = (y1 * L + x0) * 4, o11 = (y1 * L + x1) * 4;
            const w00 = (1 - tx) * (1 - ty) * d[o00 + 3], w10 = tx * (1 - ty) * d[o10 + 3];
            const w01 = (1 - tx) * ty * d[o01 + 3], w11 = tx * ty * d[o11 + 3];
            const a = w00 + w10 + w01 + w11;
            const n = (y * novaL + x) * 4;
            for (let c = 0; c < 3; c++) {
                s[n + c] = a > 0 ? (d[o00 + c] * w00 + d[o10 + c] * w10 + d[o01 + c] * w01 + d[o11 + c] * w11) / a : 0;
            }
            s[n + 3] = a;
        }
    }
    return saida;
}

// ---------------------------------------------------------------------------
// Editor de fotos: ajustes e filtros
// ---------------------------------------------------------------------------
// Tudo em -100..100, zero = sem mudanca. Feito em JavaScript puro, e nao com o
// `ctx.filter` do canvas, porque o Safari do iPhone passou anos ignorando o filter em
// silencio: o professor mexia no controle e a foto baixada saia igual.
const FILTROS = ['nenhum', 'cinza', 'sepia', 'pb', 'inverter', 'frio', 'quente', 'vintage'];

function ajustar(img, op) {
    op = op || {};
    const brilho = limitar(Number(op.brilho) || 0, -100, 100) / 100;
    const contraste = limitar(Number(op.contraste) || 0, -100, 100) / 100;
    const saturacao = limitar(Number(op.saturacao) || 0, -100, 100) / 100;
    const temperatura = limitar(Number(op.temperatura) || 0, -100, 100) / 100;
    const exposicao = limitar(Number(op.exposicao) || 0, -100, 100) / 100;
    const filtro = FILTROS.indexOf(op.filtro) >= 0 ? op.filtro : 'nenhum';

    // Contraste pela formula classica (em torno do cinza medio); o fator vai de 0 a ~4x.
    const fc = contraste >= 0 ? 1 + contraste * 3 : 1 + contraste;
    const fe = Math.pow(2, exposicao * 1.5);

    // Tabela por canal: brilho, exposicao e contraste sao a mesma curva nos tres canais,
    // calculada uma vez so' (256 contas em vez de uma por pixel).
    const curva = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
        let v = i * fe + brilho * 255 * 0.6;
        v = (v - 128) * fc + 128;
        curva[i] = v;
    }

    const saida = copiar(img), s = saida.dados;
    for (let i = 0; i < s.length; i += 4) {
        let r = curva[s[i]], g = curva[s[i + 1]], b = curva[s[i + 2]];

        if (saturacao) {
            const cinza = 0.299 * r + 0.587 * g + 0.114 * b;
            const f = 1 + saturacao;
            r = cinza + (r - cinza) * f; g = cinza + (g - cinza) * f; b = cinza + (b - cinza) * f;
        }
        if (temperatura) { r += temperatura * 30; b -= temperatura * 30; }

        if (filtro !== 'nenhum') {
            const cinza = 0.299 * r + 0.587 * g + 0.114 * b;
            if (filtro === 'cinza') { r = g = b = cinza; }
            else if (filtro === 'pb') { r = g = b = cinza >= 128 ? 255 : 0; }
            else if (filtro === 'sepia') {
                const nr = 0.393 * r + 0.769 * g + 0.189 * b;
                const ng = 0.349 * r + 0.686 * g + 0.168 * b;
                const nb = 0.272 * r + 0.534 * g + 0.131 * b;
                r = nr; g = ng; b = nb;
            }
            else if (filtro === 'inverter') { r = 255 - r; g = 255 - g; b = 255 - b; }
            else if (filtro === 'frio') { r -= 18; b += 22; }
            else if (filtro === 'quente') { r += 22; g += 6; b -= 18; }
            else if (filtro === 'vintage') {
                r = r * 0.9 + 30; g = g * 0.85 + 20; b = b * 0.7 + 25;
            }
        }
        s[i] = r; s[i + 1] = g; s[i + 2] = b;   // Uint8ClampedArray ja' corta em 0..255
    }
    return saida;
}

// ---------------------------------------------------------------------------
// Desfocar e pixelar um pedaco (o "desfocar rosto")
// ---------------------------------------------------------------------------
// `ret` em pixels { x, y, largura, altura }. `forca` 1..10.
//
// O desfoque e' uma caixa aplicada tres vezes (fica muito perto de um gaussiano) e le a
// vizinhanca de FORA do retangulo tambem, para a borda do borrado nao virar uma moldura
// dura. O pixelado usa blocos alinhados ao proprio retangulo.
//
// Um aviso honesto mora na tela, nao aqui: desfoque fraco num rosto pequeno pode ser
// revertido o bastante para reconhecer alguem. Para anonimizar de verdade, pixelar forte
// ou tarja.
function desfocarRegiao(img, ret, forca) {
    const saida = copiar(img);
    const r = normalizarRet(img, ret);
    if (!r) return saida;
    const raio = Math.max(1, Math.round(Math.max(r.largura, r.altura) * 0.012 * limitar(Number(forca) || 5, 1, 10)));
    // A janela de trabalho e' o retangulo com uma margem do tamanho do raio.
    const mx0 = Math.max(0, r.x - raio * 3), my0 = Math.max(0, r.y - raio * 3);
    const mx1 = Math.min(img.largura, r.x + r.largura + raio * 3), my1 = Math.min(img.altura, r.y + r.altura + raio * 3);
    let janela = recortar(img, mx0, my0, mx1 - mx0, my1 - my0);
    for (let i = 0; i < 3; i++) janela = caixaSeparavel(janela, raio);
    for (let y = r.y; y < r.y + r.altura; y++) {
        for (let x = r.x; x < r.x + r.largura; x++) {
            const o = ((y - my0) * janela.largura + (x - mx0)) * 4, n = (y * img.largura + x) * 4;
            saida.dados[n] = janela.dados[o]; saida.dados[n + 1] = janela.dados[o + 1];
            saida.dados[n + 2] = janela.dados[o + 2]; saida.dados[n + 3] = janela.dados[o + 3];
        }
    }
    return saida;
}

function caixaSeparavel(img, raio) {
    const L = img.largura, A = img.altura;
    const tmp = new Float32Array(L * A * 4);
    const s = img.dados;
    // horizontal
    for (let y = 0; y < A; y++) {
        for (let c = 0; c < 4; c++) {
            let soma = 0;
            for (let k = -raio; k <= raio; k++) soma += s[(y * L + limitar(k, 0, L - 1)) * 4 + c];
            for (let x = 0; x < L; x++) {
                tmp[(y * L + x) * 4 + c] = soma / (2 * raio + 1);
                const sai = limitar(x - raio, 0, L - 1), entra = limitar(x + raio + 1, 0, L - 1);
                soma += s[(y * L + entra) * 4 + c] - s[(y * L + sai) * 4 + c];
            }
        }
    }
    const saida = novaImagem(L, A), d = saida.dados;
    // vertical
    for (let x = 0; x < L; x++) {
        for (let c = 0; c < 4; c++) {
            let soma = 0;
            for (let k = -raio; k <= raio; k++) soma += tmp[(limitar(k, 0, A - 1) * L + x) * 4 + c];
            for (let y = 0; y < A; y++) {
                d[(y * L + x) * 4 + c] = soma / (2 * raio + 1);
                const sai = limitar(y - raio, 0, A - 1), entra = limitar(y + raio + 1, 0, A - 1);
                soma += tmp[(entra * L + x) * 4 + c] - tmp[(sai * L + x) * 4 + c];
            }
        }
    }
    return saida;
}

function pixelarRegiao(img, ret, forca) {
    const saida = copiar(img);
    const r = normalizarRet(img, ret);
    if (!r) return saida;
    const bloco = Math.max(2, Math.round(Math.max(r.largura, r.altura) * 0.025 * limitar(Number(forca) || 5, 1, 10)));
    const d = saida.dados, L = img.largura;
    for (let by = r.y; by < r.y + r.altura; by += bloco) {
        for (let bx = r.x; bx < r.x + r.largura; bx += bloco) {
            const ex = Math.min(bx + bloco, r.x + r.largura), ey = Math.min(by + bloco, r.y + r.altura);
            let cr = 0, cg = 0, cb = 0, ca = 0, n = 0;
            for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) {
                const o = (y * L + x) * 4;
                cr += d[o]; cg += d[o + 1]; cb += d[o + 2]; ca += d[o + 3]; n++;
            }
            cr /= n; cg /= n; cb /= n; ca /= n;
            for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) {
                const o = (y * L + x) * 4;
                d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = ca;
            }
        }
    }
    return saida;
}

function tarjaRegiao(img, ret, cor) {
    const saida = copiar(img);
    const r = normalizarRet(img, ret);
    if (!r) return saida;
    const c = corDeHex(cor || '#000000');
    for (let y = r.y; y < r.y + r.altura; y++) for (let x = r.x; x < r.x + r.largura; x++) {
        const o = (y * img.largura + x) * 4;
        saida.dados[o] = c[0]; saida.dados[o + 1] = c[1]; saida.dados[o + 2] = c[2]; saida.dados[o + 3] = 255;
    }
    return saida;
}

function normalizarRet(img, ret) {
    if (!ret) return null;
    const x0 = limitar(Math.round(Math.min(ret.x, ret.x + ret.largura)), 0, img.largura);
    const y0 = limitar(Math.round(Math.min(ret.y, ret.y + ret.altura)), 0, img.altura);
    const x1 = limitar(Math.round(Math.max(ret.x, ret.x + ret.largura)), 0, img.largura);
    const y1 = limitar(Math.round(Math.max(ret.y, ret.y + ret.altura)), 0, img.altura);
    if (x1 - x0 < 1 || y1 - y0 < 1) return null;
    return { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 };
}

function corDeHex(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return [0, 0, 0];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------------------------------------------------------------------------
// Remover fundo
// ---------------------------------------------------------------------------
// Sem rede neural, de proposito: o modelo que recorta pessoa de qualquer fundo pesa
// dezenas de MB e vem do servidor de um terceiro. O que se resolve aqui e' o caso que o
// professor mais tem — logotipo, desenho, assinatura, figura escaneada, foto de objeto
// sobre fundo liso — e se resolve bem.
//
// Como: a cor do fundo e' estimada pelas BORDAS da imagem (a mediana, que ignora o
// pedaco de desenho que encosta na margem), e o fundo e' tudo o que se liga a borda por
// pixels parecidos com essa cor (preenchimento por inundacao). Assim o branco DENTRO do
// desenho (o olho de uma letra "o" fechada, por exemplo) fica. Com `todaCor`, some toda
// cor parecida, ligada ou nao — e' o que se quer para uma assinatura.
//
// `pontos` sao cliques do professor: sementes extras ("isto aqui tambem e' fundo").
// `suavizar` cria uma faixa de transparencia parcial na borda do recorte, para o desenho
// nao sair serrilhado quando for colocado sobre outra cor.
function corDoFundo(img) {
    const L = img.largura, A = img.altura, d = img.dados;
    const rs = [], gs = [], bs = [];
    const pegar = (x, y) => { const o = (y * L + x) * 4; rs.push(d[o]); gs.push(d[o + 1]); bs.push(d[o + 2]); };
    const passo = Math.max(1, Math.floor(Math.max(L, A) / 400));
    for (let x = 0; x < L; x += passo) { pegar(x, 0); pegar(x, A - 1); }
    for (let y = 0; y < A; y += passo) { pegar(0, y); pegar(L - 1, y); }
    const mediana = (v) => { v.sort((a, b) => a - b); return v[v.length >> 1]; };
    return [mediana(rs), mediana(gs), mediana(bs)];
}

function removerFundo(img, op) {
    op = op || {};
    const L = img.largura, A = img.altura, d = img.dados;
    const tol = limitar(Number(op.tolerancia == null ? 30 : op.tolerancia), 0, 100);
    const limite = 4 + tol * 2.2;                  // distancia de cor (0..441)
    const faixa = limitar(Number(op.suavizar == null ? 2 : op.suavizar), 0, 10);
    const cor = op.cor ? corDeHex(op.cor) : corDoFundo(img);
    const n = L * A;

    const dist = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        const dr = d[o] - cor[0], dg = d[o + 1] - cor[1], db = d[o + 2] - cor[2];
        dist[i] = d[o + 3] < 8 ? 0 : Math.sqrt(dr * dr + dg * dg + db * db);
    }

    // 1 = fundo. Vale o criterio "ligado a borda" (ou "qualquer lugar", com todaCor).
    const fundo = new Uint8Array(n);
    if (op.todaCor) {
        for (let i = 0; i < n; i++) if (dist[i] <= limite) fundo[i] = 1;
    } else {
        const pilha = new Int32Array(n);
        let topo = 0;
        const semear = (i) => { if (!fundo[i] && dist[i] <= limite) { fundo[i] = 1; pilha[topo++] = i; } };
        if (op.bordas !== false) {
            for (let x = 0; x < L; x++) { semear(x); semear((A - 1) * L + x); }
            for (let y = 0; y < A; y++) { semear(y * L); semear(y * L + L - 1); }
        }
        (op.pontos || []).forEach(p => {
            const px = limitar(Math.round(p.x), 0, L - 1), py = limitar(Math.round(p.y), 0, A - 1);
            // O clique vale mesmo se a cor dele for diferente da do fundo estimado: o
            // professor apontou, entao e' fundo — a inundacao parte da cor do ponto.
            const i = py * L + px;
            if (!fundo[i]) { fundo[i] = 1; pilha[topo++] = i; }
        });
        // Para os cliques, a tolerancia e' medida contra a cor do proprio ponto de partida.
        const refDoPonto = new Int32Array(n).fill(-1);
        (op.pontos || []).forEach(p => {
            const i = limitar(Math.round(p.y), 0, A - 1) * L + limitar(Math.round(p.x), 0, L - 1);
            refDoPonto[i] = i;
        });
        const parecido = (i, ref) => {
            if (ref < 0) return dist[i] <= limite;
            const o = i * 4, r = ref * 4;
            const dr = d[o] - d[r], dg = d[o + 1] - d[r + 1], db = d[o + 2] - d[r + 2];
            return Math.sqrt(dr * dr + dg * dg + db * db) <= limite;
        };
        while (topo > 0) {
            const i = pilha[--topo];
            const ref = refDoPonto[i];
            const x = i % L, y = (i / L) | 0;
            const viz = [x > 0 ? i - 1 : -1, x < L - 1 ? i + 1 : -1, y > 0 ? i - L : -1, y < A - 1 ? i + L : -1];
            for (let k = 0; k < 4; k++) {
                const j = viz[k];
                if (j >= 0 && !fundo[j] && parecido(j, ref)) {
                    fundo[j] = 1; refDoPonto[j] = ref; pilha[topo++] = j;
                }
            }
        }
    }

    const saida = copiar(img), s = saida.dados;
    for (let i = 0; i < n; i++) if (fundo[i]) s[i * 4 + 3] = 0;

    // Borda suave: pixel de desenho encostado no fundo ganha transparencia parcial, na
    // medida em que a cor dele ainda lembra a do fundo (o "meio-tom" do antisserrilhado).
    if (faixa > 0) {
        const limiteSuave = limite * (1 + faixa * 0.35);
        for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) {
            const i = y * L + x;
            if (fundo[i]) continue;
            const encosta = (x > 0 && fundo[i - 1]) || (x < L - 1 && fundo[i + 1]) ||
                            (y > 0 && fundo[i - L]) || (y < A - 1 && fundo[i + L]);
            if (!encosta || dist[i] >= limiteSuave) continue;
            const f = limitar((dist[i] - limite) / (limiteSuave - limite), 0, 1);
            s[i * 4 + 3] = Math.round(s[i * 4 + 3] * f);
        }
    }
    return saida;
}

// Encaixa a imagem sobre uma cor solida — JPG e BMP nao tem transparencia, e sem isto o
// fundo transparente vira PRETO (que e' o valor que o canal de cor guarda ali).
function achatar(img, corFundo) {
    const c = corDeHex(corFundo || '#ffffff');
    const saida = copiar(img), s = saida.dados;
    for (let i = 0; i < s.length; i += 4) {
        const a = s[i + 3] / 255;
        s[i] = s[i] * a + c[0] * (1 - a);
        s[i + 1] = s[i + 1] * a + c[1] * (1 - a);
        s[i + 2] = s[i + 2] * a + c[2] * (1 - a);
        s[i + 3] = 255;
    }
    return saida;
}

function temTransparencia(img) {
    const d = img.dados;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
    return false;
}

// ---------------------------------------------------------------------------
// Onde vai a marca d'agua (e o texto do meme)
// ---------------------------------------------------------------------------
const POSICOES = ['topo-esquerda', 'topo-centro', 'topo-direita', 'centro-esquerda', 'centro',
                  'centro-direita', 'rodape-esquerda', 'rodape-centro', 'rodape-direita'];

// Canto superior esquerdo de uma caixa `caixaL x caixaA` na posicao pedida, com `margem`.
function posicionar(largura, altura, caixaL, caixaA, posicao, margem) {
    const m = Number(margem) || 0;
    const p = POSICOES.indexOf(posicao) >= 0 ? posicao : 'rodape-direita';
    const [v, h] = p === 'centro' ? ['centro', 'centro'] : p.split('-');
    const x = h === 'esquerda' ? m : h === 'direita' ? largura - caixaL - m : (largura - caixaL) / 2;
    const y = v === 'topo' ? m : v === 'rodape' ? altura - caixaA - m : (altura - caixaA) / 2;
    return { x: Math.round(x), y: Math.round(y) };
}

// ---------------------------------------------------------------------------
// Escrever GIF
// ---------------------------------------------------------------------------
// O navegador le GIF mas nao sabe escrever. Este codificador e' pequeno de proposito:
// paleta fixa de 252 cores (6 niveis de vermelho, 7 de verde, 6 de azul — o olho
// distingue mais verde) com pontilhado de Floyd-Steinberg, que e' o que salva degradê
// numa paleta curta, e mais uma cor reservada para a transparencia. Varios quadros viram
// GIF animado.
//
// quadros: [{ largura, altura, dados }] (todos do tamanho do primeiro)
// op: { atraso (ms por quadro), repetir (true = para sempre), pontilhar }
const GIF_NR = 6, GIF_NG = 7, GIF_NB = 6;
const GIF_TRANSP = 252;

function paletaGif() {
    const p = new Uint8Array(256 * 3);
    let k = 0;
    for (let r = 0; r < GIF_NR; r++) for (let g = 0; g < GIF_NG; g++) for (let b = 0; b < GIF_NB; b++) {
        p[k * 3] = Math.round(r * 255 / (GIF_NR - 1));
        p[k * 3 + 1] = Math.round(g * 255 / (GIF_NG - 1));
        p[k * 3 + 2] = Math.round(b * 255 / (GIF_NB - 1));
        k++;
    }
    return p;
}

function indicesGif(img, pontilhar) {
    const L = img.largura, A = img.altura, d = img.dados;
    const erro = new Float32Array(L * A * 3);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { erro[j] = d[i]; erro[j + 1] = d[i + 1]; erro[j + 2] = d[i + 2]; }
    const idx = new Uint8Array(L * A);
    const niveis = [GIF_NR - 1, GIF_NG - 1, GIF_NB - 1];
    const espalhar = (x, y, er, eg, eb, f) => {
        if (x < 0 || x >= L || y >= A) return;
        const j = (y * L + x) * 3;
        erro[j] += er * f; erro[j + 1] += eg * f; erro[j + 2] += eb * f;
    };
    for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) {
        const i = y * L + x;
        if (d[i * 4 + 3] < 128) { idx[i] = GIF_TRANSP; continue; }
        const j = i * 3;
        const q = [0, 1, 2].map(c => Math.round(limitar(erro[j + c], 0, 255) * niveis[c] / 255));
        idx[i] = (q[0] * GIF_NG + q[1]) * GIF_NB + q[2];
        if (pontilhar !== false) {
            const er = erro[j] - q[0] * 255 / niveis[0];
            const eg = erro[j + 1] - q[1] * 255 / niveis[1];
            const eb = erro[j + 2] - q[2] * 255 / niveis[2];
            espalhar(x + 1, y, er, eg, eb, 7 / 16);
            espalhar(x - 1, y + 1, er, eg, eb, 3 / 16);
            espalhar(x, y + 1, er, eg, eb, 5 / 16);
            espalhar(x + 1, y + 1, er, eg, eb, 1 / 16);
        }
    }
    return idx;
}

// LZW de GIF, com codigos de largura variavel e sub-blocos de 255 bytes.
function lzwGif(indices, bitsMinimos) {
    const saida = [];
    let acumulado = 0, nbits = 0;
    const bloco = [];
    const emitir = (codigo, largura) => {
        acumulado |= codigo << nbits;
        nbits += largura;
        while (nbits >= 8) {
            bloco.push(acumulado & 255);
            acumulado >>>= 8; nbits -= 8;
            if (bloco.length === 255) { saida.push(255); for (const b of bloco) saida.push(b); bloco.length = 0; }
        }
    };
    const LIMPAR = 1 << bitsMinimos, FIM = LIMPAR + 1;
    let dicionario = new Map();
    let proximo = FIM + 1, largura = bitsMinimos + 1;
    emitir(LIMPAR, largura);
    let atual = indices[0];
    for (let i = 1; i < indices.length; i++) {
        const k = indices[i];
        const chave = atual * 4096 + k;
        const achado = dicionario.get(chave);
        if (achado !== undefined) { atual = achado; continue; }
        emitir(atual, largura);
        if (proximo < 4096) {
            dicionario.set(chave, proximo++);
            if (proximo > (1 << largura) && largura < 12) largura++;
        } else {
            emitir(LIMPAR, largura);
            dicionario = new Map(); proximo = FIM + 1; largura = bitsMinimos + 1;
        }
        atual = k;
    }
    emitir(atual, largura);
    emitir(FIM, largura);
    if (nbits > 0) bloco.push(acumulado & 255);
    for (let i = 0; i < bloco.length; i += 255) {
        const pedaco = bloco.slice(i, i + 255);
        saida.push(pedaco.length);
        for (const b of pedaco) saida.push(b);
    }
    saida.push(0);
    return saida;
}

function codificarGif(quadros, op) {
    op = op || {};
    if (!quadros || !quadros.length) throw new Error('Nenhuma imagem para o GIF.');
    const L = quadros[0].largura, A = quadros[0].altura;
    const atraso = Math.max(2, Math.round((Number(op.atraso) || 500) / 10));   // centesimos
    const b = [];
    const u16 = (v) => { b.push(v & 255, (v >> 8) & 255); };
    const texto = (t) => { for (let i = 0; i < t.length; i++) b.push(t.charCodeAt(i)); };

    texto('GIF89a');
    u16(L); u16(A);
    b.push(0xF7, 0, 0);                 // paleta global de 256 cores
    const paleta = paletaGif();
    for (let i = 0; i < paleta.length; i++) b.push(paleta[i]);

    if (quadros.length > 1) {
        b.push(0x21, 0xFF, 11); texto('NETSCAPE2.0');
        b.push(3, 1); u16(op.repetir === false ? 1 : 0); b.push(0);
    }
    quadros.forEach(q => {
        if (q.largura !== L || q.altura !== A) throw new Error('Os quadros do GIF precisam ter o mesmo tamanho.');
        const idx = indicesGif(q, op.pontilhar);
        let transp = false;
        for (let i = 0; i < idx.length; i++) if (idx[i] === GIF_TRANSP) { transp = true; break; }
        // Controle grafico: atraso, e "restaurar ao fundo" para a animacao nao borrar.
        b.push(0x21, 0xF9, 4, (2 << 2) | (transp ? 1 : 0)); u16(atraso); b.push(GIF_TRANSP, 0);
        b.push(0x2C); u16(0); u16(0); u16(L); u16(A); b.push(0);
        b.push(8);
        const dados = lzwGif(idx, 8);
        for (let i = 0; i < dados.length; i++) b.push(dados[i]);
    });
    b.push(0x3B);
    return Uint8Array.from(b);
}

// ---------------------------------------------------------------------------
// Escrever BMP
// ---------------------------------------------------------------------------
// 24 bits, sem compressao — o que qualquer programa antigo da secretaria abre. A
// transparencia e' achatada sobre `corFundo`.
function codificarBmp(img, corFundo) {
    const chapada = achatar(img, corFundo || '#ffffff');
    const L = chapada.largura, A = chapada.altura, d = chapada.dados;
    const linha = Math.ceil(L * 3 / 4) * 4;
    const tamanho = 54 + linha * A;
    const buf = new Uint8Array(tamanho);
    const dv = new DataView(buf.buffer);
    buf[0] = 0x42; buf[1] = 0x4D;
    dv.setUint32(2, tamanho, true);
    dv.setUint32(10, 54, true);
    dv.setUint32(14, 40, true);
    dv.setInt32(18, L, true);
    dv.setInt32(22, A, true);            // positivo = de baixo para cima
    dv.setUint16(26, 1, true);
    dv.setUint16(28, 24, true);
    dv.setUint32(34, linha * A, true);
    dv.setInt32(38, 2835, true); dv.setInt32(42, 2835, true);   // 72 DPI
    for (let y = 0; y < A; y++) {
        const base = 54 + (A - 1 - y) * linha;
        for (let x = 0; x < L; x++) {
            const o = (y * L + x) * 4, n = base + x * 3;
            buf[n] = d[o + 2]; buf[n + 1] = d[o + 1]; buf[n + 2] = d[o];
        }
    }
    return buf;
}

// ---------------------------------------------------------------------------
// Utilitarios
// ---------------------------------------------------------------------------
function formatarTamanho(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(b < 10240 ? 1 : 0).replace('.', ',') + ' KB';
    return (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
}

// "foto.final.png" + ("-comprimida", "jpg") -> "foto.final-comprimida.jpg"
function nomeDeSaida(nomeOriginal, sufixo, extensao) {
    const base = String(nomeOriginal || 'imagem').replace(/\.[^.\/\\]+$/, '') || 'imagem';
    return base + (sufixo || '') + '.' + extensao;
}

function extensaoDoTipo(tipo) {
    return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
              'image/bmp': 'bmp', 'image/avif': 'avif' })[tipo] || 'png';
}

const IMGOPS = {
    novaImagem, copiar, girar, espelhar, recortar, calcularTamanho, redimensionar,
    FILTROS, ajustar, desfocarRegiao, pixelarRegiao, tarjaRegiao, corDoFundo, removerFundo,
    achatar, temTransparencia, POSICOES, posicionar, codificarGif, codificarBmp,
    formatarTamanho, nomeDeSaida, extensaoDoTipo, corDeHex
};

raiz.IMGOPS = IMGOPS;
if (typeof module !== 'undefined' && module.exports) module.exports = IMGOPS;

})(typeof window !== 'undefined' ? window : globalThis);
