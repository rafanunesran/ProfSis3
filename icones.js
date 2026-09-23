// icones.js — galeria de ícones do SisProf (estilo "vidro": forma de destaque atrás,
// forma cinza translúcida na frente, e um brilho desfocado onde as duas se cruzam).
//
// Os ícones seguem o tema: a forma de trás usa --ic-a (a cor de destaque do tema), a da
// frente usa --ic-b (cinza) e o brilho usa --ic-brilho. Ver styles.css (.ico).
//
// O sistema foi escrito com emojis como ícones. Em vez de reescrever cada tela, este
// arquivo troca o emoji pelo desenho SÓ na aparência: menu, abas, títulos de cartão e de
// janela, e botões. O texto dos rótulos não muda, o onclick não muda, nenhum dado muda.
// Documento editável (contenteditable) e relatório de impressão ficam de fora.
//
// Uso direto: iconeSisProf('turmas') devolve o <svg> pronto.

const ICONES_SISPROF = {
    // ---- Navegação ----
    painel:       { rotulo: 'Painel',        a: '<rect x="4" y="6" width="17" height="16" rx="5"/><rect x="4" y="26" width="17" height="16" rx="5"/>', b: '<rect x="15" y="12" width="29" height="30" rx="7"/>' },
    turmas:       { rotulo: 'Turmas',        a: '<circle cx="31" cy="14" r="8"/><path d="M16 41a15 13 0 0 1 30 0z"/>', b: '<circle cx="18" cy="18" r="8.5"/><path d="M2 45a16 14 0 0 1 32 0z"/>' },
    tutoria:      { rotulo: 'Tutoria',       a: '<path d="M22.2 6.9a4 4 0 0 1 3.6 0l17.4 8.7a2 2 0 0 1 0 3.6l-17.4 8.7a4 4 0 0 1-3.6 0L4.8 19.2a2 2 0 0 1 0-3.6z"/>', b: '<path d="M11 21h26v12c0 4-6 8-13 8s-13-4-13-8z"/><rect x="40" y="17" width="4" height="15" rx="2"/>' },
    documentos:   { rotulo: 'Documentos',    a: '<rect x="4" y="12" width="26" height="32" rx="5"/>', b: '<path d="M18 4h15l11 11v21a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z"/>' },
    registros:    { rotulo: 'Registros',     a: '<path d="M4 11a4 4 0 0 1 4-4h10.5a3 3 0 0 1 2.3 1.1L23.5 12H40a4 4 0 0 1 4 4v4H4z"/><rect x="4" y="14" width="40" height="26" rx="5"/>', b: '<rect x="12" y="22" width="32" height="22" rx="5"/>' },
    aee:          { rotulo: 'Painel AEE',    a: '<path d="M20 4.5l4.3 10.3 11.1.9-8.5 7.2 2.6 10.9L20 28l-9.5 5.8 2.6-10.9-8.5-7.2 11.1-.9z"/>', b: '<circle cx="33" cy="33" r="11"/>' },
    biblioteca:   { rotulo: 'Biblioteca',    a: '<rect x="4" y="8" width="10" height="34" rx="3"/><rect x="16" y="13" width="10" height="29" rx="3"/>', b: '<rect x="27" y="9" width="11" height="34" rx="3" transform="rotate(-14 32.5 43)"/>' },
    ferramentas:  { rotulo: 'Ferramentas',   a: '<rect x="4" y="18" width="40" height="24" rx="6"/>', b: '<path d="M14 30V14a5 5 0 0 1 5-5h10a5 5 0 0 1 5 5v16h-5V15h-10v15z"/><rect x="4" y="26" width="40" height="5" rx="2.5"/>' },
    ocorrencias:  { rotulo: 'Ocorrências',   a: '<path d="M20.5 7.1a4 4 0 0 1 7 0l16 27.8a4 4 0 0 1-3.5 6H8a4 4 0 0 1-3.5-6z"/>', b: '<rect x="21" y="15" width="6" height="14" rx="3"/><circle cx="24" cy="35" r="3.3"/>' },
    notas:        { rotulo: 'Notas',         a: '<rect x="6" y="4" width="26" height="38" rx="6"/>', b: '<rect x="18" y="18" width="26" height="26" rx="6"/>' },
    horarios:     { rotulo: 'Horários',      a: '<circle cx="24" cy="25" r="19"/>', b: '<path d="M21.5 12a2.5 2.5 0 0 1 5 0v11.6l7.4 4.6a2.5 2.5 0 0 1-2.7 4.3l-8.5-5.4a2.5 2.5 0 0 1-1.2-2.1z"/>' },
    escola:       { rotulo: 'Escola',        a: '<rect x="7" y="22" width="34" height="21" rx="4"/>', b: '<path d="M21.6 5.8a4 4 0 0 1 4.8 0l16 12.4a2 2 0 0 1-1.2 3.6H6.8a2 2 0 0 1-1.2-3.6z"/><rect x="19" y="29" width="10" height="14" rx="3"/>' },

    // ---- Dentro da turma ----
    chamada:      { rotulo: 'Chamada',       a: '<rect x="4" y="12" width="30" height="30" rx="8"/>', b: '<path d="M11.6 26.6a3 3 0 0 1 4.3 0l5 5L38.2 10a3 3 0 1 1 4.7 3.8L23.4 38a3 3 0 0 1-4.5.3l-7.3-7.3a3 3 0 0 1 0-4.4z"/>' },
    trabalhos:    { rotulo: 'Trabalhos',     a: '<rect x="4" y="6" width="27" height="36" rx="5"/>', b: '<path d="M36.3 9.5a4 4 0 0 1 5.7 0l.5.5a4 4 0 0 1 0 5.7L25 33.2 17 36l2.8-8z"/>' },
    compensacoes: { rotulo: 'Compensações',  a: '<path d="M3 28h16a8 8 0 0 1-16 0z"/><path d="M29 28h16a8 8 0 0 1-16 0z"/>', b: '<rect x="21.5" y="6" width="5" height="33" rx="2.5"/><rect x="7" y="10" width="34" height="5" rx="2.5"/><rect x="13" y="37" width="22" height="6" rx="3"/>' },
    caderno:      { rotulo: 'Caderno',       a: '<path d="M4 11c7-3 14-2 19 2v29c-5-3-12-4-19-2z"/>', b: '<path d="M44 11c-7-3-14-2-19 2v29c5-3 12-4 19-2z"/><rect x="20" y="9" width="8" height="15" rx="2"/>' },
    mapa:         { rotulo: 'Mapeamento',    a: '<ellipse cx="24" cy="39" rx="20" ry="6"/>', b: '<path fill-rule="evenodd" d="M24 3a12.5 12.5 0 0 1 12.5 12.5C36.5 25 24 38 24 38S11.5 25 11.5 15.5A12.5 12.5 0 0 1 24 3zm0 7.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/>' },
    estudante:    { rotulo: 'Estudante',     a: '<path d="M5 44a19 16 0 0 1 38 0z"/>', b: '<circle cx="24" cy="18" r="11.5"/>' },

    // ---- Painel e agenda ----
    agenda:       { rotulo: 'Agenda',        a: '<rect x="4" y="9" width="40" height="34" rx="7"/>', b: '<path d="M4 16a7 7 0 0 1 7-7h26a7 7 0 0 1 7 7v4H4z"/><rect x="12" y="4" width="5" height="11" rx="2.5"/><rect x="31" y="4" width="5" height="11" rx="2.5"/>' },
    reuniao:      { rotulo: 'Reunião',       a: '<rect x="4" y="15" width="25" height="19" rx="5"/><path d="M9 33l-1 9 9-8z"/>', b: '<rect x="18" y="5" width="26" height="19" rx="5"/><path d="M39 23l1 9-9-8z"/>' },
    aviso:        { rotulo: 'Avisos',        a: '<path d="M13 17.5 36.6 6.4A2.5 2.5 0 0 1 40 8.7v30.6a2.5 2.5 0 0 1-3.4 2.3L13 30.5z"/>', b: '<rect x="4" y="15" width="14" height="18" rx="5"/><rect x="10" y="29" width="7" height="14" rx="3.5"/>' },
    alerta:       { rotulo: 'Alerta',        a: '<path d="M11 21a13 13 0 0 1 26 0v9l4 6H7l4-6z"/>', b: '<circle cx="24" cy="39" r="5.5"/><circle cx="36" cy="12" r="7"/>' },
    config:       { rotulo: 'Ajustes',       a: '<circle cx="14" cy="12" r="6.5"/><circle cx="32" cy="24" r="6.5"/><circle cx="19" cy="36" r="6.5"/>', b: '<rect x="4" y="9.5" width="40" height="5" rx="2.5"/><rect x="4" y="21.5" width="40" height="5" rx="2.5"/><rect x="4" y="33.5" width="40" height="5" rx="2.5"/>' },
    historico:    { rotulo: 'Histórico',     a: '<path d="M22 20.8a4 4 0 0 1 4 0l16.4 9a1.5 1.5 0 0 1 0 2.6L26 41.2a4 4 0 0 1-4 0L5.6 32.4a1.5 1.5 0 0 1 0-2.6z"/>', b: '<path d="M22 6.8a4 4 0 0 1 4 0l16.4 9a1.5 1.5 0 0 1 0 2.6L26 27.2a4 4 0 0 1-4 0L5.6 18.4a1.5 1.5 0 0 1 0-2.6z"/>' },
    relatorio:    { rotulo: 'Relatório',     a: '<rect x="6" y="22" width="8" height="20" rx="3"/><rect x="20" y="12" width="8" height="30" rx="3"/><rect x="34" y="26" width="8" height="16" rx="3"/>', b: '<path d="M4 20 16 10l9 6L43 5v6L25.5 22.5l-9-6L4 27z"/>' },

    // ---- Conta ----
    perfil:       { rotulo: 'Perfil',        a: '<path d="M5 44a19 16 0 0 1 38 0z"/>', b: '<circle cx="24" cy="17" r="11"/>' },
    apoie:        { rotulo: 'Apoie',         a: '<path d="M24 42C10.5 33 4 25.5 4 17.5A9.5 9.5 0 0 1 22 13a9.5 9.5 0 0 1 22 4.5C44 25.5 37.5 33 24 42z"/>', b: '<circle cx="36" cy="12" r="8.5"/>' },
    sair:         { rotulo: 'Sair',          a: '<rect x="4" y="4" width="23" height="40" rx="5"/>', b: '<path d="M22 20h11v-6.5a1.5 1.5 0 0 1 2.5-1.1l9.3 10.4a1.5 1.5 0 0 1 0 2.2l-9.3 10.4a1.5 1.5 0 0 1-2.5-1.1V28H22a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3z"/>' },
    seguranca:    { rotulo: 'Segurança',     a: '<rect x="6" y="20" width="36" height="24" rx="7"/>', b: '<path d="M13 26V16a11 11 0 0 1 22 0v10h-6V16a5 5 0 0 0-10 0v10z"/>' },

    // ---- Documentos e ferramentas ----
    estagiario:   { rotulo: 'Estagiário',    a: '<path d="M29.5 3.5 8.9 27.2A1.8 1.8 0 0 0 10.2 30H24z"/>', b: '<path d="M18.5 44.5 39.1 20.8A1.8 1.8 0 0 0 37.8 18H24z"/>' },
    planos:       { rotulo: 'Planos de aula', a: '<rect x="4" y="6" width="27" height="36" rx="5"/>', b: '<path d="M36.3 9.5a4 4 0 0 1 5.7 0l.5.5a4 4 0 0 1 0 5.7L25 33.2 17 36l2.8-8z"/>' },
    anexo:        { rotulo: 'Anexo',         a: '<rect x="4" y="10" width="30" height="34" rx="5"/>', b: '<path d="M26 4h14a4 4 0 0 1 4 4v28L35 30l-9 6z"/>' },
    pdf:          { rotulo: 'PDF',           a: '<path d="M10 4h17l13 13v23a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z"/>', b: '<rect x="2" y="21" width="30" height="14" rx="4"/>' },
    ampliar:      { rotulo: 'Ampliar',       a: '<rect x="27" y="31" width="20" height="8" rx="4" transform="rotate(45 27 35)"/>', b: '<circle cx="20" cy="20" r="15"/>' },
    poster:       { rotulo: 'Pôster',        a: '<circle cx="33" cy="14" r="9"/>', b: '<path d="M16.3 11.6a2 2 0 0 1 3.4 0L29 27.4l3.3-4.8a2 2 0 0 1 3.3 0l8 12.3a2 2 0 0 1-1.7 3.1H6.1a2 2 0 0 1-1.7-3z"/>' },
    video:        { rotulo: 'Vídeo',         a: '<rect x="4" y="9" width="40" height="30" rx="7"/>', b: '<path d="M19 16.6a2 2 0 0 1 3-1.7l12.5 7.4a2 2 0 0 1 0 3.4L22 33.1a2 2 0 0 1-3-1.7z"/>' },
    imagem:       { rotulo: 'Imagem',        a: '<circle cx="33" cy="14" r="9"/>', b: '<path d="M16.3 11.6a2 2 0 0 1 3.4 0L29 27.4l3.3-4.8a2 2 0 0 1 3.3 0l8 12.3a2 2 0 0 1-1.7 3.1H6.1a2 2 0 0 1-1.7-3z"/>' },

    // ---- Dados e cópia de segurança ----
    backup:       { rotulo: 'Backup',        a: '<path d="M14 40a10 10 0 0 1-1.6-19.9A12.5 12.5 0 0 1 36.3 17 9.5 9.5 0 0 1 35 40z"/>', b: '<path d="M22.2 21.8a2.5 2.5 0 0 1 3.6 0l7 7.4a1.5 1.5 0 0 1-1.1 2.5H27v10.8a3 3 0 0 1-6 0V31.7h-4.7a1.5 1.5 0 0 1-1.1-2.5z"/>' },
    baixar:       { rotulo: 'Baixar',        a: '<rect x="4" y="31" width="40" height="13" rx="5"/>', b: '<path d="M21 6.5a3 3 0 0 1 6 0V22h5.6a1.5 1.5 0 0 1 1.1 2.5l-8.6 9.4a1.5 1.5 0 0 1-2.2 0l-8.6-9.4a1.5 1.5 0 0 1 1.1-2.5H21z"/>' },
    importar:     { rotulo: 'Importar',      a: '<rect x="4" y="31" width="40" height="13" rx="5"/>', b: '<path d="M21 34.5a3 3 0 0 0 6 0V19h5.6a1.5 1.5 0 0 0 1.1-2.5l-8.6-9.4a1.5 1.5 0 0 0-2.2 0l-8.6 9.4a1.5 1.5 0 0 0 1.1 2.5H21z"/>' },
    salvar:       { rotulo: 'Salvar',        a: '<rect x="4" y="4" width="40" height="40" rx="8"/>', b: '<rect x="12" y="4" width="24" height="14" rx="3"/><rect x="11" y="26" width="26" height="18" rx="4"/>' },
    imprimir:     { rotulo: 'Imprimir',      a: '<rect x="4" y="15" width="40" height="20" rx="6"/>', b: '<rect x="12" y="4" width="24" height="15" rx="3"/><rect x="12" y="27" width="24" height="17" rx="3"/>' },
    lixeira:      { rotulo: 'Remover',       a: '<path d="M9 14h30l-2.4 26a4 4 0 0 1-4 3.6H15.4a4 4 0 0 1-4-3.6z"/>', b: '<rect x="4" y="9" width="40" height="7" rx="3.5"/><rect x="17" y="4" width="14" height="8" rx="3"/>' },
    busca:        { rotulo: 'Busca',         a: '<rect x="27" y="31" width="20" height="8" rx="4" transform="rotate(45 27 35)"/>', b: '<circle cx="20" cy="20" r="15"/>' },
    editar:       { rotulo: 'Editar',        a: '<rect x="4" y="30" width="30" height="14" rx="5"/>', b: '<path d="M33.3 5.5a4 4 0 0 1 5.7 0l3.5 3.5a4 4 0 0 1 0 5.7L20 37.2 10 40l2.8-10z"/>' },
    tema:         { rotulo: 'Tema',          a: '<circle cx="18" cy="24" r="15"/>', b: '<circle cx="31" cy="24" r="13"/>' },
    celular:      { rotulo: 'Celular',       a: '<rect x="10" y="4" width="24" height="40" rx="6"/>', b: '<rect x="18" y="12" width="24" height="22" rx="5"/>' },
    nuvem:        { rotulo: 'Nuvem',         a: '<path d="M14 38a10 10 0 0 1-1.6-19.9A12.5 12.5 0 0 1 36.3 15 9.5 9.5 0 0 1 35 38z"/>', b: '<circle cx="34" cy="31" r="10"/>' }
};

// Emoji do código antigo → ícone. Só estes são trocados; qualquer outro emoji fica como está.
const EMOJI_ICONE = {
    '📊': 'painel', '👥': 'turmas', '🎓': 'tutoria', '📁': 'documentos', '📂': 'registros',
    '🌟': 'aee', '📚': 'biblioteca', '🧰': 'ferramentas', '⚠️': 'ocorrencias', '⚠': 'ocorrencias',
    '🧮': 'notas', '⏰': 'horarios', '🏫': 'escola', '✅': 'chamada', '📝': 'trabalhos',
    '⚖️': 'compensacoes', '⚖': 'compensacoes', '📖': 'caderno', '🗺️': 'mapa', '🗺': 'mapa',
    '📅': 'agenda', '📆': 'agenda', '🗓️': 'agenda', '🤝': 'reuniao', '📢': 'aviso', '📣': 'aviso',
    '🔔': 'alerta', '⚙️': 'config', '⚙': 'config', '👤': 'perfil', '❤️': 'apoie', '❤': 'apoie',
    '💛': 'apoie', '✨': 'estagiario', '📕': 'pdf', '📘': 'anexo', '🔍': 'ampliar', '🔎': 'busca',
    '🧱': 'poster', '🎬': 'video', '🖼️': 'imagem', '🗂️': 'historico', '🗂': 'historico', '💾': 'salvar',
    '☁️': 'nuvem', '☁': 'nuvem', '⬇️': 'baixar', '⬆️': 'importar', '📤': 'importar', '📥': 'baixar',
    '🖨️': 'imprimir', '🖨': 'imprimir', '🗑️': 'lixeira', '🗑': 'lixeira', '✏️': 'editar', '✏': 'editar',
    '🎨': 'tema', '📱': 'celular', '🔒': 'seguranca', '🔐': 'seguranca', '🛟': 'seguranca',
    '🧑‍🎓': 'estudante', '👨‍🎓': 'estudante', '👩‍🎓': 'estudante', '📈': 'relatorio', '📋': 'historico'
};

(function () {
    const NS = 'http://www.w3.org/2000/svg';

    function montarSprite() {
        if (document.getElementById('sisprof-icones')) return;
        let defs = '<filter id="ic-desfoque" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>';
        let simbolos = '';
        Object.keys(ICONES_SISPROF).forEach(function (nome) {
            const ic = ICONES_SISPROF[nome];
            defs += '<clipPath id="ic-' + nome + '-frente">' + ic.b + '</clipPath>';
            simbolos += '<symbol id="ic-' + nome + '" viewBox="0 0 48 48">' +
                '<g style="fill:var(--ic-a)">' + ic.a + '</g>' +
                '<g style="fill:var(--ic-b)">' + ic.b + '</g>' +
                '<g clip-path="url(#ic-' + nome + '-frente)"><g filter="url(#ic-desfoque)" style="fill:var(--ic-brilho)">' + ic.a + '</g></g>' +
                '</symbol>';
        });
        const div = document.createElement('div');
        div.innerHTML = '<svg id="sisprof-icones" xmlns="' + NS + '" aria-hidden="true" focusable="false" ' +
            'style="position:absolute;width:0;height:0;overflow:hidden"><defs>' + defs + '</defs>' + simbolos + '</svg>';
        document.body.insertBefore(div.firstChild, document.body.firstChild);
    }

    function iconeSisProf(nome, classeExtra) {
        if (!ICONES_SISPROF[nome]) return '';
        return '<svg class="ico' + (classeExtra ? ' ' + classeExtra : '') + '" data-ico="' + nome +
            '" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><use href="#ic-' + nome + '"/></svg>';
    }
    window.iconeSisProf = iconeSisProf;

    // ---- Troca automática dos emojis ----
    const emojis = Object.keys(EMOJI_ICONE).sort(function (x, y) { return y.length - x.length; });
    const escapar = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    const INICIO = new RegExp('^(\\s*)(' + emojis.map(escapar).join('|') + ')\\uFE0F?\\s*');

    // Onde a troca vale: menu, abas, títulos e botões. Nada de conteúdo digitado.
    const ALVOS = [
        'nav .icon', '.icon',
        '.card > h2', '.card > h3', '.card > div > h2', '.card > div > h3', '.grid > div > h3',
        '.modal-header h2', '.modal-content > h2', '.modal-content > h3',
        '.btn', 'header h1'
    ].join(',');
    const FORA = '[contenteditable], [contenteditable] *, #relatorioImpressao, #relatorioImpressao *, .no-icones, .no-icones *, textarea, select, option';

    function trocar(el) {
        if (!el || el.nodeType !== 1 || el.closest(FORA)) return;
        // .icon: o conteúdo inteiro é o emoji
        if (el.classList.contains('icon')) {
            const t = (el.textContent || '').trim().replace(/️/g, '');
            const nome = EMOJI_ICONE[t] || EMOJI_ICONE[(el.textContent || '').trim()];
            if (nome && !el.querySelector('svg.ico')) {
                el.setAttribute('data-emoji', (el.textContent || '').trim());
                el.innerHTML = iconeSisProf(nome);
            }
            return;
        }
        // Títulos e botões: só o emoji do começo do primeiro texto
        let no = el.firstChild;
        while (no && no.nodeType === 3 && !no.nodeValue.trim()) no = no.nextSibling;
        if (!no || no.nodeType !== 3) return;
        const m = no.nodeValue.match(INICIO);
        if (!m) return;
        const nome = EMOJI_ICONE[m[2]];
        if (!nome) return;
        const tmp = document.createElement('span');
        tmp.innerHTML = iconeSisProf(nome, 'ico-texto');
        const svg = tmp.firstChild;
        svg.setAttribute('data-emoji', m[2]);
        no.nodeValue = no.nodeValue.slice(m[0].length);
        el.insertBefore(svg, no);
        el.classList.add('tem-ico');
    }

    function varrer(raiz) {
        if (!raiz || raiz.nodeType !== 1) return;
        if (raiz.matches && raiz.matches(ALVOS)) trocar(raiz);
        const lista = raiz.querySelectorAll ? raiz.querySelectorAll(ALVOS) : [];
        for (let i = 0; i < lista.length; i++) trocar(lista[i]);
    }

    let pendentes = new Set();
    let agendado = false;
    function agendar(no) {
        pendentes.add(no);
        if (agendado) return;
        agendado = true;
        requestAnimationFrame(function () {
            agendado = false;
            const lote = pendentes; pendentes = new Set();
            lote.forEach(function (n) {
                if (n.nodeType === 3) n = n.parentElement;
                if (n && n.isConnected) {
                    varrer(n);
                    // texto trocado dentro de um botão/título (ex.: innerHTML do botão Apoie)
                    const alvo = n.closest && n.closest(ALVOS);
                    if (alvo) trocar(alvo);
                }
            });
        });
    }

    function iniciar() {
        montarSprite();
        varrer(document.body);
        new MutationObserver(function (muts) {
            for (let i = 0; i < muts.length; i++) {
                const m = muts[i];
                if (m.type === 'characterData') { agendar(m.target); continue; }
                for (let k = 0; k < m.addedNodes.length; k++) agendar(m.addedNodes[k]);
                if (m.target && m.addedNodes.length) agendar(m.target);
            }
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
