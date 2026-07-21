// --- MÓDULO: ESTAGIÁRIO (IA E GERAÇÃO DE DOCUMENTOS) ---

// --- FUNDAMENTAÇÃO NO CURRÍCULO OFICIAL (Tier 1: planilha de escopo-sequência / Tier 2: PDFs com
// busca por palavra-chave) - ver Base Curricular Oficial no Super Admin (admin.js) pra como esses
// dados chegam nas coleções curriculo_escopo_sequencia / curriculo_chunks_embeddings. Compartilhado
// entre todas as escolas (sem schoolId), ao contrário do catálogo de Material Digital.
//
// A Tier 2 já foi busca semântica (embeddings do Google) - removida porque a chave de IA configurada
// não tinha cota gratuita pra nenhuma chamada de IA (erro real: "quota exceeded... limit: 0"), então
// virou busca por palavra-chave (mesma lógica da Tier 1), sem nenhuma dependência de IA.

const cacheCurriculoTier1Estagiario = new Map(); // chave serieChave -> linhas (todas as disciplinas)
const cacheCurriculoTier2Estagiario = new Map(); // chave serieChave -> chunks de texto (todas as disciplinas)
const CONFIANCA_MINIMA_TIER1_ESTAGIARIO = 0.55;
const CONFIANCA_MINIMA_TIER2_ESTAGIARIO = 0.4; // mais permissivo que a Tier1 - trechos de PDF são mais longos/variados, cobertura parcial já é um bom sinal
const TOP_K_CHUNKS_TIER2_ESTAGIARIO = 4;

const MESES_AGENDA = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Snapshot da última lista de estudantes do Painel AEE buscada por abrirModalGerarDocumentoIA -
// reaproveitado por gerarAnexoIVEstagiario pra ler a Ficha AEE (aee_diagnostico/aee_relatorio) do
// estudante escolhido no <select id="anexoIVAluno"> sem precisar buscar tudo de novo no Firestore.
let ultimaListaTutoradosAeeParaAnexoIV = [];

// Diferencia Ensino Médio de Ensino Fundamental quando os dois usam "Ano" pro mesmo número (ex: "1º
// Ano" do Fundamental vs "1º Ano EM"/"1º Ano do Ensino Médio") - sem isso, extrairSerieChaveMaterialDigital
// sozinha devolveria "1" pros dois, misturando os documentos dos dois segmentos na busca. Prefixa com
// "EM" só quando o texto original menciona "EM" ou "Médio". Duplicada em admin.js (mesma convenção já
// usada no projeto pra funções pequenas usadas em contextos/arquivos diferentes).
function resolverSerieChaveCurriculoOficial(serieOriginal) {
    const digito = extrairSerieChaveMaterialDigital(serieOriginal);
    if (!digito) return '';
    const original = String(serieOriginal || '');
    // Sigla "EM" só em maiúsculas (ex: "1º Ano EM") - em minúsculas "em" é só a preposição comum do
    // português (ex: "6º Ano em Período Integral"), que não deve disparar a detecção.
    const temSiglaEM = /\bEM\b/.test(original);
    const semAcento = original.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const temPalavraMedio = /medio/.test(semAcento);
    return (temSiglaEM || temPalavraMedio) ? ('EM' + digito) : digito;
}

async function buscarLinhasCurriculoOficial(serie) {
    if (typeof db === 'undefined' || !db) return [];
    const serieChave = resolverSerieChaveCurriculoOficial(serie);
    if (!serieChave) return [];

    try {
        let linhas = cacheCurriculoTier1Estagiario.get(serieChave);
        if (!linhas) {
            const snap = await db.collection('curriculo_escopo_sequencia').where('serieChave', '==', serieChave).get();
            linhas = snap.docs.map(d => d.data());
            cacheCurriculoTier1Estagiario.set(serieChave, linhas);
        }
        return linhas;
    } catch (e) {
        console.warn('[Estagiário][Tier1] Erro ao buscar planilha oficial:', e);
        return [];
    }
}

async function buscarChunksCurriculoTexto(serie) {
    if (typeof db === 'undefined' || !db) return [];
    const serieChave = resolverSerieChaveCurriculoOficial(serie);
    if (!serieChave) return [];

    try {
        let chunks = cacheCurriculoTier2Estagiario.get(serieChave);
        if (!chunks) {
            const snap = await db.collection('curriculo_chunks_embeddings').where('serieChaves', 'array-contains', serieChave).get();
            chunks = snap.docs.map(d => d.data());
            cacheCurriculoTier2Estagiario.set(serieChave, chunks);
        }
        return chunks;
    } catch (e) {
        console.warn('[Estagiário][Tier2] Erro ao buscar trechos de PDF:', e);
        return [];
    }
}

// Pontua um texto já normalizado (normalizarTextoComparacaoMaterialDigital) contra o "Tema" digitado
// pelo professor: 1.0 se o texto contém o tema inteiro, senão a proporção de tokens do tema (>=3
// letras) encontrados no texto. Reaproveitada tanto pra achar a melhor linha da planilha (Tier 1)
// quanto os melhores trechos de PDF (Tier 2) - mesma busca por palavra-chave nas duas fontes, sem IA.
function pontuarTextoBuscavelContraTema(temaNorm, tokensTema, textoBuscavel) {
    if (!textoBuscavel) return 0;
    if (textoBuscavel.includes(temaNorm)) return 1;
    if (tokensTema.length === 0) return 0;
    const tokensBatidos = tokensTema.filter(tok => textoBuscavel.includes(tok)).length;
    return tokensBatidos / tokensTema.length;
}

// Pontua a melhor linha da planilha oficial contra o "Tema" digitado pelo professor, reaproveitando
// os mesmos utilitários de comparação de texto já usados pro catálogo de Material Digital (em vez de
// criar uma segunda lógica de fuzzy-match no mesmo arquivo).
function selecionarMelhorLinhaCurriculo(tema, linhasDaDisciplina) {
    const temaNorm = normalizarTextoComparacaoMaterialDigital(tema);
    if (!temaNorm || !linhasDaDisciplina || linhasDaDisciplina.length === 0) return { linha: null, confiante: false };

    const tokensTema = temaNorm.split(' ').filter(t => t.length >= 3);
    if (tokensTema.length === 0) return { linha: null, confiante: false };

    let melhor = null;
    let melhorScore = 0;

    linhasDaDisciplina.forEach(linha => {
        const score = pontuarTextoBuscavelContraTema(temaNorm, tokensTema, linha.textoBuscavel || '');
        if (score > melhorScore) { melhorScore = score; melhor = linha; }
    });

    return { linha: melhor, score: melhorScore, confiante: melhorScore >= CONFIANCA_MINIMA_TIER1_ESTAGIARIO };
}

// Mesma pontuação por palavra-chave da Tier 1, aplicada aos chunks de PDF - pega os top ~4 acima de
// um limiar mínimo de confiança (mais permissivo que a Tier1: trechos de PDF são mais longos/
// variados, então cobertura parcial de tokens já é um bom sinal de relevância).
function selecionarMelhoresTrechosCurriculo(tema, chunks) {
    const temaNorm = normalizarTextoComparacaoMaterialDigital(tema);
    if (!temaNorm || !chunks || chunks.length === 0) return [];

    const tokensTema = temaNorm.split(' ').filter(t => t.length >= 3);
    if (tokensTema.length === 0) return [];

    return chunks
        .map(chunk => ({ chunk, score: pontuarTextoBuscavelContraTema(temaNorm, tokensTema, chunk.textoBuscavel || '') }))
        .filter(r => r.score >= CONFIANCA_MINIMA_TIER2_ESTAGIARIO)
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_K_CHUNKS_TIER2_ESTAGIARIO)
        .map(r => r.chunk);
}

// Orquestra a busca nas duas fontes oficiais (planilha + PDFs) uma única vez por clique em "Gerar
// Estrutura". Nunca lança erro pra fora - qualquer falha em qualquer uma das duas fontes só reduz o
// quanto a geração fica fundamentada, nunca bloqueia o professor de gerar o plano. Nenhuma das duas
// fontes depende de chave de IA - é tudo Firestore + comparação de texto em JS puro.
async function montarContextoCurriculoOficial(disciplina, serie, tema) {
    const contexto = { tier1: null, tier1Confiante: false, tier2Trechos: [], grounded: false };

    try {
        const linhas = (await buscarLinhasCurriculoOficial(serie))
            .filter(l => disciplinasSaoSemelhantes(disciplina, l.disciplinaOriginal));
        if (linhas.length > 0) {
            const { linha, confiante } = selecionarMelhorLinhaCurriculo(tema, linhas);
            if (linha) {
                contexto.tier1 = linha;
                contexto.tier1Confiante = confiante;
                contexto.grounded = true;
            }
        }
    } catch (e) {
        console.warn('[Estagiário][Tier1] Erro ao montar contexto:', e);
    }

    try {
        const chunks = (await buscarChunksCurriculoTexto(serie))
            .filter(c => !c.disciplinaOriginal || disciplinasSaoSemelhantes(disciplina, c.disciplinaOriginal));
        if (chunks.length > 0) {
            const trechos = selecionarMelhoresTrechosCurriculo(tema, chunks);
            if (trechos.length > 0) {
                contexto.tier2Trechos = trechos;
                contexto.grounded = true;
            }
        }
    } catch (e) {
        console.warn('[Estagiário][Tier2] Erro ao montar contexto:', e);
    }

    return contexto;
}

const ROTULOS_TIPO_DOCUMENTO_ESTAGIARIO = {
    caderno_aluno: 'Caderno do Aluno',
    caderno_professor: 'Caderno do Professor',
    material_digital_pdf: 'Material Digital',
    guia_priorizado: 'Guia Priorizado',
    outros: 'Outros'
};

// --- ANEXO III - PAEE (Plano de AEE) ---
// Só aparece no Estagiário pra quem está no Modo AEE (currentViewMode === 'aee'). Os tokens abaixo
// batem 1:1 com os marcadores {{TOKEN}} de Docs/anexoIIIPAEE2026TEA.docx.html.
const ANEXO_PAEE_ELEGIBILIDADE = [
    { token: 'CHECK_ELEG_DI', label: 'Deficiência Intelectual' },
    { token: 'CHECK_ELEG_DV', label: 'Deficiência Visual' },
    { token: 'CHECK_ELEG_DF', label: 'Deficiência Física' },
    { token: 'CHECK_ELEG_DA', label: 'Deficiência Auditiva/Surdez' },
    { token: 'CHECK_ELEG_SC', label: 'Surdocegueira' },
    { token: 'CHECK_ELEG_DM', label: 'Deficiência Múltipla' },
    { token: 'CHECK_ELEG_AH', label: 'Altas habilidades/superdotação' },
    { token: 'CHECK_ELEG_TEA', label: 'Transtorno do Espectro Autista' }
];
const ANEXO_PAEE_APOIOS = [
    { token: 'CHECK_APOIO_RECURSOS', label: 'Recursos Pedagógicos, de Acessibilidade e de Tecnologia Assistiva' },
    { token: 'CHECK_APOIO_LIBRAS', label: 'Professor de Libras ou Professor interlocutor de Libras' },
    { token: 'CHECK_APOIO_GUIA', label: 'Professor Instrutor mediador ou Guia-intérprete' },
    { token: 'CHECK_APOIO_PROFISSIONAL', label: 'Serviço de Profissional de Apoio Escolar' }
];
// Campos descritivos que a IA rascunha a partir das notas do Estudo de Caso - chave usada no JSON
// pedido à IA, token usado na substituição final do template.
const ANEXO_PAEE_CAMPOS_IA = [
    { key: 'informacoes_identificadas', token: 'INFORMACOES_IDENTIFICADAS', label: 'Informações identificadas no Estudo de Caso' },
    { key: 'apoios_recursos_servicos', token: 'APOIOS_RECURSOS_SERVICOS', label: 'Texto introdutório sobre os Apoios, Recursos e Serviços indicados' },
    { key: 'indicacao_apoio_escolar', token: 'INDICACAO_APOIO_ESCOLAR', label: 'Motivos para indicação de Profissional de Apoio Escolar' },
    { key: 'habilidades_desenvolvidas', token: 'HABILIDADES_DESENVOLVIDAS', label: 'Habilidades a serem desenvolvidas no AEE, complementares/suplementares ao currículo' },
    { key: 'estrategias_utilizadas', token: 'ESTRATEGIAS_UTILIZADAS', label: 'Estratégias a serem utilizadas no AEE (Sala de Recursos ou Modalidade Itinerante)' },
    { key: 'planejamento_bimestral', token: 'PLANEJAMENTO_BIMESTRAL', label: 'Planejamento bimestral: ações pedagógicas propostas' },
    { key: 'recomendacao_professor', token: 'RECOMENDACAO_PROFESSOR', label: 'Recomendações ao Professor Regente / professores de componentes curriculares' },
    { key: 'ensino_colaborativo', token: 'ENSINO_COLABORATIVO', label: 'Recomendações sobre o Projeto Ensino Colaborativo' },
    { key: 'recomendacao_equipe_gestora', token: 'RECOMENDACAO_EQUIPE_GESTORA', label: 'Recomendações à equipe gestora e demais profissionais da escola' },
    { key: 'materiais_pedagogicos', token: 'MATERIAIS_PEDAGOGICOS', label: 'Materiais pedagógicos, recursos de acessibilidade e tecnologias assistivas' },
    { key: 'materiais_equipamentos', token: 'MATERIAIS_EQUIPAMENTOS', label: 'Materiais e equipamentos a adquirir via PDDE-Paulista' },
    { key: 'superar_barreiras', token: 'SUPERAR_BARREIRAS', label: 'Medidas para a escola superar as barreiras identificadas no Estudo de Caso' }
];

// --- ANEXO IV - PEI (Plano Educacional Individualizado) ---
// Preenchido pelo Professor Regente/de componente curricular (não pelo especialista AEE) sobre um
// aluno já classificado no Painel AEE da escola - um documento por Disciplina+Bimestre, por isso o
// estudante pode acumular vários (ver ANEXO_PEI_CAMPOS_IA e t.anexosIV em app.js). Os tokens abaixo
// batem 1:1 com os marcadores {{TOKEN}} de Docs/AnexoIV.docx.html.
const ANEXO_PEI_CAMPOS_IA = [
    { key: 'habilidades_curriculo', token: 'HABILIDADES_CURRICULO', label: 'Conteúdos e habilidades do Currículo da Rede Estadual Paulista a serem desenvolvidos no bimestre, sempre citando o código oficial da habilidade (ex: EF69AR11)' },
    { key: 'estrategias_intervencoes', token: 'ESTRATEGIAS_INTERVENCOES', label: 'Estratégias, intervenções pedagógicas e recursos de acessibilidade para favorecer o acesso, a participação e a aprendizagem do estudante' },
    { key: 'instrumentos', token: 'INSTRUMENTOS', label: 'Instrumentos utilizados para acompanhar o aprendizado do estudante de forma inclusiva e individualizada' }
];

// Monta o bloco de texto injetado no prompt, instruindo a IA a reaproveitar os dados reais em vez de
// inventar. Quando não há nada fundamentado, ainda assim retorna um aviso explícito no prompt (em vez
// de simplesmente omitir a seção), pra IA não tratar o silêncio como "invente à vontade".
function montarBlocoContextoOficial(contexto) {
    if (!contexto || !contexto.grounded) {
        return '\n\n[CONTEXTO OFICIAL]\nNenhuma correspondência foi encontrada na base curricular oficial pra este tema. Gere o conteúdo com cautela e deixe claro que os códigos de habilidade são uma sugestão a ser revisada pelo professor.';
    }

    let bloco = '\n\n[CONTEXTO OFICIAL - USE ESTES DADOS REAIS, NÃO INVENTE OUTROS CÓDIGOS OU CONTEÚDOS]\n';

    if (contexto.tier1) {
        const l = contexto.tier1;
        const habilidadesStr = (l.habilidades || []).map(h => `${h.codigo} - ${h.texto}`).join('\n');
        bloco += `Fonte: planilha oficial de escopo-sequência (${l.fonteArquivo || ''}, aba ${l.fonteAba || ''}).\n`;
        bloco += `Título da aula oficial: ${l.titulo || ''}\n`;
        bloco += `Unidade Temática: ${l.unidadeTematica || ''}\n`;
        bloco += `Objeto de Conhecimento: ${l.objetoConhecimento || ''}\n`;
        bloco += `Conteúdo oficial: ${l.conteudo || ''}\n`;
        bloco += `Objetivos oficiais: ${l.objetivos || ''}\n`;
        bloco += `Habilidades (código - texto):\n${habilidadesStr}\n`;
    }

    if (contexto.tier2Trechos && contexto.tier2Trechos.length > 0) {
        bloco += '\nTrechos de documentos oficiais relacionados ao tema:\n';
        contexto.tier2Trechos.forEach(chunk => {
            const rotulo = ROTULOS_TIPO_DOCUMENTO_ESTAGIARIO[chunk.tipoDocumento] || chunk.tipoDocumento || 'Material Oficial';
            bloco += `- [${rotulo} - ${chunk.fonteArquivo || ''}, p.${chunk.paginaInicio || '?'}]: ${chunk.texto}\n`;
        });
    }

    return bloco;
}

async function abrirModalGerarDocumentoIA() {
    // Extrai nomes de série de forma inteligente, ignorando formatos colados ou separados (ex: "7º Ano A", "7A", "7ºA" -> "7º Ano", "7", "7º")
    const getSerieNome = (nome) => {
        if (!nome) return '';
        let n = nome.trim();
        n = n.replace(/[\s-]+[A-Za-z]$/i, '');   // Remove letra com espaço/hífen (ex: "7º Ano A", "7 - B")
        n = n.replace(/(\d)[A-Za-z]$/i, '$1');   // Remove letra colada em número (ex: "7A" -> "7")
        n = n.replace(/([ºª])[A-Za-z]$/i, '$1'); // Remove letra colada em símbolo ordinal (ex: "7ºA" -> "7º")
        return n.trim();
    };
    const seriesUnicas = [...new Set((data.turmas || []).map(t => getSerieNome(t.ano_serie || t.nome)))].filter(Boolean);
    const disciplinasUnicas = [...new Set((data.turmas || []).map(t => t.disciplina))].filter(Boolean);

    // Bimestre vigente (mesmo cálculo usado em gerarDocumentoIA/gerarAnexoPaeeEstagiario) - usado só
    // pra pré-selecionar o seletor de Bimestre do Anexo IV - PEI; o professor pode trocar antes de gerar.
    const hojeStr = getTodayString();
    const configBimestresAtual = (data.configBimestres || []).find(c => hojeStr >= c.inicio && hojeStr <= c.fim);
    const bimestreAtualNum = configBimestresAtual ? String(configBimestresAtual.bim) : '';

    // O Anexo III - PAEE só faz sentido pra quem está no Modo AEE (professor especializado) - fica
    // fora do dropdown pra qualquer outro perfil/modo, inclusive Gestor alternando pra outros modos.
    const isAeeView = currentViewMode === 'aee';
    // O Anexo IV - PEI já é preenchido pelo Professor Regente/de componente curricular sobre um aluno
    // do Painel AEE (não pelo especialista) - por isso fica disponível em Modo Professor e em Modo AEE
    // (um especialista que também lecione uma disciplina também pode preenchê-lo).
    const isProfessorOuAeeView = currentViewMode === 'professor' || currentViewMode === 'aee';
    const opcoesTipoDocHtml = `
        <option value="plano_aula">Plano de Aula</option>
        <option value="agenda_mensal">📅 Agenda Mensal</option>
        ${isAeeView ? '<option value="anexo3_paee">📋 Anexo III - PAEE</option>' : ''}
        ${isProfessorOuAeeView ? '<option value="anexo4_pei">📘 Anexo IV - PEI</option>' : ''}
    `;
    const alunosAeeOptionsHtml = '<option value="">Selecione...</option>' + (data.tutorados || [])
        .map(t => `<option value="${t.id}">${t.nome_estudante}</option>`).join('');

    // Anexo IV - PEI: busca a lista de estudantes classificada no Painel AEE compartilhado da escola
    // (não a lista pessoal de tutorados do professor - o professor comum não mantém essa lista) e os
    // professores com o papel 'aee' (classificados pelo Super Admin) pra popular o {{PROF_AEE}}.
    let alunosPeiOptionsHtml = '<option value="">Selecione...</option>';
    let professoresAeeOptionsHtml = '<option value="">Selecione...</option>';
    if (currentUser && currentUser.schoolId) {
        try {
            const aeeSchoolData = await getData('app_data', `app_data_school_${currentUser.schoolId}_aee`);
            const tutoradosEscola = (aeeSchoolData && Array.isArray(aeeSchoolData.tutorados)) ? aeeSchoolData.tutorados : [];
            alunosPeiOptionsHtml += tutoradosEscola.map(t => `<option value="${t.id}">${t.nome_estudante}</option>`).join('');
            ultimaListaTutoradosAeeParaAnexoIV = tutoradosEscola;
        } catch (e) { console.warn('Erro ao buscar estudantes do Painel AEE:', e); }

        try {
            const usersData = await getData('system', 'users_list');
            const users = (usersData && usersData.list) ? usersData.list : [];
            const professoresAee = users.filter(u => u.role === 'aee' && String(u.schoolId || '') === String(currentUser.schoolId));
            professoresAeeOptionsHtml += professoresAee.map(u => `<option value="${u.id}">${u.nome}</option>`).join('');
        } catch (e) { console.warn('Erro ao buscar professores AEE da escola:', e); }
    }

    // Calcula a próxima semana de segunda a sexta
    const hoje = new Date();
    const proximaSegunda = new Date(hoje);
    proximaSegunda.setDate(hoje.getDate() + ((1 + 7 - hoje.getDay()) % 7 || 7));
    const proximaSexta = new Date(proximaSegunda);
    proximaSexta.setDate(proximaSegunda.getDate() + 4);
    const formatData = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const semanaSugerida = `${formatData(proximaSegunda)} a ${formatData(proximaSexta)}`;
    const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const semanaInicioISO = toISO(proximaSegunda);
    const semanaFimISO = toISO(proximaSexta);

    // Mês/Ano padrão sugeridos para a Agenda Mensal
    const defaultMonth = hoje.getMonth();
    const defaultYear = hoje.getFullYear();

    const defaultPromptTemplate = `Você é um professor/coordenador pedagógico experiente do Estado de São Paulo. Crie a estrutura de um Plano de Aula de {{disciplina}} para a série/ano {{serie}} sobre o tema: "{{tema}}".\nUtilize seus profundos conhecimentos sobre o Currículo Paulista e os Materiais de Apoio (Caderno do Aluno/Professor) da SEDUC-SP.\nAs habilidades devem seguir estritamente o código e formato do Currículo Paulista específicos da disciplina de {{disciplina}} (ex: se for Matemática, use EF...MA..., se for Arte, EF...AR..., etc.).\nA Aprendizagem Essencial deve ser compatível com os documentos curriculares oficiais da disciplina.\nRetorne APENAS um objeto JSON válido (sem marcações markdown e escape corretamente aspas e quebras de linha usando \\n) com as seguintes chaves textuais estritas:\n{"aprendizagem_essencial": "Habilidade central do Currículo Paulista", "conteudos": "lista de conteúdos", "habilidades": "lista de habilidades cognitivas a desenvolver com os códigos do Currículo Paulista da disciplina solicitada", "objetivos": "objetivos da aula", "desenvolvimento": "introdução, desenvolvimento e conclusão com tempos sugeridos", "materiais": "recursos utilizados", "avaliacao": "critérios e instrumentos"}`;
    const savedPrompt = localStorage.getItem('ia_prompt_template') || defaultPromptTemplate;

    if (!document.getElementById('modalGerarDocumentoIA')) {
        const div = document.createElement('div');
        div.id = 'modalGerarDocumentoIA';
        div.className = 'modal';
        div.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:10px; margin-bottom:15px;">
                    <h2 style="margin: 0;">🤖 Estagiário IA</h2>
                    <button class="btn btn-sm btn-danger" style="padding: 2px 8px;" onclick="closeModal('modalGerarDocumentoIA')">×</button>
                </div>
                
                <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                    <div style="flex: 1;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Tipo de Documento:</label>
                        <select id="iaDocTipo" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;" onchange="toggleTipoDocumentoIA()">
                            ${opcoesTipoDocHtml}
                        </select>
                    </div>
                    <div style="flex: 1;" id="campoSemanaVigente">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Semana Vigente:</label>
                        <input type="text" id="iaDocSemana" value="${semanaSugerida}" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                        <input type="hidden" id="iaDocSemanaInicio" value="${semanaInicioISO}">
                        <input type="hidden" id="iaDocSemanaFim" value="${semanaFimISO}">
                    </div>
                    <div style="flex: 1; display:none;" id="campoMesAnoAgenda">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Mês / Ano da Agenda:</label>
                        <div style="display:flex; gap:8px;">
                            <select id="iaAgendaMes" style="flex:1; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                                ${MESES_AGENDA.map((m, i) => `<option value="${i}" ${i === defaultMonth ? 'selected' : ''}>${m}</option>`).join('')}
                            </select>
                            <input type="number" id="iaAgendaAno" value="${defaultYear}" style="width:90px; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                        </div>
                    </div>
                </div>

                <div id="camposPlanoAula">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom: 15px;">
                        <div>
                            <label style="font-weight:bold; display:block; margin-bottom:5px;">Série / Ano:</label>
                            <select id="iaDocSerie" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                                <option value="">Selecione...</option>
                                ${seriesUnicas.map(s => `<option value="${s}">${s}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="font-weight:bold; display:block; margin-bottom:5px;">Disciplina:</label>
                            <select id="iaDocDisciplina" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                                <option value="">Selecione...</option>
                                ${disciplinasUnicas.map(d => `<option value="${d}">${d}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Tema / Assunto:</label>
                        <input type="text" id="iaDocTema" placeholder="Ex: Revolução Francesa" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                    </div>

                    <div style="margin-bottom: 15px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                            <label style="font-weight:bold; margin:0;">Comando do Estagiário:</label>
                            <button class="btn btn-sm btn-secondary" style="font-size:10px; padding:2px 5px;" onclick="restaurarPromptPadraoIA()">Restaurar Padrão</button>
                        </div>
                        <p style="font-size:11px; color:#718096; margin-bottom:5px;">Você pode modificar com seu prompt pessoal ou usar o nativo</p>
                        <textarea id="iaDocPrompt" rows="6" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px; font-family:monospace; font-size:11px; line-height:1.4;" onchange="localStorage.setItem('ia_prompt_template', this.value)"></textarea>
                    </div>
                </div>

                <div id="camposAnexoPaee" style="display:none;">
                    <div style="margin-bottom: 15px;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Estudante (AEE):</label>
                        <select id="anexoPaeeAluno" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;" onchange="preencherDadosEstudanteAnexoPaee()">
                            ${alunosAeeOptionsHtml}
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:15px; margin-bottom: 15px;">
                        <div>
                            <label style="font-weight:bold; display:block; margin-bottom:5px; font-size:12px;">Data de Nascimento:</label>
                            <input type="text" id="anexoPaeeNascimento" placeholder="dd/mm/aaaa" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                        </div>
                        <div>
                            <label style="font-weight:bold; display:block; margin-bottom:5px; font-size:12px;">Escolaridade / Série:</label>
                            <input type="text" id="anexoPaeeEscolaridade" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                        </div>
                        <div>
                            <label style="font-weight:bold; display:block; margin-bottom:5px; font-size:12px;">Turno:</label>
                            <input type="text" id="anexoPaeeTurno" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                        </div>
                    </div>
                    <div style="display:flex; gap:20px; margin-bottom:15px; font-size:13px;">
                        <label><input type="radio" name="anexoPaeeSexo" value="F"> Feminino</label>
                        <label><input type="radio" name="anexoPaeeSexo" value="M"> Masculino</label>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Elegibilidade aos serviços da Educação Especial:</label>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; font-size:13px;">
                            ${ANEXO_PAEE_ELEGIBILIDADE.map(o => `<label><input type="checkbox" id="anexoEleg_${o.token}" ${o.token === 'CHECK_ELEG_TEA' ? 'checked' : ''}> ${o.label}</label>`).join('')}
                        </div>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Nível de Apoio:</label>
                        <div style="display:flex; gap:20px; font-size:13px;">
                            <label><input type="radio" name="anexoPaeeNivel" value="1"> Nível 1</label>
                            <label><input type="radio" name="anexoPaeeNivel" value="2"> Nível 2</label>
                            <label><input type="radio" name="anexoPaeeNivel" value="3"> Nível 3</label>
                        </div>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Apoios / Recursos / Serviços indicados:</label>
                        <div style="display:flex; flex-direction:column; gap:5px; font-size:13px;">
                            ${ANEXO_PAEE_APOIOS.map(o => `<label><input type="checkbox" id="anexoApoio_${o.token}"> ${o.label}</label>`).join('')}
                        </div>
                    </div>
                    <div style="margin-bottom: 15px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Notas do Estudo de Caso / Diagnóstico (contexto para a IA):</label>
                        <p style="font-size:11px; color:#718096; margin-bottom:5px;">A IA vai usar essas notas (pré-preenchidas com o diagnóstico/relatório já salvos do aluno, se houver) pra rascunhar os campos descritivos do Anexo III. Você revisa e edita tudo antes de gerar o documento final.</p>
                        <textarea id="anexoPaeeNotas" rows="6" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; font-size:12px; line-height:1.4;"></textarea>
                    </div>
                </div>

                <div id="camposAnexoIV" style="display:none;">
                    <div style="margin-bottom: 15px;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Estudante (Painel AEE):</label>
                        <select id="anexoIVAluno" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                            ${alunosPeiOptionsHtml}
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom: 15px;">
                        <div>
                            <label style="font-weight:bold; display:block; margin-bottom:5px;">Disciplina que você leciona para o estudante:</label>
                            <select id="anexoIVDisciplina" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                                <option value="">Selecione...</option>
                                ${disciplinasUnicas.map(d => `<option value="${d}">${d}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="font-weight:bold; display:block; margin-bottom:5px;">Professor Especializado (AEE):</label>
                            <select id="anexoIVProfAee" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                                ${professoresAeeOptionsHtml}
                            </select>
                            <p style="font-size:10px; color:#a0aec0; margin-top:3px;">Lista de professores com o papel "AEE" definido pelo Super Admin nesta escola.</p>
                        </div>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Bimestre:</label>
                        <div style="display:flex; gap:15px; font-size:13px;">
                            <label><input type="radio" name="anexoIVBimestre" value="1" ${bimestreAtualNum === '1' ? 'checked' : ''}> 1º Bimestre</label>
                            <label><input type="radio" name="anexoIVBimestre" value="2" ${bimestreAtualNum === '2' ? 'checked' : ''}> 2º Bimestre</label>
                            <label><input type="radio" name="anexoIVBimestre" value="3" ${bimestreAtualNum === '3' ? 'checked' : ''}> 3º Bimestre</label>
                            <label><input type="radio" name="anexoIVBimestre" value="4" ${bimestreAtualNum === '4' ? 'checked' : ''}> 4º Bimestre</label>
                        </div>
                        <p style="font-size:10px; color:#a0aec0; margin-top:3px;">Vem pré-selecionado conforme a data de hoje - troque se estiver gerando pra outro bimestre.</p>
                    </div>
                    <div style="margin-bottom: 15px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Breve descrição da atividade (contexto para a IA):</label>
                        <p style="font-size:11px; color:#718096; margin-bottom:5px;">Descreva em poucas linhas a atividade/conteúdo planejado. A IA usa isso pra rascunhar os campos do PEI abaixo. Você revisa e edita tudo antes de gerar o documento final.</p>
                        <textarea id="anexoIVDescricao" rows="4" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; font-size:12px; line-height:1.4;"></textarea>
                    </div>
                </div>

                <div style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn btn-secondary" onclick="closeModal('modalGerarDocumentoIA')">Cancelar</button>
                    <button class="btn btn-primary" id="btnGerarDocumentoIA" onclick="gerarDocumentoIA()">Gerar Estrutura</button>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    } else {
        // Atualiza os dropdowns caso o professor tenha adicionado/removido turmas
        const selSerie = document.getElementById('iaDocSerie');
        if(selSerie) selSerie.innerHTML = '<option value="">Selecione...</option>' + seriesUnicas.map(s => `<option value="${s}">${s}</option>`).join('');

        const selDisc = document.getElementById('iaDocDisciplina');
        if(selDisc) selDisc.innerHTML = '<option value="">Selecione...</option>' + disciplinasUnicas.map(d => `<option value="${d}">${d}</option>`).join('');

        // Atualiza o Tipo de Documento (visibilidade do Anexo III - PAEE muda com o modo/perfil) e a
        // lista de alunos AEE (pode ter mudado desde a última abertura do modal).
        const selTipo = document.getElementById('iaDocTipo');
        if (selTipo) selTipo.innerHTML = opcoesTipoDocHtml;

        const selAluno = document.getElementById('anexoPaeeAluno');
        if (selAluno) selAluno.innerHTML = alunosAeeOptionsHtml;

        // Anexo IV - PEI: mesma lógica de refresh (lista de alunos do Painel AEE e de professores AEE
        // podem ter mudado desde a última abertura do modal).
        const selDiscIV = document.getElementById('anexoIVDisciplina');
        if (selDiscIV) selDiscIV.innerHTML = '<option value="">Selecione...</option>' + disciplinasUnicas.map(d => `<option value="${d}">${d}</option>`).join('');
        const selAlunoIV = document.getElementById('anexoIVAluno');
        if (selAlunoIV) selAlunoIV.innerHTML = alunosPeiOptionsHtml;
        const selProfAeeIV = document.getElementById('anexoIVProfAee');
        if (selProfAeeIV) selProfAeeIV.innerHTML = professoresAeeOptionsHtml;
    }

    const docTema = document.getElementById('iaDocTema');
    if (docTema) docTema.value = '';
    const docSerie = document.getElementById('iaDocSerie');
    if (docSerie) docSerie.value = '';
    const docDisciplina = document.getElementById('iaDocDisciplina');
    if (docDisciplina) docDisciplina.value = '';
    const docSemana = document.getElementById('iaDocSemana');
    if (docSemana) docSemana.value = semanaSugerida;
    const docSemanaInicio = document.getElementById('iaDocSemanaInicio');
    if (docSemanaInicio) docSemanaInicio.value = semanaInicioISO;
    const docSemanaFim = document.getElementById('iaDocSemanaFim');
    if (docSemanaFim) docSemanaFim.value = semanaFimISO;

    const docPrompt = document.getElementById('iaDocPrompt');
    if (docPrompt) docPrompt.value = savedPrompt;

    const docAgendaMes = document.getElementById('iaAgendaMes');
    if (docAgendaMes) docAgendaMes.value = defaultMonth;
    const docAgendaAno = document.getElementById('iaAgendaAno');
    if (docAgendaAno) docAgendaAno.value = defaultYear;

    const anexoAluno = document.getElementById('anexoPaeeAluno');
    if (anexoAluno) anexoAluno.value = '';
    ['anexoPaeeNascimento', 'anexoPaeeEscolaridade', 'anexoPaeeTurno', 'anexoPaeeNotas'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.querySelectorAll('input[name="anexoPaeeSexo"], input[name="anexoPaeeNivel"]').forEach(el => el.checked = false);
    document.querySelectorAll('#camposAnexoPaee input[type="checkbox"]').forEach(el => { el.checked = el.id === 'anexoEleg_CHECK_ELEG_TEA'; });

    ['anexoIVAluno', 'anexoIVDisciplina', 'anexoIVProfAee', 'anexoIVDescricao'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.querySelectorAll('input[name="anexoIVBimestre"]').forEach(el => { el.checked = el.value === bimestreAtualNum; });

    toggleTipoDocumentoIA();
    showModal('modalGerarDocumentoIA');
}

// Alterna os campos do modal do Estagiário conforme o Tipo de Documento escolhido: Plano de Aula usa
// IA (série/disciplina/tema/prompt), Agenda Mensal é só um preenchimento mecânico da grade do
// professor - pede apenas Mês/Ano e pula a etapa de revisão por IA.
function toggleTipoDocumentoIA() {
    const tipo = document.getElementById('iaDocTipo').value;
    const isAgenda = tipo === 'agenda_mensal';
    const isAnexoPaee = tipo === 'anexo3_paee';
    const isAnexoIV = tipo === 'anexo4_pei';

    const campoSemana = document.getElementById('campoSemanaVigente');
    if (campoSemana) campoSemana.style.display = (isAgenda || isAnexoPaee || isAnexoIV) ? 'none' : '';
    const campoMesAno = document.getElementById('campoMesAnoAgenda');
    if (campoMesAno) campoMesAno.style.display = isAgenda ? 'block' : 'none';
    const camposPlano = document.getElementById('camposPlanoAula');
    if (camposPlano) camposPlano.style.display = (isAgenda || isAnexoPaee || isAnexoIV) ? 'none' : '';
    const camposAnexo = document.getElementById('camposAnexoPaee');
    if (camposAnexo) camposAnexo.style.display = isAnexoPaee ? '' : 'none';
    const camposAnexoIV = document.getElementById('camposAnexoIV');
    if (camposAnexoIV) camposAnexoIV.style.display = isAnexoIV ? '' : 'none';

    const btn = document.getElementById('btnGerarDocumentoIA');
    if (btn) btn.textContent = isAgenda ? '🖨️ Gerar e Imprimir Agenda' : 'Gerar Estrutura';
}

// Preenche automaticamente os campos do Anexo III - PAEE com os dados já cadastrados do aluno
// selecionado (Ficha do Tutorado + turma vinculada), deixando tudo editável antes de gerar.
function preencherDadosEstudanteAnexoPaee() {
    const sel = document.getElementById('anexoPaeeAluno');
    const nascInput = document.getElementById('anexoPaeeNascimento');
    const escInput = document.getElementById('anexoPaeeEscolaridade');
    const turnoInput = document.getElementById('anexoPaeeTurno');
    const notasInput = document.getElementById('anexoPaeeNotas');
    if (!sel || !sel.value) {
        if (nascInput) nascInput.value = '';
        if (escInput) escInput.value = '';
        if (turnoInput) turnoInput.value = '';
        if (notasInput) notasInput.value = '';
        return;
    }

    const t = (data.tutorados || []).find(x => x.id == sel.value);
    if (!t) return;

    if (nascInput) nascInput.value = t.data_nascimento ? formatDate(t.data_nascimento) : '';

    const turmaInfo = (data.turmas || []).find(x => x.nome === t.turma);
    if (escInput) escInput.value = (turmaInfo && turmaInfo.ano_serie) ? turmaInfo.ano_serie : (t.turma || '');
    if (turnoInput) turnoInput.value = turmaInfo ? (turmaInfo.turno || '') : '';

    let notas = '';
    if (t.aee_diagnostico) notas += `Diagnóstico: ${t.aee_diagnostico}\n`;
    if (t.aee_relatorio) notas += `Relatório/Observações: ${t.aee_relatorio}`;
    if (notasInput) notasInput.value = notas;
}

function restaurarPromptPadraoIA() {
    const defaultPromptTemplate = `Você é um professor/coordenador pedagógico experiente do Estado de São Paulo. Crie a estrutura de um Plano de Aula de {{disciplina}} para a série/ano {{serie}} sobre o tema: "{{tema}}".\nUtilize seus profundos conhecimentos sobre o Currículo Paulista e os Materiais de Apoio (Caderno do Aluno/Professor) da SEDUC-SP.\nAs habilidades devem seguir estritamente o código e formato do Currículo Paulista específicos da disciplina de {{disciplina}} (ex: se for Matemática, use EF...MA..., se for Arte, EF...AR..., etc.).\nA Aprendizagem Essencial deve ser compatível com os documentos curriculares oficiais da disciplina.\nRetorne APENAS um objeto JSON válido (sem marcações markdown e escape corretamente aspas e quebras de linha usando \\n) com as seguintes chaves textuais estritas:\n{"aprendizagem_essencial": "Habilidade central do Currículo Paulista", "conteudos": "lista de conteúdos", "habilidades": "lista de habilidades cognitivas a desenvolver com os códigos do Currículo Paulista da disciplina solicitada", "objetivos": "objetivos da aula", "desenvolvimento": "introdução, desenvolvimento e conclusão com tempos sugeridos", "materiais": "recursos utilizados", "avaliacao": "critérios e instrumentos"}`;
    const txt = document.getElementById('iaDocPrompt');
    if (txt) {
        txt.value = defaultPromptTemplate;
        localStorage.setItem('ia_prompt_template', defaultPromptTemplate);
    }
}

// Gera e imprime a Agenda Mensal de Trabalho a partir do modelo Docs/AgendaNova.html: só pede
// Mês/Ano (sem passar pela IA nem pela tela de revisão, já que aqui não há texto pra redigir - é um
// preenchimento mecânico da grade horária + aulas que o professor já organizou no Dashboard/Grade).
// Segue o mesmo esquema de placeholders {{REGIÃO}}/{{NOME COMPLETO DA ESCOLA}}/{{LOGO_ESTADO}}/
// {{LOGO_ESCOLA}} já usado no Plano de Aula (Docs/Base_Plano_Aula.html), pra reaproveitar as mesmas
// configurações da escola/sistema.
async function gerarAgendaMensalEstagiario() {
    const mes = parseInt(document.getElementById('iaAgendaMes').value);
    const ano = parseInt(document.getElementById('iaAgendaAno').value);
    if (isNaN(mes) || isNaN(ano) || ano < 2000) return alert('Informe um Mês e Ano válidos.');

    const btn = document.getElementById('btnGerarDocumentoIA');
    const originalText = btn.textContent;
    btn.textContent = 'Gerando agenda... ⏳';
    btn.disabled = true;

    try {
        // 1. Carrega o modelo (template) da agenda
        let templateHtml = '';
        try {
            const response = await fetch('Docs/AgendaNova.html');
            if (!response.ok) throw new Error('HTTP ' + response.status);
            templateHtml = await response.text();
        } catch (fetchErr) {
            console.error(fetchErr);
            return alert('Erro ao carregar o modelo Docs/AgendaNova.html. Verifique se o arquivo está na pasta do sistema.');
        }

        // 2. Busca configurações globais e da escola (mesmo padrão do Plano de Aula)
        let configSistema = {};
        let configEscola = {};
        try {
            configSistema = await getData('system', 'config_sistema') || {};
            if (currentUser && currentUser.schoolId) {
                const sData = await getData('system', 'schools_list');
                const schools = (sData && sData.list) ? sData.list : [];
                configEscola = schools.find(s => s.id == currentUser.schoolId) || {};
            }
        } catch (e) { console.warn('Erro ao buscar configs da escola', e); }

        const fallbackLogo = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
        const regiao = configSistema.regiao || 'REGIÃO NÃO CONFIGURADA';
        const logoEstado = configSistema.logoEstado || fallbackLogo;
        const nomeCompletoEscola = configEscola.nomeCompleto || configEscola.nome || 'ESCOLA NÃO CONFIGURADA';
        const logoEscola = configEscola.logoEscola || fallbackLogo;

        // 3. Substitui os marcadores globais do cabeçalho (uma única vez, texto puro)
        let htmlFinal = templateHtml
            // AgendaNova.html foi exportado do Google Docs, que grava acentos como entidades HTML
            // (Ã -> &Atilde;, ê -> &ecirc;) mesmo dentro dos marcadores {{ }} - por isso os dois
            // primeiros casamentos usam a forma decimal/entidade em vez do caractere acentuado.
            .replace(/{{REGI&Atilde;O}}/g, regiao)
            .replace(/{{NOME COMPLETO DA ESCOLA}}/g, nomeCompletoEscola)
            .replace(/{{TIPO DE DOC}}/g, 'AGENDA MENSAL DE TRABALHO')
            .replace(/{{Professor}}/g, currentUser.nome)
            .replace(/{{M&ecirc;s}}/g, MESES_AGENDA[mes])
            .replace(/{{Ano}}/g, ano);

        // 4. Carrega a grade fixa (definida pelo Gestor), exceções (dias atípicos) e as aulas que o
        // próprio professor organizou em sua Grade de Horários dentro do SisProf.
        const gradeEscola = await getGradeEscola();
        if (gradeEscola.length === 0) return alert('A grade de horários ainda não foi configurada pela gestão.');

        let excecoesGrade = [];
        if (currentUser && currentUser.schoolId) {
            const keyGestor = 'app_data_school_' + currentUser.schoolId + '_gestor';
            const gestorData = await getData('app_data', keyGestor);
            if (gestorData) excecoesGrade = gestorData.gradeHorariaExcecoes || [];
        }
        const minhasAulas = data.horariosAulas || [];
        const turmas = data.turmas || [];

        const mapFixed = { tutoria: 'Tutoria', almoco: 'Almoço', cafe: 'Café', atpca: 'ATPCA', apcg: 'APCG', reuniao: 'Reunião' };
        const mapProf = { tutoria: 'Tutoria', estudo: 'Estudo', apcg: 'APCG', atpca: 'ATPCA', reuniao: 'Reunião', almoco: 'Almoço', cafe: 'Café', ped_presenc: 'Ped. Presenç.', eletiva: 'Eletiva' };

        // Acha o bloco da grade correspondente a uma "N-ésima aula" de um dia (1=Seg...5=Sex), dando
        // preferência ao rótulo (label) configurado pelo gestor e caindo pra ordem de horário quando
        // não houver rótulo - e resolve o conteúdo (turma/disciplina ou tipo fixo) daquele bloco.
        function montarConteudoCelula(diaSemana, aulaNum, dataStr) {
            const excecao = excecoesGrade.find(e => e.data === dataStr);
            let bloco = null;

            if (excecao) {
                if (excecao.blocos && excecao.blocos.length >= aulaNum) bloco = excecao.blocos[aulaNum - 1];
            } else {
                bloco = gradeEscola.find(g => g.diaSemana == diaSemana && (g.label || '').trim().startsWith(aulaNum.toString()));
                if (!bloco) {
                    const blocosDoDia = gradeEscola.filter(g => g.diaSemana == diaSemana).sort((a, b) => a.inicio.localeCompare(b.inicio));
                    if (blocosDoDia.length >= aulaNum) bloco = blocosDoDia[aulaNum - 1];
                }
            }
            if (!bloco) return '';

            if (bloco.tipo) return mapFixed[bloco.tipo] || bloco.tipo.toUpperCase();

            const aula = minhasAulas.find(a => a.id_bloco == bloco.id);
            if (!aula) return '';
            if (aula.tipo === 'aula' && aula.id_turma) {
                const t = turmas.find(x => x.id == aula.id_turma);
                if (!t) return 'Turma Excluída';
                return t.disciplina ? `${t.nome}<br><span style="font-size:8pt;">${t.disciplina}</span>` : t.nome;
            }
            const rotulo = mapProf[aula.tipo] || aula.tipo;
            return aula.tema ? `${rotulo}<br><span style="font-size:8pt;">${aula.tema}</span>` : rotulo;
        }

        // 5. Faz o parse do modelo e localiza os logos + a tabela semanal (que será duplicada)
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlFinal, 'text/html');

        const imgEstado = doc.querySelector('img.image-1');
        if (imgEstado) imgEstado.src = logoEstado;
        const imgEscola = doc.querySelector('img.image-2');
        if (imgEscola) imgEscola.src = logoEscola;

        const templateTable = doc.querySelector('table.c22');
        if (!templateTable) return alert('Modelo Docs/AgendaNova.html inválido: tabela semanal não encontrada.');

        // 6. Calcula quantas semanas (segunda a sábado) o mês precisa e clona a tabela-modelo pra cada uma
        const primeiroDia = new Date(ano, mes, 1);
        const ultimoDia = new Date(ano, mes + 1, 0);
        const folgaPrimeiraSemana = (primeiroDia.getDay() + 6) % 7; // 0=Seg ... 6=Dom
        const semanasNecessarias = Math.ceil((ultimoDia.getDate() + folgaPrimeiraSemana) / 7);
        const primeiraSegunda = new Date(ano, mes, 1 - folgaPrimeiraSemana);

        const tabelasSemana = [templateTable];
        let ultimaInserida = templateTable;
        for (let i = 1; i < semanasNecessarias; i++) {
            const clone = templateTable.cloneNode(true);
            clone.style.marginTop = '12px';
            ultimaInserida.parentNode.insertBefore(clone, ultimaInserida.nextSibling);
            ultimaInserida = clone;
            tabelasSemana.push(clone);
        }

        // 7. Preenche cada semana com as datas do mês e as aulas/compromissos do professor
        tabelasSemana.forEach((tabela, semanaIdx) => {
            const segunda = new Date(primeiraSegunda);
            segunda.setDate(primeiraSegunda.getDate() + semanaIdx * 7);

            const diasDaSemana = [];
            let temDiaNoMes = false;
            for (let d = 0; d < 6; d++) { // 0=Seg ... 5=Sáb
                const dt = new Date(segunda);
                dt.setDate(segunda.getDate() + d);
                diasDaSemana.push(dt);
                if (dt.getMonth() === mes) temDiaNoMes = true;
            }

            if (!temDiaNoMes) { tabela.remove(); return; }

            const linhas = Array.from(tabela.querySelectorAll('tr'));
            const linhaDatas = linhas[1]; // thead: [0]=nomes dos dias, [1]=números dos dias
            const celulasDatas = linhaDatas ? Array.from(linhaDatas.cells) : [];

            for (let d = 0; d < 6; d++) {
                const dt = diasDaSemana[d];
                const isMesAtual = dt.getMonth() === mes;
                const celula = celulasDatas[d + 1];
                const span = celula ? celula.querySelector('span') : null;
                if (span) span.textContent = isMesAtual ? dt.getDate() : '';
            }

            // tbody: linhas de "1ª Aula" a "9ª Aula" (a de Almoço não tem número e é ignorada, mantendo
            // seu texto fixo do modelo)
            linhas.slice(2).forEach(linha => {
                const rotuloLinha = linha.cells[0] ? linha.cells[0].textContent.trim() : '';
                const match = rotuloLinha.match(/(\d+)/);
                if (!match) return;
                const aulaNum = parseInt(match[1]);

                for (let d = 0; d < 5; d++) { // Segunda a Sexta (Sábado não tem aula fixa)
                    const dt = diasDaSemana[d];
                    const celula = linha.cells[d + 1];
                    const span = celula ? celula.querySelector('span') : null;
                    if (!span) continue;

                    if (dt.getMonth() !== mes) { span.innerHTML = ''; continue; }

                    const dataStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
                    span.innerHTML = montarConteudoCelula(d + 1, aulaNum, dataStr);
                }
            });
        });

        // 8. Garante que o CSS relativo do modelo (Docs/style.css) carregue na janela de impressão.
        // Precisa ser o primeiro elemento do <head> - o navegador já dispara o fetch do <link
        // rel="stylesheet"> ao encontrá-lo durante o parse do document.write(), antes de processar
        // qualquer <base> que viesse depois dele.
        const base = doc.createElement('base');
        base.href = new URL('Docs/AgendaNova.html', window.location.href).href;
        doc.head.insertBefore(base, doc.head.firstChild);

        const printStyle = doc.createElement('style');
        printStyle.textContent = '@media print { body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }';
        doc.head.appendChild(printStyle);

        const win = window.open('', '', 'width=1200,height=800');
        if (!win) throw new Error('O navegador bloqueou a abertura da janela (Pop-up). Permita pop-ups no seu navegador para gerar a agenda.');
        win.document.write(doc.documentElement.outerHTML);
        win.document.close();
        setTimeout(() => { win.print(); }, 500);

        closeModal('modalGerarDocumentoIA');
    } catch (e) {
        alert('Erro ao gerar a agenda: ' + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Chamada de IA compartilhada por qualquer Tipo de Documento do Estagiário que precise de um JSON
// estruturado como saída (Plano de Aula, Anexo III - PAEE...): busca a(s) chave(s) configuradas,
// tenta os provedores/modelos com fallback e devolve o objeto já parseado. Lança erro (pro chamador
// tratar com alert) se a chave não estiver configurada, se todas as tentativas falharem ou se a IA
// não devolver um JSON válido.
async function chamarIAEstruturada(promptText, btn) {
    let apiKeys = [];
    try {
        const configData = await getData('system', 'config_ia');
        if (configData && configData.apiKey) {
            apiKeys = configData.apiKey.split(',').map(k => k.trim()).filter(k => k);
        }
    } catch(e) {
        console.warn('Erro ao buscar chave da IA:', e);
    }

    if (apiKeys.length === 0) throw new Error('⚠️ A chave da API não foi configurada. Peça ao Administrador para entrar no painel Super Admin e adicioná-la na aba Migração.');

    let success = false;
    let lastError = '';
    let respostaTexto = '';

    let tentativas = 3; // Tenta até 3 vezes
    const modelosFallback = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];

    for (let i = 0; i < tentativas && !success; i++) {
        const modeloAtual = modelosFallback[i % modelosFallback.length];

        for (const currentKey of apiKeys) {
            try {
                if (btn) btn.textContent = `Gerando estrutura... ⏳ (Tentativa ${i+1}/3)`;

                // Implementa limite de tempo (20 segundos) para evitar congelamento da tela
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000);

                // --- ROTEADOR MULTI-IA AUTOMÁTICO ---
                if (currentKey.startsWith('sk-') && !currentKey.startsWith('sk-ant-')) {
                    // 1. OPENAI (ChatGPT - GPT-4o-mini)
                    const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentKey}` },
                        body: JSON.stringify({
                            model: 'gpt-4o-mini',
                            messages: [
                                { role: 'system', content: 'Você deve retornar APENAS um JSON válido. Nenhuma formatação markdown.' },
                                { role: 'user', content: promptText }
                            ],
                            temperature: 0.7,
                            response_format: { type: "json_object" }
                        }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    if (!response.ok) throw new Error(`OpenAI Erro: ${response.statusText}`);
                    const apiDataObj = await response.json();
                    respostaTexto = apiDataObj.choices[0].message.content;

                } else if (currentKey.startsWith('gsk_')) {
                    // 2. GROQ (Llama-3 - Super Rápido)
                    const response = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentKey}` },
                        body: JSON.stringify({
                            model: 'llama-3.3-70b-versatile',
                            messages: [
                                { role: 'system', content: 'Você deve retornar APENAS um JSON válido. Nenhuma formatação markdown.' },
                                { role: 'user', content: promptText }
                            ],
                            temperature: 0.7,
                            response_format: { type: "json_object" }
                        }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    if (!response.ok) throw new Error(`Groq Erro: ${response.statusText}`);
                    const apiDataObj = await response.json();
                    respostaTexto = apiDataObj.choices[0].message.content;

                } else {
                    // 3. GOOGLE GEMINI (Padrão)
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modeloAtual}:generateContent?key=${currentKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: promptText }] }],
                            generationConfig: { temperature: 0.7, response_mime_type: "application/json" }
                        }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    if (!response.ok) {
                        const errorObj = await response.json();
                        throw new Error(errorObj.error ? errorObj.error.message : response.statusText);
                    }
                    const apiDataObj = await response.json();
                    if (!apiDataObj.candidates || apiDataObj.candidates.length === 0 || !apiDataObj.candidates[0].content) {
                        throw new Error('A IA não retornou um conteúdo válido.');
                    }
                    respostaTexto = apiDataObj.candidates[0].content.parts[0].text;
                }

                success = true;
                break; // Sucesso, sai do loop de chaves
            } catch (err) {
                lastError = err.name === 'AbortError' ? 'Tempo de resposta esgotado.' : err.message;
                console.warn(`⚠️ Falha na API (Tentativa ${i+1}):`, lastError);
            }
        }
        if (!success && i < tentativas - 1) {
            // Aguarda 2 segundos (2000ms) antes de tentar novamente, para dar tempo da API desafogar
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    if (!success) {
        throw new Error(`A Inteligência Artificial falhou ou rejeitou o pedido.\nMotivo: ${lastError}`);
    }

    // Limpa potenciais blocos markdown que a IA possa enviar por teimosia e converte para objeto
    let jsonLimpo = respostaTexto.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim();

    const jsonMatch = jsonLimpo.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        jsonLimpo = jsonMatch[0];
    }

    try {
        return JSON.parse(jsonLimpo);
    } catch (parseErr) {
        console.error("Erro no JSON retornado pela IA:", respostaTexto);
        throw new Error("A IA não retornou os dados no formato esperado. Por favor, tente gerar novamente.");
    }
}

async function gerarDocumentoIA() {
    const tipo = document.getElementById('iaDocTipo').value;
    if (tipo === 'agenda_mensal') return gerarAgendaMensalEstagiario();
    if (tipo === 'anexo3_paee') return gerarAnexoPaeeEstagiario();
    if (tipo === 'anexo4_pei') return gerarAnexoIVEstagiario();

    const tema = document.getElementById('iaDocTema').value;
    const serie = document.getElementById('iaDocSerie') ? document.getElementById('iaDocSerie').value : '';
    const disciplina = document.getElementById('iaDocDisciplina') ? document.getElementById('iaDocDisciplina').value : '';
    const semana = document.getElementById('iaDocSemana') ? document.getElementById('iaDocSemana').value : '';
    const semanaInicioISO = document.getElementById('iaDocSemanaInicio') ? document.getElementById('iaDocSemanaInicio').value : '';
    const semanaFimISO = document.getElementById('iaDocSemanaFim') ? document.getElementById('iaDocSemanaFim').value : '';

    if (!serie || !disciplina) return alert('Por favor, selecione a série e a disciplina.');
    if (!tema) return alert('Por favor, informe o tema/assunto.');

    const btn = document.querySelector('#modalGerarDocumentoIA .btn-primary');
    const originalText = btn.textContent;
    btn.textContent = 'Gerando estrutura... ⏳';
    btn.disabled = true;

    // Extrai turmas e duração
    const getSerieNome = (nome) => {
        if (!nome) return '';
        let n = nome.trim();
        n = n.replace(/[\s-]+[A-Za-z]$/i, '');
        n = n.replace(/(\d)[A-Za-z]$/i, '$1');
        n = n.replace(/([ºª])[A-Za-z]$/i, '$1');
        return n.trim();
    };

    const turmasMatch = (data.turmas || []).filter(t => getSerieNome(t.ano_serie || t.nome) === serie && t.disciplina === disciplina);
    const turmasNomesStr = turmasMatch.length > 0 ? turmasMatch.map(t => t.nome).join(', ') : 'Não detectada';

    let duracaoAulas = 0;
    if (turmasMatch.length > 0) {
        const idPrimeiraTurma = turmasMatch[0].id;
        const minhasAulas = data.horariosAulas || [];
        duracaoAulas = minhasAulas.filter(a => a.id_turma == idPrimeiraTurma && a.tipo === 'aula').length;
    }
    const duracaoAulasStr = duracaoAulas > 0 ? `${duracaoAulas} aula(s) (${duracaoAulas * 50} min)` : 'Não definida';

    const hoje = getTodayString();
    const configBimestres = data.configBimestres || [];
    const configAtual = configBimestres.find(c => hoje >= c.inicio && hoje <= c.fim);
    const bimestreAtual = configAtual ? `${configAtual.bim}º BIMESTRE` : 'BIMESTRE VIGENTE';

    try {
        let dadosEstruturados = {};
        let promptText = '';

        // Busca a fundamentação oficial (planilha de escopo-sequência + PDFs por palavra-chave)
        // antes de montar o prompt, pra IA usar dados reais em vez de "conhecimento profundo" de
        // memória - ver montarContextoCurriculoOficial no topo do arquivo. Não depende de chave de
        // IA (só Firestore + comparação de texto).
        const contextoOficial = await montarContextoCurriculoOficial(disciplina, serie, tema);

        let templateBase = document.getElementById('iaDocPrompt') ? document.getElementById('iaDocPrompt').value : '';
        if (!templateBase || templateBase.trim() === '') {
            templateBase = `Você é um professor/coordenador pedagógico experiente do Estado de São Paulo. Crie a estrutura de um Plano de Aula de {{disciplina}} para a série/ano {{serie}} sobre o tema: "{{tema}}".\nUtilize seus profundos conhecimentos sobre o Currículo Paulista e os Materiais de Apoio (Caderno do Aluno/Professor) da SEDUC-SP.\nAs habilidades devem seguir estritamente o código e formato do Currículo Paulista específicos da disciplina de {{disciplina}} (ex: se for Matemática, use EF...MA..., se for Arte, EF...AR..., etc.).\nA Aprendizagem Essencial deve ser compatível com os documentos curriculares oficiais da disciplina.\nRetorne APENAS um objeto JSON válido (sem marcações markdown e escape corretamente aspas e quebras de linha usando \\n) com as seguintes chaves textuais estritas:\n{"aprendizagem_essencial": "Habilidade central do Currículo Paulista", "conteudos": "lista de conteúdos", "habilidades": "lista de habilidades cognitivas a desenvolver com os códigos do Currículo Paulista da disciplina solicitada", "objetivos": "objetivos da aula", "desenvolvimento": "introdução, desenvolvimento e conclusão com tempos sugeridos", "materiais": "recursos utilizados", "avaliacao": "critérios e instrumentos"}`;
        }

        promptText = templateBase
            .replace(/{{disciplina}}/g, disciplina)
            .replace(/{{serie}}/g, serie)
            .replace(/{{tema}}/g, tema);

        // Verifica se o usuário colou um prompt externo que não contém os marcadores ou a estrutura JSON necessária
        const faltaMarcador = !templateBase.includes('{{disciplina}}') || !templateBase.includes('{{serie}}') || !templateBase.includes('{{tema}}');
        const faltaEstruturaJson = !templateBase.includes('{"aprendizagem_essencial"');

        // Injeta as diretrizes obrigatórias de forma invisível caso o prompt colado não as tenha
        if (faltaMarcador) {
            promptText += `\n\n[DADOS OBRIGATÓRIOS]\nO plano de aula DEVE ser sobre a disciplina de ${disciplina}, para a série/ano ${serie}, com o tema "${tema}".\nAs habilidades devem seguir o código e formato do Currículo Paulista específicos da disciplina de ${disciplina} (ex: se for Matemática, use EF...MA..., se for Arte, EF...AR...).`;
        }
        if (faltaEstruturaJson) {
            promptText += `\n\n[FORMATO DE SAÍDA OBRIGATÓRIO]\nRetorne APENAS um objeto JSON válido (sem marcações markdown e escape corretamente aspas e quebras de linha usando \\n) com as seguintes chaves textuais estritas:\n{"aprendizagem_essencial": "Habilidade central", "conteudos": "lista de conteúdos", "habilidades": "lista de habilidades com códigos", "objetivos": "objetivos da aula", "desenvolvimento": "introdução, desenvolvimento e conclusão com tempos sugeridos", "materiais": "recursos utilizados", "avaliacao": "critérios e instrumentos"}`;
        }

        // Injeta a fundamentação oficial (planilha/PDFs) sempre, independente do prompt usado -
        // mesmo princípio dos blocos [DADOS OBRIGATÓRIOS]/[FORMATO...] acima.
        promptText += montarBlocoContextoOficial(contextoOficial);

        dadosEstruturados = await chamarIAEstruturada(promptText, btn);

        // Quando a planilha oficial deu uma correspondência confiante, os campos com fonte 1:1 na
        // planilha (habilidades/conteúdos/objetivos) são sobrescritos com o dado real - não passam
        // pela IA, que ocasionalmente parafraseia ou corrompe um código alfanumérico mesmo tendo o
        // contexto correto no prompt.
        if (contextoOficial.tier1Confiante && contextoOficial.tier1) {
            const linhaOficial = contextoOficial.tier1;
            if ((linhaOficial.habilidades || []).length > 0) {
                dadosEstruturados.habilidades = linhaOficial.habilidades.map(h => `${h.codigo} - ${h.texto}`).join('\n');
            }
            if (linhaOficial.conteudo) dadosEstruturados.conteudos = linhaOficial.conteudo;
            if (linhaOficial.objetivos) dadosEstruturados.objetivos = linhaOficial.objetivos;
        }

        closeModal('modalGerarDocumentoIA');
        // Catálogo de Material Digital compartilhado pra essa disciplina+série (mesma coleção que
        // qualquer turma/professor da escola alimenta) - buscado aqui (função já é async) pra não
        // precisar tornar abrirModalRevisaoDocumento assíncrona.
        const cardsMaterialDigitalDisponiveis = await obterCardsCatalogoCompartilhado(disciplina, serie);
        const resumoFundamentacao = {
            grounded: contextoOficial.grounded,
            tier1Confiante: contextoOficial.tier1Confiante,
            fonte: contextoOficial.tier1 ? `${contextoOficial.tier1.fonteArquivo || ''} (aba ${contextoOficial.tier1.fonteAba || ''})` : null,
            qtdTrechosTier2: (contextoOficial.tier2Trechos || []).length
        };
        abrirModalRevisaoDocumento(tipo, serie, disciplina, tema, semana, turmasNomesStr, duracaoAulasStr, bimestreAtual, dadosEstruturados, semanaInicioISO, semanaFimISO, cardsMaterialDigitalDisponiveis, resumoFundamentacao);

    } catch (e) {
        console.error(e);
        alert('Erro ao gerar documento com IA:\n' + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Coleta os dados básicos + checkboxes preenchidos no formulário do Anexo III - PAEE, pede pra IA
// rascunhar os campos descritivos (com base nas notas do Estudo de Caso/diagnóstico do aluno) e abre
// a tela de revisão - mesmo fluxo do Plano de Aula (formulário -> IA -> revisão -> exportar).
async function gerarAnexoPaeeEstagiario() {
    const alunoId = document.getElementById('anexoPaeeAluno').value;
    if (!alunoId) return alert('Selecione o estudante.');
    const tutorado = (data.tutorados || []).find(t => t.id == alunoId);
    if (!tutorado) return alert('Estudante não encontrado.');

    const dadosBasicos = {
        nomeEstudante: tutorado.nome_estudante,
        dataNascimento: document.getElementById('anexoPaeeNascimento').value || '',
        escolaridade: document.getElementById('anexoPaeeEscolaridade').value || '',
        turno: document.getElementById('anexoPaeeTurno').value || '',
        sexo: document.querySelector('input[name="anexoPaeeSexo"]:checked') ? document.querySelector('input[name="anexoPaeeSexo"]:checked').value : '',
        nivelApoio: document.querySelector('input[name="anexoPaeeNivel"]:checked') ? document.querySelector('input[name="anexoPaeeNivel"]:checked').value : '',
        elegibilidade: ANEXO_PAEE_ELEGIBILIDADE.filter(o => document.getElementById('anexoEleg_' + o.token).checked).map(o => o.token),
        apoios: ANEXO_PAEE_APOIOS.filter(o => document.getElementById('anexoApoio_' + o.token).checked).map(o => o.token)
    };
    const notas = document.getElementById('anexoPaeeNotas').value || '';

    const hoje = getTodayString();
    const configBimestres = data.configBimestres || [];
    const configAtual = configBimestres.find(c => hoje >= c.inicio && hoje <= c.fim);
    const bimestreAtual = configAtual ? `${configAtual.bim}º BIMESTRE` : 'BIMESTRE VIGENTE';

    const btn = document.querySelector('#modalGerarDocumentoIA .btn-primary');
    const originalText = btn.textContent;
    btn.textContent = 'Gerando estrutura... ⏳';
    btn.disabled = true;

    try {
        const elegibilidadeLabels = ANEXO_PAEE_ELEGIBILIDADE.filter(o => dadosBasicos.elegibilidade.includes(o.token)).map(o => o.label);
        const apoiosLabels = ANEXO_PAEE_APOIOS.filter(o => dadosBasicos.apoios.includes(o.token)).map(o => o.label);

        const promptText = `Você é um Professor Especializado de Atendimento Educacional Especializado (AEE) do Estado de São Paulo, redigindo o Anexo III - Plano de AEE (PAEE) de um estudante.
Dados do estudante: ${dadosBasicos.nomeEstudante}, ${dadosBasicos.escolaridade || 'série não informada'}, turno ${dadosBasicos.turno || 'não informado'}.
Categoria(s) de elegibilidade à Educação Especial: ${elegibilidadeLabels.join(', ') || 'não informada'}.
Nível de apoio: ${dadosBasicos.nivelApoio || 'não informado'}.
Apoios/Recursos/Serviços já indicados: ${apoiosLabels.join(', ') || 'nenhum indicado'}.
Bimestre vigente: ${bimestreAtual}.
Notas do Estudo de Caso / diagnóstico e relatório já registrados pelo professor:
"""${notas || 'Nenhuma nota registrada - use cautela e deixe claro nos campos que o professor precisa detalhar melhor o caso.'}"""

Com base nesses dados, redija os campos abaixo do Anexo III - PAEE, em português, de forma técnica, objetiva e alinhada às diretrizes da Educação Especial da SEDUC-SP. Não invente diagnósticos, laudos ou informações que não constam nas notas acima.
Retorne APENAS um objeto JSON válido (sem marcações markdown e escape corretamente aspas e quebras de linha usando \\n) com as seguintes chaves textuais estritas:
{${ANEXO_PAEE_CAMPOS_IA.map(c => `"${c.key}": "${c.label}"`).join(', ')}}`;

        const dadosEstruturados = await chamarIAEstruturada(promptText, btn);

        closeModal('modalGerarDocumentoIA');
        abrirModalRevisaoAnexoPaee(dadosBasicos, dadosEstruturados, alunoId);
    } catch (e) {
        console.error(e);
        alert('Erro ao gerar documento com IA:\n' + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Coleta os dados básicos do formulário do Anexo IV - PEI (estudante do Painel AEE, disciplina que o
// Professor Regente leciona pra ele, Professor Especializado escolhido e a breve descrição da
// atividade), pede pra IA rascunhar os 3 campos descritivos do PEI e abre a tela de revisão - mesmo
// fluxo do Anexo III - PAEE (formulário -> IA -> revisão -> exportar).
async function gerarAnexoIVEstagiario() {
    const selAluno = document.getElementById('anexoIVAluno');
    const alunoId = selAluno ? selAluno.value : '';
    if (!alunoId) return alert('Selecione o estudante.');
    const nomeEstudante = selAluno.options[selAluno.selectedIndex].textContent;

    const disciplina = document.getElementById('anexoIVDisciplina').value;
    if (!disciplina) return alert('Selecione a disciplina.');

    const selProfAee = document.getElementById('anexoIVProfAee');
    const profAeeId = selProfAee ? selProfAee.value : '';
    if (!profAeeId) return alert('Selecione o Professor Especializado (AEE).');
    const nomeProfAee = selProfAee.options[selProfAee.selectedIndex].textContent;

    const descricaoAtividade = document.getElementById('anexoIVDescricao').value || '';

    const bimestreSelecionado = document.querySelector('input[name="anexoIVBimestre"]:checked');
    if (!bimestreSelecionado) return alert('Selecione o Bimestre.');
    const bimestreNum = bimestreSelecionado.value;
    const bimestreAtual = `${bimestreNum}º BIMESTRE`;

    // Contexto real do estudante pra IA propor adaptações condizentes com o perfil dele - a fonte
    // principal é o Anexo III - PAEE já estruturado (t.anexoPaee.dados: habilidades desenvolvidas,
    // estratégias, planejamento bimestral etc. - ver ANEXO_PAEE_CAMPOS_IA), já que os campos de texto
    // livre aee_diagnostico/aee_relatorio saíram da ficha e não são mais editados (ver comentário em
    // app.js: salvarDadosAee). Cai pros campos legados só se o Anexo III ainda não tiver sido gerado.
    // Vem do snapshot buscado em abrirModalGerarDocumentoIA (ultimaListaTutoradosAeeParaAnexoIV), não
    // do Firestore de novo, já que o estudante escolhido é o mesmo da lista carregada na abertura do modal.
    const tutoradoSelecionado = ultimaListaTutoradosAeeParaAnexoIV.find(t => t.id == alunoId);
    const anexoPaeeDoAluno = tutoradoSelecionado && tutoradoSelecionado.anexoPaee;
    const camposAnexoPaeePreenchidos = (anexoPaeeDoAluno && anexoPaeeDoAluno.dados)
        ? ANEXO_PAEE_CAMPOS_IA
            .filter(c => (anexoPaeeDoAluno.dados[c.key] || '').trim())
            .map(c => `${c.label}: ${anexoPaeeDoAluno.dados[c.key].trim()}`)
        : [];
    const fichaAnexoIIITexto = camposAnexoPaeePreenchidos.join('\n');
    const diagnosticoLegado = [
        tutoradoSelecionado && tutoradoSelecionado.aee_diagnostico,
        tutoradoSelecionado && tutoradoSelecionado.aee_relatorio
    ].filter(Boolean).join('\n');
    const fichaAeeTexto = fichaAnexoIIITexto || diagnosticoLegado;
    const fichaAeeVazia = !fichaAeeTexto;

    const dadosBasicos = {
        nomeEstudante,
        disciplina,
        professorRegente: currentUser.nome,
        profAeeId,
        nomeProfAee,
        bimestre: bimestreNum,
        descricaoAtividade,
        fichaAeeVazia
    };

    const btn = document.querySelector('#modalGerarDocumentoIA .btn-primary');
    const originalText = btn.textContent;
    btn.textContent = 'Gerando estrutura... ⏳';
    btn.disabled = true;

    try {
        const fichaAeeBloco = fichaAeeVazia
            ? '\nO Anexo III - PAEE deste estudante ainda não foi preenchido/gerado - gere as adaptações de forma geral, adequada a estudantes atendidos pelo AEE, sem inventar um diagnóstico específico.'
            : `\nInformações do Anexo III - Plano de AEE (PAEE) já registrado pelo Professor Especializado para este estudante:\n"""${fichaAeeTexto}"""\nUse essas informações pra adequar as estratégias, intervenções pedagógicas e recursos de acessibilidade ao perfil real do estudante - não invente nada além do que consta aqui.`;

        const promptText = `Você é um professor de ${disciplina} do Estado de São Paulo, redigindo o Anexo IV - Plano Educacional Individualizado (PEI) de um estudante atendido pelo AEE (Atendimento Educacional Especializado).
Estudante: ${nomeEstudante}. Componente Curricular: ${disciplina}. Bimestre: ${bimestreAtual}.
Breve descrição da atividade/conteúdo planejado pelo professor:
"""${descricaoAtividade || 'Nenhuma descrição informada - use cautela e sugira conteúdos e estratégias gerais e acessíveis, deixando claro que o professor precisa detalhar melhor a atividade.'}"""
${fichaAeeBloco}

Com base nesses dados, redija os campos abaixo do Anexo IV - PEI, em português, de forma técnica, objetiva e alinhada às diretrizes da Educação Especial da SEDUC-SP, adaptando conteúdos e estratégias às necessidades de acessibilidade do estudante. Não invente diagnósticos ou informações que não constam acima.
No campo de conteúdos e habilidades do currículo, cite sempre o(s) código(s) oficial(is) de habilidade do Currículo Paulista específicos da disciplina de ${disciplina} (ex: EF69AR11 pra Arte, EF67MA... pra Matemática etc.), seguido(s) da descrição da habilidade - nunca deixe esse campo sem pelo menos um código.
Retorne APENAS um objeto JSON válido (sem marcações markdown e escape corretamente aspas e quebras de linha usando \\n) com as seguintes chaves textuais estritas:
{${ANEXO_PEI_CAMPOS_IA.map(c => `"${c.key}": "${c.label}"`).join(', ')}}`;

        const dadosEstruturados = await chamarIAEstruturada(promptText, btn);

        closeModal('modalGerarDocumentoIA');
        abrirModalRevisaoAnexoIV(dadosBasicos, dadosEstruturados, alunoId);
    } catch (e) {
        console.error(e);
        alert('Erro ao gerar documento com IA:\n' + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function abrirModalRevisaoDocumento(tipo, serie, disciplina, tema, semana, turmasStr, duracaoAulas, bimestreAtual, dados, semanaInicioISO, semanaFimISO, cardsMaterialDigitalDisponiveis, resumoFundamentacao) {
    if (!document.getElementById('modalRevisaoDocumento')) {
        const div = document.createElement('div');
        div.id = 'modalRevisaoDocumento';
        div.className = 'modal';
        document.body.appendChild(div);
    }

    // Salvar meta-dados no modal invisivelmente para uso na exportação final
    const modal = document.getElementById('modalRevisaoDocumento');
    modal.dataset.tipo = tipo;
    modal.dataset.serie = serie;
    modal.dataset.disciplina = disciplina;
    modal.dataset.tema = tema;
    modal.dataset.semana = semana;
    modal.dataset.turmasStr = turmasStr;
    modal.dataset.duracaoAulas = duracaoAulas;
    modal.dataset.bimestre = bimestreAtual;
    modal.dataset.semanaInicio = semanaInicioISO || '';
    modal.dataset.semanaFim = semanaFimISO || '';

    let formHtml = '';
    if (tipo === 'plano_aula') {
        formHtml = `
            <div style="max-height: 50vh; overflow-y: auto; padding-right: 10px;">
                <div style="margin-bottom: 15px;">
                    <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">Aprendizagem Essencial (AE):</label>
                    <textarea id="revDocAE" rows="2" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados.aprendizagem_essencial || ''}</textarea>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom: 15px;">
                    <div>
                        <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">Conteúdos:</label>
                        <textarea id="revDocConteudos" rows="3" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados.conteudos || ''}</textarea>
                    </div>
                    <div>
                        <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">Habilidades:</label>
                        <textarea id="revDocHabilidades" rows="3" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados.habilidades || ''}</textarea>
                    </div>
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">Objetivos da Aula:</label>
                    <textarea id="revDocObjetivos" rows="2" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados.objetivos || ''}</textarea>
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">Desenvolvimento / Metodologia:</label>
                    <textarea id="revDocDesenvolvimento" rows="5" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados.desenvolvimento || ''}</textarea>
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">Materiais e Recursos:</label>
                    <textarea id="revDocMateriais" rows="2" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados.materiais || ''}</textarea>
                </div>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">Avaliação:</label>
                <textarea id="revDocAvaliacao" rows="3" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados.avaliacao || ''}</textarea>
            </div>
        `;
    }

    // Seletor de "qual aula do Material Digital foi dada" - reaproveita o catálogo compartilhado da
    // escola pra essa disciplina+série (já resolvido em gerarDocumentoIA, antes de chamar esta função).
    // Fica de fora do PDF por exigência do usuário - só é lido em exportarDocumentoFinal() pra anexar
    // aos rascunhos de registrosAula (automações).
    const cardsMaterialDigitalHtml = renderizarSeletorCardsMaterialDigitalDeLista(cardsMaterialDigitalDisponiveis || [], [], 'revDocCardsMaterialDigital');

    // Aviso de fundamentação na base curricular oficial (planilha/PDFs) - ver montarContextoCurriculoOficial.
    const fundamentacaoHtml = resumoFundamentacao && resumoFundamentacao.grounded
        ? `<div style="background:#f0fff4; border:1px solid #9ae6b4; color:#276749; padding:8px 12px; border-radius:6px; margin-bottom:15px; font-size:13px;">✅ Fundamentado no Currículo Paulista${resumoFundamentacao.fonte ? ` (${resumoFundamentacao.fonte})` : ''}${resumoFundamentacao.qtdTrechosTier2 ? ` + ${resumoFundamentacao.qtdTrechosTier2} trecho(s) de material oficial` : ''}.</div>`
        : `<div style="background:#fffaf0; border:1px solid #fbd38d; color:#975a16; padding:8px 12px; border-radius:6px; margin-bottom:15px; font-size:13px;">⚠️ Gerado sem fundamentação na base curricular oficial — revise os códigos de habilidade com atenção.</div>`;

    document.getElementById('modalRevisaoDocumento').innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:10px; margin-bottom:15px;">
                <h2 style="margin: 0;">📝 Revisar e Editar Documento</h2>
                <button class="btn btn-sm btn-danger" style="padding: 2px 8px;" onclick="closeModal('modalRevisaoDocumento')">×</button>
            </div>
            <div style="background:#ebf8ff; border:1px solid #bee3f8; padding:12px; border-radius:6px; margin-bottom:20px; font-size:14px;">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:5px;">
                    <div><strong style="color:#2b6cb0;">Professor:</strong> <span>${currentUser.nome}</span></div>
                    <div><strong style="color:#2b6cb0;">Disciplina:</strong> <span>${disciplina}</span></div>
                    <div><strong style="color:#2b6cb0;">Turmas:</strong> <span style="font-size:12px;">${turmasStr}</span></div>
                    <div><strong style="color:#2b6cb0;">Duração Prevista:</strong> <span>${duracaoAulas}</span></div>
                </div>
                <div style="border-top:1px dashed #bee3f8; margin-top:5px; padding-top:5px;">
                    <strong style="color:#2b6cb0;">Semana:</strong> <span>${semana}</span> | <strong style="color:#2b6cb0;">Tema:</strong> <span>${tema}</span> | <strong style="color:#2b6cb0;">Bimestre:</strong> <span>${bimestreAtual}</span>
                </div>
            </div>
            <p style="font-size:13px; color:#666; margin-bottom:15px;">Abaixo está a estrutura pré-gerada. Fique à vontade para ajustar o texto antes de exportar o arquivo final.</p>
            ${fundamentacaoHtml}
            ${formHtml}
            ${cardsMaterialDigitalHtml}
            <div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0; padding-top:15px;">
                <button class="btn btn-secondary" onclick="closeModal('modalRevisaoDocumento'); showModal('modalGerarDocumentoIA')">← Voltar</button>
                <button class="btn btn-success" onclick="exportarDocumentoFinal('${tipo}')" id="btnExportarDoc">💾 Gerar PDF Final</button>
            </div>
        </div>
    `;
    showModal('modalRevisaoDocumento');
}

// Tela de revisão do Anexo III - PAEE: mostra um resumo dos dados básicos/checkboxes preenchidos no
// formulário (não editáveis aqui - volte pro formulário pra corrigi-los) e uma textarea editável por
// campo descritivo rascunhado pela IA. Segue o mesmo padrão de abrirModalRevisaoDocumento.
function abrirModalRevisaoAnexoPaee(dadosBasicos, dados, alunoId) {
    if (!document.getElementById('modalRevisaoAnexoPaee')) {
        const div = document.createElement('div');
        div.id = 'modalRevisaoAnexoPaee';
        div.className = 'modal';
        document.body.appendChild(div);
    }

    const modal = document.getElementById('modalRevisaoAnexoPaee');
    modal.dataset.basicos = JSON.stringify(dadosBasicos);
    modal.dataset.alunoId = alunoId;

    const elegibilidadeLabels = ANEXO_PAEE_ELEGIBILIDADE.filter(o => dadosBasicos.elegibilidade.includes(o.token)).map(o => o.label);
    const apoiosLabels = ANEXO_PAEE_APOIOS.filter(o => dadosBasicos.apoios.includes(o.token)).map(o => o.label);
    const sexoLabel = dadosBasicos.sexo === 'F' ? 'Feminino' : (dadosBasicos.sexo === 'M' ? 'Masculino' : 'Não informado');

    const camposHtml = ANEXO_PAEE_CAMPOS_IA.map(c => `
        <div style="margin-bottom: 15px;">
            <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">${c.label}:</label>
            <textarea id="revAnexo_${c.key}" rows="3" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados[c.key] || ''}</textarea>
        </div>
    `).join('');

    document.getElementById('modalRevisaoAnexoPaee').innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:10px; margin-bottom:15px;">
                <h2 style="margin: 0;">📝 Revisar Anexo III - PAEE</h2>
                <button class="btn btn-sm btn-danger" style="padding: 2px 8px;" onclick="closeModal('modalRevisaoAnexoPaee')">×</button>
            </div>
            <div style="background:#ebf8ff; border:1px solid #bee3f8; padding:12px; border-radius:6px; margin-bottom:20px; font-size:14px;">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:5px;">
                    <div><strong style="color:#2b6cb0;">Estudante:</strong> <span>${dadosBasicos.nomeEstudante}</span></div>
                    <div><strong style="color:#2b6cb0;">Nascimento:</strong> <span>${dadosBasicos.dataNascimento || 'Não informado'}</span></div>
                    <div><strong style="color:#2b6cb0;">Escolaridade:</strong> <span>${dadosBasicos.escolaridade || 'Não informado'}</span></div>
                    <div><strong style="color:#2b6cb0;">Turno:</strong> <span>${dadosBasicos.turno || 'Não informado'}</span></div>
                    <div><strong style="color:#2b6cb0;">Sexo:</strong> <span>${sexoLabel}</span></div>
                    <div><strong style="color:#2b6cb0;">Nível de Apoio:</strong> <span>${dadosBasicos.nivelApoio ? 'Nível ' + dadosBasicos.nivelApoio : 'Não informado'}</span></div>
                </div>
                <div style="border-top:1px dashed #bee3f8; margin-top:5px; padding-top:5px; font-size:13px;">
                    <strong style="color:#2b6cb0;">Elegibilidade:</strong> <span>${elegibilidadeLabels.join(', ') || 'Não informado'}</span><br>
                    <strong style="color:#2b6cb0;">Apoios/Recursos/Serviços:</strong> <span>${apoiosLabels.join(', ') || 'Nenhum'}</span>
                </div>
            </div>
            <p style="font-size:13px; color:#666; margin-bottom:15px;">Os dados básicos acima vêm do formulário anterior (volte pra corrigi-los). Revise e ajuste abaixo o texto rascunhado pela IA antes de exportar o documento final.</p>
            <div style="max-height: 50vh; overflow-y: auto; padding-right: 10px;">
                ${camposHtml}
            </div>
            <div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0; padding-top:15px;">
                <button class="btn btn-secondary" onclick="closeModal('modalRevisaoAnexoPaee'); showModal('modalGerarDocumentoIA')">← Voltar</button>
                <button class="btn btn-success" onclick="exportarAnexoPaeeFinal()" id="btnExportarAnexoPaee">💾 Gerar Documento Final</button>
            </div>
        </div>
    `;
    showModal('modalRevisaoAnexoPaee');
}

// Tela de revisão do Anexo IV - PEI: mesmo padrão de abrirModalRevisaoAnexoPaee - resumo dos dados
// básicos do formulário (não editáveis aqui - volte pro formulário pra corrigi-los) e uma textarea
// editável por campo descritivo rascunhado pela IA.
function abrirModalRevisaoAnexoIV(dadosBasicos, dados, alunoId) {
    if (!document.getElementById('modalRevisaoAnexoIV')) {
        const div = document.createElement('div');
        div.id = 'modalRevisaoAnexoIV';
        div.className = 'modal';
        document.body.appendChild(div);
    }

    const modal = document.getElementById('modalRevisaoAnexoIV');
    modal.dataset.basicos = JSON.stringify(dadosBasicos);
    modal.dataset.alunoId = alunoId;

    const camposHtml = ANEXO_PEI_CAMPOS_IA.map(c => `
        <div style="margin-bottom: 15px;">
            <label style="font-weight:bold; display:block; margin-bottom:5px; color:#2c5282;">${c.label}:</label>
            <textarea id="revAnexoIV_${c.key}" rows="3" style="width:100%; padding:10px; border:1px solid #cbd5e0; border-radius:4px; font-family:inherit; line-height:1.4;">${dados[c.key] || ''}</textarea>
        </div>
    `).join('');

    const fichaAeeAvisoHtml = dadosBasicos.fichaAeeVazia
        ? `<div style="background:#fffaf0; border:1px solid #fbd38d; color:#975a16; padding:8px 12px; border-radius:6px; margin-bottom:15px; font-size:13px;">⚠️ Este estudante ainda não tem o Anexo III - PAEE preenchido/gerado - as adaptações abaixo foram geradas de forma geral. Gere o Anexo III - PAEE do aluno pra rascunhos mais precisos da próxima vez.</div>`
        : `<div style="background:#f0fff4; border:1px solid #9ae6b4; color:#276749; padding:8px 12px; border-radius:6px; margin-bottom:15px; font-size:13px;">✅ As adaptações abaixo consideraram o Anexo III - PAEE já preenchido do estudante.</div>`;

    document.getElementById('modalRevisaoAnexoIV').innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:10px; margin-bottom:15px;">
                <h2 style="margin: 0;">📝 Revisar Anexo IV - PEI</h2>
                <button class="btn btn-sm btn-danger" style="padding: 2px 8px;" onclick="closeModal('modalRevisaoAnexoIV')">×</button>
            </div>
            <div style="background:#ebf8ff; border:1px solid #bee3f8; padding:12px; border-radius:6px; margin-bottom:20px; font-size:14px;">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                    <div><strong style="color:#2b6cb0;">Estudante:</strong> <span>${dadosBasicos.nomeEstudante}</span></div>
                    <div><strong style="color:#2b6cb0;">Componente Curricular:</strong> <span>${dadosBasicos.disciplina}</span></div>
                    <div><strong style="color:#2b6cb0;">Professor Regente:</strong> <span>${dadosBasicos.professorRegente}</span></div>
                    <div><strong style="color:#2b6cb0;">Professor Especializado:</strong> <span>${dadosBasicos.nomeProfAee}</span></div>
                    <div><strong style="color:#2b6cb0;">Bimestre:</strong> <span>${dadosBasicos.bimestre}º Bimestre</span></div>
                </div>
            </div>
            <p style="font-size:13px; color:#666; margin-bottom:15px;">Os dados básicos acima vêm do formulário anterior (volte pra corrigi-los). Revise e ajuste abaixo o texto rascunhado pela IA antes de exportar o documento final.</p>
            ${fichaAeeAvisoHtml}
            <div style="max-height: 50vh; overflow-y: auto; padding-right: 10px;">
                ${camposHtml}
            </div>
            <div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0; padding-top:15px;">
                <button class="btn btn-secondary" onclick="closeModal('modalRevisaoAnexoIV'); showModal('modalGerarDocumentoIA')">← Voltar</button>
                <button class="btn btn-success" onclick="exportarAnexoIVFinal()" id="btnExportarAnexoIV">💾 Gerar Documento Final</button>
            </div>
        </div>
    `;
    showModal('modalRevisaoAnexoIV');
}

// Preenche o modelo Docs/anexoIIIPAEE2026TEA.docx.html com os dados informados (substitui os
// marcadores {{TOKEN}} - texto, checkboxes marcados como "X" e logos) e abre a janela de impressão -
// mesmo esquema de {{REGIAO}}/{{ESCOLA}}/{{LOGO_ESTADO}}/{{LOGO_ESCOLA}} já usado nos outros modelos.
// Função pura (não lê nada do DOM) - usada tanto pela exportação normal do wizard quanto pela
// reimpressão de um Anexo III-PAEE já salvo no perfil do estudante (app.js: abrirFichaAeeReadOnly).
async function montarEImprimirAnexoPaee(dadosBasicos, dados) {
    const response = await fetch('Docs/anexoIIIPAEE2026TEA.docx.html');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const templateHtml = await response.text();

    let configSistema = {};
    let configEscola = {};
    try {
        configSistema = await getData('system', 'config_sistema') || {};
        if (currentUser && currentUser.schoolId) {
            const sData = await getData('system', 'schools_list');
            const schools = (sData && sData.list) ? sData.list : [];
            configEscola = schools.find(s => s.id == currentUser.schoolId) || {};
        }
    } catch(e) { console.warn("Erro ao buscar configs da escola", e); }

    const fallbackLogo = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    const regiao = configSistema.regiao || 'REGIÃO NÃO CONFIGURADA';
    const logoEstado = configSistema.logoEstado || fallbackLogo;
    const nomeCompletoEscola = configEscola.nomeCompleto || configEscola.nome || 'ESCOLA NÃO CONFIGURADA';
    const logoEscola = configEscola.logoEscola || fallbackLogo;

    const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const paraTexto = (s) => escapeHtml(s).replace(/\n/g, '<br>');
    const marca = (v) => v ? 'X' : '';

    let htmlFinal = templateHtml
        .replace(/{{REGIAO}}/g, escapeHtml(regiao))
        .replace(/{{ESCOLA}}/g, escapeHtml(nomeCompletoEscola))
        .replace(/{{LOGO_ESTADO}}/g, logoEstado)
        .replace(/{{LOGO_ESCOLA}}/g, logoEscola)
        .replace(/{{NOME_ESTUDANTE}}/g, escapeHtml(dadosBasicos.nomeEstudante))
        .replace(/{{DATA_NASCIMENTO}}/g, escapeHtml(dadosBasicos.dataNascimento))
        .replace(/{{ESCOLARIDADE}}/g, escapeHtml(dadosBasicos.escolaridade))
        .replace(/{{TURNO}}/g, escapeHtml(dadosBasicos.turno))
        .replace(/{{CHECK_SEXO_F}}/g, marca(dadosBasicos.sexo === 'F'))
        .replace(/{{CHECK_SEXO_M}}/g, marca(dadosBasicos.sexo === 'M'))
        .replace(/{{CHECK_NIVEL_1}}/g, marca(dadosBasicos.nivelApoio === '1'))
        .replace(/{{CHECK_NIVEL_2}}/g, marca(dadosBasicos.nivelApoio === '2'))
        .replace(/{{CHECK_NIVEL_3}}/g, marca(dadosBasicos.nivelApoio === '3'));

    ANEXO_PAEE_ELEGIBILIDADE.forEach(o => {
        htmlFinal = htmlFinal.replace(new RegExp(`{{${o.token}}}`, 'g'), marca((dadosBasicos.elegibilidade || []).includes(o.token)));
    });
    ANEXO_PAEE_APOIOS.forEach(o => {
        htmlFinal = htmlFinal.replace(new RegExp(`{{${o.token}}}`, 'g'), marca((dadosBasicos.apoios || []).includes(o.token)));
    });
    ANEXO_PAEE_CAMPOS_IA.forEach(c => {
        htmlFinal = htmlFinal.replace(new RegExp(`{{${c.token}}}`, 'g'), paraTexto(dados[c.key]));
    });

    if (!htmlFinal.includes('window.print')) {
        htmlFinal += '<script>window.onload = function() { setTimeout(function(){ window.print(); }, 500); }</script>';
    }

    const win = window.open('', '', 'width=900,height=800');
    if (!win) throw new Error('O navegador bloqueou a abertura da janela (Pop-up). Permita pop-ups no seu navegador para gerar o documento.');
    win.document.write(htmlFinal);
    win.document.close();
}

// Grava o Anexo III-PAEE (dadosBasicos + dados) direto no documento AEE da escola (chave
// app_data_school_<id>_aee) - a ficha do Painel AEE (app.js: abrirFichaAeeReadOnly) lê exatamente
// dessa chave, então é preciso gravar ali mesmo que quem esteja salvando não esteja em Modo AEE.
// getData/saveData (core.js) não fazem merge parcial: busca o documento inteiro, altera e regrava.
async function salvarAnexoPaeeSchoolWide(schoolId, tutoradoId, dadosBasicos, dados) {
    const aeeKey = `app_data_school_${schoolId}_aee`;
    const aeeData = await getData('app_data', aeeKey);
    if (!aeeData || !Array.isArray(aeeData.tutorados)) throw new Error('Não foi possível localizar os dados AEE da escola.');

    const t = aeeData.tutorados.find(x => x.id == tutoradoId);
    if (!t) throw new Error('Estudante não encontrado nos dados AEE da escola.');

    const anexoPaee = { dadosBasicos, dados, atualizadoEm: getTodayString() };
    t.anexoPaee = anexoPaee;
    await saveData('app_data', aeeKey, aeeData);

    // Se quem salvou estiver em Modo AEE, o objeto `data` global em memória usa essa mesma chave -
    // atualiza também pra não ficar desatualizado até o próximo reload.
    if (typeof data !== 'undefined' && data && Array.isArray(data.tutorados)) {
        const tLocal = data.tutorados.find(x => x.id == tutoradoId);
        if (tLocal) tLocal.anexoPaee = anexoPaee;
    }

    return anexoPaee;
}

// Exporta o Anexo III - PAEE final: preenche o modelo e abre a impressão (montarEImprimirAnexoPaee) e
// salva os dados estruturados no perfil do estudante, pra aparecer depois no Painel AEE sem precisar
// gerar tudo de novo (app.js: abrirFichaAeeReadOnly).
async function exportarAnexoPaeeFinal() {
    const btn = document.getElementById('btnExportarAnexoPaee');
    const originalText = btn.textContent;
    btn.textContent = 'Gerando Documento... ⏳';
    btn.disabled = true;

    const modal = document.getElementById('modalRevisaoAnexoPaee');
    const dadosBasicos = JSON.parse(modal.dataset.basicos);
    const alunoId = modal.dataset.alunoId;
    const dados = {};
    ANEXO_PAEE_CAMPOS_IA.forEach(c => {
        const el = document.getElementById('revAnexo_' + c.key);
        dados[c.key] = el ? el.value : '';
    });

    try {
        await montarEImprimirAnexoPaee(dadosBasicos, dados);

        if (alunoId && currentUser && currentUser.schoolId) {
            try {
                const anexoPaeeSalvo = await salvarAnexoPaeeSchoolWide(currentUser.schoolId, alunoId, dadosBasicos, dados);
                if (typeof atualizarFichaAeeReadOnlyAposSalvar === 'function') {
                    atualizarFichaAeeReadOnlyAposSalvar(alunoId, anexoPaeeSalvo);
                }
            } catch (eSalvar) {
                console.error(eSalvar);
                alert('O documento foi impresso, mas houve um erro ao salvar no perfil do estudante:\n' + eSalvar.message);
            }
        }

        closeModal('modalRevisaoAnexoPaee');
    } catch (e) {
        console.error(e);
        alert('Erro ao gerar o documento: ' + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Preenche o modelo Docs/AnexoIV.docx.html com os dados informados (substitui os marcadores {{TOKEN}}
// - texto, checkboxes de bimestre marcados como "X" e logos) e abre a janela de impressão - mesmo
// esquema de {{REGIAO}}/{{ESCOLA}}/{{LOGO_ESTADO}}/{{LOGO_ESCOLA}} já usado nos outros modelos. Função
// pura (não lê nada do DOM) - usada tanto pela exportação normal do wizard quanto por uma futura
// reimpressão de um Anexo IV já salvo no perfil do estudante (app.js: abrirFichaAeeReadOnly).
async function montarEImprimirAnexoIV(dadosBasicos, dados) {
    const response = await fetch('Docs/AnexoIV.docx.html');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const templateHtml = await response.text();

    let configSistema = {};
    let configEscola = {};
    try {
        configSistema = await getData('system', 'config_sistema') || {};
        if (currentUser && currentUser.schoolId) {
            const sData = await getData('system', 'schools_list');
            const schools = (sData && sData.list) ? sData.list : [];
            configEscola = schools.find(s => s.id == currentUser.schoolId) || {};
        }
    } catch(e) { console.warn("Erro ao buscar configs da escola", e); }

    const fallbackLogo = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    const regiao = configSistema.regiao || 'REGIÃO NÃO CONFIGURADA';
    const logoEstado = configSistema.logoEstado || fallbackLogo;
    const nomeCompletoEscola = configEscola.nomeCompleto || configEscola.nome || 'ESCOLA NÃO CONFIGURADA';
    const logoEscola = configEscola.logoEscola || fallbackLogo;

    const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const paraTexto = (s) => escapeHtml(s).replace(/\n/g, '<br>');
    const marca = (v) => v ? 'X' : '';

    let htmlFinal = templateHtml
        .replace(/{{REGIAO}}/g, escapeHtml(regiao))
        .replace(/{{ESCOLA}}/g, escapeHtml(nomeCompletoEscola))
        .replace(/{{LOGO_ESTADO}}/g, logoEstado)
        .replace(/{{LOGO_ESCOLA}}/g, logoEscola)
        .replace(/{{NOME_ESTUDANTE}}/g, escapeHtml(dadosBasicos.nomeEstudante))
        .replace(/{{PROFESSOR}}/g, escapeHtml(dadosBasicos.professorRegente))
        .replace(/{{PROF_AEE}}/g, escapeHtml(dadosBasicos.nomeProfAee))
        .replace(/{{DISCIPLINA}}/g, escapeHtml(dadosBasicos.disciplina))
        .replace(/{{CHECK_BIM_1}}/g, marca(String(dadosBasicos.bimestre) === '1'))
        .replace(/{{CHECK_BIM_2}}/g, marca(String(dadosBasicos.bimestre) === '2'))
        .replace(/{{CHECK_BIM_3}}/g, marca(String(dadosBasicos.bimestre) === '3'))
        .replace(/{{CHECK_BIM_4}}/g, marca(String(dadosBasicos.bimestre) === '4'));

    ANEXO_PEI_CAMPOS_IA.forEach(c => {
        htmlFinal = htmlFinal.replace(new RegExp(`{{${c.token}}}`, 'g'), paraTexto(dados[c.key]));
    });

    if (!htmlFinal.includes('window.print')) {
        htmlFinal += '<script>window.onload = function() { setTimeout(function(){ window.print(); }, 500); }</script>';
    }

    const win = window.open('', '', 'width=900,height=800');
    if (!win) throw new Error('O navegador bloqueou a abertura da janela (Pop-up). Permita pop-ups no seu navegador para gerar o documento.');
    win.document.write(htmlFinal);
    win.document.close();
}

// Grava o Anexo IV-PEI direto no documento AEE da escola (chave app_data_school_<id>_aee), na lista
// `anexosIV` do tutorado - diferente do Anexo III (um só por estudante), o PEI é por
// Disciplina+Bimestre, então o estudante pode acumular vários (um por componente curricular que o
// atende). Atualiza a entrada existente se já houver um Anexo IV para a mesma disciplina+bimestre,
// senão adiciona uma nova. getData/saveData (core.js) não fazem merge parcial: busca o documento
// inteiro, altera e regrava.
async function salvarAnexoIVSchoolWide(schoolId, tutoradoId, dadosBasicos, dados) {
    const aeeKey = `app_data_school_${schoolId}_aee`;
    const aeeData = await getData('app_data', aeeKey);
    if (!aeeData || !Array.isArray(aeeData.tutorados)) throw new Error('Não foi possível localizar os dados AEE da escola.');

    const t = aeeData.tutorados.find(x => x.id == tutoradoId);
    if (!t) throw new Error('Estudante não encontrado nos dados AEE da escola.');

    if (!Array.isArray(t.anexosIV)) t.anexosIV = [];
    const anexoIV = { id: Date.now(), dadosBasicos, dados, atualizadoEm: getTodayString() };
    const idxExistente = t.anexosIV.findIndex(a => a.dadosBasicos.disciplina === dadosBasicos.disciplina && String(a.dadosBasicos.bimestre) === String(dadosBasicos.bimestre));
    if (idxExistente >= 0) {
        anexoIV.id = t.anexosIV[idxExistente].id;
        t.anexosIV[idxExistente] = anexoIV;
    } else {
        t.anexosIV.push(anexoIV);
    }
    await saveData('app_data', aeeKey, aeeData);

    // Se quem salvou estiver em Modo AEE, o objeto `data` global em memória usa essa mesma chave -
    // atualiza também pra não ficar desatualizado até o próximo reload.
    if (typeof data !== 'undefined' && data && Array.isArray(data.tutorados)) {
        const tLocal = data.tutorados.find(x => x.id == tutoradoId);
        if (tLocal) tLocal.anexosIV = t.anexosIV;
    }

    return anexoIV;
}

// Remove um Anexo IV-PEI específico (por id) da lista `anexosIV` do tutorado, direto no documento AEE
// compartilhado da escola - usado quando o professor quer apagar um PEI gerado (ex: pra gerar de novo
// do zero) pela ficha editável "Meus Alunos" (app.js: excluirAnexoIVSalvo). Mesmo padrão de
// salvarAnexoIVSchoolWide: busca o documento inteiro, altera e regrava.
async function excluirAnexoIVSchoolWide(schoolId, tutoradoId, anexoIVId) {
    const aeeKey = `app_data_school_${schoolId}_aee`;
    const aeeData = await getData('app_data', aeeKey);
    if (!aeeData || !Array.isArray(aeeData.tutorados)) throw new Error('Não foi possível localizar os dados AEE da escola.');

    const t = aeeData.tutorados.find(x => x.id == tutoradoId);
    if (!t) throw new Error('Estudante não encontrado nos dados AEE da escola.');

    t.anexosIV = (Array.isArray(t.anexosIV) ? t.anexosIV : []).filter(a => a.id != anexoIVId);
    await saveData('app_data', aeeKey, aeeData);

    // Se quem excluiu estiver em Modo AEE, o objeto `data` global em memória usa essa mesma chave -
    // atualiza também pra não ficar desatualizado até o próximo reload.
    if (typeof data !== 'undefined' && data && Array.isArray(data.tutorados)) {
        const tLocal = data.tutorados.find(x => x.id == tutoradoId);
        if (tLocal) tLocal.anexosIV = t.anexosIV;
    }
}

// Exporta o Anexo IV - PEI final: preenche o modelo e abre a impressão (montarEImprimirAnexoIV) e
// salva os dados estruturados no perfil do estudante, pra aparecer depois no Painel AEE sem precisar
// gerar tudo de novo (app.js: abrirFichaAeeReadOnly).
async function exportarAnexoIVFinal() {
    const btn = document.getElementById('btnExportarAnexoIV');
    const originalText = btn.textContent;
    btn.textContent = 'Gerando Documento... ⏳';
    btn.disabled = true;

    const modal = document.getElementById('modalRevisaoAnexoIV');
    const dadosBasicos = JSON.parse(modal.dataset.basicos);
    const alunoId = modal.dataset.alunoId;
    const dados = {};
    ANEXO_PEI_CAMPOS_IA.forEach(c => {
        const el = document.getElementById('revAnexoIV_' + c.key);
        dados[c.key] = el ? el.value : '';
    });

    try {
        await montarEImprimirAnexoIV(dadosBasicos, dados);

        if (alunoId && currentUser && currentUser.schoolId) {
            try {
                const anexoIVSalvo = await salvarAnexoIVSchoolWide(currentUser.schoolId, alunoId, dadosBasicos, dados);
                if (typeof atualizarFichaAeeReadOnlyAposSalvarAnexoIV === 'function') {
                    atualizarFichaAeeReadOnlyAposSalvarAnexoIV(alunoId, anexoIVSalvo);
                }
            } catch (eSalvar) {
                console.error(eSalvar);
                alert('O documento foi impresso, mas houve um erro ao salvar no perfil do estudante:\n' + eSalvar.message);
            }
        }

        closeModal('modalRevisaoAnexoIV');
    } catch (e) {
        console.error(e);
        alert('Erro ao gerar o documento: ' + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Lê um Anexo III-PAEE já preenchido em Word (.docx) - extrai o texto no navegador (mammoth.js, sem
// enviar o arquivo a lugar nenhum), pede pra IA ESTRUTURAR (não redigir) os mesmos campos que o
// formulário/wizard preenchem manualmente, e abre a mesma tela de revisão pra o professor conferir
// antes de salvar. Chamada tanto do botão "Enviar Novo Arquivo" na ficha editável do aluno (app.js:
// abrirFichaTutorado, via handleArquivoRelatorioSelecionado) quanto do upload da ficha só-leitura do
// Painel AEE (app.js: abrirFichaAeeReadOnly) - por isso recebe o id do input/status como parâmetro,
// já que os dois pontos de entrada usam elementos com ids diferentes.
// O arquivo nunca é enviado a lugar nenhum: só o texto extraído (variável local) segue pro prompt da
// IA, e some junto com o resto do escopo da função quando ela termina.
async function analisarAnexoPaeeWord(tutoradoId, fileInputId, statusElId) {
    const fileInput = document.getElementById(fileInputId);
    const file = fileInput && fileInput.files[0];
    if (!file) return;

    // Nome do estudante: usa o objeto `data` global se disponível (ficha editável) ou o snapshot do
    // Painel AEE (ficha só-leitura) - evita ter que passar texto livre (nome do aluno) por atributo
    // HTML onchange. Ver encontrarTutoradoAeeEmQualquerContexto em app.js.
    const tutoradoInfo = (typeof encontrarTutoradoAeeEmQualquerContexto === 'function')
        ? encontrarTutoradoAeeEmQualquerContexto(tutoradoId)
        : null;
    const nomeEstudante = tutoradoInfo ? tutoradoInfo.nome_estudante : '';

    const statusEl = document.getElementById(statusElId);
    const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

    if (typeof mammoth === 'undefined') {
        alert('Erro: biblioteca de leitura de Word não carregou. Recarregue a página e tente novamente.');
        fileInput.value = '';
        return;
    }

    try {
        setStatus('Lendo arquivo... ⏳');
        const arrayBuffer = await file.arrayBuffer();
        const { value: textoExtraido } = await mammoth.extractRawText({ arrayBuffer });
        if (!textoExtraido || !textoExtraido.trim()) throw new Error('Não foi possível extrair texto do arquivo. Confirme que é um .docx válido.');

        setStatus('Analisando com IA... ⏳');

        const elegibilidadeOpcoes = ANEXO_PAEE_ELEGIBILIDADE.map(o => `${o.token}: ${o.label}`).join('\n');
        const apoiosOpcoes = ANEXO_PAEE_APOIOS.map(o => `${o.token}: ${o.label}`).join('\n');

        const promptText = `Você é um assistente que EXTRAI dados estruturados de um Anexo III - Plano de AEE (PAEE) do Estado de São Paulo já preenchido, colado abaixo como texto puro (extraído de um Word). Não redija nada novo, não invente - extraia exatamente o que já está escrito no documento. Se algum dado não aparecer no texto, retorne string vazia (ou array vazio) para ele.

TEXTO DO DOCUMENTO:
"""
${textoExtraido}
"""

Retorne APENAS um objeto JSON válido (sem marcações markdown e escape corretamente aspas e quebras de linha usando \\n) com estas chaves:
{
  "dataNascimento": "data de nascimento do estudante, formato DD/MM/AAAA se encontrada",
  "escolaridade": "série/ano escolar",
  "turno": "turno (Manhã/Tarde/Integral etc)",
  "sexo": "F ou M, conforme marcado no documento",
  "nivelApoio": "1, 2 ou 3, conforme o nível de apoio marcado",
  "elegibilidade": "array com os tokens (dentre a lista abaixo) que estiverem marcados como elegibilidade do estudante",
  "apoios": "array com os tokens (dentre a lista abaixo) que estiverem marcados como apoios/recursos/serviços indicados",
  ${ANEXO_PAEE_CAMPOS_IA.map(c => `"${c.key}": "${c.label} - copie o texto correspondente do documento"`).join(',\n  ')}
}

Tokens possíveis de elegibilidade:
${elegibilidadeOpcoes}

Tokens possíveis de apoios/recursos/serviços:
${apoiosOpcoes}`;

        const extraido = await chamarIAEstruturada(promptText);

        const dadosBasicos = {
            nomeEstudante: nomeEstudante,
            dataNascimento: extraido.dataNascimento || '',
            escolaridade: extraido.escolaridade || '',
            turno: extraido.turno || '',
            sexo: (extraido.sexo === 'F' || extraido.sexo === 'M') ? extraido.sexo : '',
            nivelApoio: ['1', '2', '3'].includes(String(extraido.nivelApoio)) ? String(extraido.nivelApoio) : '',
            elegibilidade: Array.isArray(extraido.elegibilidade) ? extraido.elegibilidade.filter(tok => ANEXO_PAEE_ELEGIBILIDADE.some(o => o.token === tok)) : [],
            apoios: Array.isArray(extraido.apoios) ? extraido.apoios.filter(tok => ANEXO_PAEE_APOIOS.some(o => o.token === tok)) : []
        };
        const dados = {};
        ANEXO_PAEE_CAMPOS_IA.forEach(c => { dados[c.key] = extraido[c.key] || ''; });

        setStatus('');
        fileInput.value = '';
        abrirModalRevisaoAnexoPaee(dadosBasicos, dados, tutoradoId);
    } catch (e) {
        console.error(e);
        setStatus('');
        alert('Erro ao analisar o arquivo:\n' + e.message);
        fileInput.value = '';
    }
}

async function exportarDocumentoFinal(tipo) {

    const btn = document.getElementById('btnExportarDoc');
    const originalText = btn.textContent;
    btn.textContent = 'Gerando Documento... ⏳';
    btn.disabled = true;

    const modal = document.getElementById('modalRevisaoDocumento');
    const payload = {
        tipo: modal.dataset.tipo,
        professor: currentUser.nome,
        disciplina: modal.dataset.disciplina,
        serie: modal.dataset.serie,
        turmasStr: modal.dataset.turmasStr,
        semana: modal.dataset.semana,
        tema: modal.dataset.tema,
        duracaoAulas: modal.dataset.duracaoAulas,
        bimestre: modal.dataset.bimestre,
        dados: {
            aprendizagem_essencial: document.getElementById('revDocAE') ? document.getElementById('revDocAE').value : '',
            conteudos: document.getElementById('revDocConteudos') ? document.getElementById('revDocConteudos').value : '',
            habilidades: document.getElementById('revDocHabilidades') ? document.getElementById('revDocHabilidades').value : '',
            objetivos: document.getElementById('revDocObjetivos') ? document.getElementById('revDocObjetivos').value : '',
            desenvolvimento: document.getElementById('revDocDesenvolvimento') ? document.getElementById('revDocDesenvolvimento').value : '',
            materiais: document.getElementById('revDocMateriais') ? document.getElementById('revDocMateriais').value : '',
            avaliacao: document.getElementById('revDocAvaliacao') ? document.getElementById('revDocAvaliacao').value : ''
        }
    };

    try {
        let templateHtml = '';
        try {
            const response = await fetch('Docs/Base_Plano_Aula.html');
            if (!response.ok) throw new Error('HTTP ' + response.status);
            templateHtml = await response.text();
        } catch (fetchErr) {
            console.warn("Template local não carregado (CORS/file://). Usando template embutido.", fetchErr);
            templateHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Planos de Aula Semanais</title>
<style>
    @page { size: landscape; margin: 10mm; }
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 0; }
    .page-break { page-break-after: always; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { border: 1px solid black; padding: 6px; text-align: left; vertical-align: top; }
    .header-table { border: none; width: 100%; margin-bottom: 10px; }
    .header-table td { border: none; text-align: center; vertical-align: middle; }
    .header-left { text-align: left; width: 250px; }
    .header-right { text-align: right; width: 150px; }
    .header-center { font-weight: bold; font-size: 14px; }
    .subtitle { text-align: center; font-weight: bold; margin-bottom: 10px; font-size: 13px; }
    .gray-bg { background-color: #f2f2f2; font-weight: bold; text-align: center; }
    .center { text-align: center; }
</style>
</head>
<body>
<div class="page-break">
    <table class="header-table">
        <tr>
            <td class="header-left"><img src="{{LOGO_ESTADO}}" style="max-width: 220px; max-height: 80px;"></td>
            <td class="header-center">UNIDADE REGIONAL DE ENSINO - {{REGIÃO}}<br>{{NOME COMPLETO DA ESCOLA}}<br>{{TIPO DE DOC}}</td>
            <td class="header-right"><img src="{{LOGO_ESCOLA}}" style="max-width: 120px; max-height: 80px;"></td>
        </tr>
    </table>
    <div class="subtitle">{{BIMESTRE}}</div>
    <table>
        <tr>
            <td colspan="4"><b>PROFESSOR:</b> {{PROFESSOR}}</td>
            <td colspan="3"><b>DISCIPLINA:</b> {{DISCIPLINA}}</td>
        </tr>
        <tr>
            <td colspan="4"><b>ANO:</b>{{SERIE}} {{TURMAS}}</td>
            <td colspan="3"><b>DATA:</b> {{SEMANA}}</td>
        </tr>
        <tr>
            <td colspan="4"><b>TEMA DA AULA:</b> {{TEMA}}</td>
            <td colspan="3"><b>Aprendizagem essencial:</b> {{APRENDIZAGEM_ESSENCIAL}}</td>
        </tr>
        <tr class="gray-bg">
            <td width="12%">CONTEÚDOS</td>
            <td width="15%">HABILIDADES</td>
            <td width="13%">OBJETIVOS</td>
            <td width="30%">DESENVOLVIMENTO</td>
            <td width="10%">MATERIAIS</td>
            <td width="10%">AVALIAÇÃO</td>
            <td width="10%">DURAÇÃO</td>
        </tr>
        <tr>
            <td>{{CONTEUDOS}}</td>
            <td>{{HABILIDADES}}</td>
            <td>{{OBJETIVOS}}</td>
            <td>
                {{DESENVOLVIMENTO}}
            </td>
            <td>{{MATERIAIS}}</td>
            <td>{{AVALIACAO}}</td>
            <td class="center"><b>{{DURACAO}}</b></td>
        </tr>
        <tr>
            <td colspan="7" style="height: 60px;">
                <b>* OBSERVAÇÃO DO CGPG:</b><br><br>
                <b>CIÊNCIA DO PROFESSOR:</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <b>CIÊNCIA DO CGPG:</b>
            </td>
        </tr>
    </table>
</div>
</body>
</html>`;
        }

        // Busca configurações globais e da escola
        let configSistema = {};
        let configEscola = {};
        try {
            configSistema = await getData('system', 'config_sistema') || {};
            if (currentUser && currentUser.schoolId) {
                const sData = await getData('system', 'schools_list');
                const schools = (sData && sData.list) ? sData.list : [];
                configEscola = schools.find(s => s.id == currentUser.schoolId) || {};
            }
        } catch(e) { console.warn("Erro ao buscar configs da escola", e); }

        const fallbackLogo = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
        const regiao = configSistema.regiao || 'REGIÃO NÃO CONFIGURADA';
        const logoEstado = configSistema.logoEstado || fallbackLogo;
        const nomeCompletoEscola = configEscola.nomeCompleto || configEscola.nome || 'ESCOLA NÃO CONFIGURADA';
        const logoEscola = configEscola.logoEscola || fallbackLogo;
        const tipoDoc = payload.tipo === 'plano_aula' ? 'PLANO DE AULA' : payload.tipo.toUpperCase().replace('_', ' ');

        // Substitui todos os marcadores (placeholders) pelos dados reais globalmente (/g)
        let htmlFinal = templateHtml
            .replace(/{{REGIÃO}}/g, regiao)
            .replace(/{{NOME COMPLETO DA ESCOLA}}/g, nomeCompletoEscola)
            .replace(/{{TIPO DE DOC}}/g, tipoDoc)
            .replace(/{{LOGO_ESTADO}}/g, logoEstado)
            .replace(/{{LOGO_ESCOLA}}/g, logoEscola)
            .replace(/{{PROFESSOR}}/g, payload.professor || '')
            .replace(/{{DISCIPLINA}}/g, payload.disciplina || '')
            .replace(/{{SERIE}}/g, payload.serie || '')
            .replace(/{{TURMAS}}/g, payload.turmasStr || '')
            .replace(/{{TEMA}}/g, payload.tema || '')
            .replace(/{{SEMANA}}/g, payload.semana || '')
            .replace(/{{DURACAO}}/g, payload.duracaoAulas || '')
            .replace(/{{BIMESTRE}}/g, payload.bimestre || '')
            .replace(/{{APRENDIZAGEM_ESSENCIAL}}/g, payload.dados.aprendizagem_essencial || '')
            .replace(/{{OBJETIVOS}}/g, payload.dados.objetivos || '')
            .replace(/{{CONTEUDOS}}/g, payload.dados.conteudos || '')
            .replace(/{{HABILIDADES}}/g, payload.dados.habilidades || '')
            .replace(/{{DESENVOLVIMENTO}}/g, payload.dados.desenvolvimento || '')
            .replace(/{{MATERIAIS}}/g, payload.dados.materiais || '')
            .replace(/{{AVALIACAO}}/g, payload.dados.avaliacao || '');

        // Injeta o script de auto-imprimir se ele não existir no seu arquivo base
        if (!htmlFinal.includes('window.print')) {
            htmlFinal += '<script>window.onload = function() { setTimeout(function(){ window.print(); }, 500); }</script>';
        }

        const win = window.open('', '', 'width=900,height=800');
        if (!win) {
            throw new Error('O navegador bloqueou a abertura da janela (Pop-up). Permita pop-ups no seu navegador para gerar o documento.');
        }
        win.document.write(htmlFinal);
        win.document.close();
        
        closeModal('modalRevisaoDocumento');
        
        // [NOVO] AUTO-SALVAR DRAFT DO REGISTRO DE AULA
        // Gera um rascunho de registro para CADA dia em que a turma realmente tem aula dentro da
        // semana informada no plano (não só "hoje"), assim o rascunho já aparece pré-preenchido na
        // Chamada de qualquer um desses dias. Nunca sobrescreve um registro que o professor já tenha
        // feito manualmente para aquele dia (checagem de "registroExistente" por turma+data).
        try {
            if (!data.registrosAula) data.registrosAula = [];

            const getSerieNomeLocal = (nome) => {
                if (!nome) return '';
                let n = nome.trim();
                n = n.replace(/[\s-]+[A-Za-z]$/i, '');
                n = n.replace(/(\d)[A-Za-z]$/i, '$1');
                n = n.replace(/([ºª])[A-Za-z]$/i, '$1');
                return n.trim();
            };

            // Busca a grade/exceções da escola direto no banco (mesmo padrão do renderDashboard/
            // renderChamada), em vez de confiar em data.schoolGrade/schoolExceptions - que só ficam
            // preenchidos se o professor já tiver aberto o Dashboard nesta sessão.
            let gradeEscola = data.schoolGrade || [];
            let excecoesGrade = data.schoolExceptions || [];
            if (currentUser && currentUser.schoolId) {
                const keyGestor = 'app_data_school_' + currentUser.schoolId + '_gestor';
                const gestorData = await getData('app_data', keyGestor);
                if (gestorData) {
                    gradeEscola = gestorData.gradeHoraria || [];
                    excecoesGrade = gestorData.gradeHorariaExcecoes || [];
                }
            }
            const minhasAulas = data.horariosAulas || [];

            const turmaTemAulaNoDia = (turmaId, dataStr) => {
                const diaSemana = new Date(dataStr + 'T12:00:00').getDay();
                const excecao = excecoesGrade.find(e => e.data === dataStr);
                const blocosDoDia = excecao ? (excecao.blocos || []) : gradeEscola.filter(g => g.diaSemana == diaSemana);
                return blocosDoDia.some(bloco => {
                    const aula = minhasAulas.find(a => a.id_bloco == bloco.id);
                    return aula && aula.tipo === 'aula' && aula.id_turma == turmaId;
                });
            };

            const turmasAlvo = (data.turmas || []).filter(t => t.disciplina === payload.disciplina && getSerieNomeLocal(t.ano_serie || t.nome) === payload.serie);

            // Monta a lista de dias da semana do plano (inclusive); cai para "hoje" se as datas não vieram.
            const diasDaSemana = [];
            const inicioISO = modal.dataset.semanaInicio;
            const fimISO = modal.dataset.semanaFim;
            if (inicioISO && fimISO) {
                const cursor = new Date(inicioISO + 'T12:00:00');
                const fim = new Date(fimISO + 'T12:00:00');
                while (cursor <= fim) {
                    diasDaSemana.push(cursor.toISOString().split('T')[0]);
                    cursor.setDate(cursor.getDate() + 1);
                }
            } else {
                diasDaSemana.push(getTodayString());
            }

            const conteudoResumo = `Tema: ${payload.tema}\n\nObjetivo: ${payload.dados.objetivos || 'Apresentado no plano de aula.'}\n\nDesenvolvimento: ${payload.dados.desenvolvimento || ''}`;
            let algumCriado = false;

            // Lido do seletor de "Material Digital" do modal de revisão - NÃO entra no template/PDF
            // exportado (fica de fora dos placeholders substituídos acima), só é anexado aos rascunhos
            // de registrosAula abaixo, para as automações (extensão) que preenchem a SED depois.
            const cardsMaterialDigitalSelecionados = lerCardsMaterialDigitalSelecionados('revDocCardsMaterialDigital');

            turmasAlvo.forEach(turma => {
                // Se a turma não tem nenhum bloco de grade configurado, não há como saber os dias de
                // aula dela - cai para o comportamento antigo (rascunho só em "hoje") em vez de não
                // criar nada.
                const turmaTemGradeConfigurada = gradeEscola.some(g => minhasAulas.some(a => a.id_bloco == g.id && a.id_turma == turma.id));
                const diasAlvo = turmaTemGradeConfigurada ? diasDaSemana.filter(d => turmaTemAulaNoDia(turma.id, d)) : [getTodayString()];

                diasAlvo.forEach(diaStr => {
                    const registroExistente = data.registrosAula.find(r => r.id_turma == turma.id && r.data == diaStr);
                    if (registroExistente) return;
                    data.registrosAula.push({ id: Date.now() + Math.random(), id_turma: turma.id, data: diaStr, conteudo: conteudoResumo.substring(0, 1000), cardsMaterialDigital: cardsMaterialDigitalSelecionados });
                    algumCriado = true;
                });
            });

            if (algumCriado) {
                persistirDados();
                if (typeof window.enviarDadosParaExtensao === 'function') window.enviarDadosParaExtensao(true);
            }
        } catch(er) { console.warn("Erro ao auto-salvar registro", er); }

    } catch (e) {
        alert('Erro ao formatar o documento: ' + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}