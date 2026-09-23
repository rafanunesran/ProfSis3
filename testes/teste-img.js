// A aba "IMG" (img_operacoes.js), as contas que rodam no aparelho.
//
// Como o motor de ampliar, este foi escrito sem <canvas> e sem DOM, sobre
// { largura, altura, dados } em RGBA — entao da' para conferir cada ferramenta aqui,
// com numero, sem abrir navegador.
//
// O que este teste cobre:
//   1. girar e espelhar: o pixel do canto vai para o canto certo, e 4 x 90 graus volta ao comeco;
//   2. cortar: pega o pedaco certo, apara o que passa da borda, recusa corte vazio;
//   3. a conta do tamanho novo (proporcao travada, porcentagem, "nao ampliar");
//   4. redimensionar: area lisa continua lisa, e o transparente nao vaza preto na borda;
//   5. editor: zero em tudo nao muda nada; brilho clareia; cinza zera a cor;
//   6. desfocar/pixelar/tarja mexem SO' dentro do retangulo;
//   7. remover fundo: tira o fundo ligado a borda, mantem o desenho e o "miolo" dele,
//      e com "toda a cor" tira o miolo tambem;
//   8. achatar sobre branco (JPG nao tem transparencia);
//   9. GIF: o arquivo e' lido de volta por um decodificador escrito aqui e as cores batem,
//      inclusive com varios quadros (GIF animado);
//  10. BMP: cabecalho e pixels no lugar certo (de baixo para cima, BGR);
//  11. posicao da marca d'agua e nomes de arquivo.
//
// Como rodar:  node testes/teste-img.js

const IMG = require('../img_operacoes.js');

let falhas = 0, total = 0;
function ok(nome, condicao, detalhe) {
    total++;
    if (!condicao) falhas++;
    console.log((condicao ? '  ok  ' : ' FALHA') + ' | ' + nome + (detalhe ? '  -> ' + detalhe : ''));
}

function montar(L, A, fn) {
    const img = IMG.novaImagem(L, A);
    for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) {
        const p = fn(x, y), o = (y * L + x) * 4;
        img.dados[o] = p[0]; img.dados[o + 1] = p[1]; img.dados[o + 2] = p[2]; img.dados[o + 3] = p[3] == null ? 255 : p[3];
    }
    return img;
}
const px = (img, x, y) => { const o = (y * img.largura + x) * 4; return Array.from(img.dados.slice(o, o + 4)); };
const igual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// Imagem 4x3 com cada pixel identificavel: R = x, G = y.
const marcada = montar(4, 3, (x, y) => [x * 10, y * 10, 200]);

console.log('\n1. Girar e espelhar');
{
    const g90 = IMG.girar(marcada, 90);
    ok('90 graus troca largura e altura', g90.largura === 3 && g90.altura === 4);
    ok('90 graus: o canto de cima a esquerda vai para cima a direita', igual(px(g90, 2, 0), [0, 0, 200, 255]));
    const g270 = IMG.girar(marcada, -90);
    ok('-90 (= 270): o canto de cima a esquerda vai para baixo a esquerda', igual(px(g270, 0, 3), [0, 0, 200, 255]));
    const g180 = IMG.girar(marcada, 180);
    ok('180: o canto vai para o canto oposto', igual(px(g180, 3, 2), [0, 0, 200, 255]));
    let volta = marcada;
    for (let i = 0; i < 4; i++) volta = IMG.girar(volta, 90);
    ok('quatro vezes 90 volta ao comeco', igual(Array.from(volta.dados), Array.from(marcada.dados)));
    const eh = IMG.espelhar(marcada, true, false);
    ok('espelhar na horizontal', igual(px(eh, 3, 1), px(marcada, 0, 1)));
    const ev = IMG.espelhar(marcada, false, true);
    ok('espelhar na vertical', igual(px(ev, 1, 2), px(marcada, 1, 0)));
}

console.log('\n2. Cortar');
{
    const c = IMG.recortar(marcada, 1, 1, 2, 2);
    ok('tamanho do corte', c.largura === 2 && c.altura === 2);
    ok('pega o pedaco certo', igual(px(c, 0, 0), px(marcada, 1, 1)) && igual(px(c, 1, 1), px(marcada, 2, 2)));
    const aparado = IMG.recortar(marcada, 2, 1, 50, 50);
    ok('corte que passa da borda e aparado', aparado.largura === 2 && aparado.altura === 2);
    let recusou = false;
    try { IMG.recortar(marcada, 10, 10, 5, 5); } catch (_) { recusou = true; }
    ok('corte vazio e recusado com explicacao', recusou);
}

console.log('\n3. A conta do tamanho novo');
{
    const t1 = IMG.calcularTamanho(4000, 3000, { modo: 'pixels', largura: 1280, proporcao: true });
    ok('so a largura, proporcao travada', t1.largura === 1280 && t1.altura === 960, JSON.stringify(t1));
    const t2 = IMG.calcularTamanho(4000, 3000, { modo: 'pixels', largura: 1000, altura: 1000, proporcao: true });
    ok('caixa quadrada: cabe dentro, sem deformar', t2.largura === 1000 && t2.altura === 750, JSON.stringify(t2));
    const t3 = IMG.calcularTamanho(4000, 3000, { modo: 'pixels', largura: 1000, altura: 1000, proporcao: false });
    ok('sem proporcao: exatamente o pedido', t3.largura === 1000 && t3.altura === 1000);
    const t4 = IMG.calcularTamanho(800, 600, { modo: 'porcento', porcento: 50 });
    ok('50%', t4.largura === 400 && t4.altura === 300);
    const t5 = IMG.calcularTamanho(800, 600, { modo: 'pixels', largura: 1600, proporcao: true, naoAmpliar: true });
    ok('"nao ampliar" segura no tamanho original', t5.largura === 800 && t5.altura === 600, JSON.stringify(t5));
    const t6 = IMG.calcularTamanho(800, 600, { modo: 'pixels', altura: 300, proporcao: true });
    ok('so a altura', t6.largura === 400 && t6.altura === 300);
}

console.log('\n4. Redimensionar');
{
    const lisa = montar(40, 30, () => [120, 130, 140]);
    const menor = IMG.redimensionar(lisa, 13, 7);
    let lisaFicou = true;
    for (let i = 0; i < menor.dados.length; i += 4) {
        if (Math.abs(menor.dados[i] - 120) > 1 || Math.abs(menor.dados[i + 2] - 140) > 1 || menor.dados[i + 3] !== 255) lisaFicou = false;
    }
    ok('reduzir area lisa continua lisa', lisaFicou);
    const maior = IMG.redimensionar(lisa, 97, 71);
    ok('ampliar area lisa continua lisa', Array.from(maior.dados).every((v, i) => Math.abs(v - [120, 130, 140, 255][i % 4]) <= 1));
    // Metade esquerda vermelha opaca, direita transparente com "preto" guardado atras.
    const meio = montar(8, 8, (x) => x < 4 ? [255, 0, 0, 255] : [0, 0, 0, 0]);
    const r = IMG.redimensionar(meio, 3, 3);
    const borda = px(r, 1, 1);
    ok('o transparente nao escurece a borda (alfa pre-multiplicado)', borda[0] > 250 && borda[3] > 0 && borda[3] < 255, borda.join(','));
    const r2 = IMG.redimensionar(meio, 20, 20);
    const b2 = px(r2, 10, 10);
    ok('nem ao ampliar', b2[3] === 0 || b2[0] > 250, b2.join(','));
}

console.log('\n5. Editor');
{
    const foto = montar(10, 10, (x, y) => [x * 20, y * 20, 100]);
    const nada = IMG.ajustar(foto, { brilho: 0, contraste: 0, saturacao: 0, filtro: 'nenhum' });
    ok('tudo em zero nao muda nada', igual(Array.from(nada.dados), Array.from(foto.dados)));
    const claro = IMG.ajustar(foto, { brilho: 50 });
    ok('brilho clareia', px(claro, 2, 2)[0] > px(foto, 2, 2)[0]);
    const cinza = IMG.ajustar(foto, { filtro: 'cinza' });
    const p = px(cinza, 7, 3);
    ok('cinza zera a cor', p[0] === p[1] && p[1] === p[2]);
    const pb = IMG.ajustar(foto, { filtro: 'pb' });
    ok('alto contraste so tem preto e branco', Array.from(pb.dados).every((v, i) => i % 4 === 3 || v === 0 || v === 255));
    const sem = IMG.ajustar(foto, { saturacao: -100 });
    const q = px(sem, 5, 1);
    ok('saturacao -100 tambem tira a cor', Math.abs(q[0] - q[1]) <= 1 && Math.abs(q[1] - q[2]) <= 1);
    ok('o original nao e alterado', px(foto, 2, 2)[0] === 40);
}

console.log('\n6. Desfocar, pixelar e tarja so dentro do retangulo');
{
    const xadrez = montar(40, 40, (x, y) => ((x + y) % 2) ? [255, 255, 255] : [0, 0, 0]);
    const ret = { x: 10, y: 10, largura: 20, altura: 20 };
    const fora = (img) => [px(img, 2, 2), px(img, 35, 35), px(img, 9, 20), px(img, 30, 20)];
    [['desfocar', IMG.desfocarRegiao(xadrez, ret, 8)], ['pixelar', IMG.pixelarRegiao(xadrez, ret, 8)],
     ['tarja', IMG.tarjaRegiao(xadrez, ret, '#000000')]].forEach(([nome, r]) => {
        ok(nome + ': fora do retangulo nada muda', fora(r).every((p, i) => igual(p, fora(xadrez)[i])));
        const dentro = px(r, 20, 20)[0], vizinho = px(r, 21, 20)[0];
        ok(nome + ': dentro, o xadrez some', Math.abs(dentro - vizinho) < 60, dentro + ' vs ' + vizinho);
    });
}

console.log('\n7. Remover fundo');
{
    // Fundo branco, um anel azul (com miolo branco) e um quadrado vermelho.
    const figura = montar(60, 40, (x, y) => {
        const d = Math.hypot(x - 20, y - 20);
        if (d <= 12 && d >= 6) return [30, 60, 200];
        if (x >= 40 && x < 52 && y >= 14 && y < 26) return [220, 30, 30];
        return [255, 255, 255];
    });
    const cor = IMG.corDoFundo(figura);
    ok('a cor do fundo sai das bordas', igual(cor, [255, 255, 255]), cor.join(','));
    const sem = IMG.removerFundo(figura, { tolerancia: 30, suavizar: 0 });
    ok('o fundo ficou transparente', px(sem, 1, 1)[3] === 0 && px(sem, 58, 38)[3] === 0);
    ok('o desenho ficou', px(sem, 20, 10)[3] === 255 && px(sem, 45, 20)[3] === 255);
    ok('o miolo do anel (nao ligado a borda) ficou', px(sem, 20, 20)[3] === 255);
    const toda = IMG.removerFundo(figura, { tolerancia: 30, suavizar: 0, todaCor: true });
    ok('com "toda a cor", o miolo sai tambem', px(toda, 20, 20)[3] === 0 && px(toda, 20, 10)[3] === 255);
    const clicado = IMG.removerFundo(figura, { tolerancia: 30, suavizar: 0, pontos: [{ x: 20, y: 20 }] });
    ok('um toque no miolo tira o miolo', px(clicado, 20, 20)[3] === 0 && px(clicado, 20, 10)[3] === 255);
    const quadrado = IMG.removerFundo(figura, { tolerancia: 30, suavizar: 0, bordas: false, pontos: [{ x: 45, y: 20 }] });
    ok('o toque vale mesmo numa cor diferente do fundo', px(quadrado, 45, 20)[3] === 0 && px(quadrado, 1, 1)[3] === 255);
    // Borda antisserrilhada: um pixel meio-termo entre o azul e o branco.
    const suave = montar(20, 20, (x, y) => (x >= 8 && x < 12 && y >= 8 && y < 12) ? [0, 0, 0] :
                                           (x === 7 && y >= 8 && y < 12) ? [200, 200, 200] : [255, 255, 255]);
    const s0 = IMG.removerFundo(suave, { tolerancia: 25, suavizar: 0 });
    const s4 = IMG.removerFundo(suave, { tolerancia: 25, suavizar: 6 });
    ok('suavizar deixa o meio-tom da borda parcialmente transparente',
       px(s0, 7, 9)[3] === 255 && px(s4, 7, 9)[3] < 255 && px(s4, 7, 9)[3] > 0 && px(s4, 9, 9)[3] === 255,
       px(s0, 7, 9)[3] + ' -> ' + px(s4, 7, 9)[3]);
}

console.log('\n8. Achatar');
{
    const vazada = montar(2, 1, (x) => x ? [0, 0, 0, 0] : [0, 0, 0, 128]);
    const chapa = IMG.achatar(vazada, '#ffffff');
    ok('transparente vira branco, nao preto', igual(px(chapa, 1, 0), [255, 255, 255, 255]));
    ok('meio transparente vira cinza', Math.abs(px(chapa, 0, 0)[0] - 127) <= 1 && px(chapa, 0, 0)[3] === 255);
    ok('detecta transparencia', IMG.temTransparencia(vazada) && !IMG.temTransparencia(chapa));
}

// --- decodificador de GIF, so' para o teste ---------------------------------
function lerGif(bytes) {
    let p = 0;
    const u8 = () => bytes[p++];
    const u16 = () => { const v = bytes[p] | (bytes[p + 1] << 8); p += 2; return v; };
    const assinatura = String.fromCharCode.apply(null, bytes.slice(0, 6)); p = 6;
    const L = u16(), A = u16(), flags = u8(); u8(); u8();
    let paleta = null;
    if (flags & 0x80) { const n = 1 << ((flags & 7) + 1); paleta = bytes.slice(p, p + n * 3); p += n * 3; }
    const quadros = [];
    let transp = -1, atraso = 0, laco = false;
    while (p < bytes.length) {
        const b = u8();
        if (b === 0x3B) break;
        if (b === 0x21) {
            const rotulo = u8();
            if (rotulo === 0xF9) { u8(); const f = u8(); atraso = u16(); const t = u8(); u8(); transp = (f & 1) ? t : -1; }
            else {
                let n;
                const ini = p;
                while ((n = u8())) { if (rotulo === 0xFF && String.fromCharCode.apply(null, bytes.slice(ini + 1, ini + 12)) === 'NETSCAPE2.0') laco = true; p += n; }
            }
        } else if (b === 0x2C) {
            u16(); u16(); const ql = u16(), qa = u16(); u8();
            const minimo = u8();
            const dados = [];
            let n;
            while ((n = u8())) { for (let i = 0; i < n; i++) dados.push(bytes[p + i]); p += n; }
            const idx = lzwDecodificar(dados, minimo, ql * qa);
            quadros.push({ largura: ql, altura: qa, idx: idx, transp: transp, atraso: atraso });
        } else throw new Error('bloco desconhecido ' + b + ' em ' + (p - 1));
    }
    return { assinatura, L, A, paleta, quadros, laco };
}

function lzwDecodificar(dados, minimo, total) {
    const LIMPAR = 1 << minimo, FIM = LIMPAR + 1;
    let largura = minimo + 1, dic = [], prox, anterior = null;
    const reset = () => { dic = []; for (let i = 0; i < LIMPAR; i++) dic[i] = [i]; dic[LIMPAR] = []; dic[FIM] = []; prox = FIM + 1; largura = minimo + 1; anterior = null; };
    reset();
    const saida = [];
    let bit = 0;
    const ler = () => {
        let v = 0;
        for (let i = 0; i < largura; i++, bit++) v |= ((dados[bit >> 3] >> (bit & 7)) & 1) << i;
        return v;
    };
    while (bit + largura <= dados.length * 8) {
        const c = ler();
        if (c === LIMPAR) { reset(); continue; }
        if (c === FIM) break;
        let entrada;
        if (c < prox && dic[c]) entrada = dic[c];
        else if (c === prox && anterior) entrada = anterior.concat([anterior[0]]);
        else throw new Error('codigo LZW invalido ' + c + ' (prox ' + prox + ')');
        for (const v of entrada) saida.push(v);
        if (anterior && prox < 4096) {
            dic[prox++] = anterior.concat([entrada[0]]);
            if (prox === (1 << largura) && largura < 12) largura++;
        }
        anterior = entrada;
    }
    if (saida.length < total) throw new Error('GIF curto: ' + saida.length + ' de ' + total);
    return saida.slice(0, total);
}

console.log('\n9. GIF');
{
    // Cores que existem na paleta (sem pontilhado, batem exato) + transparencia + uma
    // imagem grande e variada o bastante para o dicionario LZW encher e reiniciar.
    const cores = [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
    const q1 = montar(97, 61, (x, y) => (x === 0 && y === 0) ? [0, 0, 0, 0] : cores[(x * 7 + y * 13 + ((x * y) % 5)) % cores.length]);
    const bytes = IMG.codificarGif([q1], { pontilhar: false });
    let g = null, erro = '';
    try { g = lerGif(bytes); } catch (e) { erro = e.message; }
    ok('o GIF e lido de volta', !!g, erro);
    if (g) {
        ok('assinatura e tamanho', g.assinatura === 'GIF89a' && g.L === 97 && g.A === 61);
        let batem = true;
        for (let y = 0; y < 61 && batem; y++) for (let x = 0; x < 97; x++) {
            const i = g.quadros[0].idx[y * 97 + x];
            const esperado = px(q1, x, y);
            if (esperado[3] === 0) { if (i !== g.quadros[0].transp) { batem = false; break; } continue; }
            const cor = [g.paleta[i * 3], g.paleta[i * 3 + 1], g.paleta[i * 3 + 2]];
            if (!igual(cor, esperado.slice(0, 3))) { batem = false; erro = x + ',' + y + ': ' + cor + ' vs ' + esperado; break; }
        }
        ok('todos os pixels batem (e o transparente e transparente)', batem, erro);
    }
    // Degrade com pontilhado: a media de uma faixa tem de ficar perto da cor original.
    const degrade = montar(128, 16, (x) => [x * 2, 90, 255 - x * 2]);
    const gd = lerGif(IMG.codificarGif([degrade]));
    let soma = 0;
    for (let x = 60; x < 68; x++) for (let y = 0; y < 16; y++) soma += gd.paleta[gd.quadros[0].idx[y * 128 + x] * 3];
    const media = soma / (8 * 16);
    ok('com pontilhado, a media da cor e preservada', Math.abs(media - 128) < 12, media.toFixed(1) + ' (esperado ~128)');
    // Imagem de ruido: forca o dicionario a encher e mandar o codigo de reinicio.
    let semente = 7;
    const aleatorio = () => (semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const ruido = montar(200, 200, () => [aleatorio() * 255, aleatorio() * 255, aleatorio() * 255]);
    let gr = null; erro = '';
    try { gr = lerGif(IMG.codificarGif([ruido], { pontilhar: false })); } catch (e) { erro = e.message; }
    ok('imagem de ruido (dicionario LZW cheio) tambem e lida', !!gr && gr.quadros[0].idx.length === 40000, erro);
    const anim = lerGif(IMG.codificarGif([q1, IMG.girar(IMG.girar(q1, 90), 90)], { atraso: 700 }));
    ok('GIF animado: dois quadros, em laco, 0,7 s cada', anim.quadros.length === 2 && anim.laco && anim.quadros[1].atraso === 70);
    let recusou = false;
    try { IMG.codificarGif([q1, IMG.girar(q1, 90)]); } catch (_) { recusou = true; }
    ok('quadros de tamanhos diferentes sao recusados', recusou);
}

console.log('\n10. BMP');
{
    const img = montar(3, 2, (x, y) => [x * 100, y * 100, 50, x === 2 && y === 1 ? 0 : 255]);
    const b = IMG.codificarBmp(img, '#ffffff');
    const dv = new DataView(b.buffer);
    ok('assinatura BM e tamanho do arquivo', b[0] === 0x42 && b[1] === 0x4D && dv.getUint32(2, true) === b.length);
    ok('largura, altura, 24 bits', dv.getInt32(18, true) === 3 && dv.getInt32(22, true) === 2 && dv.getUint16(28, true) === 24);
    const linha = 12;   // 3 px * 3 bytes = 9, arredondado para multiplo de 4
    ok('linhas com preenchimento ate multiplo de 4', b.length === 54 + linha * 2);
    // A primeira linha do arquivo e' a de BAIXO da imagem; ordem B, G, R.
    const p10 = [b[54 + 3 + 2], b[54 + 3 + 1], b[54 + 3]];
    ok('pixel (1,1) no lugar certo, em BGR', igual(p10, [100, 100, 50]), p10.join(','));
    const p21 = [b[54 + 6 + 2], b[54 + 6 + 1], b[54 + 6]];
    ok('transparente achatado em branco', igual(p21, [255, 255, 255]), p21.join(','));
}

console.log('\n11. Marca d\'agua e nomes');
{
    ok('canto de baixo a direita', JSON.stringify(IMG.posicionar(1000, 800, 200, 100, 'rodape-direita', 20)) === '{"x":780,"y":680}');
    ok('centro', JSON.stringify(IMG.posicionar(1000, 800, 200, 100, 'centro', 20)) === '{"x":400,"y":350}');
    ok('topo a esquerda', JSON.stringify(IMG.posicionar(1000, 800, 200, 100, 'topo-esquerda', 20)) === '{"x":20,"y":20}');
    ok('nome de saida troca a extensao', IMG.nomeDeSaida('foto.final.PNG', '-comprimida', 'jpg') === 'foto.final-comprimida.jpg');
    ok('nome sem extensao', IMG.nomeDeSaida('scan', '', 'png') === 'scan.png');
    ok('tamanho legivel', IMG.formatarTamanho(1536) === '1,5 KB' && IMG.formatarTamanho(5 * 1024 * 1024) === '5,0 MB');
}

console.log('\n' + (falhas ? falhas + ' FALHA(S) de ' + total : 'Tudo certo: ' + total + ' verificacoes.'));
process.exit(falhas ? 1 : 0);
