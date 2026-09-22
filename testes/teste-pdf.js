// As Ferramentas PDF (pdf_ferramentas.js + pdf_operacoes.js), a primeira funcao premium.
//
// Roda no navegador de verdade porque e' LA' que a coisa acontece: as bibliotecas de PDF
// vem de CDN, o desenho da pagina passa por <canvas> e a promessa central da funcao —
// "o arquivo nao sai do aparelho" — so' pode ser verificada vendo que nenhum pedido de
// rede sai com o conteudo do arquivo.
//
// O que este teste cobre:
//   1. o botao PDF aparece nos quatro perfis e a tela nasce sob demanda;
//   2. o catalogo lista as 48 ferramentas e a busca filtra;
//   3. o PORTAO: conta gratuita nao abre ferramenta (o convite do plano aparece);
//   4. as contas de verdade: juntar, dividir, girar, marca d'agua, numerar, N-up,
//      proteger/desbloquear, metadados e formulario;
//   5. o que so' existe no navegador: PDF -> imagem, PDF -> texto, rasterizar, .zip;
//   6. a promessa de privacidade: NENHUM pedido de rede sai para fora dos CDNs de
//      biblioteca enquanto as ferramentas rodam.
//
// Como rodar (ver testes/LEIAME.md):
//   npm i playwright
//   python3 -m http.server 8877 --bind 127.0.0.1 &
//   node testes/teste-pdf.js
//
// Precisa de internet: as bibliotecas de PDF vem de cdn.jsdelivr.net e cdnjs.cloudflare.com.
// Atras de proxy, use PROFSIS_PROXY=http://host:porta.

const { chromium } = require('playwright');

const CDNS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

// O Firebase falso: o teste nao toca no banco real e nao precisa de conta.
const FAKE = () => {
    // Espiao de saida: qualquer POST, PUT ou sendBeacon fica registrado. E' o que
    // transforma "o arquivo nao sai do aparelho" em afirmacao verificavel.
    window.__enviosDeSaida = [];
    const fetchOriginal = window.fetch;
    window.fetch = function (recurso, opcoes) {
        const metodo = ((opcoes && opcoes.method) || (recurso && recurso.method) || 'GET').toUpperCase();
        if (metodo !== 'GET' && metodo !== 'HEAD') {
            window.__enviosDeSaida.push(metodo + ' ' + String((recurso && recurso.url) || recurso));
        }
        return fetchOriginal.apply(this, arguments);
    };
    const abrirOriginal = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (metodo, url) {
        const m = String(metodo || '').toUpperCase();
        if (m !== 'GET' && m !== 'HEAD') window.__enviosDeSaida.push(m + ' ' + url);
        return abrirOriginal.apply(this, arguments);
    };
    if (navigator.sendBeacon) {
        const beaconOriginal = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = function (url) { window.__enviosDeSaida.push('BEACON ' + url); return beaconOriginal.apply(this, arguments); };
    }

    window.__docs = {};
    const ref = (col, id) => ({
        get: async () => { const d = window.__docs[col + '/' + id]; return { exists: !!d, data: () => d || null }; },
        set: async (obj) => { window.__docs[col + '/' + id] = obj; },
        delete: async () => { delete window.__docs[col + '/' + id]; }
    });
    window.firebase = {
        initializeApp: () => {}, analytics: () => {},
        // onAuthStateChanged tem de devolver a funcao que CANCELA a escuta, como o
        // Firebase de verdade: core.js chama o retorno (`unsub()`), e um fake que
        // devolvesse o id do setTimeout derrubaria a pagina com "unsub is not a function".
        auth: () => ({ currentUser: { uid: 'u1', email: 'm@e.com' },
                       onAuthStateChanged: (cb) => { setTimeout(() => cb(null), 0); return () => {}; },
                       signOut: async () => {} }),
        firestore: () => ({ collection: (col) => ({ doc: (id) => ref(col, String(id)) }) })
    };
    window.firebase.firestore.FieldValue = { serverTimestamp: () => null };
};

const falhas = [];
function ok(nome, condicao, extra) {
    console.log('  ' + (condicao ? 'ok   ' : 'FALHA') + '  ' + nome + (extra ? '  — ' + extra : ''));
    if (!condicao) falhas.push(nome);
}

(async () => {
    const opcoes = { executablePath: process.env.PROFSIS_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' };
    if (process.env.PROFSIS_PROXY) {
        // O bypass e' obrigatorio: sem ele o proprio site de teste (localhost) sairia
        // pelo proxy e voltaria 405, e nenhum script do SisProf carregaria.
        opcoes.proxy = { server: process.env.PROFSIS_PROXY, bypass: 'localhost,127.0.0.1,::1' };
    }
    const browser = await chromium.launch(opcoes);
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });

    // Os SDKs do Google ficam DE FORA. Nao e' economia de tempo: se os scripts do
    // gstatic carregarem, eles reescrevem window.firebase por cima do banco falso, o
    // teste passa a conversar com o Firestore de verdade e a medicao do item 7
    // ("nada sai do aparelho") fica impossivel de ler, afogada no trafego do Firebase
    // e do Analytics — que o index.html ja carregava muito antes desta funcao existir.
    await ctx.route(/(gstatic\.com\/firebasejs|accounts\.google\.com|googletagmanager\.com|google-analytics\.com|firebaseinstallations\.googleapis\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com)/,
                    r => r.abort());

    const page = await ctx.newPage();

    // Todo pedido de rede fica registrado: e' assim que a promessa "nada sai do
    // aparelho" deixa de ser texto de propaganda e passa a ser coisa testada.
    const pedidos = [];
    page.on('request', r => pedidos.push(r.url()));
    const avisos = [];
    page.on('dialog', async d => { avisos.push(d.message()); await d.accept(); });
    page.on('pageerror', e => { falhas.push('erro de JS na pagina: ' + e.message); console.log('  FALHA  erro de JS: ' + e.message); });

    await page.addInitScript(FAKE);
    const base = process.env.PROFSIS_URL || 'http://localhost:8877';
    await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);

    console.log('\n1. O botao PDF e a tela');
    const menus = await page.evaluate(() => {
        const r = {};
        currentUser = { id: 1, uid: 'u1', nome: 'Maria', email: 'm@e.com', role: 'professor', schoolId: '77' };
        data = Object.assign(getInitialData(), { turmas: [] });
        window.dadosCarregados = true;
        [['professor', renderProfessorPanel], ['aee', renderAeePanel], ['projeto', renderProjetoPanel]].forEach(([modo, fn]) => {
            currentViewMode = modo;
            try { fn(); } catch (e) { /* o dashboard pode reclamar de dado que nao existe */ }
            r[modo] = document.querySelector('nav').innerHTML.indexOf("showScreen('pdf'") !== -1;
        });
        currentViewMode = 'gestor';
        try { renderGestorPanel(); } catch (e) { /* idem */ }
        r.gestor = document.querySelector('nav').innerHTML.indexOf("showScreen('pdf'") !== -1;
        currentViewMode = 'professor';
        try { renderProfessorPanel(); } catch (e) {}
        r.telaAntes = !!document.getElementById('pdf');
        return r;
    });
    ok('botao no menu do professor', menus.professor);
    ok('botao no menu do AEE', menus.aee);
    ok('botao no menu do projeto', menus.projeto);
    ok('botao no menu do gestor', menus.gestor);
    ok('a tela nao existe antes de ser pedida', menus.telaAntes === false);

    console.log('\n2. O catalogo');
    const catalogo = await page.evaluate(() => {
        showScreen('pdf');
        const tela = document.getElementById('pdf');
        return {
            criada: !!tela,
            ativa: !!tela && tela.classList.contains('active'),
            totalNoCatalogo: window.CATALOGO_PDF.length,
            grupos: window.PDF_GRUPOS.length,
            botoes: tela.querySelectorAll('#pdfGrade button').length,
            temAvisoDePrivacidade: tela.innerHTML.indexOf('não sai deste aparelho') !== -1,
            // toda ferramenta tem de apontar para uma operacao que existe (ou ser interativa)
            acoesQuebradas: window.CATALOGO_PDF
                .filter(f => f.acao && !window.PDFOPS.ops[f.acao]).map(f => f.id),
            extrasQuebrados: window.CATALOGO_PDF
                .filter(f => f.extra && !window.PDF_EXTRAS[f.extra]).map(f => f.id),
            semAcaoNemExtra: window.CATALOGO_PDF.filter(f => !f.acao && !f.extra).map(f => f.id),
            idsRepetidos: window.CATALOGO_PDF.map(f => f.id)
                .filter((id, i, t) => t.indexOf(id) !== i),
            gruposInvalidos: window.CATALOGO_PDF
                .filter(f => !window.PDF_GRUPOS.some(g => g.id === f.grupo)).map(f => f.id)
        };
    });
    ok('a tela foi criada e ficou ativa', catalogo.criada && catalogo.ativa);
    ok('48 ferramentas no catalogo', catalogo.totalNoCatalogo === 48, String(catalogo.totalNoCatalogo));
    ok('8 grupos', catalogo.grupos === 8);
    ok('todas as ferramentas aparecem na grade', catalogo.botoes === 48, catalogo.botoes + ' botoes');
    ok('a tela avisa que o arquivo nao sai do aparelho', catalogo.temAvisoDePrivacidade);
    ok('nenhuma ferramenta aponta para operacao que nao existe', !catalogo.acoesQuebradas.length, catalogo.acoesQuebradas.join(', '));
    ok('nenhuma ferramenta aponta para extra que nao existe', !catalogo.extrasQuebrados.length, catalogo.extrasQuebrados.join(', '));
    ok('nenhuma ferramenta ficou sem acao e sem extra', !catalogo.semAcaoNemExtra.length, catalogo.semAcaoNemExtra.join(', '));
    ok('nenhum id repetido', !catalogo.idsRepetidos.length, catalogo.idsRepetidos.join(', '));
    ok('nenhum grupo invalido', !catalogo.gruposInvalidos.length, catalogo.gruposInvalidos.join(', '));

    const busca = await page.evaluate(() => {
        pdfBuscar('senha');   // sem acento e com acento tem de achar o mesmo
        const comSenha = document.querySelectorAll('#pdfGrade button').length;
        pdfBuscar('MARCA DÁGUA');
        const comAcento = document.getElementById('pdfGrade').innerHTML.indexOf("marca d'água") !== -1 ||
                          document.getElementById('pdfGrade').innerHTML.indexOf('água') !== -1;
        pdfBuscar('xyzinexistente');
        const vazio = document.getElementById('pdfGrade').innerHTML.indexOf('Nenhuma ferramenta') !== -1;
        pdfLimparBusca();
        return { comSenha: comSenha, comAcento: comAcento, vazio: vazio,
                 voltouTudo: document.querySelectorAll('#pdfGrade button').length };
    });
    ok('a busca filtra ("senha")', busca.comSenha > 0 && busca.comSenha < 48, busca.comSenha + ' resultados');
    ok('a busca ignora acento', busca.comAcento);
    ok('busca sem resultado explica', busca.vazio);
    ok('limpar a busca devolve o catalogo', busca.voltouTudo === 48);

    console.log('\n3. O portao do plano Professor');
    const portao = await page.evaluate(async () => {
        const r = {};
        // Conta gratuita: assinatura.js devolve plano 'free'.
        r.premiumAntes = ehPremium();
        abrirFerramentaPdf('juntar');
        r.abriuSemAssinar = pdfFerramentaAberta === 'juntar';
        // O convite do plano e' montado depois de LER a assinatura (abrirModalApoie e'
        // assincrona). Esperar e' parte do teste: e' o que o professor ve de fato.
        for (let i = 0; i < 40 && !(document.getElementById('conteudoModalApoie') || {}).innerHTML; i++) {
            await new Promise(ok => setTimeout(ok, 50));
        }
        r.convidouAAssinar = !!document.getElementById('modalApoie') &&
                             document.getElementById('modalApoie').innerHTML.indexOf('plano Professor') !== -1;
        closeModal('modalApoie');
        // Agora com direito (o super admin tem plano Professor, por regra de assinatura.js).
        currentUser.role = 'super_admin';
        r.premiumDepois = ehPremium();
        abrirFerramentaPdf('juntar');
        r.abriuAssinando = pdfFerramentaAberta === 'juntar';
        r.formularioMontado = !!document.querySelector('#pdfPainelForm input[type=file]');
        r.temBotaoExecutar = !!document.getElementById('pdfBotaoExecutar');
        fecharFerramentaPdf();
        r.voltouAoCatalogo = pdfFerramentaAberta === null;
        return r;
    });
    ok('conta gratuita nao e premium', portao.premiumAntes === false);
    ok('conta gratuita NAO abre a ferramenta', portao.abriuSemAssinar === false);
    ok('conta gratuita recebe o convite do plano', portao.convidouAAssinar);
    ok('conta com direito e premium', portao.premiumDepois === true);
    ok('conta com direito abre a ferramenta', portao.abriuAssinando);
    ok('o formulario e montado a partir do catalogo', portao.formularioMontado);
    ok('a ferramenta tem botao de executar', portao.temBotaoExecutar);
    ok('fechar volta ao catalogo', portao.voltouAoCatalogo);

    console.log('\n4. Todas as ferramentas abrem sem erro');
    const abertura = await page.evaluate(async () => {
        const problemas = [];
        for (const f of window.CATALOGO_PDF) {
            try {
                abrirFerramentaPdf(f.id);
                if (pdfFerramentaAberta !== f.id) problemas.push(f.id + ' (nao abriu)');
                if (!document.getElementById('pdfPainelForm')) problemas.push(f.id + ' (sem formulario)');
            } catch (e) {
                problemas.push(f.id + ': ' + e.message);
            }
        }
        fecharFerramentaPdf();
        return problemas;
    });
    ok('as 48 ferramentas montam a tela sem erro', !abertura.length, abertura.join(' | '));

    // Aquecimento: baixa as bibliotecas ANTES de medir qualquer coisa. Sem isto, uma
    // oscilacao de rede (comum em proxy e em Wi-Fi de escola) apareceria como se a
    // ferramenta estivesse quebrada, e o teste morreria com um erro que nao e' dele.
    console.log('\nBaixando as bibliotecas de PDF (CDN)...');
    const aquecimento = await page.evaluate(async () => {
        const erros = [];
        for (const nome of ['pdfLib', 'pdfJs', 'jsZip', 'qr']) {
            let ultimo = null;
            for (let tentativa = 0; tentativa < 3; tentativa++) {
                try { await window.PDFOPS.lib[nome](); ultimo = null; break; }
                catch (e) { ultimo = e.message; }
            }
            if (ultimo) erros.push(nome + ' — ' + ultimo);
        }
        return erros;
    });
    if (aquecimento.length) {
        console.log('\n⚠️  Nao consegui baixar as bibliotecas de PDF:\n  - ' + aquecimento.join('\n  - '));
        console.log('\nEste teste precisa de internet (cdn.jsdelivr.net e cdnjs.cloudflare.com).' +
                    '\nAtras de proxy, rode com PROFSIS_PROXY=http://host:porta.');
        await browser.close();
        process.exit(2);
    }
    console.log('  ok    bibliotecas carregadas');

    console.log('\n5. As contas (pdf-lib de verdade, no navegador)');
    // Daqui para frente e' so' trabalho das ferramentas: o que aparecer na rede agora
    // foi causado por elas.
    const antesDasFerramentas = pedidos.length;
    await page.evaluate(() => { window.__enviosDeSaida = []; });
    const contas = await page.evaluate(async () => {
        const { ops, util } = window.PDFOPS;
        const PDFLib = await window.PDFOPS.lib.pdfLib();
        const r = {};

        const fazerPdf = async (n, texto) => {
            const d = await PDFLib.PDFDocument.create();
            const f = await d.embedFont(PDFLib.StandardFonts.Helvetica);
            for (let i = 0; i < n; i++) {
                const p = d.addPage([595.28, 841.89]);
                p.drawText((texto || 'Pagina') + ' ' + (i + 1) + ' — avaliação do órgão', { x: 50, y: 700, size: 14, font: f });
            }
            d.setTitle('Ata da reuniao'); d.setAuthor('Maria Souza');
            return { nome: 'ata.pdf', bytes: await d.save() };
        };
        const contar = async (bytes, senha) => {
            const d = await PDFLib.PDFDocument.load(bytes, senha ? { password: senha } : {});
            return d.getPageCount();
        };

        const a = await fazerPdf(5, 'A');
        const b = await fazerPdf(3, 'B');

        r.juntar = await contar((await ops.juntar({ arquivos: [a, b] })).arquivos[0].bytes);
        r.dividir = (await ops.dividir({ arquivo: a, modo: 'cada', cada: 2 })).arquivos.length;
        r.remover = await contar((await ops.removerPaginas({ arquivo: a, paginas: '2,4' })).arquivos[0].bytes);
        r.extrair = await contar((await ops.extrairPaginas({ arquivo: a, paginas: '1,3,5' })).arquivos[0].bytes);
        r.reorganizar = await contar((await ops.reorganizar({ arquivo: a, ordem: '5,4,3,2,1' })).arquivos[0].bytes);
        const girado = await ops.rotacionar({ arquivo: a, paginas: 'todas', graus: 90 });
        r.giro = (await PDFLib.PDFDocument.load(girado.arquivos[0].bytes)).getPage(0).getRotation().angle;
        r.nup = await contar((await ops.paginasPorFolha({ arquivo: a, porFolha: 4 })).arquivos[0].bytes);
        r.aoMeio = await contar((await ops.cortarAoMeio({ arquivo: a })).arquivos[0].bytes);
        r.marcaDagua = (await ops.marcaDagua({ arquivo: a, tipo: 'texto', texto: 'CÓPIA — não vale', paginas: 'todas' })).arquivos.length;
        r.numeros = (await ops.numerosPagina({ arquivo: a, formato: 'Página {n} de {total}', paginas: '2-' })).mensagem;
        r.marcadores = (await ops.marcadores({ arquivo: a, marcadores: 'Início | 1\nFim | 5' })).arquivos.length;
        r.pdfa = (await ops.paraPdfA({ arquivo: a, conformidade: '3B' })).arquivos.length;

        // Senha: cifra, recusa sem senha, abre com senha, e o desbloqueio devolve PDF aberto.
        const protegido = (await ops.proteger({ arquivo: a, senha: 'escola2026' })).arquivos[0].bytes;
        try { await PDFLib.PDFDocument.load(protegido); r.recusouSemSenha = false; }
        catch (e) { r.recusouSemSenha = true; }
        r.abriuComSenha = await contar(protegido, 'escola2026');
        const aberto = (await ops.desbloquear({ arquivo: { nome: 'p.pdf', bytes: protegido }, senha: 'escola2026' })).arquivos[0].bytes;
        try { r.desbloqueou = await contar(aberto); } catch (e) { r.desbloqueou = 'AINDA CIFRADO'; }
        try { await ops.desbloquear({ arquivo: { nome: 'p.pdf', bytes: protegido }, senha: 'chutei' }); r.senhaErrada = 'passou'; }
        catch (e) { r.senhaErrada = e.message; }

        // Metadados: entram e saem.
        const comInfo = (await ops.infoDocumento({ arquivo: a, titulo: 'Anexo III', autor: 'Escola' })).arquivos[0].bytes;
        const lido = await window.PDFOPS.inspecionar.infoDocumento({ nome: 'x.pdf', bytes: comInfo });
        r.infoGravada = lido.titulo + ' / ' + lido.autor;
        const limpo = (await ops.removerMetadados({ arquivo: { nome: 'x.pdf', bytes: comInfo } })).arquivos[0].bytes;
        const lido2 = await window.PDFOPS.inspecionar.infoDocumento({ nome: 'x.pdf', bytes: limpo });
        r.infoApagada = !lido2.titulo && !lido2.autor;

        // Formulario: le, preenche, achata.
        const doc = await PDFLib.PDFDocument.create();
        const pg = doc.addPage([400, 300]);
        const form = doc.getForm();
        form.createTextField('nome').addToPage(pg, { x: 20, y: 200, width: 300, height: 24 });
        form.createCheckBox('presente').addToPage(pg, { x: 20, y: 160, width: 16, height: 16 });
        const ficha = { nome: 'ficha.pdf', bytes: await doc.save() };
        r.campos = (await window.PDFOPS.inspecionar.camposFormulario(ficha)).length;
        const cheia = (await ops.preencher({ arquivo: ficha, valores: { nome: 'João', presente: true } })).arquivos[0].bytes;
        const depois = await window.PDFOPS.inspecionar.camposFormulario({ nome: 'f.pdf', bytes: cheia });
        r.valorGravado = (depois.find(c => c.nome === 'nome') || {}).valor;
        const achatada = (await ops.preencher({ arquivo: ficha, valores: { nome: 'Ana' }, achatar: true })).arquivos[0].bytes;
        r.achatadaSemCampos = (await window.PDFOPS.inspecionar.camposFormulario({ nome: 'f.pdf', bytes: achatada })).length;

        // Erro tratado: mensagem em portugues, nao "stack trace".
        try { await ops.juntar({ arquivos: [a] }); r.erroJuntar = 'passou'; } catch (e) { r.erroJuntar = e.message; }
        try { await ops.removerPaginas({ arquivo: a, paginas: 'todas' }); r.erroRemover = 'passou'; } catch (e) { r.erroRemover = e.message; }
        try { await ops.rotacionar({ arquivo: { nome: 'c.pdf', bytes: protegido }, paginas: '1', graus: 90 }); r.erroCifrado = 'passou'; }
        catch (e) { r.erroCifrado = e.message; }

        r.faixas = [
            JSON.stringify(util.faixaParaIndices('1-3,5', 10)),
            JSON.stringify(util.faixaParaIndices('2-ultima', 4)),
            JSON.stringify(util.faixaParaIndices('pares', 5))
        ].join(' ');
        return r;
    });
    ok('juntar 5+3 = 8 paginas', contas.juntar === 8, String(contas.juntar));
    ok('dividir de 2 em 2 = 3 arquivos', contas.dividir === 3, String(contas.dividir));
    ok('remover 2 paginas sobra 3', contas.remover === 3, String(contas.remover));
    ok('extrair 3 paginas', contas.extrair === 3);
    ok('reorganizar mantem 5', contas.reorganizar === 5);
    ok('girar 90 graus', contas.giro === 90, String(contas.giro));
    ok('4 por folha: 5 paginas -> 2 folhas', contas.nup === 2, String(contas.nup));
    ok('cortar ao meio dobra as paginas', contas.aoMeio === 10, String(contas.aoMeio));
    ok("marca d'agua com acento nao derruba o save", contas.marcaDagua === 1);
    ok('numerar so da 2 em diante', /4 pagina/.test(contas.numeros), contas.numeros);
    ok('marcadores', contas.marcadores === 1);
    ok('PDF/A', contas.pdfa === 1);
    ok('protegido recusa abrir sem senha', contas.recusouSemSenha === true);
    ok('protegido abre COM a senha', contas.abriuComSenha === 5);
    ok('desbloquear devolve PDF sem cifra', contas.desbloqueou === 5, String(contas.desbloqueou));
    ok('senha errada explica em portugues', /senha/i.test(contas.senhaErrada), contas.senhaErrada);
    ok('metadados gravados', contas.infoGravada === 'Anexo III / Escola', contas.infoGravada);
    ok('metadados apagados', contas.infoApagada === true);
    ok('le 2 campos do formulario', contas.campos === 2);
    ok('valor gravado no campo', contas.valorGravado === 'João', String(contas.valorGravado));
    ok('achatar remove os campos', contas.achatadaSemCampos === 0);
    ok('juntar com 1 arquivo explica', /pelo menos DOIS/.test(contas.erroJuntar), contas.erroJuntar);
    ok('remover todas e recusado', /TODAS/.test(contas.erroRemover), contas.erroRemover);
    ok('arquivo cifrado manda desbloquear primeiro', /Desbloquear/.test(contas.erroCifrado), contas.erroCifrado);
    ok('faixas de pagina', contas.faixas === '[0,1,2,4] [1,2,3] [1,3]', contas.faixas);

    console.log('\n6. O que so existe no navegador (canvas, pdf.js, zip)');
    const navegador = await page.evaluate(async () => {
        const { ops } = window.PDFOPS;
        const PDFLib = await window.PDFOPS.lib.pdfLib();
        const r = {};
        const d = await PDFLib.PDFDocument.create();
        const f = await d.embedFont(PDFLib.StandardFonts.Helvetica);
        for (let i = 0; i < 2; i++) {
            d.addPage([595.28, 841.89]).drawText('Conteudo secreto da pagina ' + (i + 1), { x: 50, y: 700, size: 16, font: f });
        }
        const a = { nome: 'doc.pdf', bytes: await d.save() };

        const imagens = await ops.pdfParaImagens({ arquivo: a, paginas: 'todas', formato: 'png', dpi: 72 });
        r.imagens = imagens.arquivos.length;
        r.imagemTemBytes = imagens.arquivos[0].blob.size > 500;

        const texto = await ops.pdfParaTexto({ arquivo: a, paginas: 'todas' });
        r.texto = new TextDecoder().decode(texto.arquivos[0].bytes);

        const html = await ops.pdfParaHtml({ arquivo: a });
        r.html = new TextDecoder().decode(html.arquivos[0].bytes).indexOf('Conteudo secreto') !== -1;

        const word = await ops.pdfParaWord({ arquivo: a });
        r.docx = word.arquivos[0].nome + ' ' + (word.arquivos[0].bytes.length > 400);

        const rast = await ops.rasterizar({ arquivo: a, dpi: 72, formato: 'jpg' });
        const rastDoc = await PDFLib.PDFDocument.load(rast.arquivos[0].bytes);
        r.rasterizado = rastDoc.getPageCount();
        // Rasterizar tem de MATAR o texto: e' isso que faz "Censurar" ser censura.
        const textoDepois = await ops.pdfParaTexto({ arquivo: { nome: 'r.pdf', bytes: rast.arquivos[0].bytes } });
        r.textoSumiu = new TextDecoder().decode(textoDepois.arquivos[0].bytes).indexOf('secreto') === -1;

        // Censurar pelo TEXTO: acha a palavra e apaga de verdade.
        const cens = await ops.censurar({ arquivo: a, termos: 'secreto', dpi: 100 });
        const censTexto = await ops.pdfParaTexto({ arquivo: { nome: 'c.pdf', bytes: cens.arquivos[0].bytes } });
        r.censurou = new TextDecoder().decode(censTexto.arquivos[0].bytes).indexOf('secreto') === -1;
        r.censuraMensagem = cens.mensagem;

        const img = await ops.imagensParaPdf({ imagens: [{ nome: 'p.png', bytes: await window.PDFOPS.util.blobParaBytes(imagens.arquivos[0].blob) }] });
        r.imagensParaPdf = (await PDFLib.PDFDocument.load(img.arquivos[0].bytes)).getPageCount();

        const senhas = ops.gerarSenha({ comprimento: 24, quantidade: 4, simbolos: true });
        r.senhas = senhas.senhas.length + '/' + senhas.senhas[0].length + '/' + new Set(senhas.senhas).size;

        const qr = await ops.qrCode({ texto: 'https://rafanunesran.github.io/ProfSis3/', tambemPdf: true });
        r.qr = qr.arquivos.length;

        const cmp = await ops.comparar({ arquivo: a, arquivo2: { nome: 'b.pdf', bytes: (await (async () => {
            const d2 = await PDFLib.PDFDocument.load(a.bytes);
            d2.getPages()[0].drawText('acrescentado depois', { x: 50, y: 600, size: 12 });
            return d2.save();
        })()) } });
        r.comparou = cmp.relatorio.diferentes;

        // Censurar so' a pagina marcada: as outras voltam INTEIRAS, com o texto. Sem isso
        // uma censura de uma linha custaria a camada de texto do documento todo.
        const d3 = await PDFLib.PDFDocument.create();
        const f3 = await d3.embedFont(PDFLib.StandardFonts.Helvetica);
        ['primeira limpa', 'segunda com segredo', 'terceira limpa'].forEach(t => {
            d3.addPage([595.28, 841.89]).drawText(t, { x: 60, y: 700, size: 18, font: f3 });
        });
        const tres = { nome: 'tres.pdf', bytes: await d3.save() };
        const parcial = await ops.censurar({ arquivo: tres, termos: 'segredo', dpi: 100 });
        const docParcial = await PDFLib.PDFDocument.load(parcial.arquivos[0].bytes);
        r.parcialPaginas = docParcial.getPageCount();
        const textoParcial = new TextDecoder().decode(
            (await ops.pdfParaTexto({ arquivo: { nome: 'p.pdf', bytes: parcial.arquivos[0].bytes } })).arquivos[0].bytes);
        r.parcialGuardouLimpas = textoParcial.indexOf('primeira limpa') !== -1 &&
                                 textoParcial.indexOf('terceira limpa') !== -1;
        r.parcialApagouMarcada = textoParcial.indexOf('segredo') === -1;
        r.parcialMensagem = parcial.mensagem;

        // O .zip que a tela oferece quando sai mais de um arquivo.
        const JSZip = await window.PDFOPS.lib.jsZip();
        const zip = new JSZip();
        imagens.arquivos.forEach(x => zip.file(x.nome, x.blob));
        const blob = await zip.generateAsync({ type: 'blob' });
        r.zip = blob.size > 500;
        return r;
    });
    ok('PDF -> 2 imagens', navegador.imagens === 2, String(navegador.imagens));
    ok('a imagem tem conteudo', navegador.imagemTemBytes);
    ok('PDF -> texto acha o conteudo', navegador.texto.indexOf('Conteudo secreto') !== -1, JSON.stringify(navegador.texto.slice(0, 60)));
    ok('PDF -> HTML', navegador.html);
    ok('PDF -> .docx', /\.docx true/.test(navegador.docx), navegador.docx);
    ok('rasterizar mantem as paginas', navegador.rasterizado === 2);
    ok('rasterizar APAGA o texto (base da censura)', navegador.textoSumiu === true);
    ok('censurar por palavra apaga o texto do arquivo', navegador.censurou === true, navegador.censuraMensagem);
    ok('imagem -> PDF', navegador.imagensParaPdf === 1);
    ok('gerar senha (4 senhas de 24, todas diferentes)', navegador.senhas === '4/24/4', navegador.senhas);
    ok('codigo QR (PNG + PDF)', navegador.qr === 2, String(navegador.qr));
    ok('comparar acha a pagina alterada', navegador.comparou === 1, String(navegador.comparou));
    ok('.zip com varios resultados', navegador.zip === true);
    ok('censura parcial mantem as 3 paginas', navegador.parcialPaginas === 3, String(navegador.parcialPaginas));
    ok('as paginas sem tarja continuam com texto', navegador.parcialGuardouLimpas === true, navegador.parcialMensagem);
    ok('a pagina com tarja perdeu o termo', navegador.parcialApagouMarcada === true);

    console.log('\n6b. A tarja cai no lugar certo — inclusive em pagina girada');
    // O caso que quase passou batido: a pagina digitalizada de lado (/Rotate 90). A tarja
    // e' desenhada no canvas do pdf.js, e converter ponto-do-PDF -> pixel por regra de tres
    // com a largura da pagina acerta na pagina em pe e erra na girada — a tarja cai longe e
    // o nome fica a vista. Aqui a conta e' conferida OLHANDO O PIXEL: onde estava a palavra
    // censurada tem de ficar preto, e onde esta a palavra que fica tem de continuar claro.
    const tarja = await page.evaluate(async () => {
        const { ops, util } = window.PDFOPS;
        const PDFLib = await window.PDFOPS.lib.pdfLib();
        const resultado = {};

        for (const giro of [0, 90]) {
            const d = await PDFLib.PDFDocument.create();
            const fonte = await d.embedFont(PDFLib.StandardFonts.HelveticaBold);
            const p = d.addPage([595.28, 841.89]);
            p.drawText('SEGREDO', { x: 70, y: 700, size: 28, font: fonte });
            p.drawText('MANTER', { x: 70, y: 200, size: 28, font: fonte });
            if (giro) p.setRotation(PDFLib.degrees(giro));
            const original = { nome: 'girado.pdf', bytes: await d.save() };

            // Onde cada palavra esta, em pontos do PDF (o pdf.js entrega isso).
            const docJs = await util.abrirPdfJs(original);
            const pagina = await docJs.getPage(1);
            const itens = (await pagina.getTextContent()).items;
            const caixaDe = (palavra) => {
                const it = itens.find(x => (x.str || '').indexOf(palavra) !== -1);
                const alturaTexto = Math.abs(it.transform[3]) || 28;
                return { x: it.transform[4], y: it.transform[5] - alturaTexto * 0.2,
                         largura: it.width || 0, altura: alturaTexto * 1.1 };
            };
            const caixaSegredo = caixaDe('SEGREDO');
            const caixaManter = caixaDe('MANTER');

            const censurado = (await ops.censurar({ arquivo: original, termos: 'segredo', dpi: 150 })).arquivos[0].bytes;

            // A pagina censurada e' um DESENHO da original: mesmo tamanho em pixels quando
            // desenhada na mesma escala, mas ja' com a rotacao aplicada e, por isso, sem
            // /Rotate proprio. Entao quem traduz "ponto do PDF" para "pixel" aqui e' o
            // viewport da pagina ORIGINAL — exatamente o que a ferramenta usa.
            const docSaida = await util.abrirPdfJs({ nome: 'c.pdf', bytes: censurado });
            const canvas = await util.paginaParaCanvas(docSaida, 1, 150 / 72);
            const vista = pagina.getViewport({ scale: 150 / 72 });
            const ctx = canvas.getContext('2d');
            // Tom MEDIO da caixa da palavra, e nao de um pixel: no meio de uma letra o
            // pixel e' preto de qualquer jeito (a letra e' preta). Sob a tarja a caixa
            // inteira fica escura; com a letra apenas desenhada, sobra o branco do papel
            // entre os tracos e a media fica alta.
            const tomMedioDa = (caixa) => {
                const [x1, y1] = vista.convertToViewportPoint(caixa.x, caixa.y);
                const [x2, y2] = vista.convertToViewportPoint(caixa.x + caixa.largura, caixa.y + caixa.altura);
                const x = Math.max(0, Math.round(Math.min(x1, x2)));
                const y = Math.max(0, Math.round(Math.min(y1, y2)));
                const l = Math.max(1, Math.round(Math.abs(x2 - x1)));
                const a = Math.max(1, Math.round(Math.abs(y2 - y1)));
                const dados = ctx.getImageData(x, y, l, a).data;
                let soma = 0;
                for (let i = 0; i < dados.length; i += 4) soma += (dados[i] + dados[i + 1] + dados[i + 2]) / 3;
                return soma / (dados.length / 4);
            };
            resultado['giro' + giro] = { censurada: tomMedioDa(caixaSegredo), preservada: tomMedioDa(caixaManter) };
            canvas.width = canvas.height = 0;
        }
        return resultado;
    });
    [0, 90].forEach(giro => {
        const r = tarja['giro' + giro];
        ok('pagina girada ' + giro + '\u00b0: a palavra censurada ficou sob a tarja',
           r.censurada < 25, 'tom medio ' + r.censurada.toFixed(0) + ' (0 = tudo preto)');
        ok('pagina girada ' + giro + '\u00b0: a tarja NAO cobriu a outra palavra',
           r.preservada > 100, 'tom medio ' + r.preservada.toFixed(0) + ' (255 = papel branco)');
    });

    console.log('\n7. A promessa: o arquivo nao sai do aparelho');
    const origem = new URL(base);
    const paraFora = pedidos.slice(antesDasFerramentas).filter(u => {
        // blob: e data: nao sao rede — sao a memoria do proprio aparelho (e' assim que o
        // resultado e' entregue para download, justamente para nao subir nada).
        if (/^(blob|data|filesystem):/.test(u)) return false;
        try {
            const h = new URL(u).hostname;
            if (h === origem.hostname) return false;                 // o proprio site
            if (CDNS.indexOf(h) !== -1) return false;                // bibliotecas (codigo, nao dado)
            return true;
        } catch (_) { return false; }
    });
    ok('nenhum pedido de rede fora do site e dos CDNs de biblioteca', paraFora.length === 0, paraFora.slice(0, 5).join(', '));
    const envios = await page.evaluate(() => window.__enviosDeSaida || []);
    ok('nenhum POST/PUT/beacon partiu da pagina', envios.length === 0, envios.slice(0, 5).join(' | '));
    console.log('  (' + (pedidos.length - antesDasFerramentas) + ' pedidos de rede enquanto as ferramentas rodavam — ' +
                'so as bibliotecas de PDF, vindas dos CDNs)');

    await browser.close();

    console.log('\n' + (falhas.length
        ? '❌ ' + falhas.length + ' FALHA(S):\n  - ' + falhas.join('\n  - ')
        : '✅ TUDO CERTO: as Ferramentas PDF se comportam.'));
    process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e); process.exit(1); });
