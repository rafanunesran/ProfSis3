// video.js — A ABA "VIDEO": cortar, girar, juntar, comprimir, virar GIF... sem enviar o video.
//
// POR QUE ISTO EXISTE
//   O mesmo motivo das outras abas de Ferramentas. O video da apresentacao da turma tem o
//   rosto e a voz de criancas, e o caminho de sempre — um site gratuito de editar video —
//   e' um upload para o servidor de um terceiro. Aqui o trabalho e' do ffmpeg rodando no
//   navegador (video_operacoes.js): o programa e' baixado, o video fica.
//
//   A excecao e' "Baixar video por link": ali o que sai do aparelho e' so' o endereco que
//   o professor colou — nenhum arquivo dele.
//
// COMO A TELA E' FEITA
//   Igual a aba de PDF, em menor escala: um catalogo de cartoes; ao abrir um, um
//   formulario montado a partir dos campos declarados em CATALOGO_VIDEO; o resultado
//   aparece com previa e botao de baixar. O portao premium e' o mesmo das outras abas:
//   ver da' para todo mundo, usar e' do plano Professor.

(function () {
'use strict';

let vidAberta = null;            // id da ferramenta aberta, ou null (catalogo)
let vidEntradas = {};
let vidResultado = null;         // { arquivos: [{nome, tipo, blob}], mensagem, segundos }
let vidOcupado = false;
let vidCancelado = false;
let vidUrls = [];                // URLs de blob para revogar
let vidInfo = {};                // campo -> { duracao, largura, altura } lidos pelo <video>

function escVid(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const tamanho = (b) => (window.VIDEOOPS ? VIDEOOPS.formatarTamanho(b) : Math.round((b || 0) / 1024) + ' KB');
const tempo = (s) => (window.VIDEOOPS ? VIDEOOPS.formatarTempo(s) : String(Math.round(s || 0)) + 's');

function vidUrlDe(blob) {
    const url = URL.createObjectURL(blob);
    vidUrls.push(url);
    return url;
}

function vidLimparUrls() {
    vidUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (_) { /* ja' foi */ } });
    vidUrls = [];
}

function vidPodeUsar(nome) {
    if (typeof exigirPremium !== 'function') {
        console.warn('[Video] assinatura.js indisponivel — portao premium nao aplicado.');
        return true;
    }
    return exigirPremium('Ferramentas — Vídeo' + (nome ? ' — ' + nome : ''));
}

function vidEhPremium() {
    return (typeof ehPremium === 'function') ? ehPremium() : true;
}

function vidSeloPro() {
    return (typeof selosPremiumHtml === 'function') ? selosPremiumHtml()
        : '<span class="badge" style="background:#faf089; color:#744210; font-size:10px; padding:1px 5px; border-radius:4px; margin-left:4px;">PRO</span>';
}

// ---------------------------------------------------------------------------
// O CATALOGO
// ---------------------------------------------------------------------------
// Campo: { id, tipo, rotulo, ajuda, padrao, opcoes, quando(entradas) }
//   tipo: video | videos | audio | gif | imagens | tempo | texto | link | select |
//         numero | checkbox

const GRUPOS_VIDEO = [
    { id: 'baixar',    nome: 'Baixar',             emoji: '⬇️' },
    { id: 'editar',    nome: 'Editar',             emoji: '✂️' },
    { id: 'ajustar',   nome: 'Tamanho e formato',  emoji: '📐' },
    { id: 'som',       nome: 'Som',                emoji: '🔊' },
    { id: 'gif',       nome: 'GIF',                emoji: '🎞️' }
];

const cVideo = () => ({ id: 'arquivo', tipo: 'video', rotulo: 'Vídeo' });

const CATALOGO_VIDEO = [
    {
        id: 'baixar-link', grupo: 'baixar', emoji: '🔗', nome: 'Baixar vídeo por link',
        resumo: 'Cole o link de um vídeo e salve o arquivo no aparelho.',
        acao: 'baixarLink', rotuloBotao: 'Baixar', semMotor: true,
        campos: [
            { id: 'link', tipo: 'link', rotulo: 'Link do vídeo', ajuda: 'Copie o endereço do vídeo e cole aqui.' },
            { id: 'formato', tipo: 'select', rotulo: 'Baixar como', padrao: 'video',
              opcoes: [['video', 'Vídeo (MP4)'], ['audio', 'Só o áudio (MP3)']] },
            { id: 'qualidade', tipo: 'select', rotulo: 'Qualidade', padrao: '720',
              quando: e => e.formato !== 'audio',
              opcoes: [['1080', '1080p (Full HD)'], ['720', '720p (HD) — recomendado'], ['480', '480p'], ['360', '360p (arquivo menor)']] }
        ]
    },
    {
        id: 'cortar', grupo: 'editar', emoji: '✂️', nome: 'Cortar vídeo',
        resumo: 'Fique só com o trecho que interessa: escolha início e fim.',
        acao: 'cortar', rotuloBotao: 'Cortar',
        campos: [cVideo(),
            { id: 'inicio', tipo: 'tempo', rotulo: 'Início', padrao: '0:00', marcar: true },
            { id: 'fim', tipo: 'tempo', rotulo: 'Fim', padrao: '', marcar: true, ajuda: 'Ex.: 1:30 (um minuto e meio). Ou toque o vídeo e use "marcar aqui".' }]
    },
    {
        id: 'juntar', grupo: 'editar', emoji: '🧩', nome: 'Juntar vídeos',
        resumo: 'Emende vários vídeos em um só, na ordem que você escolher.',
        detalhe: 'Vídeos de tamanhos diferentes são encaixados no tamanho do primeiro, com faixas pretas, sem esticar.',
        acao: 'juntar', rotuloBotao: 'Juntar',
        campos: [{ id: 'arquivos', tipo: 'videos', rotulo: 'Vídeos (na ordem)' }]
    },
    {
        id: 'velocidade', grupo: 'editar', emoji: '⏩', nome: 'Mudar a velocidade',
        resumo: 'Acelere ou deixe em câmera lenta, com o som acompanhando.',
        acao: 'velocidade', rotuloBotao: 'Aplicar',
        campos: [cVideo(),
            { id: 'fator', tipo: 'select', rotulo: 'Velocidade', padrao: '2',
              opcoes: [['0.25', '0,25x (bem lento)'], ['0.5', '0,5x (câmera lenta)'], ['0.75', '0,75x'], ['1.25', '1,25x'],
                       ['1.5', '1,5x'], ['2', '2x (dobro)'], ['3', '3x'], ['4', '4x']] },
            { id: 'semAudio', tipo: 'checkbox', rotulo: 'Tirar o som', padrao: false }]
    },
    {
        id: 'repetir', grupo: 'editar', emoji: '🔁', nome: 'Repetir vídeo',
        resumo: 'Faça o vídeo tocar várias vezes seguidas, num arquivo só.',
        acao: 'repetir', rotuloBotao: 'Repetir',
        campos: [cVideo(), { id: 'vezes', tipo: 'numero', rotulo: 'Quantas vezes no total', padrao: 3, min: 2, max: 50 }]
    },
    {
        id: 'girar', grupo: 'ajustar', emoji: '🔄', nome: 'Girar vídeo',
        resumo: 'Conserte o vídeo gravado deitado ou de cabeça para baixo.',
        acao: 'girar', rotuloBotao: 'Girar',
        campos: [cVideo(),
            { id: 'angulo', tipo: 'select', rotulo: 'Girar', padrao: '90',
              opcoes: [['90', '90° para a direita ↻'], ['270', '90° para a esquerda ↺'], ['180', '180° (de cabeça para baixo)']] }]
    },
    {
        id: 'espelhar', grupo: 'ajustar', emoji: '🪞', nome: 'Espelhar vídeo',
        resumo: 'Inverta a imagem na horizontal (efeito espelho) ou na vertical.',
        acao: 'espelhar', rotuloBotao: 'Espelhar',
        campos: [cVideo(),
            { id: 'direcao', tipo: 'select', rotulo: 'Direção', padrao: 'horizontal',
              opcoes: [['horizontal', 'Horizontal (esquerda ↔ direita)'], ['vertical', 'Vertical (cima ↕ baixo)']] }]
    },
    {
        id: 'recortar', grupo: 'ajustar', emoji: '🖼️', nome: 'Recortar a imagem',
        resumo: 'Tire as bordas ou mude o formato do quadro: quadrado, em pé, deitado.',
        acao: 'recortar', rotuloBotao: 'Recortar',
        campos: [cVideo(),
            { id: 'modo', tipo: 'select', rotulo: 'Como recortar', padrao: 'proporcao',
              opcoes: [['proporcao', 'Pelo formato (centralizado)'], ['manual', 'Em pixels (personalizado)']] },
            { id: 'proporcao', tipo: 'select', rotulo: 'Formato', padrao: '1:1', quando: e => e.modo !== 'manual',
              opcoes: [['1:1', 'Quadrado 1:1'], ['9:16', 'Em pé 9:16 (celular)'], ['16:9', 'Deitado 16:9 (tela)'], ['4:3', '4:3'], ['3:4', '3:4'], ['4:5', '4:5']] },
            { id: 'x', tipo: 'numero', rotulo: 'Começa em X (px)', padrao: 0, quando: e => e.modo === 'manual' },
            { id: 'y', tipo: 'numero', rotulo: 'Começa em Y (px)', padrao: 0, quando: e => e.modo === 'manual' },
            { id: 'largura', tipo: 'numero', rotulo: 'Largura (px)', padrao: '', quando: e => e.modo === 'manual' },
            { id: 'altura', tipo: 'numero', rotulo: 'Altura (px)', padrao: '', quando: e => e.modo === 'manual' }]
    },
    {
        id: 'redimensionar', grupo: 'ajustar', emoji: '📏', nome: 'Redimensionar vídeo',
        resumo: 'Mude a resolução: 1080p, 720p, 480p, porcentagem ou pixels.',
        acao: 'redimensionar', rotuloBotao: 'Redimensionar',
        campos: [cVideo(),
            { id: 'modo', tipo: 'select', rotulo: 'Como', padrao: 'predefinido',
              opcoes: [['predefinido', 'Resolução pronta'], ['porcentagem', 'Porcentagem'], ['manual', 'Em pixels']] },
            { id: 'predefinido', tipo: 'select', rotulo: 'Resolução', padrao: '720', quando: e => e.modo === 'predefinido',
              opcoes: [['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p'], ['240', '240p']] },
            { id: 'porcentagem', tipo: 'numero', rotulo: 'Porcentagem (%)', padrao: 50, min: 5, max: 400, quando: e => e.modo === 'porcentagem' },
            { id: 'largura', tipo: 'numero', rotulo: 'Largura (px)', padrao: '', quando: e => e.modo === 'manual' },
            { id: 'altura', tipo: 'numero', rotulo: 'Altura (px)', padrao: '', quando: e => e.modo === 'manual',
              ajuda: 'Deixe um dos dois vazio para manter a proporção.' },
            { id: 'distorcer', tipo: 'checkbox', rotulo: 'Usar as duas medidas mesmo que estique a imagem', padrao: false, quando: e => e.modo === 'manual' }]
    },
    {
        id: 'comprimir', grupo: 'ajustar', emoji: '🗜️', nome: 'Comprimir vídeo',
        resumo: 'Deixe o arquivo menor para mandar por mensagem ou e-mail.',
        acao: 'comprimir', rotuloBotao: 'Comprimir',
        campos: [cVideo(),
            { id: 'nivel', tipo: 'select', rotulo: 'Compressão', padrao: 'media',
              opcoes: [['leve', 'Leve (quase sem perda)'], ['media', 'Média — recomendado'], ['forte', 'Forte (arquivo bem menor)']] },
            { id: 'limiteAltura', tipo: 'select', rotulo: 'Reduzir a resolução', padrao: '720',
              opcoes: [['0', 'Não mexer'], ['1080', 'Até 1080p'], ['720', 'Até 720p'], ['480', 'Até 480p'], ['360', 'Até 360p']] }]
    },
    {
        id: 'adicionar-audio', grupo: 'som', emoji: '🎵', nome: 'Adicionar áudio',
        resumo: 'Coloque uma música ou narração no vídeo, no lugar do som ou misturada.',
        acao: 'adicionarAudio', rotuloBotao: 'Adicionar',
        campos: [cVideo(),
            { id: 'audio', tipo: 'audio', rotulo: 'Áudio (MP3, WAV, M4A...)' },
            { id: 'modo', tipo: 'select', rotulo: 'O som original', padrao: 'substituir',
              opcoes: [['substituir', 'Trocar pelo áudio novo'], ['misturar', 'Manter e misturar com o áudio novo']] },
            { id: 'volume', tipo: 'numero', rotulo: 'Volume do áudio novo (%)', padrao: 100, min: 0, max: 200 },
            { id: 'repetirAudio', tipo: 'checkbox', rotulo: 'Repetir o áudio se for mais curto que o vídeo', padrao: false }]
    },
    {
        id: 'extrair-audio', grupo: 'som', emoji: '🎧', nome: 'Extrair o áudio',
        resumo: 'Salve só o som do vídeo, em MP3.',
        acao: 'extrairAudio', rotuloBotao: 'Extrair',
        campos: [cVideo()]
    },
    {
        id: 'video-gif', grupo: 'gif', emoji: '🎬', nome: 'Vídeo para GIF',
        resumo: 'Transforme um trecho do vídeo em GIF animado.',
        acao: 'videoParaGif', rotuloBotao: 'Criar GIF',
        campos: [cVideo(),
            { id: 'inicio', tipo: 'tempo', rotulo: 'Começar em', padrao: '0:00', marcar: true },
            { id: 'duracao', tipo: 'tempo', rotulo: 'Duração', padrao: '5', ajuda: 'Em segundos (ou 0:05). GIF longo fica pesado.' },
            { id: 'fps', tipo: 'select', rotulo: 'Fluidez', padrao: '10',
              opcoes: [['6', '6 quadros/s (leve)'], ['10', '10 quadros/s'], ['15', '15 quadros/s'], ['24', '24 quadros/s (pesado)']] },
            { id: 'largura', tipo: 'select', rotulo: 'Largura', padrao: '480',
              opcoes: [['320', '320 px'], ['480', '480 px'], ['640', '640 px'], ['0', 'Original']] }]
    },
    {
        id: 'velocidade-gif', grupo: 'gif', emoji: '⏱️', nome: 'Mudar a velocidade do GIF',
        resumo: 'Acelere ou desacelere um GIF animado.',
        acao: 'velocidadeGif', rotuloBotao: 'Aplicar',
        campos: [{ id: 'arquivo', tipo: 'gif', rotulo: 'GIF' },
            { id: 'fator', tipo: 'select', rotulo: 'Velocidade', padrao: '2',
              opcoes: [['0.25', '0,25x'], ['0.5', '0,5x (mais lento)'], ['0.75', '0,75x'], ['1.5', '1,5x'], ['2', '2x (mais rápido)'], ['3', '3x'], ['4', '4x']] }]
    },
    {
        id: 'imagens-gif', grupo: 'gif', emoji: '🖼️', nome: 'Imagens para GIF',
        resumo: 'Junte várias fotos ou desenhos numa animação.',
        acao: 'imagensParaGif', rotuloBotao: 'Criar GIF',
        campos: [{ id: 'imagens', tipo: 'imagens', rotulo: 'Imagens (na ordem)' },
            { id: 'segundos', tipo: 'texto', rotulo: 'Segundos em cada imagem', padrao: '0,5' },
            { id: 'largura', tipo: 'numero', rotulo: 'Largura do GIF (px)', padrao: 480, min: 16, max: 1920 },
            { id: 'fundo', tipo: 'cor', rotulo: 'Cor do fundo (onde a imagem não cobre)', padrao: '#ffffff' },
            { id: 'repetir', tipo: 'checkbox', rotulo: 'Repetir sem parar', padrao: true }]
    }
];

function vidFerramenta(id) {
    return CATALOGO_VIDEO.find(f => f.id === id) || null;
}

function vidCamposVisiveis(f) {
    return (f.campos || []).filter(c => !c.quando || c.quando(vidEntradas));
}

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

function vidTela() {
    let tela = document.getElementById('video');
    if (tela) return tela;
    let destino = null;
    if (typeof garantirTelaFerramentas === 'function') {
        garantirTelaFerramentas();
        destino = document.getElementById('tabFerramentasVideo');
    }
    tela = document.createElement('div');
    tela.id = 'video';
    (destino || document.body).appendChild(tela);
    return tela;
}

function renderVideo() {
    vidTela();
    if (vidAberta) vidRenderPainel();
    else vidRenderCatalogo();
}

function vidRenderCatalogo() {
    const tela = vidTela();
    const premium = vidEhPremium();
    const grupos = GRUPOS_VIDEO.map(g => {
        const itens = CATALOGO_VIDEO.filter(f => f.grupo === g.id);
        if (!itens.length) return '';
        return `
            <div class="card" style="margin-bottom:18px;">
                <h3 style="margin-top:0; color:#1b4488;">${g.emoji} ${escVid(g.nome)}
                    <span style="font-weight:400; font-size:12px; color:#7a869a;">(${itens.length})</span></h3>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:10px;">
                    ${itens.map(f => `
                        <button class="vid-cartao" data-ferramenta="${f.id}" onclick="abrirFerramentaVideo('${f.id}')"
                                style="text-align:left; background:white; border:1px solid #e3e8ef; border-radius:8px;
                                       padding:12px; cursor:pointer; transition:all .15s; font:inherit;"
                                onmouseover="this.style.borderColor='#2563c9'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 10px rgba(0,0,0,.07)';"
                                onmouseout="this.style.borderColor='#e3e8ef'; this.style.transform=''; this.style.boxShadow='';">
                            <div style="font-size:20px; line-height:1.2;">${f.emoji}</div>
                            <div style="font-weight:700; font-size:13px; color:#1c2536; margin:5px 0 3px;">${escVid(f.nome)}</div>
                            <div style="font-size:11.5px; color:#5f6b7f; line-height:1.45;">${escVid(f.resumo)}</div>
                        </button>`).join('')}
                </div>
            </div>`;
    }).join('');

    tela.innerHTML = `
        <div class="card" style="margin:20px 0;">
            <h2>🎬 Vídeo ${vidSeloPro()}</h2>
            <p style="color:#3d4759; font-size:14px; line-height:1.6; margin-bottom:6px;">
                ${CATALOGO_VIDEO.length} ferramentas de vídeo dentro do sistema: baixar, cortar, juntar, girar, comprimir,
                mudar a velocidade, trocar o som e transformar em GIF.
            </p>
            <div style="background:#f0fff4; border:1px solid #9ae6b4; border-radius:8px; padding:12px 14px; margin:12px 0; font-size:13px; color:#22543d; line-height:1.6;">
                🔒 <strong>O vídeo não sai deste aparelho.</strong> A edição acontece aqui, no navegador — o vídeo da
                apresentação da turma, com rosto e voz de estudante, não é enviado para servidor nenhum.
                Na primeira vez, o navegador baixa o editor (cerca de 32 MB); depois ele fica guardado.
            </div>
            ${premium ? '' : `
                <div style="background:#fffaf0; border:1px solid #fbd38d; border-radius:8px; padding:12px 14px; margin:12px 0; font-size:13px; color:#744210; line-height:1.6;">
                    ⭐ Estas ferramentas fazem parte do <strong>plano Professor</strong>. Você pode ver tudo o que
                    existe aqui; para usar, é preciso assinar.
                    <div style="margin-top:8px;">
                        <button class="btn btn-sm btn-primary" onclick="abrirModalApoie({ destaque: 'professor' })">
                            Ver o plano Professor</button>
                    </div>
                </div>`}
        </div>
        ${grupos}`;
}

function abrirFerramentaVideo(id) {
    const f = vidFerramenta(id);
    if (!f) return;
    if (!vidPodeUsar(f.nome)) return;
    if (vidOcupado) return;
    vidAberta = id;
    vidEntradas = {};
    vidInfo = {};
    vidResultado = null;
    vidLimparUrls();
    (f.campos || []).forEach(c => { if (c.padrao !== undefined) vidEntradas[c.id] = c.padrao; });
    vidRenderPainel();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fecharFerramentaVideo() {
    if (vidOcupado) {
        if (!confirm('O vídeo ainda está sendo processado. Parar e voltar?')) return;
        vidCancelar();
    }
    vidLimparUrls();
    vidAberta = null;
    vidEntradas = {};
    vidInfo = {};
    vidResultado = null;
    vidRenderCatalogo();
}

function vidRenderPainel() {
    const tela = vidTela();
    const f = vidFerramenta(vidAberta);
    if (!f) { vidRenderCatalogo(); return; }
    const grupo = GRUPOS_VIDEO.find(g => g.id === f.grupo) || { nome: '', emoji: '' };
    tela.innerHTML = `
        <div class="card" style="margin:20px 0;">
            <div style="display:flex; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                <button class="btn btn-sm btn-secondary" onclick="fecharFerramentaVideo()">← Todas as ferramentas</button>
                <div style="flex:1; min-width:200px;">
                    <h2 style="margin:0; border:none; padding:0;">${f.emoji} ${escVid(f.nome)} ${vidSeloPro()}</h2>
                    <div style="font-size:12px; color:#7a869a;">${grupo.emoji} ${escVid(grupo.nome)}</div>
                </div>
            </div>
            <p style="color:#3d4759; font-size:14px; margin:12px 0 0;">${escVid(f.resumo)}</p>
            ${f.detalhe ? `<p style="color:#5f6b7f; font-size:12.5px; line-height:1.6; margin:8px 0 0;">${escVid(f.detalhe)}</p>` : ''}
        </div>
        <div class="card">
            <div id="vidAviso"></div>
            <div id="vidForm"></div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:6px;">
                <button class="btn btn-primary" id="vidExecutar" onclick="vidExecutar()" style="padding:11px 24px; font-size:15px;">
                    ▶️ ${escVid(f.rotuloBotao || 'Executar')}</button>
                <button class="btn btn-secondary" id="vidCancelar" onclick="vidCancelar()" style="display:none;">Cancelar</button>
            </div>
            <div id="vidProgresso" style="display:none; margin-top:14px;">
                <div style="background:#e3e8ef; border-radius:99px; height:8px; overflow:hidden;">
                    <div id="vidBarra" style="background:#2563c9; height:100%; width:100%; transform:scaleX(0); transform-origin:left; transition:transform .25s;"></div>
                </div>
                <div id="vidTextoProgresso" style="font-size:12px; color:#5f6b7f; margin-top:6px;"></div>
            </div>
            <div id="vidResultado"></div>
        </div>`;
    vidRenderForm();
    if (vidResultado) vidRenderResultado();
}

const estiloEntrada = 'width:100%; padding:9px 11px; border:1px solid #cdd5e1; border-radius:6px; font-size:14px; box-sizing:border-box;';

function vidCampoHtml(c) {
    const v = vidEntradas[c.id];
    const ajuda = c.ajuda ? `<div style="font-size:11.5px; color:#7a869a; margin-top:4px; line-height:1.45;">${escVid(c.ajuda)}</div>` : '';
    const rotulo = `<label for="vidCampo_${c.id}" style="display:block; font-weight:600; font-size:13px; color:#3d4759; margin-bottom:5px;">${escVid(c.rotulo)}</label>`;
    const bloco = (conteudo, largo) => `<div style="margin-bottom:14px; ${largo ? 'grid-column:1 / -1;' : ''}">${conteudo}</div>`;

    if (c.tipo === 'video' || c.tipo === 'audio' || c.tipo === 'gif') {
        const aceita = { video: 'video/*,.mkv,.mov,.avi,.3gp,.flv,.wmv', audio: 'audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac', gif: 'image/gif' }[c.tipo];
        const arq = v;
        const info = vidInfo[c.id];
        let previa = '';
        if (arq) {
            const url = vidUrlDe(arq);
            if (c.tipo === 'video') {
                previa = `<video id="vidPrevia_${c.id}" src="${url}" controls preload="metadata" playsinline
                        onloadedmetadata="vidMetadados('${c.id}', this)"
                        style="width:100%; max-height:340px; background:#000; border-radius:8px; margin-top:10px;"></video>`;
            } else if (c.tipo === 'audio') {
                previa = `<audio src="${url}" controls style="width:100%; margin-top:10px;"></audio>`;
            } else {
                previa = `<img src="${url}" alt="" style="max-width:100%; max-height:260px; border-radius:8px; margin-top:10px; display:block;">`;
            }
        }
        return bloco(`${rotulo}
            <input type="file" id="vidCampo_${c.id}" accept="${aceita}" onchange="vidEscolherArquivo('${c.id}', this)" style="${estiloEntrada}">
            ${arq ? `<div id="vidInfo_${c.id}" style="font-size:12px; color:#5f6b7f; margin-top:6px;">📄 ${escVid(arq.name)} — ${tamanho(arq.size)}${info && info.duracao ? ' — ' + tempo(info.duracao) + (info.largura ? ' — ' + info.largura + ' x ' + info.altura + ' px' : '') : ''}</div>` : ''}
            ${previa}${ajuda}`, true);
    }

    if (c.tipo === 'videos' || c.tipo === 'imagens') {
        const lista = Array.isArray(v) ? v : [];
        const aceita = c.tipo === 'videos' ? 'video/*,.mkv,.mov,.avi,.3gp' : 'image/*';
        const itens = lista.map((a, i) => `
            <div style="display:flex; align-items:center; gap:8px; padding:7px 10px; background:#f6f8fb; border:1px solid #e3e8ef; border-radius:6px; margin-bottom:6px;">
                <span style="font-size:12px; color:#7a869a; width:20px;">${i + 1}.</span>
                <span style="flex:1; min-width:0; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escVid(a.name)}</span>
                <span style="font-size:11px; color:#7a869a;">${tamanho(a.size)}</span>
                <button class="btn btn-sm btn-secondary" title="Subir" onclick="vidMover('${c.id}', ${i}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button class="btn btn-sm btn-secondary" title="Descer" onclick="vidMover('${c.id}', ${i}, 1)" ${i === lista.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="btn btn-sm btn-secondary" title="Tirar" onclick="vidTirar('${c.id}', ${i})">✕</button>
            </div>`).join('');
        return bloco(`${rotulo}
            <input type="file" id="vidCampo_${c.id}" accept="${aceita}" multiple onchange="vidAcrescentar('${c.id}', this)" style="${estiloEntrada}">
            <div style="font-size:11.5px; color:#7a869a; margin:4px 0 8px;">Pode escolher vários de uma vez, e acrescentar mais depois.</div>
            ${itens}${ajuda}`, true);
    }

    if (c.tipo === 'select') {
        return bloco(`${rotulo}
            <select id="vidCampo_${c.id}" onchange="vidDefinir('${c.id}', this.value, true)" style="${estiloEntrada}">
                ${c.opcoes.map(o => `<option value="${escVid(o[0])}" ${String(v) === String(o[0]) ? 'selected' : ''}>${escVid(o[1])}</option>`).join('')}
            </select>${ajuda}`);
    }

    if (c.tipo === 'checkbox') {
        return bloco(`<label style="display:flex; gap:8px; align-items:center; font-size:13px; color:#3d4759; cursor:pointer; padding-top:6px;">
                <input type="checkbox" id="vidCampo_${c.id}" ${v ? 'checked' : ''} onchange="vidDefinir('${c.id}', this.checked, false)">
                ${escVid(c.rotulo)}</label>${ajuda}`, true);
    }

    if (c.tipo === 'cor') {
        return bloco(`${rotulo}<input type="color" id="vidCampo_${c.id}" value="${escVid(v || '#ffffff')}" oninput="vidDefinir('${c.id}', this.value, false)"
                style="width:64px; height:38px; border:1px solid #cdd5e1; border-radius:6px; padding:2px;">${ajuda}`);
    }

    const tipoHtml = c.tipo === 'numero' ? 'number' : c.tipo === 'link' ? 'url' : 'text';
    const extra = c.tipo === 'numero' ? `${c.min != null ? 'min="' + c.min + '"' : ''} ${c.max != null ? 'max="' + c.max + '"' : ''} inputmode="numeric"` : '';
    const placeholder = c.tipo === 'tempo' ? 'placeholder="0:00"' : c.tipo === 'link' ? 'placeholder="https://..."' : '';
    const marcar = c.marcar ? `<button class="btn btn-sm btn-secondary" style="white-space:nowrap;" onclick="vidMarcar('${c.id}')" title="Usar o ponto em que o vídeo está parado">📍 marcar aqui</button>` : '';
    return bloco(`${rotulo}
        <div style="display:flex; gap:6px;">
            <input type="${tipoHtml}" id="vidCampo_${c.id}" value="${escVid(v == null ? '' : v)}" ${extra} ${placeholder}
                   oninput="vidDefinir('${c.id}', this.value, false)" style="${estiloEntrada}"
                   ${c.tipo === 'link' ? 'autocomplete="off" autocapitalize="off" spellcheck="false"' : ''}>
            ${marcar}
        </div>${ajuda}`, c.tipo === 'link');
}

function vidRenderForm() {
    const area = document.getElementById('vidForm');
    const f = vidFerramenta(vidAberta);
    if (!area || !f) return;
    area.innerHTML = `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:0 18px;">
        ${vidCamposVisiveis(f).map(vidCampoHtml).join('')}</div>`;
}

function vidDefinir(id, valor, remontar) {
    vidEntradas[id] = valor;
    if (remontar) vidRenderForm();
}

function vidEscolherArquivo(id, input) {
    const arq = input.files && input.files[0];
    if (!arq) return;
    vidEntradas[id] = arq;
    delete vidInfo[id];
    vidResultado = null;
    const r = document.getElementById('vidResultado');
    if (r) r.innerHTML = '';
    vidAviso('');
    if (arq.size > VIDEOOPS.VIDEO_MAX_MB * 1024 * 1024) {
        vidAviso('Este arquivo tem ' + tamanho(arq.size) + '. O editor no navegador aguenta até cerca de ' +
                 VIDEOOPS.VIDEO_MAX_MB + ' MB; acima disso ele pode travar.', 'erro');
    }
    vidRenderForm();
}

function vidAcrescentar(id, input) {
    const novos = Array.from(input.files || []);
    if (!novos.length) return;
    vidEntradas[id] = (Array.isArray(vidEntradas[id]) ? vidEntradas[id] : []).concat(novos);
    vidRenderForm();
}

function vidMover(id, i, passo) {
    const lista = vidEntradas[id] || [];
    const j = i + passo;
    if (j < 0 || j >= lista.length) return;
    const t = lista[i]; lista[i] = lista[j]; lista[j] = t;
    vidRenderForm();
}

function vidTirar(id, i) {
    (vidEntradas[id] || []).splice(i, 1);
    vidRenderForm();
}

// Duracao e tamanho lidos pelo proprio <video>: e' o que da' "fim" padrao ao corte e
// mostra ao professor o que ele escolheu, antes do ffmpeg entrar em cena.
function vidMetadados(id, el) {
    // Video gravado no navegador chega com duracao "infinita" (o arquivo nao traz o
    // dado). Pular para muito longe obriga o navegador a achar o fim; depois volta.
    if (el.duration === Infinity && !el.dataset.medindo) {
        el.dataset.medindo = '1';
        el.addEventListener('durationchange', function pronto() {
            if (!isFinite(el.duration)) return;
            el.removeEventListener('durationchange', pronto);
            el.currentTime = 0;
            vidMetadados(id, el);
        });
        el.currentTime = 1e101;
        return;
    }
    const info = { duracao: el.duration && isFinite(el.duration) ? el.duration : 0, largura: el.videoWidth, altura: el.videoHeight };
    vidInfo[id] = info;
    const linha = document.getElementById('vidInfo_' + id);
    const arq = vidEntradas[id];
    if (linha && arq) {
        linha.textContent = '📄 ' + arq.name + ' — ' + tamanho(arq.size) + (info.duracao ? ' — ' + tempo(info.duracao) : '') +
            (info.largura ? ' — ' + info.largura + ' x ' + info.altura + ' px' : '');
    }
    const f = vidFerramenta(vidAberta);
    if (f && f.id === 'cortar' && !vidEntradas.fim && info.duracao) {
        vidEntradas.fim = tempo(Math.floor(info.duracao * 10) / 10);
        const campo = document.getElementById('vidCampo_fim');
        if (campo) campo.value = vidEntradas.fim;
    }
    if (f && f.id === 'recortar' && info.largura && !vidEntradas.largura) {
        vidEntradas.largura = info.largura;
        vidEntradas.altura = info.altura;
        if (vidEntradas.modo === 'manual') vidRenderForm();
    }
}

function vidMarcar(id) {
    const el = document.getElementById('vidPrevia_arquivo');
    if (!el) { vidAviso('Escolha o vídeo primeiro.', 'erro'); return; }
    const t = Math.round(el.currentTime * 10) / 10;
    vidEntradas[id] = tempo(t);
    const campo = document.getElementById('vidCampo_' + id);
    if (campo) campo.value = vidEntradas[id];
}

function vidAviso(texto, tipo) {
    const caixa = document.getElementById('vidAviso');
    if (!caixa) return;
    if (!texto) { caixa.innerHTML = ''; return; }
    const cores = {
        erro: ['#fff5f5', '#fc8181', '#742a2a', '⚠️'],
        ok:   ['#f0fff4', '#9ae6b4', '#22543d', '✅'],
        info: ['#ebf8ff', '#90cdf4', '#2a4365', 'ℹ️']
    };
    const [fundo, borda, cor, icone] = cores[tipo] || cores.info;
    caixa.innerHTML = `<div class="vid-aviso vid-aviso-${tipo || 'info'}" style="background:${fundo}; border:1px solid ${borda}; color:${cor};
        border-radius:6px; padding:10px 12px; font-size:13px; line-height:1.5; margin-bottom:14px;">${icone} ${escVid(texto)}</div>`;
}

function vidProgresso(pct, texto) {
    if (vidCancelado) return;
    const barra = document.getElementById('vidBarra');
    const rotulo = document.getElementById('vidTextoProgresso');
    if (barra) barra.style.transform = 'scaleX(' + Math.max(0, Math.min(100, pct || 0)) / 100 + ')';
    if (rotulo) rotulo.textContent = texto || '';
}

function vidCancelar() {
    if (!vidOcupado) return;
    vidCancelado = true;
    if (window.VIDEOOPS) VIDEOOPS.cancelar();
}

async function vidExecutar() {
    if (vidOcupado) return;
    const f = vidFerramenta(vidAberta);
    if (!f) return;
    if (!vidPodeUsar(f.nome)) return;
    if (!window.VIDEOOPS || !VIDEOOPS.ops[f.acao]) {
        vidAviso('O motor de vídeo não carregou (video_operacoes.js). Recarregue a página.', 'erro');
        return;
    }
    const faltando = vidCamposVisiveis(f).filter(c => {
        if (['video', 'audio', 'gif', 'link'].indexOf(c.tipo) !== -1) return !vidEntradas[c.id];
        if (c.tipo === 'videos' || c.tipo === 'imagens') return !(vidEntradas[c.id] || []).length;
        return false;
    });
    if (faltando.length) {
        vidAviso('Falta: ' + faltando.map(c => c.rotulo).join(', ') + '.', 'erro');
        return;
    }

    const entradas = {};
    vidCamposVisiveis(f).forEach(c => { entradas[c.id] = vidEntradas[c.id]; });

    vidOcupado = true;
    vidCancelado = false;
    vidResultado = null;
    vidAviso('');
    const botao = document.getElementById('vidExecutar');
    const cancelar = document.getElementById('vidCancelar');
    const areaProgresso = document.getElementById('vidProgresso');
    const areaResultado = document.getElementById('vidResultado');
    if (botao) { botao.disabled = true; botao.textContent = '⏳ Processando...'; }
    if (cancelar && !f.semMotor) cancelar.style.display = '';
    if (areaProgresso) areaProgresso.style.display = 'block';
    if (areaResultado) areaResultado.innerHTML = '';
    vidProgresso(1, f.semMotor ? 'Começando...' : 'Preparando o editor de vídeo...');

    try {
        const inicio = Date.now();
        const saida = await VIDEOOPS.ops[f.acao](entradas, vidProgresso);
        if (vidCancelado) throw Object.assign(new Error('cancelado'), { cancelado: true });
        vidProgresso(100, 'Pronto');
        vidResultado = Object.assign({}, saida, { segundos: ((Date.now() - inicio) / 1000).toFixed(1) });
        vidRenderResultado();
    } catch (erro) {
        if (vidCancelado || (erro && erro.cancelado)) {
            vidAviso('Cancelado. Nada foi salvo.', 'info');
        } else {
            console.error('[Video] ' + f.id, erro);
            vidAviso(erro && erro.message ? erro.message : String(erro), 'erro');
            if (erro && erro.abrirLink && areaResultado) {
                areaResultado.innerHTML = `<a class="btn btn-secondary" href="${escVid(erro.abrirLink)}" target="_blank" rel="noopener noreferrer">
                    ↗️ ${f.id === 'baixar-link' && VIDEOOPS.ehLinkDeArquivo(String(entradas.link || '')) ? 'Abrir o link' : 'Abrir o arquivo'}</a>`;
            }
        }
        if (areaProgresso) areaProgresso.style.display = 'none';
    } finally {
        vidOcupado = false;
        vidCancelado = false;
        if (botao) { botao.disabled = false; botao.textContent = '▶️ ' + (f.rotuloBotao || 'Executar'); }
        if (cancelar) cancelar.style.display = 'none';
    }
}

function vidRenderResultado() {
    const area = document.getElementById('vidResultado');
    if (!area || !vidResultado) return;
    const itens = (vidResultado.arquivos || []).map((a, i) => {
        const url = vidUrlDe(a.blob);
        a.url = url;
        let previa = '';
        if (/^video\//.test(a.tipo)) previa = `<video src="${url}" controls playsinline style="width:100%; max-height:360px; background:#000; border-radius:8px; margin-top:10px;"></video>`;
        else if (/^audio\//.test(a.tipo)) previa = `<audio src="${url}" controls style="width:100%; margin-top:10px;"></audio>`;
        else if (/^image\//.test(a.tipo)) previa = `<img src="${url}" alt="" style="max-width:100%; max-height:360px; border-radius:8px; margin-top:10px; display:block;">`;
        return `
            <div style="padding:10px 12px; background:white; border:1px solid #e3e8ef; border-radius:8px; margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:20px;">${/^audio/.test(a.tipo) ? '🎧' : /^image/.test(a.tipo) ? '🎞️' : '🎬'}</span>
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:600; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escVid(a.nome)}</div>
                        <div style="font-size:11px; color:#5f6b7f;">${tamanho(a.blob.size)}</div>
                    </div>
                    <button class="btn btn-sm btn-primary vid-baixar" onclick="vidBaixar(${i})">⬇️ Baixar</button>
                </div>
                ${previa}
            </div>`;
    }).join('');
    area.innerHTML = `
        <div class="vid-pronto" style="background:#f0fff4; border:1px solid #9ae6b4; border-radius:8px; padding:14px 16px; margin-top:16px;">
            <div style="font-weight:700; color:#22543d; margin-bottom:6px;">✅ Pronto
                <span style="font-weight:400; font-size:12px; color:#38a169;">em ${escVid(vidResultado.segundos)}s</span></div>
            <div style="font-size:13px; color:#22543d; line-height:1.55;">${escVid(vidResultado.mensagem || '')}</div>
        </div>
        <div style="margin-top:14px;">${itens}</div>
        <div style="font-size:11px; color:#7a869a; margin-top:10px;">
            O resultado fica só neste aparelho e se perde ao sair da página — baixe antes.
        </div>`;
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function vidBaixar(i) {
    const a = vidResultado && vidResultado.arquivos[i];
    if (!a) return;
    const link = document.createElement('a');
    link.href = a.url || vidUrlDe(a.blob);
    link.download = a.nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

window.renderVideo = renderVideo;
window.abrirFerramentaVideo = abrirFerramentaVideo;
window.fecharFerramentaVideo = fecharFerramentaVideo;
window.vidExecutar = vidExecutar;
window.vidCancelar = vidCancelar;
window.vidDefinir = vidDefinir;
window.vidEscolherArquivo = vidEscolherArquivo;
window.vidAcrescentar = vidAcrescentar;
window.vidMover = vidMover;
window.vidTirar = vidTirar;
window.vidMetadados = vidMetadados;
window.vidMarcar = vidMarcar;
window.vidBaixar = vidBaixar;
window.CATALOGO_VIDEO = CATALOGO_VIDEO;

})();
