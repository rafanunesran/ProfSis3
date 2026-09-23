// ux.js — camada de experiência do SisProf (estrutura do tema Híbrido e atalhos).
//
// Nada aqui salva, apaga ou calcula dado. Toda ação passa pelo que já existe: clicar
// no próprio botão do menu (que chama showScreen) ou chamar as funções de sempre
// (abrirTurma, abrirModalPerfil...). O que este arquivo faz:
//
//   1. Agrupa o menu por assunto (Dia a dia, Registros, Escola, Recursos). Os botões
//      são os mesmos, só mudam de ordem; os títulos dos grupos aparecem no menu
//      lateral do Híbrido.
//   2. No celular, a barra de baixo mostra os 4 primeiros itens e um "Mais" que abre
//      uma folha com todos.
//   3. Busca rápida (Ctrl+K ou o botão Buscar): telas, funções, turmas, estudantes,
//      trabalhos e tutorados, só com o que já está carregado no aparelho.
//   4. Mostra no topo em que tela a pessoa está.
//   5. Menu lateral recolhível no computador (a escolha fica guardada no aparelho).

(function () {
    const GRUPOS = [
        { id: 'dia', nome: 'Dia a dia', telas: ['dashboard', 'turmas', 'tutoria', 'ocorrenciasGestor', 'tutoriasGestor'] },
        { id: 'reg', nome: 'Registros', telas: ['documentos', 'registrosProfessor', 'registrosGestor', 'aeeVisaoGeral'] },
        { id: 'esc', nome: 'Escola', telas: ['horariosGestor', 'escolaGestor'] },
        { id: 'rec', nome: 'Recursos', telas: ['biblioteca', 'ferramentas'] }
    ];
    const NOMES_TELA = {
        turmaDetalhe: 'Turma', tutoradoDetalhe: 'Tutorado', estudanteDetalhe: 'Estudante',
        relatorioImpressao: 'Relatório', pdf: 'Ferramentas'
    };
    const MOSTRA_NA_BARRA = 4;

    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    const ico = (n) => (typeof window.iconeSisProf === 'function' ? window.iconeSisProf(n) : '');
    const semAcento = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    const ler = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

    function navPrincipal() { return $('#appContainer nav.app-nav'); }
    function telaDoBotao(b) {
        const m = (b.getAttribute('onclick') || '').match(/showScreen\('([\w]+)'/);
        return m ? m[1] : null;
    }
    function rotuloDoBotao(b) {
        const l = b.querySelector('.label');
        return (l ? l.textContent : b.textContent).trim();
    }
    function botoesDoMenu() {
        const nav = navPrincipal();
        return nav ? $$(':scope > button:not(.nav-mais)', nav) : [];
    }

    // ---------------------------------------------------------------- 1. grupos
    let organizando = false;
    function organizarMenu() {
        const nav = navPrincipal();
        if (!nav || organizando) return;
        const botoes = botoesDoMenu();
        if (!botoes.length) return;
        organizando = true;

        // Ordem: pelos grupos; o que não estiver em grupo nenhum fica no fim, na ordem de antes
        const ordem = (b) => {
            const t = telaDoBotao(b);
            for (let g = 0; g < GRUPOS.length; g++) {
                const i = GRUPOS[g].telas.indexOf(t);
                if (i !== -1) return g * 100 + i;
            }
            return 1000 + botoes.indexOf(b);
        };
        const ordenados = botoes.slice().sort((x, y) => ordem(x) - ordem(y));

        $$(':scope > .nav-grupo, :scope > .nav-mais, :scope > .nav-rodape, :scope > .nav-marca', nav).forEach(e => e.remove());

        // Topo do menu lateral: marca e o botão de recolher/abrir
        const marca = document.createElement('div');
        marca.className = 'nav-marca';
        marca.innerHTML = '<span class="nav-marca-selo" aria-hidden="true">S</span><span class="nav-marca-nome">SisProf</span>' +
            '<button type="button" class="nav-recolher" aria-label="Recolher o menu" title="Recolher o menu">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M9.5 4v16"/><path d="m15.5 10-2 2 2 2"/></svg></button>';
        marca.querySelector('.nav-recolher').addEventListener('click', alternarRecolhido);
        nav.appendChild(marca);

        let grupoAtual = null;
        ordenados.forEach((b, i) => {
            const t = telaDoBotao(b);
            const g = GRUPOS.find(x => x.telas.indexOf(t) !== -1);
            const gid = g ? g.id : 'outros';
            if (gid !== grupoAtual) {
                grupoAtual = gid;
                const rot = document.createElement('div');
                rot.className = 'nav-grupo';
                rot.setAttribute('aria-hidden', 'true');
                rot.textContent = g ? g.nome : 'Outros';
                nav.appendChild(rot);
            }
            b.title = rotuloDoBotao(b);
            b.classList.toggle('nav-extra', i >= MOSTRA_NA_BARRA);
            nav.appendChild(b);
        });

        // "Mais" (só aparece no celular, pelo CSS)
        if (ordenados.length > MOSTRA_NA_BARRA) {
            const mais = document.createElement('button');
            mais.type = 'button';
            mais.className = 'nav-mais';
            mais.innerHTML = '<span class="icon">' + ico('config') + '</span><span class="label">Mais</span>';
            mais.addEventListener('click', abrirFolhaMais);
            nav.appendChild(mais);
        }

        // Rodapé do menu lateral: busca e recolher
        const rod = document.createElement('div');
        rod.className = 'nav-rodape';
        rod.innerHTML =
            '<button type="button" class="nav-acao" data-acao="buscar" title="Buscar (Ctrl+K)">' + ico('busca') + '<span>Buscar</span><kbd>Ctrl K</kbd></button>';
        rod.querySelector('[data-acao="buscar"]').addEventListener('click', abrirPaleta);
        nav.appendChild(rod);

        marcarMais();
        atualizarBotaoRecolher();
        organizando = false;
    }

    function marcarMais() {
        const nav = navPrincipal();
        if (!nav) return;
        const mais = $(':scope > .nav-mais', nav);
        if (!mais) return;
        const ativoExtra = botoesDoMenu().some(b => b.classList.contains('active') && b.classList.contains('nav-extra'));
        mais.classList.toggle('mais-ativo', ativoExtra);
    }

    // --------------------------------------------------------- 2. folha "Mais"
    function abrirFolhaMais() {
        fecharFolhaMais();
        const fundo = document.createElement('div');
        fundo.className = 'ux-folha-fundo';
        fundo.innerHTML = '<div class="ux-folha" role="dialog" aria-modal="true" aria-label="Todas as telas">' +
            '<div class="ux-folha-alca"></div><h2>Todas as telas</h2><div class="ux-folha-grade"></div></div>';
        const grade = $('.ux-folha-grade', fundo);
        botoesDoMenu().forEach(b => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'ux-folha-item' + (b.classList.contains('active') ? ' ativo' : '');
            const icone = b.querySelector('.icon');
            item.innerHTML = '<span class="ux-folha-ico">' + (icone ? icone.innerHTML : '') + '</span><span>' + rotuloDoBotao(b) + '</span>';
            item.addEventListener('click', () => { fecharFolhaMais(); b.click(); });
            grade.appendChild(item);
        });
        fundo.addEventListener('click', (e) => { if (e.target === fundo) fecharFolhaMais(); });
        document.body.appendChild(fundo);
        const primeiro = $('.ux-folha-item', fundo);
        if (primeiro) primeiro.focus({ preventScroll: true });
    }
    function fecharFolhaMais() { $$('.ux-folha-fundo').forEach(e => e.remove()); }

    // ------------------------------------------------------ 3. busca rápida
    let paleta = null, itensPaleta = [], selecionado = 0;

    // Índice da busca. Tudo vem do que já está carregado neste aparelho (nada vai para a
    // rede) e toda ação é uma função que já existe. Grupos com muitos itens (estudantes,
    // trabalhos, tutorados) só aparecem depois que a pessoa começa a digitar.
    const LIMITE_POR_GRUPO = { 'Estudantes': 8, 'Trabalhos': 8, 'Tutorados': 6 };

    function temDados() { return typeof data !== 'undefined' && data; }
    function listaDe(chave) { return temDados() && Array.isArray(data[chave]) ? data[chave] : []; }
    function nomeDaTurma(t) { return t ? (t.disciplina ? t.nome + ' · ' + t.disciplina : t.nome) : ''; }
    function clicarMenu(tela) {
        const b = botoesDoMenu().find(x => telaDoBotao(x) === tela);
        if (b) { b.click(); return true; }
        if (typeof showScreen === 'function') { showScreen(tela); return true; }
        return false;
    }

    function coletarItens() {
        const itens = [];
        const turmas = listaDe('turmas');
        const turmaPorId = {};
        turmas.forEach(t => { turmaPorId[String(t.id)] = t; });
        const estudantes = listaDe('estudantes');
        const podeAbrirTurma = typeof abrirTurma === 'function';

        // Telas do menu
        botoesDoMenu().forEach(b => {
            const icone = b.querySelector('.icon');
            itens.push({ grupo: 'Telas', rotulo: rotuloDoBotao(b), icone: icone ? icone.innerHTML : '', fazer: () => b.click() });
        });

        // Funções dentro das telas: abas de Documentos e de Ferramentas
        if (typeof ABAS_DOCUMENTOS !== 'undefined' && Array.isArray(ABAS_DOCUMENTOS) && typeof showDocumentosTab === 'function') {
            ABAS_DOCUMENTOS.forEach(a => itens.push({ grupo: 'Funções', rotulo: a.label, extra: 'Documentos', icone: ico('documentos'),
                fazer: () => { clicarMenu('documentos'); setTimeout(() => showDocumentosTab(a.id), 60); } }));
        }
        if (typeof ABAS_FERRAMENTAS !== 'undefined' && Array.isArray(ABAS_FERRAMENTAS) && typeof showFerramentasTab === 'function') {
            ABAS_FERRAMENTAS.forEach(a => itens.push({ grupo: 'Funções', rotulo: a.label, extra: 'Ferramentas', icone: ico('ferramentas'),
                fazer: () => { if (typeof definirAbaFerramentas === 'function') definirAbaFerramentas(a.id); clicarMenu('ferramentas'); } }));
        }

        // Turmas: acha também pelo nome de um estudante da turma
        if (podeAbrirTurma) {
            const nomesPorTurma = {};
            estudantes.forEach(e => { const k = String(e.id_turma); (nomesPorTurma[k] = nomesPorTurma[k] || []).push(e.nome_completo || ''); });
            turmas.forEach(t => itens.push({ grupo: 'Turmas', rotulo: nomeDaTurma(t), extra: t.turno || '', icone: ico('turmas'),
                busca: (nomesPorTurma[String(t.id)] || []).join(' '), fazer: () => abrirTurma(t.id) }));
        }

        // Estudantes: abre a turma e a ficha do estudante (frequência, notas e trabalhos)
        if (podeAbrirTurma && typeof abrirEstudanteDetalhe === 'function') {
            estudantes.forEach(e => {
                const t = turmaPorId[String(e.id_turma)];
                if (!t || !e.nome_completo) return;
                const situacao = e.status && e.status !== 'Ativo' ? ' · ' + e.status : '';
                itens.push({ grupo: 'Estudantes', soComBusca: true, rotulo: e.nome_completo, extra: nomeDaTurma(t) + situacao, icone: ico('estudante'),
                    fazer: async () => { await abrirTurma(t.id); abrirEstudanteDetalhe(e.id); } });
            });
        }

        // Trabalhos: abre a turma na aba Trabalhos
        if (podeAbrirTurma && typeof showTurmaTab === 'function') {
            listaDe('trabalhos').forEach(tr => {
                const t = turmaPorId[String(tr.id_turma)];
                if (!t || !tr.titulo) return;
                itens.push({ grupo: 'Trabalhos', soComBusca: true, rotulo: tr.titulo,
                    extra: nomeDaTurma(t) + (tr.bimestre ? ' · ' + tr.bimestre + 'º bim.' : ''), icone: ico('trabalhos'),
                    fazer: async () => { await abrirTurma(t.id); showTurmaTab('trabalhos'); } });
            });
        }

        // Tutorados: abre a ficha de tutoria
        if (typeof abrirFichaTutorado === 'function') {
            listaDe('tutorados').forEach(tu => {
                if (!tu.nome_estudante) return;
                itens.push({ grupo: 'Tutorados', soComBusca: true, rotulo: tu.nome_estudante, extra: tu.turma || '', icone: ico('tutoria'),
                    fazer: () => abrirFichaTutorado(tu.id) });
            });
        }

        // Ações
        const modo = typeof currentViewMode !== 'undefined' ? currentViewMode : null;
        const acao = (rotulo, icone, fn) => { if (typeof fn === 'function') itens.push({ grupo: 'Ações', rotulo, icone: ico(icone), fazer: fn }); };
        if (!modo || modo === 'professor') acao('Nova turma', 'turmas', window.abrirModalNovaTurma);
        acao('Estagiário (gerar documento)', 'estagiario', window.abrirModalGerarDocumentoIA);
        acao('Meu perfil e tema', 'perfil', window.abrirModalPerfil);
        acao('Baixar minha cópia de segurança', 'baixar', window.exportarArquivoProfsis);
        acao('Importar dados do arquivo', 'importar', window.abrirSeletorArquivoProfsis);
        acao('Histórico de backups na nuvem', 'nuvem', window.listarBackupsNuvem);
        acao('Central de Resgate (perdi dados)', 'seguranca', window.abrirCentralResgate);
        return itens;
    }

    function abrirPaleta() {
        const app = $('#appContainer');
        if (!app || app.style.display === 'none') return;
        fecharFolhaMais();
        if (paleta) { $('input', paleta).focus(); return; }
        itensPaleta = coletarItens();
        paleta = document.createElement('div');
        paleta.className = 'ux-paleta-fundo';
        paleta.innerHTML =
            '<div class="ux-paleta" role="dialog" aria-modal="true" aria-label="Busca rápida">' +
            '<label class="ux-paleta-campo">' + ico('busca') +
            '<input type="text" id="uxPaletaBusca" placeholder="Buscar estudante, turma, trabalho, tela ou função…" autocomplete="off" spellcheck="false">' +
            '<kbd>Esc</kbd></label>' +
            '<div class="ux-paleta-lista" role="listbox"></div>' +
            '<div class="ux-paleta-dica"><span><kbd>↑</kbd><kbd>↓</kbd> escolher</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Ctrl</kbd><kbd>K</kbd> de qualquer tela</span></div>' +
            '</div>';
        paleta.addEventListener('click', (e) => { if (e.target === paleta) fecharPaleta(); });
        document.body.appendChild(paleta);
        const campo = $('input', paleta);
        campo.addEventListener('input', () => { selecionado = 0; desenharLista(campo.value); });
        campo.addEventListener('keydown', teclaPaleta);
        desenharLista('');
        campo.focus();
    }

    function filtrar(q) {
        const busca = semAcento(q).trim();
        if (!busca) return itensPaleta.filter(it => !it.soComBusca);
        const partes = busca.split(/\s+/);
        const achados = itensPaleta.filter(it => {
            const alvo = semAcento(it.rotulo + ' ' + (it.extra || '') + ' ' + it.grupo + ' ' + (it.busca || ''));
            return partes.every(p => alvo.indexOf(p) !== -1);
        });
        // Grupos grandes mostram só os primeiros; o resto aparece refinando a busca
        const contagem = {};
        const saida = [];
        achados.forEach(it => {
            const lim = LIMITE_POR_GRUPO[it.grupo];
            contagem[it.grupo] = (contagem[it.grupo] || 0) + 1;
            if (!lim || contagem[it.grupo] <= lim) saida.push(it);
        });
        Object.keys(LIMITE_POR_GRUPO).forEach(g => {
            const sobra = (contagem[g] || 0) - LIMITE_POR_GRUPO[g];
            if (sobra > 0) {
                const ult = saida.map(x => x.grupo).lastIndexOf(g);
                saida.splice(ult + 1, 0, { grupo: g, rotulo: 'e mais ' + sobra + ' — continue digitando para refinar', aviso: true, icone: '', fazer: () => {} });
            }
        });
        return saida;
    }

    function desenharLista(q) {
        const lista = $('.ux-paleta-lista', paleta);
        const achados = filtrar(q);
        if (!achados.length) {
            lista.innerHTML = '<div class="ux-paleta-vazio">Nada encontrado para “' + q.replace(/[<>&]/g, '') + '”.</div>';
            return;
        }
        let html = '', grupo = null;
        achados.forEach((it, i) => {
            if (it.grupo !== grupo) { grupo = it.grupo; html += '<div class="ux-paleta-grupo">' + grupo + '</div>'; }
            if (it.aviso) { html += '<div class="ux-paleta-mais" data-i="' + i + '"></div>'; return; }
            html += '<button type="button" role="option" class="ux-paleta-item' + (i === selecionado ? ' sel' : '') + '" data-i="' + i + '">' +
                '<span class="ux-paleta-ico">' + it.icone + '</span><span class="ux-paleta-rot"></span>' +
                (it.extra ? '<span class="ux-paleta-extra"></span>' : '') + '</button>';
        });
        lista.innerHTML = html;
        $$('.ux-paleta-mais', lista).forEach(d => { d.textContent = achados[+d.dataset.i].rotulo; });
        $$('.ux-paleta-item', lista).forEach(btn => {
            const it = achados[+btn.dataset.i];
            $('.ux-paleta-rot', btn).textContent = it.rotulo;
            const ex = $('.ux-paleta-extra', btn);
            if (ex) ex.textContent = it.extra;
            btn.addEventListener('click', () => executar(it));
            btn.addEventListener('mousemove', () => { if (selecionado !== +btn.dataset.i) { selecionado = +btn.dataset.i; marcarSelecionado(); } });
        });
        lista._achados = achados;
    }

    function marcarSelecionado() {
        const lista = $('.ux-paleta-lista', paleta);
        $$('.ux-paleta-item', lista).forEach(b => b.classList.toggle('sel', +b.dataset.i === selecionado));
        const sel = $('.ux-paleta-item.sel', lista);
        if (sel) sel.scrollIntoView({ block: 'nearest' });
    }

    function teclaPaleta(e) {
        const lista = $('.ux-paleta-lista', paleta);
        const achados = lista._achados || [];
        const passo = (d) => {
            let i = selecionado + d;
            while (i >= 0 && i < achados.length && achados[i].aviso) i += d;
            if (i >= 0 && i < achados.length) selecionado = i;
            marcarSelecionado();
        };
        if (e.key === 'ArrowDown') { e.preventDefault(); passo(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); passo(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); if (achados[selecionado]) executar(achados[selecionado]); }
        else if (e.key === 'Escape') { e.preventDefault(); fecharPaleta(); }
    }

    function executar(it) {
        if (it.aviso) return;
        fecharPaleta();
        try {
            Promise.resolve(it.fazer()).catch(err => console.warn('[SisProf] Busca rápida:', err));
        } catch (err) { console.warn('[SisProf] Busca rápida:', err); }
    }

    function fecharPaleta() {
        if (paleta) { paleta.remove(); paleta = null; }
    }

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
            const app = $('#appContainer');
            if (!app || app.style.display === 'none') return;
            e.preventDefault();
            paleta ? fecharPaleta() : abrirPaleta();
        } else if (e.key === 'Escape') {
            if ($('.ux-folha-fundo')) fecharFolhaMais();
        }
    });

    // ------------------------------------------------ 4. tela atual no topo
    function atualizarTitulo() {
        const alvo = $('#uxTelaAtual');
        if (!alvo) return;
        const tela = $('#appContainer .screen.active');
        if (!tela) { alvo.textContent = ''; return; }
        let nome = null;
        const b = botoesDoMenu().find(x => telaDoBotao(x) === tela.id);
        if (b) nome = rotuloDoBotao(b);
        if (tela.id === 'turmaDetalhe') {
            const t = $('#turmaDetalheTitulo');
            nome = 'Turmas › ' + (t ? t.textContent.trim() : 'Turma');
        } else if (!nome) nome = NOMES_TELA[tela.id] || '';
        alvo.textContent = nome;
        marcarMais();
        marcarAbaDaTurma();
    }

    // O showScreen desmarca todos os botões de <nav>, inclusive a aba da turma que acabou de
    // ser marcada. Quando nenhuma aba está marcada, marca a que está visível (só aparência).
    function marcarAbaDaTurma() {
        const barra = $('#turmaDetalhe nav');
        if (!barra) return;
        const abas = $$('.turma-nav-btn', barra);
        if (!abas.length || abas.some(b => b.classList.contains('active'))) return;
        const visivel = abas.find(b => {
            const m = (b.getAttribute('onclick') || '').match(/showTurmaTab\('(\w+)'/);
            if (!m) return false;
            const el = document.getElementById('tab' + m[1].charAt(0).toUpperCase() + m[1].slice(1));
            return el && el.style.display !== 'none';
        });
        if (visivel) visivel.classList.add('active');
    }

    function montarTopo() {
        const sub = $('#painelSubtitle');
        if (!sub || $('#uxTelaAtual')) return;
        const linha = document.createElement('div');
        linha.className = 'ux-trilha';
        linha.innerHTML = '<span id="uxTelaAtual"></span>';
        sub.parentNode.insertBefore(linha, sub.nextSibling);

        const area = $('#headerUserArea');
        if (area && !$('#uxBotaoBuscar')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'uxBotaoBuscar';
            btn.className = 'btn btn-sm btn-secondary ux-buscar';
            btn.title = 'Busca rápida (Ctrl+K)';
            btn.innerHTML = ico('busca') + '<span>Buscar</span><kbd>Ctrl K</kbd>';
            btn.addEventListener('click', abrirPaleta);
            const dataHoje = $('#currentDate', area);
            area.insertBefore(btn, dataHoje ? dataHoje.nextSibling : area.firstChild);
        }
    }

    // ------------------------------------------------ 6. Início: boas-vindas e atalhos
    // Só lê o nome já carregado e chama funções que já existem (busca rápida e Estagiário).
    function saudacao() {
        const h = new Date().getHours();
        return h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
    }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    function montarInicio() {
        const dash = $('#dashboard');
        if (!dash || !dash.children.length || $(':scope > .ux-inicio', dash)) return;
        const usuario = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
        const primeiroNome = usuario && usuario.nome ? String(usuario.nome).trim().split(/\s+/)[0] : '';
        const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

        const secao = document.createElement('section');
        secao.className = 'ux-inicio';
        const acoes = [];
        acoes.push('<button type="button" class="ux-chip ux-chip-acao" data-acao="buscar">' + ico('busca') + '<span>Buscar</span><kbd>Ctrl K</kbd></button>');
        if (typeof window.abrirModalGerarDocumentoIA === 'function') acoes.push('<button type="button" class="ux-chip ux-chip-acao" data-acao="estagiario">' + ico('estagiario') + '<span>Estagiário</span></button>');

        secao.innerHTML =
            '<div class="ux-inicio-ola"><h2>' + saudacao() + (primeiroNome ? ', ' + esc(primeiroNome) : '') + '</h2>' +
            '<p>' + esc(hoje.charAt(0).toUpperCase() + hoje.slice(1)) + '</p></div>' +
            '<div class="ux-inicio-bloco"><span class="ux-inicio-rotulo">Atalhos</span><div class="ux-inicio-chips">' + acoes.join('') + '</div></div>';

        secao.addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            try {
                if (b.dataset.acao === 'buscar') abrirPaleta();
                else if (b.dataset.acao === 'estagiario') window.abrirModalGerarDocumentoIA();
            } catch (err) { console.warn('[SisProf] Atalho do início:', err); }
        });
        dash.insertBefore(secao, dash.firstChild);
    }

    // ------------------------------------------------ 7. Minhas turmas: o cartão inteiro abre a turma
    document.addEventListener('click', (e) => {
        const card = e.target.closest && e.target.closest('#listaTurmas > .card');
        if (!card || e.target.closest('button, a, input, select, textarea, h3[onclick]')) return;
        const titulo = card.querySelector('h3[onclick]');
        if (titulo) titulo.click();
    });

    // ------------------------------------------------ 5. menu recolhido
    function alternarRecolhido() {
        const r = document.documentElement.classList.toggle('nav-recolhido');
        guardar('sisprof_nav_recolhido', r ? '1' : '0');
        esconderDica();
        atualizarBotaoRecolher();
    }

    function atualizarBotaoRecolher() {
        const b = $('#appContainer .nav-recolher');
        if (!b) return;
        const r = document.documentElement.classList.contains('nav-recolhido');
        const txt = r ? 'Abrir o menu' : 'Recolher o menu';
        b.setAttribute('aria-label', txt);
        b.title = txt;
        b.setAttribute('aria-expanded', r ? 'false' : 'true');
    }

    // Menu recolhido: o nome aparece ao lado do ícone ao passar o mouse (ou ao focar pelo teclado)
    let dica = null;
    function mostrarDica(b) {
        if (!document.documentElement.classList.contains('nav-recolhido')) return;
        if (!window.matchMedia('(min-width: 1024px)').matches) return;
        const texto = b.classList.contains('nav-acao') ? (b.querySelector('span') || b).textContent.trim() : rotuloDoBotao(b);
        if (!texto) return;
        if (!dica) {
            dica = document.createElement('div');
            dica.className = 'ux-dica';
            dica.setAttribute('role', 'tooltip');
            document.body.appendChild(dica);
        }
        dica.textContent = texto;
        const r = b.getBoundingClientRect();
        dica.style.top = (r.top + r.height / 2) + 'px';
        dica.style.left = (r.right + 12) + 'px';
        dica.classList.add('visivel');
    }
    function esconderDica() { if (dica) dica.classList.remove('visivel'); }

    document.addEventListener('mouseover', (e) => {
        const b = e.target.closest && e.target.closest('#appContainer .app-nav > button, #appContainer .app-nav .nav-acao');
        if (b) mostrarDica(b); else esconderDica();
    });
    document.addEventListener('focusin', (e) => {
        const b = e.target.closest && e.target.closest('#appContainer .app-nav > button, #appContainer .app-nav .nav-acao');
        if (b && b.matches(':focus-visible')) mostrarDica(b); else esconderDica();
    });
    window.addEventListener('scroll', esconderDica, true);
    if (ler('sisprof_nav_recolhido') === '1') document.documentElement.classList.add('nav-recolhido');

    // ------------------------------------------------ observadores
    function iniciar() {
        montarTopo();
        organizarMenu();
        atualizarTitulo();
        const nav = navPrincipal();
        if (nav) {
            // o menu é reescrito por renderProfessorPanel/renderGestorPanel: reorganiza quando isso acontece
            new MutationObserver(() => {
                if (organizando) return;
                const precisa = botoesDoMenu().some(b => !b.hasAttribute('title')) || !$(':scope > .nav-rodape', nav);
                if (precisa && botoesDoMenu().length) organizarMenu();
                marcarMais();
            }).observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        }
        const dash = $('#dashboard');
        if (dash) new MutationObserver(() => requestAnimationFrame(montarInicio)).observe(dash, { childList: true });
        const container = $('#appContainer');
        if (container) {
            new MutationObserver(() => { requestAnimationFrame(atualizarTitulo); })
                .observe(container, { subtree: true, attributes: true, attributeFilter: ['class'] });
            const tit = $('#turmaDetalheTitulo');
            if (tit) new MutationObserver(atualizarTitulo).observe(tit, { childList: true, characterData: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();

    window.abrirBuscaRapida = abrirPaleta;
})();
