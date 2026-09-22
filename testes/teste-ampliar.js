// A aba "Ampliar" (ampliar_operacoes.js), o motor que roda no aparelho.
//
// Este teste NAO abre navegador: o motor foi escrito de proposito sem <canvas>, sem DOM e
// sem internet, sobre { largura, altura, dados } em RGBA. E' o que permite medir as contas
// aqui, com numero, em vez de olhar a imagem e achar que melhorou.
//
// O que este teste cobre:
//   1. o nucleo de Lanczos: vale 1 no zero, zero nos inteiros, e os pesos somam 1 —
//      sem isso a borda da imagem escurece ao ampliar;
//   2. area lisa continua lisa (nenhum pixel inventado) e ampliar por 1x nao muda nada;
//   3. TRANSPARENCIA: o preto que mora atras de um pixel transparente nao vaza para o
//      pixel opaco vizinho (e' o bug classico de quem esquece de pre-multiplicar o alfa);
//   4. o limitador de estouro apaga a auréola que o Lanczos cria em volta de borda dura;
//   5. o redutor de ruido apaga o granulado SEM comer a borda — medido: desvio padrao na
//      area lisa cai muito, altura do degrau na borda cai pouco;
//   6. o realce de borda aumenta o contraste local sem estourar a vizinhanca;
//   7. reduzir tambem funciona (e sem serrilha), porque a mesma funcao faz os dois;
//   8. os passos de ampliacao sao planejados em 2x, e o teto de memoria barra o que nao cabe.
//
// Como rodar:  node testes/teste-ampliar.js

const AMP = require('../ampliar_operacoes.js');

let falhas = 0;
let total = 0;
function ok(nome, condicao, detalhe) {
    total++;
    if (!condicao) falhas++;
    console.log((condicao ? '  ok  ' : ' FALHA') + ' | ' + nome + (detalhe ? '  -> ' + detalhe : ''));
}

// --- ajudas -----------------------------------------------------------------

function montar(largura, altura, fn) {
    const img = AMP.criarImagem(largura, altura);
    for (let y = 0; y < altura; y++) {
        for (let x = 0; x < largura; x++) {
            const c = (y * largura + x) * 4;
            const p = fn(x, y);
            img.dados[c] = p[0]; img.dados[c + 1] = p[1]; img.dados[c + 2] = p[2];
            img.dados[c + 3] = p[3] == null ? 255 : p[3];
        }
    }
    return img;
}

const pixel = (img, x, y) => {
    const c = (y * img.largura + x) * 4;
    return [img.dados[c], img.dados[c + 1], img.dados[c + 2], img.dados[c + 3]];
};

function estatistica(img, x0, x1, y0, y1) {
    let soma = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { soma += pixel(img, x, y)[0]; n++; }
    const media = soma / n;
    let acc = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) acc += Math.pow(pixel(img, x, y)[0] - media, 2);
    return { media: media, desvio: Math.sqrt(acc / n) };
}

// Ruido reproduzivel: um teste que sorteia numero diferente a cada execucao nao e' teste.
function sorteador(semente) {
    let s = semente;
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff) * 2 - 1; };
}

// ---------------------------------------------------------------------------
console.log('\n1. O nucleo de Lanczos e os pesos');
// ---------------------------------------------------------------------------

ok('L(0) = 1', AMP.nucleoLanczos(0, 3) === 1);
ok('L(1) = 0 (nao borra o proprio pixel)', Math.abs(AMP.nucleoLanczos(1, 3)) < 1e-9);
ok('L(2) = 0', Math.abs(AMP.nucleoLanczos(2, 3)) < 1e-9);
ok('L(x) = 0 fora do suporte', AMP.nucleoLanczos(3, 3) === 0 && AMP.nucleoLanczos(9, 3) === 0);
ok('L tem lobulo negativo (e dai vem a nitidez)', AMP.nucleoLanczos(1.5, 3) < 0);

let piorSoma = 0;
[[23, 7], [23, 16], [23, 33], [23, 100], [100, 13], [5, 40]].forEach(([origem, destino]) => {
    AMP.tabelaPesos(origem, destino, 3).forEach(e => {
        let s = 0;
        for (let i = 0; i < e.pesos.length; i++) s += e.pesos[i];
        piorSoma = Math.max(piorSoma, Math.abs(s - 1));
    });
});
ok('os pesos sempre somam 1 (borda nao escurece)', piorSoma < 1e-5, 'pior erro ' + piorSoma.toExponential(1));

// ---------------------------------------------------------------------------
console.log('\n2. Ampliar sem inventar');
// ---------------------------------------------------------------------------

const lisa = montar(9, 9, () => [200, 120, 60, 255]);
const lisa2x = AMP.redimensionar(lisa, 18, 18, 3);
let min = 255, max = 0;
for (let i = 0; i < lisa2x.dados.length; i += 4) { min = Math.min(min, lisa2x.dados[i]); max = Math.max(max, lisa2x.dados[i]); }
ok('area lisa continua lisa depois de 2x', min === 200 && max === 200, 'min ' + min + ' max ' + max);
ok('o canto tambem (a borda nao escurece)', String(pixel(lisa2x, 0, 0)) === '200,120,60,255');
ok('tamanho certo', lisa2x.largura === 18 && lisa2x.altura === 18);

const identica = AMP.redimensionar(lisa, 9, 9, 3);
ok('redimensionar para o mesmo tamanho nao muda nada',
   Buffer.compare(Buffer.from(identica.dados), Buffer.from(lisa.dados)) === 0);

// ---------------------------------------------------------------------------
console.log('\n3. Transparencia (o alfa pre-multiplicado)');
// ---------------------------------------------------------------------------
// Quadrado BRANCO opaco sobre fundo transparente cujos bytes de cor sao PRETOS — que e'
// como quase todo PNG recortado chega. Sem pre-multiplicar, o preto do fundo invisivel
// entra na conta e a figura ampliada ganha uma orla cinza.

const recorte = montar(24, 24, (x, y) => (x >= 6 && x < 18 && y >= 6 && y < 18)
    ? [255, 255, 255, 255] : [0, 0, 0, 0]);
const recorte2x = AMP.redimensionar(recorte, 48, 48, 3);

let piorBranco = 255;
for (let y = 12; y < 36; y++) {
    for (let x = 12; x < 36; x++) {
        const p = pixel(recorte2x, x, y);
        if (p[3] > 200) piorBranco = Math.min(piorBranco, p[0]);
    }
}
ok('branco opaco nao ganha orla escura do fundo transparente', piorBranco === 255, 'menor R = ' + piorBranco);
ok('o miolo continua totalmente opaco', pixel(recorte2x, 24, 24)[3] === 255);
ok('o fundo continua totalmente transparente', pixel(recorte2x, 1, 1)[3] === 0);

// ---------------------------------------------------------------------------
console.log('\n4. O limitador de estouro (anti-aureola)');
// ---------------------------------------------------------------------------
// Meia imagem preta, meia branca. E' o pior caso do Lanczos: ele responde com uma linha
// mais clara que o branco e outra mais escura que o preto em volta da emenda.

const degrau = montar(16, 16, (x) => x < 8 ? [0, 0, 0, 255] : [255, 255, 255, 255]);
const semLimite = AMP.redimensionar(degrau, 32, 32, 3);
const comLimite = AMP.limitarEstouro(AMP.redimensionar(degrau, 32, 32, 3), degrau, 1);

// Do lado branco, "auréola" e' qualquer pixel MENOS branco que 255 longe da emenda.
let mergulhoAntes = 255, mergulhoDepois = 255;
for (let x = 18; x < 32; x++) {
    mergulhoAntes = Math.min(mergulhoAntes, pixel(semLimite, x, 8)[0]);
    mergulhoDepois = Math.min(mergulhoDepois, pixel(comLimite, x, 8)[0]);
}
ok('sem limitador o Lanczos cria a aureola', mergulhoAntes < 255, 'menor branco = ' + mergulhoAntes);
ok('com limitador a aureola some', mergulhoDepois === 255, 'menor branco = ' + mergulhoDepois);

const meioEsquerda = pixel(comLimite, 14, 8)[0], meioDireita = pixel(comLimite, 17, 8)[0];
ok('e a borda continua uma borda (nao foi borrada)', (meioDireita - meioEsquerda) > 150,
   'degrau de ' + (meioDireita - meioEsquerda));

// ---------------------------------------------------------------------------
console.log('\n5. Reduzir ruido sem comer a borda');
// ---------------------------------------------------------------------------

const sortear = sorteador(20240917);
const cinzaBase = (x) => x < 20 ? 40 : 210;
const ruidosa = montar(40, 40, (x) => { const v = cinzaBase(x) + sortear() * 14; return [v, v, v, 255]; });

const alturaDoDegrau = (img) => pixel(img, 25, 20)[0] - pixel(img, 14, 20)[0];
const antes = estatistica(ruidosa, 25, 39, 5, 35);
const degrauAntes = alturaDoDegrau(ruidosa);
ok('a imagem de teste tem mesmo ruido', antes.desvio > 6, 'desvio ' + antes.desvio.toFixed(2));

let desvioAnterior = antes.desvio;
[1, 2, 3].forEach(nivel => {
    const limpa = AMP.reduzirRuido(ruidosa, nivel);
    const depois = estatistica(limpa, 25, 39, 5, 35);
    const degrauDepois = alturaDoDegrau(limpa);
    ok('nivel ' + nivel + ': o ruido cai', depois.desvio < desvioAnterior,
       'desvio ' + antes.desvio.toFixed(2) + ' -> ' + depois.desvio.toFixed(2));
    ok('nivel ' + nivel + ': a borda sobrevive', degrauDepois > degrauAntes * 0.85,
       'degrau ' + degrauAntes.toFixed(0) + ' -> ' + degrauDepois.toFixed(0));
    ok('nivel ' + nivel + ': o brilho medio nao escorrega', Math.abs(depois.media - antes.media) < 2,
       'media ' + antes.media.toFixed(1) + ' -> ' + depois.media.toFixed(1));
    desvioAnterior = depois.desvio;
});

const forte = AMP.reduzirRuido(ruidosa, 3);
ok('o nivel forte corta a maior parte do ruido',
   estatistica(forte, 25, 39, 5, 35).desvio < antes.desvio * 0.35);
ok('nivel 0 nao mexe em nada',
   Buffer.compare(Buffer.from(AMP.reduzirRuido(ruidosa, 0).dados), Buffer.from(ruidosa.dados)) === 0);

// Um borrao comum comeria a borda: este e' o contraste que justifica o filtro bilateral.
const soRuidoNaArea = estatistica(AMP.reduzirRuido(ruidosa, 2), 25, 39, 5, 35).desvio;
ok('bilateral: ruido cai mais do que a borda', (soRuidoNaArea / antes.desvio) < (alturaDoDegrau(AMP.reduzirRuido(ruidosa, 2)) / degrauAntes));

// ---------------------------------------------------------------------------
console.log('\n6. Realcar bordas com trava');
// ---------------------------------------------------------------------------

const rampa = montar(20, 20, (x) => { const v = Math.round(60 + (x / 19) * 120); return [v, v, v, 255]; });
const realcada = AMP.realcarBordas(rampa, 2);
let estourou = false;
for (let i = 0; i < realcada.dados.length; i += 4) {
    // A trava diz: nenhum pixel sai do intervalo que existia na vizinhanca 3x3 dele. Numa
    // rampa monotonica isso equivale a nao passar do minimo nem do maximo da imagem.
    if (realcada.dados[i] < 60 - 1 || realcada.dados[i] > 180 + 1) estourou = true;
}
ok('o realce nao estoura a vizinhanca (sem recorte de tesoura)', !estourou);

// Uma borda BORRADA (e' o que uma foto mal focada entrega). O realce tem de deixar a
// transicao mais curta — medida pelo maior salto entre pixels vizinhos na linha.
const bordaSuave = montar(20, 12, (x) => {
    const v = 80 + 100 / (1 + Math.exp(-(x - 9.5) / 1.8));   // degrau suavizado
    return [v, v, v, 255];
});
const maiorSalto = (img) => {
    let maior = 0;
    for (let x = 1; x < img.largura; x++) maior = Math.max(maior, pixel(img, x, 6)[0] - pixel(img, x - 1, 6)[0]);
    return maior;
};
const mudanca = (img) => {
    let soma = 0;
    for (let x = 0; x < img.largura; x++) soma += Math.abs(pixel(img, x, 6)[0] - pixel(bordaSuave, x, 6)[0]);
    return soma;
};
const saltoAntes = maiorSalto(bordaSuave);
// O raio tem de acompanhar a largura da transicao: com raio 1 num degrau de 7 pixels, o
// borrao devolve quase a propria imagem e o realce nao tem do que discordar. E' o erro
// que a versao anterior desta funcao cometia — ela borrava sempre em 3x3.
ok('realce com raio proporcional muda a imagem', mudanca(AMP.realcarBordas(bordaSuave, 2, 2)) > 0);
ok('e com raio 1 quase nada acontece numa borda larga (por isso o raio existe)',
   mudanca(AMP.realcarBordas(bordaSuave, 2, 1)) < mudanca(AMP.realcarBordas(bordaSuave, 2, 2)),
   'raio 1 = ' + mudanca(AMP.realcarBordas(bordaSuave, 2, 1)) + ' | raio 2 = ' + mudanca(AMP.realcarBordas(bordaSuave, 2, 2)));

let mudancaAnterior = 0;
[1, 2, 3].forEach(nivel => {
    const atual = mudanca(AMP.realcarBordas(bordaSuave, nivel, 2));
    ok('nitidez ' + nivel + ': o efeito cresce com o nivel', atual > mudancaAnterior,
       'total de mudanca ' + mudancaAnterior + ' -> ' + atual);
    mudancaAnterior = atual;
});
ok('a borda borrada fica mais curta', maiorSalto(AMP.realcarBordas(bordaSuave, 2, 2)) > saltoAntes,
   'maior salto ' + saltoAntes.toFixed(0) + ' -> ' + maiorSalto(AMP.realcarBordas(bordaSuave, 2, 2)).toFixed(0));

// A trava em acao: nem o realce forte inventa tom que nao existia na vizinhanca.
const forteRealce = AMP.realcarBordas(bordaSuave, 3, 2);
let inventouTom = false;
for (let x = 0; x < forteRealce.largura; x++) {
    const v = pixel(forteRealce, x, 6)[0];
    if (v < 80 || v > 181) inventouTom = true;
}
ok('nem no nivel forte o realce inventa tom fora da imagem', !inventouTom);
ok('nitidez 0 nao mexe em nada',
   Buffer.compare(Buffer.from(AMP.realcarBordas(rampa, 0).dados), Buffer.from(rampa.dados)) === 0);
ok('o alfa passa intacto pelo realce',
   AMP.realcarBordas(recorte, 2).dados[3] === recorte.dados[3]);

// ---------------------------------------------------------------------------
console.log('\n7. Reduzir (a mesma funcao faz os dois)');
// ---------------------------------------------------------------------------

const xadrez = montar(64, 64, (x, y) => { const v = ((x + y) % 2) ? 255 : 0; return [v, v, v, 255]; });
const reduzido = AMP.redimensionar(xadrez, 16, 16, 3);
const estatReduzido = estatistica(reduzido, 2, 14, 2, 14);
// Xadrez de 1 pixel reduzido 4x tem de virar cinza medio. Se sair listrado, o filtro nao
// esta alargando o suporte ao reduzir — que e' exatamente o serrilhado (aliasing).
ok('xadrez fino reduzido vira cinza medio (sem serrilha)', estatReduzido.desvio < 12,
   'desvio ' + estatReduzido.desvio.toFixed(2));
ok('e o cinza e' + "' o certo (~127)", Math.abs(estatReduzido.media - 127) < 8,
   'media ' + estatReduzido.media.toFixed(1));

// ---------------------------------------------------------------------------
console.log('\n8. O plano de ampliacao e o teto de memoria');
// ---------------------------------------------------------------------------

const passos = (e) => JSON.stringify(AMP.planejarPassos(e));
ok('1x nao tem passo nenhum', passos(1) === '[]');
ok('2x e um passo de 2', passos(2) === '[2]');
ok('4x sao dois passos de 2 (mais limpo que um salto unico)', passos(4) === '[2,2]');
ok('8x sao tres passos de 2', passos(8) === '[2,2,2]');
ok('3x e 2x seguido de 1,5x', passos(3) === '[2,1.5]');
ok('reduzir e um passo so', passos(0.5) === '[0.5]');

ok('uma imagem pequena cabe em 4x', AMP.cabeNaMemoria(800, 600, 4));
ok('uma foto de 12 megapixels nao cabe em 2x', !AMP.cabeNaMemoria(4000, 3000, 2));
ok('o teto e escolhido pela maior escala que cabe', AMP.maiorEscalaPossivel(800, 600, [1, 2, 4, 8]) === 8);
ok('e cai para 1x quando nem 2x cabe', AMP.maiorEscalaPossivel(4000, 3000, [1, 2, 4, 8]) === 1);

// ---------------------------------------------------------------------------
console.log('\n9. A receita completa');
// ---------------------------------------------------------------------------

(async () => {
    const etapas = [];
    const sujaESuave = montar(32, 32, (x, y) => {
        const base = (x < 16) ? 50 : 200;
        const v = base + sortear() * 12;
        return [v, v, v, 255];
    });

    const resultado = await AMP.ampliar(sujaESuave, { escala: 4, ruido: 2, nitidez: 2 },
        (fracao, etapa) => etapas.push(etapa));

    ok('o resultado tem o tamanho pedido', resultado.largura === 128 && resultado.altura === 128,
       resultado.largura + 'x' + resultado.altura);
    ok('a receita avisa cada etapa', etapas.indexOf('ruido') !== -1 && etapas.indexOf('ampliando') !== -1 &&
       etapas.indexOf('nitidez') !== -1 && etapas[etapas.length - 1] === 'pronto', etapas.join(' > '));
    ok('4x passa duas vezes por "ampliando"', etapas.filter(e => e === 'ampliando').length === 2);

    const areaLimpa = estatistica(resultado, 70, 120, 8, 120);
    const sujeiraAntes = estatistica(sujaESuave, 18, 30, 2, 30);
    ok('o ruido nao foi ampliado junto', areaLimpa.desvio < sujeiraAntes.desvio,
       sujeiraAntes.desvio.toFixed(2) + ' -> ' + areaLimpa.desvio.toFixed(2));
    ok('a borda continua no lugar e nitida',
       (pixel(resultado, 80, 64)[0] - pixel(resultado, 48, 64)[0]) > 130);

    const soLimpeza = await AMP.ampliar(sujaESuave, { escala: 1, ruido: 3, nitidez: 0 });
    ok('em 1x o tamanho nao muda', soLimpeza.largura === 32 && soLimpeza.altura === 32);
    ok('mas a limpeza acontece',
       estatistica(soLimpeza, 18, 30, 2, 30).desvio < sujeiraAntes.desvio * 0.5);

    let recusou = false;
    try { await AMP.ampliar(sujaESuave, { escala: 0 }); } catch (_) { recusou = true; }
    ok('escala invalida e recusada', recusou);

    let recusouImagem = false;
    try { AMP.validarImagem({ largura: 4, altura: 4, dados: new Uint8ClampedArray(9) }); }
    catch (_) { recusouImagem = true; }
    ok('imagem com tamanho incoerente e recusada', recusouImagem);

    console.log('\n' + (falhas ? falhas + ' FALHA(S) de ' + total : 'todos os ' + total + ' testes passaram'));
    process.exit(falhas ? 1 : 0);
})();
