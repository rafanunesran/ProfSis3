// ferramentas.js — A TELA "FERRAMENTAS": a caixa onde moram as ferramentas de arquivo.
//
// POR QUE ISTO EXISTE
//   A tela de PDF nasceu sozinha, como um botao "PDF" no menu. Mas ela nunca foi sobre
//   PDF: ela e' sobre fazer, DENTRO do sistema, o trabalho que o professor faria num site
//   gratuito qualquer — e que, naquele site, custaria mandar o arquivo de uma crianca
//   para o servidor de um terceiro que a escola nao autorizou.
//
//   Ampliar uma foto tem exatamente o mesmo problema e exatamente a mesma solucao, e
//   espalhar uma imagem por varias folhas para virar cartaz de parede, tambem. Se cada
//   uma dessas coisas virar um botao no menu, o menu acaba. Entao o menu ganha UM botao
//   — "Ferramentas" — e por dentro ele tem abas.
//
// COMO FUNCIONA
//   Esta tela nao sabe nada sobre PDF nem sobre imagem. Ela so' cria o quadro, desenha as
//   abas e entrega um <div> vazio para quem sabe:
//
//     aba "PDF"      -> pdf_ferramentas.js    desenha dentro de #tabFerramentasPdf
//     aba "Ampliar"  -> ampliar.js            desenha dentro de #tabFerramentasAmpliar
//     aba "Poster"   -> poster.js             desenha dentro de #tabFerramentasPoster
//
//   Acrescentar uma aba e' acrescentar uma linha em ABAS_FERRAMENTAS e um arquivo que
//   saiba desenhar no container dela.
//
//   O antigo showScreen('pdf') continua valendo (ver app.js): quem tiver um atalho
//   guardado, ou um teste antigo, cai na aba de PDF como antes.

(function () {
'use strict';

const ABAS_FERRAMENTAS = [
    {
        id: 'pdf', container: 'tabFerramentasPdf', icone: '📕', label: 'PDF',
        render: () => { if (typeof renderPdf === 'function') renderPdf(); }
    },
    {
        id: 'ampliar', container: 'tabFerramentasAmpliar', icone: '🔍', label: 'Ampliar',
        render: () => { if (typeof renderAmpliar === 'function') renderAmpliar(); }
    },
    {
        id: 'poster', container: 'tabFerramentasPoster', icone: '🧱', label: 'Pôster',
        render: () => { if (typeof renderPoster === 'function') renderPoster(); }
    }
];

let abaFerramentasAtual = 'pdf';

// A tela nasce sob demanda, como a Biblioteca e como a de PDF antes dela: quem nunca
// abre Ferramentas nao paga o custo de ter esse HTML na pagina.
function garantirTelaFerramentas() {
    let tela = document.getElementById('ferramentas');
    if (tela) return tela;

    const container = document.getElementById('appContainer');
    const interno = (container && container.querySelector('.container')) || container || document.body;

    tela = document.createElement('div');
    tela.id = 'ferramentas';
    tela.className = 'screen';
    tela.innerHTML = `
        <style>
            .ferr-nav-btn {
                display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px;
                background: transparent; border: none; cursor: pointer;
                color: #718096; border-bottom: 3px solid transparent;
                transition: all 0.2s; font-size: 16px;
            }
            .ferr-nav-btn.active { color: #3182ce; border-bottom: 3px solid #3182ce; background: #ebf8ff; border-radius: 4px 4px 0 0; }
            .ferr-nav-btn:hover { background: #f7fafc; }
            /* A regra geral de <nav> esconde o rotulo do botao que nao esta ativo; aqui as
               abas precisam se identificar todas de uma vez. */
            #navFerramentas .ferr-nav-btn .label {
                font-size: 14px; font-weight: bold; max-width: none; opacity: 1; margin-left: 0;
            }
        </style>
        <nav id="navFerramentas" style="margin:18px 0 6px; border-bottom:1px solid #e2e8f0; padding-bottom:6px;"></nav>
        ${ABAS_FERRAMENTAS.map(a => `<div id="${a.container}" class="ferramentas-tab" style="display:none;"></div>`).join('')}
    `;
    interno.appendChild(tela);
    return tela;
}

// Chamada pelo showScreen('ferramentas') — ver app.js.
function renderFerramentas(aba) {
    const tela = garantirTelaFerramentas();
    const alvo = aba || abaFerramentasAtual;

    // A tela nasce sob demanda, entao o showScreen que disparou este render pode ter
    // rodado antes de ela existir. A exibicao e' garantida aqui (mesmo caminho da
    // Biblioteca e o que a tela de PDF fazia sozinha antes).
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    tela.classList.add('active');
    tela.style.display = '';

    const nav = document.getElementById('navFerramentas');
    if (nav) {
        nav.innerHTML = ABAS_FERRAMENTAS.map(a => `
            <button class="ferr-nav-btn" data-aba="${a.id}" onclick="showFerramentasTab('${a.id}')">
                <span class="icon">${a.icone}</span><span class="label">${a.label}</span>
            </button>`).join('');
    }

    showFerramentasTab(alvo);
}

function showFerramentasTab(aba) {
    garantirTelaFerramentas();
    const def = ABAS_FERRAMENTAS.find(a => a.id === aba) || ABAS_FERRAMENTAS[0];
    abaFerramentasAtual = def.id;

    document.querySelectorAll('#ferramentas .ferramentas-tab').forEach(t => { t.style.display = 'none'; });
    const el = document.getElementById(def.container);
    if (el) el.style.display = 'block';

    // A aba aberta se marca pelo id, nao pelo clique: assim quem chega pelo codigo
    // (showScreen('pdf'), por exemplo) tambem deixa o destaque no lugar certo.
    document.querySelectorAll('#navFerramentas .ferr-nav-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.aba === def.id);
    });

    try {
        if (def.render) def.render();
    } catch (erro) {
        console.error('[Ferramentas] aba ' + def.id, erro);
        if (el) {
            el.innerHTML = `<div class="card" style="margin:20px 0;">
                <div style="background:#fff5f5; border:1px solid #fc8181; color:#742a2a; border-radius:8px; padding:12px 14px; font-size:13px;">
                    Nao consegui abrir esta aba: ${String(erro && erro.message || erro)}
                </div></div>`;
        }
    }
}

// A tela nao usa modulos: o onclick do HTML gerado precisa achar isto no window.
window.ABAS_FERRAMENTAS = ABAS_FERRAMENTAS;
window.garantirTelaFerramentas = garantirTelaFerramentas;
window.renderFerramentas = renderFerramentas;
window.showFerramentasTab = showFerramentasTab;
// Qual aba abrir no proximo showScreen('ferramentas'). E' assim que o atalho antigo
// showScreen('pdf') continua caindo na aba certa.
window.definirAbaFerramentas = (aba) => { abaFerramentasAtual = aba; };

})();
