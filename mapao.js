// mapao.js — Mapões da SED → boletim do estudante + situação na lista (painel da gestão).
//
// O "mapão" é o PDF "Registro e Controle do Rendimento Escolar" que a secretaria tira da SED,
// um por turma e por bimestre. Cada linha é um estudante; cada disciplina tem três colunas:
// M (menção/nota do fechamento), F (faltas) e AC (ausências compensadas). No fim vem o TOTAL
// (faltas e % de frequência). Algumas versões trazem o nome e a situação (Ativo, Transferido,
// Remanejamento...) e outras só o número de chamada (Nº).
//
// O que fazemos com ele:
//   1. lemos o PDF NO APARELHO (pdf.js, pela posição de cada palavra na página) — nada vai para
//      IA nem para outro servidor;
//   2. reconhecemos a turma pela própria lista de nomes (mesma impressão digital da importação em
//      massa, gestor.js) ou, sem nomes, pelo "Turma: 8° ANO B" do cabeçalho;
//   3. gravamos as notas em data.notasBimestraisOficiais (campo pessoal, cifrado, CAMPOS_PESSOAIS)
//      — que já aparece na ficha do estudante e na ficha de tutoria, e chega ao professor pela
//      lista publicada da escola (listaescola.js recorteDaEscola);
//   4. se a gestão quiser, a situação de cada estudante (do mapão mais recente de cada turma)
//      atualiza a lista da turma pelo MESMO caminho da importação em massa (aplicarArquivoImportMassa),
//      e com isso a chamada e todas as listas dos professores.
//
// Entrada: vários PDFs de uma vez, ou o link de uma pasta do Google Drive (lida com a conta
// Google de quem está usando, permissão só de leitura, pelo mesmo Client ID do Google Agenda).

// ---------------------------------------------------------------------------
// 1. Leitura do PDF (pura: recebe as palavras com posição, devolve o mapão)
// ---------------------------------------------------------------------------

const MAPAO_BIMESTRES = [
    { palavras: ['primeiro', '1o ', '1 bim', '1º'], bimestre: 1 },
    { palavras: ['segundo', '2o ', '2 bim', '2º'], bimestre: 2 },
    { palavras: ['terceiro', '3o ', '3 bim', '3º'], bimestre: 3 },
    { palavras: ['quarto', '4o ', '4 bim', '4º'], bimestre: 4 },
    { palavras: ['final', 'anual'], bimestre: 5 }
];

function semAcentoMapao(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function bimestreDoTextoMapao(texto) {
    const t = ' ' + semAcentoMapao(texto).toLowerCase().replace(/\s+/g, ' ') + ' ';
    const achado = MAPAO_BIMESTRES.find(b => b.palavras.some(p => t.indexOf(p) !== -1));
    return achado ? achado.bimestre : null;
}

// Valor de célula aceito: número (com vírgula ou ponto), "-", ou sigla curta (ES, ET, EP, NC...).
const MAPAO_CELULA = /^(\d{1,3}([.,]\d+)?%?|-|[A-Z]{1,3})$/;

// Junta pedaços de texto quebrados em várias linhas ("Remanejamen" + "to", "Não" + "Comparecime" + "nto").
function juntarPedacosMapao(pedacos) {
    let out = '';
    pedacos.forEach(p => {
        const s = String(p || '').trim();
        if (!s) return;
        if (!out) { out = s; return; }
        // Continuação de palavra: o pedaço novo começa em minúscula.
        if (/^[a-zà-ú]/.test(s)) out += s;
        else out += ' ' + s;
    });
    return out.replace(/\s+/g, ' ').trim();
}

// paginas: [[{ s, x, y, w }]] — x e y já em coordenadas da tela (y cresce para baixo).
function analisarItensMapao(paginas) {
    const todos = [];
    paginas.forEach((itens, p) => itens.forEach(it => {
        const s = String(it.s || '').trim();
        if (s) todos.push({ s, x: it.x, y: it.y, w: it.w || 0, cx: it.x + (it.w || 0) / 2, p });
    }));

    const textoPrimeira = todos.filter(t => t.p === 0);
    const acharCabecalho = (re) => {
        const t = textoPrimeira.find(i => re.test(semAcentoMapao(i.s)));
        return t ? t.s.replace(/^[^:]*:\s*/, '').trim() : '';
    };
    const resultado = {
        turma: acharCabecalho(/^Turma\s*:/i),
        fechamento: acharCabecalho(/^Tipo Fechamento\s*:/i),
        ano: acharCabecalho(/^Ano Letivo\s*:/i),
        escola: acharCabecalho(/^Escola\s*:/i),
        bimestre: null,
        comNomes: false,
        disciplinas: [],
        alunos: [],
        erro: ''
    };
    resultado.bimestre = bimestreDoTextoMapao(resultado.fechamento);

    // Linha de subcabeçalho: a que tem mais "M" na primeira página.
    const contagemM = {};
    textoPrimeira.filter(t => t.s === 'M').forEach(t => {
        const chave = Math.round(t.y);
        contagemM[chave] = (contagemM[chave] || 0) + 1;
    });
    const linhaM = Object.keys(contagemM).sort((a, b) => contagemM[b] - contagemM[a])[0];
    if (linhaM === undefined || contagemM[linhaM] < 2) {
        resultado.erro = 'Não parece um mapão (não achei as colunas M / F / AC).';
        return resultado;
    }
    const y0 = Number(linhaM);
    const naLinha = (t, y, tol) => Math.abs(t.y - y) <= tol;
    const sub = textoPrimeira.filter(t => naLinha(t, y0, 1.5)).sort((a, b) => a.x - b.x);

    // Grupos de disciplina: [Nº] M F AC.
    const grupos = [];
    let numeroPendente = null;
    sub.forEach(t => {
        if (t.s === 'Nº' || t.s === 'N°' || t.s === 'No') { numeroPendente = t; return; }
        if (t.s === 'M') {
            grupos.push({ n: numeroPendente, m: t, f: null, ac: null });
            numeroPendente = null;
        } else if (t.s === 'F' && grupos.length && !grupos[grupos.length - 1].f) grupos[grupos.length - 1].f = t;
        else if (t.s === 'AC' && grupos.length && !grupos[grupos.length - 1].ac) grupos[grupos.length - 1].ac = t;
    });
    const ultimoAC = grupos.length ? (grupos[grupos.length - 1].ac || grupos[grupos.length - 1].f || grupos[grupos.length - 1].m) : null;

    // Colunas do TOTAL: tudo depois do último AC, perto da linha do subcabeçalho (o texto delas
    // vem quebrado em 2–3 linhas: "Fre(" / "%)", "FT" / "An").
    const totais = [];
    if (ultimoAC) {
        textoPrimeira
            .filter(t => t.cx > ultimoAC.cx + 6 && Math.abs(t.y - y0) <= 9)
            .sort((a, b) => a.cx - b.cx)
            .forEach(t => {
                const ult = totais[totais.length - 1];
                if (ult && Math.abs(ult.cx - t.cx) < 7) ult.pedacos.push(t);
                else totais.push({ cx: t.cx, pedacos: [t] });
            });
        totais.forEach(c => {
            const txt = semAcentoMapao(c.pedacos.sort((a, b) => a.y - b.y).map(p => p.s).join('')).toUpperCase();
            c.texto = txt;
            if (/^N/.test(txt)) c.campo = 'numero';
            else if (/^TF/.test(txt)) c.campo = 'tf';
            else if (/^FTAN/.test(txt)) c.campo = 'ftan';
            else if (/^FRE.*AN/.test(txt)) c.campo = 'freqAnual';
            else if (/^FRE/.test(txt)) c.campo = 'freq';
            else c.campo = '';
        });
    }

    // Nome da disciplina: palavras acima do subcabeçalho, dentro da largura do grupo.
    // Banda curta e só palavras estreitas: as linhas do cabeçalho da folha ("Escola: ...",
    // "Tipo Fechamento: ...") ficam um pouco acima e são bem mais largas que uma coluna.
    const cabecalhoAlto = textoPrimeira.filter(t => t.y < y0 - 1 && t.y > y0 - 52);
    grupos.forEach((g, i) => {
        const ini = (g.n || g.m).x - 8;
        const fimTok = g.ac || g.f || g.m;
        const prox = grupos[i + 1];
        const fim = prox ? (prox.n || prox.m).x - 4 : fimTok.x + fimTok.w + 14;
        const dentro = cabecalhoAlto.filter(t => t.cx >= ini && t.cx <= fim && t.w <= (fim - ini) + 12 && !/:/.test(t.s));
        const codigo = dentro.find(t => /^\d{3,6}$/.test(t.s));
        const nomes = dentro.filter(t => !/^\d{3,6}$/.test(t.s)).sort((a, b) => a.y - b.y || a.x - b.x);
        g.nome = nomes.map(t => t.s).join(' ').replace(/([A-Za-zÀ-ú])- /g, '$1-').replace(/\s+/g, ' ').trim() || ('Disciplina ' + (i + 1));
        g.codigo = codigo ? codigo.s : '';
        // Código colado no nome ("ARTE 1813", "EDUCAÇAO FINANCEIRA 52000"): sai do nome.
        const colado = g.nome.match(/^(.*\D)\s*(\d{3,6})$/);
        if (colado && colado[1].trim()) { g.nome = colado[1].trim(); if (!g.codigo) g.codigo = colado[2]; }
    });
    resultado.disciplinas = grupos.map(g => ({ nome: g.nome, codigo: g.codigo }));

    // Colunas de nome e situação (só nas versões com nome).
    const tokAluno = textoPrimeira.find(t => naLinha(t, y0, 40) && /^ALUNO$/i.test(t.s) && t.y < y0);
    const tokSit = textoPrimeira.find(t => naLinha(t, y0, 40) && /^SIT/i.test(t.s) && t.y < y0);
    const inicioCelulas = grupos.length ? (grupos[0].n || grupos[0].m).x - 4 : Infinity;
    resultado.comNomes = !!tokAluno;
    const limiteNome = (tokAluno && tokSit) ? (tokAluno.cx + tokSit.cx) / 2 : (tokSit ? tokSit.x - 6 : inicioCelulas);

    // Linhas de estudante: cada célula da coluna M da primeira disciplina marca uma linha.
    const colRef = grupos[0].m;
    const linhas = [];
    for (let p = 0; p < paginas.length; p++) {
        const daPagina = todos.filter(t => t.p === p);
        // Página com subcabeçalho repetido: as linhas começam abaixo dele.
        const mPag = daPagina.filter(t => t.s === 'M');
        const yIni = (p === 0) ? y0 + 3 : (mPag.length >= 2 ? Math.max(...mPag.map(t => t.y)) + 3 : -Infinity);
        daPagina
            .filter(t => t.y > yIni && Math.abs(t.cx - colRef.cx) <= 6 && MAPAO_CELULA.test(t.s))
            .forEach(t => {
                if (!linhas.some(l => l.p === p && Math.abs(l.y - t.y) < 2)) linhas.push({ p, y: t.y });
            });
    }
    linhas.sort((a, b) => a.p - b.p || a.y - b.y);

    // Cada palavra de nome/situação vai para a linha mais próxima (os nomes quebram em 2–3 linhas
    // em volta da linha das células).
    const pedacosNome = linhas.map(() => []);
    const pedacosSit = linhas.map(() => []);
    if (resultado.comNomes) {
        todos.filter(t => t.x < inicioCelulas && !(t.p === 0 && t.y <= y0 + 3)).forEach(t => {
            let melhor = -1, dist = Infinity;
            linhas.forEach((l, i) => {
                if (l.p !== t.p) return;
                const d = Math.abs(l.y - t.y);
                if (d < dist) { dist = d; melhor = i; }
            });
            if (melhor < 0 || dist > 11) return;
            if (/^Aulas Dadas/i.test(t.s) || /^Legenda/i.test(t.s)) return;
            (t.cx < limiteNome ? pedacosNome : pedacosSit)[melhor].push(t);
        });
    }

    const colunaMaisPerto = (t) => {
        let melhor = null, dist = Infinity;
        grupos.forEach((g, gi) => {
            [['n', g.n], ['m', g.m], ['f', g.f], ['ac', g.ac]].forEach(([campo, tok]) => {
                if (!tok) return;
                const d = Math.abs(tok.cx - t.cx);
                if (d < dist) { dist = d; melhor = { gi, campo }; }
            });
        });
        totais.forEach(c => {
            const d = Math.abs(c.cx - t.cx);
            if (d < dist) { dist = d; melhor = { total: c.campo }; }
        });
        return dist <= 9 ? melhor : null;
    };

    linhas.forEach((l, i) => {
        const celulas = todos.filter(t => t.p === l.p && Math.abs(t.y - l.y) < 2 && t.x >= inicioCelulas - 2 && MAPAO_CELULA.test(t.s));
        const aluno = { numero: null, nome: '', situacao: '', notas: {}, total: {} };
        celulas.forEach(t => {
            const col = colunaMaisPerto(t);
            if (!col) return;
            if (col.total !== undefined) { if (col.total) aluno.total[col.total] = t.s; return; }
            const disc = grupos[col.gi].nome;
            if (!aluno.notas[disc]) aluno.notas[disc] = {};
            if (col.campo === 'n') { if (aluno.numero === null && /^\d+$/.test(t.s)) aluno.numero = Number(t.s); }
            else aluno.notas[disc][col.campo] = t.s;
        });
        if (aluno.numero === null && aluno.total.numero && /^\d+$/.test(aluno.total.numero)) aluno.numero = Number(aluno.total.numero);
        delete aluno.total.numero;
        aluno.nome = juntarPedacosMapao(pedacosNome[i].sort((a, b) => a.y - b.y || a.x - b.x).map(t => t.s)).toUpperCase();
        aluno.situacao = juntarPedacosMapao(pedacosSit[i].sort((a, b) => a.y - b.y || a.x - b.x).map(t => t.s));
        if (resultado.comNomes && !aluno.nome) return;
        if (!resultado.comNomes && aluno.numero === null) aluno.numero = i + 1;
        resultado.alunos.push(aluno);
    });

    if (!resultado.alunos.length) resultado.erro = 'Não achei nenhum estudante neste mapão.';
    return resultado;
}

// Lê um PDF (ArrayBuffer) com pdf.js e devolve o mapão.
async function lerPdfMapao(buffer) {
    if (typeof carregarBibliotecaBaseCurricular === 'function') await carregarBibliotecaBaseCurricular('pdf');
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const paginas = [];
    for (let n = 1; n <= pdf.numPages; n++) {
        const pagina = await pdf.getPage(n);
        const vp = pagina.getViewport({ scale: 1 });
        const conteudo = await pagina.getTextContent();
        paginas.push(conteudo.items.map(it => {
            const m = pdfjsLib.Util.transform(vp.transform, it.transform);
            return { s: it.str, x: m[4], y: m[5], w: it.width || 0 };
        }));
    }
    return analisarItensMapao(paginas);
}

// ---------------------------------------------------------------------------
// 2. Pasta do Google Drive
// ---------------------------------------------------------------------------

const MAPAO_DRIVE_ESCOPO = 'https://www.googleapis.com/auth/drive.readonly';
let _mapaoTokenDrive = null;

function idDaPastaDriveMapao(link) {
    const s = String(link || '').trim();
    let m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
    if (m) return m[1];
    m = s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;
    return '';
}

function pedirTokenDriveMapao() {
    return new Promise((resolve, reject) => {
        if (_mapaoTokenDrive && Date.now() < _mapaoTokenDrive.expira - 60000) return resolve(_mapaoTokenDrive.token);
        if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
            return reject(new Error('O login do Google ainda não carregou. Espere alguns segundos e tente de novo.'));
        }
        const clientId = (typeof GOOGLE_OAUTH_CLIENT_ID_MAPAO !== 'undefined' && GOOGLE_OAUTH_CLIENT_ID_MAPAO)
            || '411519047707-gmomve1rn249lt0743qrbp10j0b14qcu.apps.googleusercontent.com';
        const cliente = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: MAPAO_DRIVE_ESCOPO,
            callback: (resp) => {
                if (!resp || resp.error) return reject(new Error((resp && resp.error) || 'Sem permissão do Google.'));
                _mapaoTokenDrive = { token: resp.access_token, expira: Date.now() + (parseInt(resp.expires_in, 10) || 3600) * 1000 };
                resolve(resp.access_token);
            },
            error_callback: (e) => reject(new Error((e && e.type) === 'popup_closed' ? 'A janela do Google foi fechada.' : 'Não deu para abrir a janela do Google.'))
        });
        cliente.requestAccessToken({ prompt: '' });
    });
}

async function fetchDriveMapao(url, token) {
    const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!resp.ok) {
        let msg = 'Erro ' + resp.status;
        try { const j = await resp.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) { /* sem corpo */ }
        if (/has not been used|is disabled|accessNotConfigured/i.test(msg)) {
            msg = 'A "Google Drive API" não está ligada no projeto do Google Cloud do EdiProf. Quem administra precisa ativá-la (console.cloud.google.com → APIs → Google Drive API → Ativar).';
        } else if (resp.status === 404) {
            msg = 'Pasta não encontrada. Confira o link e se esta conta Google tem acesso a ela.';
        }
        throw new Error(msg);
    }
    return resp;
}

// Devolve [{ nome, buffer }] com todos os PDFs da pasta (sem subpastas).
async function baixarPdfsPastaDriveMapao(link, aoProgredir) {
    const id = idDaPastaDriveMapao(link);
    if (!id) throw new Error('Não reconheci o link da pasta. Copie o link que o Drive dá em "Compartilhar → Copiar link".');
    const token = await pedirTokenDriveMapao();
    const arquivos = [];
    let pageToken = '';
    do {
        const q = encodeURIComponent(`'${id}' in parents and trashed = false and mimeType = 'application/pdf'`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,size)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true` + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
        const j = await (await fetchDriveMapao(url, token)).json();
        (j.files || []).forEach(f => arquivos.push(f));
        pageToken = j.nextPageToken || '';
    } while (pageToken);
    if (!arquivos.length) throw new Error('A pasta não tem nenhum PDF.');
    const saida = [];
    for (let i = 0; i < arquivos.length; i++) {
        if (aoProgredir) aoProgredir(i + 1, arquivos.length, arquivos[i].name);
        const resp = await fetchDriveMapao(`https://www.googleapis.com/drive/v3/files/${arquivos[i].id}?alt=media&supportsAllDrives=true`, token);
        saida.push({ nome: arquivos[i].name, buffer: await resp.arrayBuffer() });
    }
    return saida;
}

// ---------------------------------------------------------------------------
// 3. Turma, estudante e o que vai ser gravado
// ---------------------------------------------------------------------------

// "8° ANO B INTEGRAL 9H ANUAL", "8º B", "8B - Matemática" → "8B"
function codigoTurmaMapao(texto) {
    const t = semAcentoMapao(texto).toUpperCase().replace(/[°ºª]/g, ' ');
    const m = t.match(/(\d{1,2})\s*(?:ANO|SERIE|S)?\s*([A-Z])\b/);
    return m ? m[1] + m[2] : '';
}

function grupoPorTextoTurmaMapao(textoTurma, grupos) {
    const cod = codigoTurmaMapao(textoTurma);
    if (!cod) return null;
    const achados = grupos.filter(g => g.rotulos.some(r => codigoTurmaMapao(r) === cod));
    return achados.length === 1 ? achados[0] : null;
}

// Estudantes de uma turma física, na ordem em que estão gravados (para os mapões só com Nº).
function estudantesDoGrupoMapao(grupo, estudantes) {
    return (estudantes || data.estudantes || []).filter(e => grupo.ids.some(id => id == e.id_turma));
}

// Um nome pode aparecer duas vezes no mapão (saiu e voltou, ou foi rematriculado): a situação
// que vale é a Ativa, e as notas são as da linha que tem notas (a linha nova vem toda com "-").
function preenchidasMapao(linha) {
    return Object.values(linha.notas || {}).filter(n => n.m !== undefined && n.m !== '-').length;
}

function alunosUnicosMapao(alunos) {
    const porChave = new Map();
    alunos.forEach(a => {
        const atual = porChave.get(a.chave);
        if (!atual) { porChave.set(a.chave, Object.assign({}, a)); return; }
        if (atual.status !== 'Ativo' && a.status === 'Ativo') { atual.status = a.status; atual.situacao = a.situacao; }
        if (preenchidasMapao(a.linha) > preenchidasMapao(atual.linha)) atual.linha = a.linha;
    });
    return Array.from(porChave.values());
}

// Prepara um mapão lido para a prévia: casa com a turma e liga cada linha a um estudante.
function prepararItemMapao(item, grupos) {
    const m = item.mapao;
    item.alunos = [];
    if (m.comNomes) {
        item.alunos = alunosUnicosMapao(m.alunos.map(a => {
            const st = statusDaSituacaoImportMassa(a.situacao);
            return { nome: a.nome, chave: normalizarNomeImportMassa(a.nome), status: st.status, situacao: a.situacao, linha: a };
        }).filter(a => a.chave));
    }
    if (!item.grupoChave) {
        let grupo = null;
        if (item.alunos.length) {
            const r = casarTurmaImportMassa(item.alunos, grupos);
            grupo = r.grupo;
            item.semelhanca = r.score;
        }
        if (!grupo) grupo = grupoPorTextoTurmaMapao(m.turma, grupos);
        item.grupoChave = grupo ? grupo.chave : '';
    }
    ligarEstudantesItemMapao(item, grupos);
}

function ligarEstudantesItemMapao(item, grupos) {
    const grupo = grupos.find(g => g.chave === item.grupoChave);
    item.ligados = [];
    item.semEstudante = [];
    if (!grupo) return;
    const daTurma = estudantesDoGrupoMapao(grupo);
    if (item.mapao.comNomes) {
        const porChave = new Map();
        daTurma.forEach(e => {
            const k = normalizarNomeImportMassa(e.nome_completo);
            const atual = porChave.get(k);
            if (!atual || ((!e.status || e.status === 'Ativo') && atual.status && atual.status !== 'Ativo')) porChave.set(k, e);
        });
        item.alunos.forEach(a => {
            const est = porChave.get(a.chave);
            if (est) item.ligados.push({ estudante: est, linha: a.linha });
            else item.semEstudante.push(a);
        });
    } else if (item.usarNumero) {
        item.mapao.alunos.forEach(l => {
            const est = daTurma[(l.numero || 0) - 1];
            if (est) item.ligados.push({ estudante: est, linha: l });
            else item.semEstudante.push({ nome: 'Nº ' + l.numero });
        });
    }
}

// Linhas novas de data.notasBimestraisOficiais para um item.
function registrosNotasItemMapao(item, loteId) {
    const b = item.mapao.bimestre;
    const out = [];
    item.ligados.forEach(({ estudante, linha }) => {
        const nomeNorm = normNomeNotasOficiais(estudante.nome_completo);
        Object.keys(linha.notas).forEach(disc => {
            const n = linha.notas[disc];
            if ((n.m === undefined || n.m === '-') && (n.f === undefined || n.f === '-' || n.f === '0') && !n.ac) return;
            out.push({
                id: loteId + '_' + out.length,
                origem: 'mapao', loteId,
                turmaId: item.grupoChave,
                id_estudante: estudante.id,
                nome_estudante_norm: nomeNorm,
                disciplina: disc,
                bimestre: b,
                valor: n.m === undefined ? '-' : n.m,
                faltas: n.f === undefined ? '' : n.f,
                ac: n.ac === undefined ? '' : n.ac
            });
        });
        const temAlgo = Object.values(linha.notas).some(n => (n.m && n.m !== '-') || (n.f && n.f !== '-' && n.f !== '0'));
        if (temAlgo && linha.total && (linha.total.freq || linha.total.tf)) {
            out.push({
                id: loteId + '_' + out.length,
                origem: 'mapao', loteId,
                turmaId: item.grupoChave,
                id_estudante: estudante.id,
                nome_estudante_norm: nomeNorm,
                disciplina: MAPAO_DISCIPLINA_TOTAL,
                bimestre: b,
                valor: linha.total.freq || '',
                faltas: linha.total.tf || ''
            });
        }
    });
    return out;
}

const MAPAO_DISCIPLINA_TOTAL = '__FREQUENCIA_GERAL__';

// Grava as notas: tira as do mesmo bimestre dos mesmos estudantes (reenviar o mapão substitui)
// e põe as novas.
function aplicarNotasMapao(lista, itens, loteId) {
    let resultado = Array.isArray(lista) ? lista.slice() : [];
    let total = 0;
    itens.forEach(item => {
        const novos = registrosNotasItemMapao(item, loteId + '_' + itens.indexOf(item));
        const nomes = new Set(item.ligados.map(l => normNomeNotasOficiais(l.estudante.nome_completo)));
        const b = item.mapao.bimestre;
        resultado = resultado.filter(n => !(n.bimestre == b && nomes.has(normNomeNotasOficiais(n.nome_estudante_norm))));
        resultado = resultado.concat(novos);
        total += novos.length;
    });
    return { lista: resultado, total };
}

// Para a situação: o mapão mais recente (maior bimestre) de cada turma, só os que têm nome.
function itensSituacaoMapao(itens) {
    const porTurma = new Map();
    itens.forEach(item => {
        if (item.erro || !item.grupoChave || !item.mapao.comNomes || !item.alunos.length) return;
        const atual = porTurma.get(item.grupoChave);
        if (!atual || (item.mapao.bimestre || 0) > (atual.mapao.bimestre || 0)) porTurma.set(item.grupoChave, item);
    });
    return Array.from(porTurma.values());
}

// ---------------------------------------------------------------------------
// 4. Tela (modal do painel da gestão)
// ---------------------------------------------------------------------------

let mapaoItens = [];
let mapaoGrupos = [];
let _mapaoGravando = false;

function escMapao(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function rotuloBimestreMapao(b) {
    return b === 5 ? 'Final' : (b ? b + 'º bim.' : '?');
}

function abrirMapoesGestor() {
    if (!document.getElementById('modalMapoes')) {
        const div = document.createElement('div');
        div.id = 'modalMapoes';
        div.className = 'modal';
        div.innerHTML = `
            <div class="modal-content" style="max-width: 820px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>📋 Mapões → Boletim</h2>
                    <button class="close-btn" onclick="closeModal('modalMapoes')">×</button>
                </div>
                <p style="font-size:13px; color:#3d4759; margin-top:0;">
                    Envie os mapões da SED (um PDF por turma e bimestre). O EdiProf lê no próprio aparelho,
                    reconhece a turma e monta o <strong>boletim</strong> na ficha de cada estudante e na ficha de tutoria.
                    Nada é enviado para IA.
                </p>
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px; margin: 12px 0;">
                    <div style="padding:12px; background:#f6f8fb; border:2px dashed #cdd5e1; border-radius:8px;">
                        <div style="font-weight:600; margin-bottom:6px;">📄 Vários PDFs</div>
                        <input type="file" id="mapaoArquivos" multiple accept=".pdf,application/pdf" onchange="lerArquivosMapao(this.files)" style="max-width:100%;">
                    </div>
                    <div style="padding:12px; background:#f6f8fb; border:2px dashed #cdd5e1; border-radius:8px;">
                        <div style="font-weight:600; margin-bottom:6px;">📁 Link de pasta do Google Drive</div>
                        <div style="display:flex; gap:6px;">
                            <input type="text" id="mapaoLinkPasta" placeholder="https://drive.google.com/drive/folders/..." style="flex:1; min-width:0;">
                            <button class="btn btn-sm btn-primary" onclick="lerPastaDriveMapao()">Ler</button>
                        </div>
                        <div style="font-size:11px; color:#5f6b7f; margin-top:4px;">Abre a janela do Google para você permitir a leitura (só leitura).</div>
                    </div>
                </div>
                <div id="mapaoStatus" style="font-size:13px; color:#3d4759; margin-bottom:8px;"></div>
                <div id="mapaoPrevia"></div>
                <div id="mapaoOpcoes" style="display:none; margin-top:12px; padding:10px; background:#edf3fd; border:1px solid #d3e2fa; border-radius:8px; font-size:13px;">
                    <label style="display:flex; gap:8px; align-items:flex-start; cursor:pointer;">
                        <input type="checkbox" id="mapaoAtualizarSituacao" onchange="renderPreviaMapao()" style="margin-top:3px;">
                        <span><strong>Atualizar também a situação dos estudantes</strong> (Ativo, Transferido, Remanejado...) pelo mapão mais
                        recente de cada turma. Quem é novo entra na turma. Muda a chamada e as listas de todos os professores.</span>
                    </label>
                    <div id="mapaoPreviaSituacao" style="margin-top:8px;"></div>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #e3e8ef; padding-top:12px; margin-top:12px;">
                    <button class="btn btn-secondary" onclick="closeModal('modalMapoes')">Cancelar</button>
                    <button class="btn btn-success" id="btnGravarMapoes" onclick="gravarMapoes()" disabled>Gravar boletins</button>
                </div>
            </div>`;
        document.body.appendChild(div);
    }
    mapaoItens = [];
    mapaoGrupos = agruparTurmasFisicasImportMassa();
    document.getElementById('mapaoArquivos').value = '';
    document.getElementById('mapaoStatus').innerHTML = (data.lotesMapaoGestor || []).length
        ? `Último envio: ${escMapao(new Date(data.lotesMapaoGestor[data.lotesMapaoGestor.length - 1].em).toLocaleString('pt-BR'))} (${data.lotesMapaoGestor[data.lotesMapaoGestor.length - 1].arquivos} arquivo(s)).`
        : '';
    document.getElementById('mapaoPrevia').innerHTML = '';
    document.getElementById('mapaoOpcoes').style.display = 'none';
    document.getElementById('mapaoAtualizarSituacao').checked = false;
    document.getElementById('btnGravarMapoes').disabled = true;
    showModal('modalMapoes');
}

async function lerArquivosMapao(files) {
    const lista = Array.from(files || []);
    if (!lista.length) return;
    const entradas = [];
    for (const f of lista) entradas.push({ nome: f.name, buffer: await f.arrayBuffer() });
    await processarEntradasMapao(entradas);
}

async function lerPastaDriveMapao() {
    const link = document.getElementById('mapaoLinkPasta').value;
    const st = document.getElementById('mapaoStatus');
    try {
        st.textContent = 'Pedindo permissão ao Google...';
        const entradas = await baixarPdfsPastaDriveMapao(link, (i, n, nome) => { st.textContent = `Baixando ${i} de ${n}: ${nome}`; });
        await processarEntradasMapao(entradas);
    } catch (e) {
        st.innerHTML = `<span style="color:#c53030;">⚠️ ${escMapao(e.message || e)}</span>`;
    }
}

async function processarEntradasMapao(entradas) {
    const st = document.getElementById('mapaoStatus');
    mapaoGrupos = agruparTurmasFisicasImportMassa();
    for (let i = 0; i < entradas.length; i++) {
        const ent = entradas[i];
        st.textContent = `Lendo ${i + 1} de ${entradas.length}: ${ent.nome}`;
        const item = { nomeArquivo: ent.nome, mapao: null, erro: '', grupoChave: '', usarNumero: false, alunos: [], ligados: [], semEstudante: [] };
        try {
            item.mapao = await lerPdfMapao(ent.buffer);
            if (item.mapao.erro) item.erro = item.mapao.erro;
            else if (!item.mapao.bimestre) item.erro = 'Não achei de qual bimestre é ("Tipo Fechamento").';
            else prepararItemMapao(item, mapaoGrupos);
        } catch (e) {
            item.erro = 'Não deu para ler o PDF: ' + (e.message || e);
        }
        // Mesmo arquivo de novo (ou o mesmo mapão tirado duas vezes): fica o último.
        const igual = mapaoItens.findIndex(x => x.mapao && item.mapao && !x.erro && !item.erro
            && x.mapao.turma === item.mapao.turma && x.mapao.bimestre === item.mapao.bimestre);
        if (igual >= 0) mapaoItens[igual] = item; else mapaoItens.push(item);
    }
    st.textContent = `${mapaoItens.length} mapão(ões) lido(s). Confira a turma de cada um antes de gravar.`;
    renderPreviaMapao();
}

function alterarTurmaMapao(indice, chave) {
    const item = mapaoItens[indice];
    if (!item) return;
    item.grupoChave = chave;
    ligarEstudantesItemMapao(item, mapaoGrupos);
    renderPreviaMapao();
}

function alterarNumeroMapao(indice, marcado) {
    const item = mapaoItens[indice];
    if (!item) return;
    item.usarNumero = !!marcado;
    ligarEstudantesItemMapao(item, mapaoGrupos);
    renderPreviaMapao();
}

function previaSituacaoMapao() {
    const copia = JSON.parse(JSON.stringify(data.estudantes || []));
    const novoId = criarGeradorIdImportMassa(copia);
    return itensSituacaoMapao(mapaoItens).map(item => {
        const grupo = mapaoGrupos.find(g => g.chave === item.grupoChave);
        return { item, grupo, previa: aplicarArquivoImportMassa(copia, grupo.turmaId, item.alunos, novoId, { marcarAusentes: false }) };
    });
}

function renderPreviaMapao() {
    const el = document.getElementById('mapaoPrevia');
    if (!el) return;
    const opcoesTurma = (sel) => `<option value="">— escolha a turma —</option>` + mapaoGrupos.map(g =>
        `<option value="${escMapao(g.chave)}" ${g.chave === sel ? 'selected' : ''}>${escMapao(g.rotulo)}</option>`).join('');

    const linhas = mapaoItens.map((item, i) => {
        if (item.erro) {
            return `<tr><td>${escMapao(item.nomeArquivo)}</td><td colspan="3" style="color:#c53030;">⚠️ ${escMapao(item.erro)}</td></tr>`;
        }
        const m = item.mapao;
        let aviso = '';
        if (!item.grupoChave) aviso = '<div style="color:#c05621;">Escolha a turma.</div>';
        else if (!m.comNomes && !item.usarNumero) {
            aviso = `<div style="color:#c05621;">Este mapão veio <strong>sem os nomes</strong> (só o nº de chamada).</div>
                <label style="font-size:11px; cursor:pointer;"><input type="checkbox" ${item.usarNumero ? 'checked' : ''} onchange="alterarNumeroMapao(${i}, this.checked)">
                usar o nº de chamada pela ordem da lista da turma no EdiProf</label>`;
        } else if (!m.comNomes) {
            const ex = item.ligados.slice(0, 3).map(l => `Nº ${l.linha.numero} → ${escMapao(l.estudante.nome_completo)}`).join('<br>');
            aviso = `<label style="font-size:11px; cursor:pointer;"><input type="checkbox" checked onchange="alterarNumeroMapao(${i}, this.checked)">
                nº de chamada pela ordem da lista</label><div style="font-size:11px; color:#5f6b7f;">Confira: ${ex || '—'}</div>`;
        }
        const faltam = item.semEstudante.length
            ? `<details style="font-size:11px; color:#c05621;"><summary>${item.semEstudante.length} sem estudante na turma</summary>${item.semEstudante.map(a => escMapao(a.nome)).join('<br>')}</details>` : '';
        return `<tr>
            <td style="font-size:12px;"><strong>${escMapao(m.turma || '?')}</strong><br><span style="color:#7a869a; font-size:11px; word-break:break-all;">${escMapao(item.nomeArquivo)}</span></td>
            <td style="text-align:center;">${rotuloBimestreMapao(m.bimestre)}</td>
            <td><select onchange="alterarTurmaMapao(${i}, this.value)" style="max-width:200px;">${opcoesTurma(item.grupoChave)}</select>${aviso}</td>
            <td style="font-size:12px; text-align:center;">${item.ligados.length}/${m.alunos.length}${faltam}</td>
        </tr>`;
    }).join('');

    el.innerHTML = mapaoItens.length ? `
        <div style="overflow-x:auto;">
        <table style="width:100%; font-size:13px;">
            <thead><tr><th>Mapão</th><th>Bimestre</th><th>Turma no EdiProf</th><th>Estudantes</th></tr></thead>
            <tbody>${linhas}</tbody>
        </table></div>` : '';

    const prontos = mapaoItens.filter(i => !i.erro && i.grupoChave && i.ligados.length);
    document.getElementById('btnGravarMapoes').disabled = prontos.length === 0;
    document.getElementById('mapaoOpcoes').style.display = itensSituacaoMapao(mapaoItens).length ? 'block' : 'none';

    const elSit = document.getElementById('mapaoPreviaSituacao');
    if (document.getElementById('mapaoAtualizarSituacao').checked) {
        const prev = previaSituacaoMapao();
        elSit.innerHTML = prev.map(({ item, grupo, previa }) => {
            const saidas = previa.alterados.filter(a => a.para !== 'Ativo');
            const voltas = previa.alterados.filter(a => a.para === 'Ativo');
            const partes = [];
            if (previa.criados.length) partes.push(`✔️ ${previa.criados.length} novo(s): ${previa.criados.map(c => escMapao(c.nome) + (c.status !== 'Ativo' ? ' <em>(' + escMapao(c.status) + ')</em>' : '')).join(', ')}`);
            if (voltas.length) partes.push(`🔄 ${voltas.length} voltam a Ativo: ${voltas.map(a => escMapao(a.nome)).join(', ')}`);
            if (saidas.length) partes.push(`➡️ ${saidas.length} saem: ${saidas.map(a => escMapao(a.nome) + ' <em>(' + escMapao(a.para) + ')</em>').join(', ')}`);
            return `<div style="margin-bottom:6px;"><strong>${escMapao(grupo.rotulo)}</strong> <span style="color:#7a869a;">(mapão do ${rotuloBimestreMapao(item.mapao.bimestre)})</span>:
                ${partes.length ? '<div style="font-size:12px;">' + partes.join('<br>') + '</div>' : ' <span style="color:#276749;">nada muda</span>'}</div>`;
        }).join('') || '<em>Nenhum mapão com nomes para atualizar a situação.</em>';
    } else {
        elSit.innerHTML = '';
    }
}

async function gravarMapoes() {
    if (_mapaoGravando) return;
    const prontos = mapaoItens.filter(i => !i.erro && i.grupoChave && i.ligados.length);
    if (!prontos.length) return alert('Nenhum mapão pronto para gravar.');
    const comSituacao = document.getElementById('mapaoAtualizarSituacao').checked;
    let saidas = 0;
    if (comSituacao) previaSituacaoMapao().forEach(p => { saidas += p.previa.alterados.filter(a => a.para !== 'Ativo').length; });
    const msg = `Gravar o boletim de ${prontos.length} mapão(ões)?` + (comSituacao ? `\n\nA situação dos estudantes também será atualizada (${saidas} deixam de estar ativos).` : '');
    if (!confirm(msg)) return;

    _mapaoGravando = true;
    const botao = document.getElementById('btnGravarMapoes');
    if (botao) botao.disabled = true;
    try {
        const loteId = 'mapao_' + Date.now();
        const r = aplicarNotasMapao(data.notasBimestraisOficiais, prontos, loteId);
        data.notasBimestraisOficiais = r.lista;
        if (!Array.isArray(data.lotesMapaoGestor)) data.lotesMapaoGestor = [];
        data.lotesMapaoGestor.push({
            id: loteId, em: new Date().toISOString(), arquivos: prontos.length, notas: r.total,
            itens: prontos.map(i => ({ turma: i.mapao.turma, bimestre: i.mapao.bimestre, estudantes: i.ligados.length }))
        });
        data.lotesMapaoGestor = data.lotesMapaoGestor.slice(-30);

        let relatorio = null;
        if (comSituacao) {
            if (!data.estudantes) data.estudantes = [];
            const novoId = criarGeradorIdImportMassa(data.estudantes);
            relatorio = itensSituacaoMapao(prontos).map(item => {
                const grupo = mapaoGrupos.find(g => g.chave === item.grupoChave);
                return { turma: grupo.rotulo, arquivo: item.nomeArquivo, resultado: aplicarArquivoImportMassa(data.estudantes, grupo.turmaId, item.alunos, novoId, { marcarAusentes: false }) };
            });
            relatorio.forEach(x => filtrarAtivosEmOutraImportMassa(x.resultado, data.estudantes));
        }

        // persistirDados() também agenda a publicação da lista da escola (listaescola.js):
        // é por ela que o boletim e a lista nova chegam aos professores.
        await persistirDados();
        // O resultado fica na própria janela (o que mudou sai nominal, como na importação em massa).
        const nEst = prontos.reduce((s, i) => s + i.ligados.length, 0);
        const blocos = (relatorio || []).map(x => {
            const saidas = x.resultado.alterados.filter(a => a.para !== 'Ativo');
            const voltas = x.resultado.alterados.filter(a => a.para === 'Ativo');
            const partes = [];
            if (x.resultado.criados.length) partes.push(`✔️ ${x.resultado.criados.length} novo(s): ${x.resultado.criados.map(c => escMapao(c.nome)).join(', ')}`);
            if (voltas.length) partes.push(`🔄 ${voltas.length} voltaram a Ativo: ${voltas.map(a => escMapao(a.nome)).join(', ')}`);
            if (saidas.length) partes.push(`➡️ ${saidas.length} saíram: ${saidas.map(a => escMapao(a.nome) + ' <em>(' + escMapao(a.para) + ')</em>').join(', ')}`);
            if (x.resultado.ativosEmOutra && x.resultado.ativosEmOutra.length) partes.push(`ℹ️ seguem ativos também em outra turma: ${x.resultado.ativosEmOutra.map(a => escMapao(a.nome) + ' (' + escMapao(a.turma) + ')').join(', ')}`);
            return `<div style="margin-top:6px;"><strong>${escMapao(x.turma)}</strong>: ${partes.length ? '<div style="font-size:12px;">' + partes.join('<br>') + '</div>' : 'situação sem mudança'}</div>`;
        }).join('');
        document.getElementById('mapaoPrevia').innerHTML = `
            <div style="padding:10px; background:#f0fff4; border:1px solid #c6f6d5; border-radius:6px;">
                <strong style="color:#276749;">✅ Boletim gravado</strong>
                <div style="font-size:12px; color:#2f855a; margin-top:4px;">${r.total} nota(s) de ${nEst} estudante(s), em ${prontos.length} mapão(ões).
                Já aparece na ficha do estudante e na ficha de tutoria (os professores recebem em alguns segundos).</div>
                ${blocos}
            </div>`;
        document.getElementById('mapaoOpcoes').style.display = 'none';
        document.getElementById('mapaoAtualizarSituacao').checked = false;
        document.getElementById('mapaoArquivos').value = '';
        document.getElementById('mapaoStatus').textContent = '';
        mapaoItens = [];
        if (typeof renderDashboard === 'function' && document.getElementById('dashboard') && document.getElementById('dashboard').classList.contains('active')) renderDashboard();
    } finally {
        _mapaoGravando = false;
        if (botao) botao.disabled = !mapaoItens.length;
    }
}

// ---------------------------------------------------------------------------
// 5. Trabalhos › 📋 Fechamentos (professor): o boletim da SUA disciplina, turma inteira,
//    com a nota mínima estimada (estimativaBoletim, gestor.js) para não reprovar.
// ---------------------------------------------------------------------------

const _fechamentoDisciplinaEscolhida = {}; // turmaId -> disciplina escolhida à mão

function chaveDisciplinaMapao(d) {
    return semAcentoMapao(d).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

// "Matemática" (turma) ↔ "MATEMATICA" (mapão). Primeiro igual; depois uma contém a outra
// ("Língua Portuguesa" ↔ "LINGUA PORTUGUESA"; "Port." não casa e a pessoa escolhe).
function disciplinaDaTurmaNoMapao(disciplinaTurma, disponiveis) {
    const alvo = chaveDisciplinaMapao(disciplinaTurma);
    if (!alvo) return '';
    const igual = disponiveis.find(d => chaveDisciplinaMapao(d) === alvo);
    if (igual) return igual;
    const parecidas = disponiveis.filter(d => { const k = chaveDisciplinaMapao(d); return k.indexOf(alvo) === 0 || alvo.indexOf(k) === 0; });
    // "MATEMATICA" também está dentro de "ORIENTACAO DE ESTUDO - MATEMATICA": fica a mais curta.
    parecidas.sort((a, b) => a.length - b.length);
    return parecidas[0] || '';
}

function escolherDisciplinaFechamento(valor) {
    _fechamentoDisciplinaEscolhida[turmaAtual] = valor;
    renderFechamentosTurma();
}

async function renderFechamentosTurma() {
    const alvo = document.getElementById('fechamentosTurma');
    if (!alvo) return;
    const turma = (data.turmas || []).find(t => t.id == turmaAtual) || {};
    const estudantes = (typeof estudantesPlanilhaTrabalhos === 'function' ? estudantesPlanilhaTrabalhos() : [])
        .slice().sort((a, b) => (typeof compararNomes === 'function' ? compararNomes(a.nome_completo, b.nome_completo) : a.nome_completo.localeCompare(b.nome_completo)));

    let fonte = null;
    try {
        fonte = (typeof currentViewMode !== 'undefined' && currentViewMode === 'gestor') ? data : await obterDadosGestor();
    } catch (e) { console.warn('[Fechamentos] não carregou:', e); }
    if (document.getElementById('fechamentosTurma') !== alvo) return; // trocou de tela enquanto buscava

    const todas = (fonte && fonte.notasBimestraisOficiais) || [];
    const nomes = new Set(estudantes.map(e => normNomeNotasOficiais(e.nome_completo)));
    const daTurma = todas.filter(n => nomes.has(normNomeNotasOficiais(n.nome_estudante_norm)));
    // Mesma disciplina com grafias diferentes ("ARTE" / "ARTE 1813") vira uma só (chave).
    const gruposDisc = agruparDisciplinasBoletim(daTurma.filter(n => n.disciplina !== MAPAO_DISCIPLINA_TOTAL));
    const disponiveis = Object.keys(gruposDisc).sort((a, b) => a.localeCompare(b));

    if (!daTurma.length) {
        alvo.innerHTML = `<div class="card" style="padding:16px;"><p class="empty-state" style="margin:0;">Ainda não há mapão desta turma. Os fechamentos aparecem aqui quando a gestão enviar os mapões da SED (Painel da Gestão › 📋 Mapões → Boletim).</p></div>`;
        return;
    }

    // Professor: travado na disciplina da turma. Só a gestão troca a disciplina mostrada.
    const ehGestor = typeof currentViewMode !== 'undefined' && currentViewMode === 'gestor';
    const escolhida = ehGestor ? _fechamentoDisciplinaEscolhida[turmaAtual] : '';
    const disciplina = (escolhida && disponiveis.indexOf(escolhida) !== -1) ? escolhida : disciplinaDaTurmaNoMapao(turma.disciplina, disponiveis);
    const seletor = !ehGestor ? '' : `<label style="font-size:12px; display:inline-flex; align-items:center; gap:6px;">Disciplina no mapão:
        <select onchange="escolherDisciplinaFechamento(this.value)" style="width:auto; padding:4px 8px; font-size:13px;">
            ${disciplina ? '' : '<option value="">— escolha —</option>'}
            ${disponiveis.map(d => `<option value="${escMapao(d)}" ${d === disciplina ? 'selected' : ''}>${escMapao(nomeDisciplinaBoletim(gruposDisc[d].nome))}</option>`).join('')}
        </select></label>`;

    if (!disciplina) {
        alvo.innerHTML = ehGestor
            ? `<div class="card" style="padding:16px;"><p style="margin:0 0 8px;">Não achei "${escMapao(turma.disciplina || '')}" no mapão. Escolha qual disciplina do mapão mostrar:</p>${seletor}</div>`
            : `<div class="card" style="padding:16px;"><p class="empty-state" style="margin:0;">A disciplina desta turma (${escMapao(turma.disciplina || 'sem disciplina')}) não aparece nos mapões enviados pela gestão. Confira se o nome da disciplina na turma é o mesmo do mapão da SED.</p></div>`;
        return;
    }

    const notasDisc = gruposDisc[disciplina].registros;
    const comDado = [1, 2, 3, 4].filter(b => notasDisc.some(n => n.bimestre == b && String(n.valor || '').trim() && n.valor !== '-'));
    const ultimo = comDado.length ? comDado[comDado.length - 1] : 0;
    const num = (v) => { const x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? null : x; };
    const temFalta = (f) => f !== undefined && f !== null && f !== '' && f !== '-' && f !== '0';

    let abaixo = 0, risco = 0, semMapao = 0, impossivel = 0;
    const linhas = estudantes.map(e => {
        const k = normNomeNotasOficiais(e.nome_completo);
        const porBim = porBimestreBoletim(notasDisc.filter(n => normNomeNotasOficiais(n.nome_estudante_norm) === k));
        if (!Object.keys(porBim).length) semMapao++;
        const est = estimativaBoletim(porBim, ultimo);
        if (est.risco) risco++;
        if (Object.values(est.porBim).some(x => x.tipo === 'impossivel')) impossivel++;
        if (porBim[ultimo] && num(porBim[ultimo].valor) !== null && num(porBim[ultimo].valor) < MEDIA_APROVACAO_BOLETIM) abaixo++;
        const celulas = [1, 2, 3, 4, 5].map(b => {
            const n = porBim[b];
            if (n && num(n.valor) !== null) {
                const baixa = num(n.valor) < MEDIA_APROVACAO_BOLETIM;
                return `<td><span class="bol-nota${baixa ? ' bol-baixa' : ''}">${escMapao(n.valor)}</span>${temFalta(n.faltas) ? `<span class="bol-f">${escMapao(n.faltas)}f</span>` : ''}</td>`;
            }
            const x = est.porBim[b];
            if (!x) return '<td class="bol-vazio">–</td>';
            if (x.tipo === 'garantida') return '<td><span class="bol-est bol-est-ok" title="Média 5 já garantida">✓</span></td>';
            if (x.tipo === 'impossivel') return '<td><span class="bol-est bol-est-ruim" title="Nem com 10 chega à média 5">✕</span></td>';
            const cls = x.tipo === 'final' ? (x.valor < MEDIA_APROVACAO_BOLETIM ? ' bol-est-ruim' : '') : (x.valor >= 7 ? ' bol-est-alerta' : '');
            return `<td><span class="bol-est${cls}" title="${x.tipo === 'final' ? '5º conceito estimado' : 'Nota mínima estimada para a média 5'}">${x.tipo === 'final' ? '' : '≥'}${x.valor}</span></td>`;
        }).join('');
        return `<tr data-risco="${est.risco ? 1 : 0}"><th scope="row">${escMapao(e.nome_completo)}</th>${celulas}</tr>`;
    }).join('');

    const chips = [
        ultimo ? `<span class="bol-chip">até o ${ultimo}º bimestre</span>` : '',
        `<span class="bol-chip">${estudantes.length} estudantes</span>`,
        `<span class="bol-chip${abaixo ? ' bol-chip-alerta' : ' bol-chip-ok'}">${abaixo} abaixo de 5 no ${ultimo || '-'}º</span>`,
        risco ? `<span class="bol-chip bol-chip-alerta" title="Precisam de 7 ou mais, ou já não alcançam 5">${risco} em risco${impossivel ? ` (${impossivel} sem chance)` : ''}</span>` : '<span class="bol-chip bol-chip-ok">ninguém em risco</span>',
        semMapao ? `<span class="bol-chip" title="Nome da lista que não apareceu no mapão desta disciplina">${semMapao} sem mapão</span>` : ''
    ].join('');

    alvo.innerHTML = `
        <div class="card" style="padding:14px;">
            <div class="boletim" style="max-width:720px;">
                <div class="bol-topo">
                    <strong>📋 Fechamentos — ${escMapao(nomeDisciplinaBoletim(gruposDisc[disciplina].nome))}</strong>
                    ${seletor}
                </div>
                <div class="bol-chips" style="margin-bottom:8px;">${chips}
                    ${risco ? `<label style="font-size:11px; display:inline-flex; align-items:center; gap:4px; cursor:pointer; margin-left:4px;"><input type="checkbox" style="width:auto; margin:0;" onchange="document.querySelectorAll('#fechamentosTurma tr[data-risco]').forEach(tr => tr.style.display = (this.checked && tr.dataset.risco !== '1') ? 'none' : '')"> só em risco</label>` : ''}
                </div>
                <div class="bol-rolagem">
                    <table class="bol-tabela">
                        <thead><tr><th scope="col">Estudante</th><th scope="col">1º</th><th scope="col">2º</th><th scope="col">3º</th><th scope="col">4º</th><th scope="col" title="5º conceito (nota final do ano)">5º C.</th></tr></thead>
                        <tbody>${linhas}</tbody>
                    </table>
                </div>
                <div class="bol-legenda">
                    <span><span class="bol-nota">7</span> lançada (mapão)</span>
                    <span><span class="bol-est">≥6</span> mínima estimada</span>
                    <span><span class="bol-est">5</span> 5º conceito estimado</span>
                    <span><span class="bol-est bol-est-ok">✓</span> média garantida</span>
                    <span><span class="bol-est bol-est-ruim">✕</span> não alcança 5</span>
                    <span><span class="bol-f">f</span> faltas</span>
                </div>
                <div class="bol-legenda">Estimativa: 5º conceito = média dos 4 bimestres, aprovação com ${MEDIA_APROVACAO_BOLETIM}. É só uma conta; o conselho de classe decide.</div>
            </div>
        </div>`;
}

// ---------------------------------------------------------------------------
// 6. Meta do bimestre na planilha de Trabalhos: embaixo da MÉDIA, a nota mínima que o
//    estudante precisa NESTE bimestre (pelos mapões dos bimestres anteriores) e se já atingiu.
// ---------------------------------------------------------------------------

let _metasTrabalhos = { chave: '', porEst: {} };

async function carregarMetasTrabalhos() {
    const turmaId = turmaAtual, bim = currentBimestreTrabalhos;
    const chave = turmaId + '_' + bim;
    const turma = (data.turmas || []).find(t => t.id == turmaId) || {};
    let fonte = null;
    try {
        fonte = (typeof currentViewMode !== 'undefined' && currentViewMode === 'gestor') ? data : await obterDadosGestor();
    } catch (e) { /* sem lista da escola: fica a meta padrão (5) */ }
    if (turmaAtual !== turmaId || currentBimestreTrabalhos !== bim) return;

    const estudantes = (data.estudantes || []).filter(e => e.id_turma == turmaId);
    const nomes = new Set(estudantes.map(e => normNomeNotasOficiais(e.nome_completo)));
    const todas = ((fonte && fonte.notasBimestraisOficiais) || []).filter(n => nomes.has(normNomeNotasOficiais(n.nome_estudante_norm)));
    const gruposDisc = agruparDisciplinasBoletim(todas.filter(n => n.disciplina !== MAPAO_DISCIPLINA_TOTAL));
    const disciplina = disciplinaDaTurmaNoMapao(turma.disciplina, Object.keys(gruposDisc));
    const notasDisc = disciplina ? gruposDisc[disciplina].registros : [];
    const num = (v) => { const x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? null : x; };

    const porEst = {};
    estudantes.forEach(e => {
        const k = normNomeNotasOficiais(e.nome_completo);
        const minhas = notasDisc.filter(n => normNomeNotasOficiais(n.nome_estudante_norm) === k);
        const oficial = minhas.find(n => n.bimestre == bim && num(n.valor) !== null);
        const anteriores = porBimestreBoletim(minhas.filter(n => Number(n.bimestre) < bim));
        const est = estimativaBoletim(anteriores, bim - 1);
        const x = est.porBim[bim];
        let meta;
        if (x && x.tipo === 'estimada') meta = { tipo: 'estimada', valor: x.valor };
        else if (x && x.tipo === 'garantida') meta = { tipo: 'garantida' };
        else if (x && x.tipo === 'impossivel') meta = { tipo: 'impossivel' };
        else meta = { tipo: 'estimada', valor: MEDIA_APROVACAO_BOLETIM }; // sem mapão antes: a meta é a média
        meta.oficial = oficial ? oficial.valor : '';
        porEst[String(e.id)] = meta;
    });
    _metasTrabalhos = { chave, porEst };
    pintarMetasTrabalhos();
}

function pintarMetasTrabalhos(soEstudanteId) {
    if (_metasTrabalhos.chave !== turmaAtual + '_' + currentBimestreTrabalhos) return;
    document.querySelectorAll('#tabTrabalhos .meta-bim').forEach(div => {
        if (soEstudanteId !== undefined && String(div.dataset.est) !== String(soEstudanteId)) return;
        const meta = _metasTrabalhos.porEst[String(div.dataset.est)];
        if (!meta) { div.innerHTML = ''; return; }
        const td = div.closest('td');
        const media = td ? parseFloat(String(td.dataset.media).replace(',', '.')) : NaN;
        const sed = meta.oficial !== '' ? `<span class="meta-sed" title="Nota do mapão da SED neste bimestre">SED ${escMapao(meta.oficial)}</span>` : '';
        if (meta.tipo === 'garantida') { div.innerHTML = `<span class="meta-chip meta-ok" title="A média 5 do ano já está garantida pelos bimestres anteriores">✓ garantida</span>${sed}`; return; }
        if (meta.tipo === 'impossivel') { div.innerHTML = `<span class="meta-chip meta-ruim" title="Mesmo com 10 neste e nos próximos bimestres, a média do ano não chega a 5">✕ sem chance</span>${sed}`; return; }
        const atingiu = !isNaN(media) && media >= meta.valor;
        const dica = `Meta: nota mínima estimada neste bimestre para a média do ano chegar a ${MEDIA_APROVACAO_BOLETIM} (pelos mapões dos bimestres anteriores).`;
        div.innerHTML = `<span class="meta-chip ${isNaN(media) ? '' : (atingiu ? 'meta-ok' : 'meta-ruim')}" title="${dica}">meta ≥${meta.valor} ${isNaN(media) ? '' : (atingiu ? '✓' : '✕')}</span>${sed}`;
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { disciplinaDaTurmaNoMapao, analisarItensMapao, bimestreDoTextoMapao, juntarPedacosMapao, codigoTurmaMapao, idDaPastaDriveMapao, aplicarNotasMapao, itensSituacaoMapao, MAPAO_DISCIPLINA_TOTAL };
}
