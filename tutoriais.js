// tutoriais.js — A TELA "TUTORIAIS" e o BOTÃO "?" (tour na tela), no perfil professor.
//
// POR QUE ISTO EXISTE
//   O SisProf cresceu: turmas com nove abas, Documentos, Tutoria, Estagiário, Biblioteca e
//   seis Ferramentas. Quem chega agora não sabe por onde começar, e quem já usa não sabe
//   o que cada botão faz. Duas ajudas, que se completam:
//
//   1. A tela "Tutoriais" (menu Recursos): uma aba "Iniciante", com o caminho desde o
//      começo (turmas, agenda, abas da turma, Estagiário, Biblioteca...), uma aba com o
//      manual de cada página e uma com cada ferramenta — para que serve e como usar.
//   2. O botão "?" no topo: abre um tour da tela em que a pessoa está. Escurece a tela,
//      acende um elemento por vez e explica o que ele faz. Na turma, o tour passa pelas
//      abas uma a uma, abrindo cada aba de verdade para a pessoa ver o conteúdo.
//
// O QUE ESTE ARQUIVO NÃO FAZ
//   Não salva, não apaga e não calcula dado. O tour só abre telas e abas pelos caminhos
//   de sempre (o botão do menu, showTurmaTab, showDocumentosTab, showFerramentasTab,
//   abrirModalGerarDocumentoIA...). Enquanto o tour está aberto, uma camada por cima
//   segura os cliques, então ninguém lança falta ou apaga turma sem querer.
//   O que fica guardado é só no aparelho: quais passos do Iniciante a pessoa marcou como
//   feitos e se ela já usou o "?" (para o botão parar de piscar).
//
// COMO ACRESCENTAR UMA TELA NOVA
//   Um tour é uma lista de passos { alvo, titulo, texto }. `alvo` é um seletor CSS ou uma
//   função que devolve o elemento; passo sem alvo aparece no meio da tela, e passo cujo
//   alvo não existe (ex.: turma ainda sem estudante) é pulado. Acrescente o tour em
//   TOURS, diga em tourDaTelaAtual() quando ele vale e, se quiser, um manual em PAGINAS.

(function () {
'use strict';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const ler = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const CHAVE_FEITOS = 'sisprof_tutorial_feitos';
const CHAVE_JA_USOU = 'sisprof_tour_ja_usou';

// ------------------------------------------------------------------ achar elementos
function visivel(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none';
}
// Botão (ou link/rótulo) cujo texto contém `texto`, dentro de `raiz`.
function porTexto(raiz, texto) {
    return () => {
        const base = typeof raiz === 'string' ? $(raiz) : raiz;
        if (!base) return null;
        const alvo = semAcento(texto);
        return $$('button, a, label, h2, h3', base).find(b => visivel(b) && semAcento(b.textContent).indexOf(alvo) !== -1) || null;
    };
}
// O cartão (.card) que contém o elemento.
function cartaoDe(sel) {
    return () => { const el = $(sel); return el ? (el.closest('.card') || el) : null; };
}
// Botão do menu principal. No celular, quem não cabe na barra de baixo mora no "Mais".
function botaoMenu(tela) {
    return () => {
        const b = $('#appContainer nav.app-nav > button[onclick*="showScreen(\'' + tela + '\'"]');
        if (visivel(b)) return b;
        const mais = $('#appContainer nav.app-nav > .nav-mais');
        return visivel(mais) ? mais : b;
    };
}
const abaTurma = (tab) => '#turmaDetalhe nav .turma-nav-btn[onclick*="\'' + tab + '\'"]';
const abaDoc = (id) => '#navDocumentos .doc-nav-btn[data-aba="' + id + '"]';
const abaFerr = (id) => '#navFerramentas .ferr-nav-btn[data-aba="' + id + '"]';

// ------------------------------------------------------------------ navegar
// Pelo botão do menu (deixa o menu marcado certo); se não houver, pelo showScreen.
async function irPara(tela) {
    const b = $('#appContainer nav.app-nav > button[onclick*="showScreen(\'' + tela + '\'"]');
    const ativa = $('#appContainer .screen.active');
    if (ativa && ativa.id === tela) return;
    if (b) b.click();
    else if (typeof showScreen === 'function') showScreen(tela);
    await esperar(250);
}
function telaAtiva() {
    const t = $('#appContainer .screen.active');
    return t ? t.id : null;
}
function modalAberto(id) {
    const m = document.getElementById(id);
    return !!(m && m.classList.contains('active'));
}
function marcarAbaTurma(tab) {
    if (typeof showTurmaTab !== 'function') return;
    showTurmaTab(tab);
    $$('#turmaDetalhe nav .turma-nav-btn').forEach(b => b.classList.remove('active'));
    const b = $(abaTurma(tab));
    if (b) b.classList.add('active');
}
// Pela aba que está à mostra (o botão marcado nem sempre acompanha: showTurmaTab sem
// evento troca a aba e deixa o botão antigo marcado).
function abaTurmaVisivel() {
    const t = $$('#turmaDetalhe .turma-tab').find(x => x.style.display !== 'none');
    if (!t) return 'estudantes';
    const nome = t.id.replace(/^tab/, '');
    return nome.charAt(0).toLowerCase() + nome.slice(1);
}
function abaDocAtual() {
    const b = $$('#navDocumentos .doc-nav-btn').find(x => x.classList.contains('active'));
    return b ? b.dataset.aba : 'agenda';
}
function abaFerrAtual() {
    const b = $$('#navFerramentas .ferr-nav-btn').find(x => x.classList.contains('active'));
    return b ? b.dataset.aba : 'pdf';
}
function temTurma() {
    return typeof data !== 'undefined' && data && Array.isArray(data.turmas) && data.turmas.length > 0;
}

// ------------------------------------------------------------------ OS TOURS
// Passos das abas da turma: o tour abre cada aba e acende o botão dela.
const PASSOS_ABAS_TURMA = [
    { id: 'estudantes', tab: 'estudantes', titulo: '👥 Estudantes',
      texto: 'A lista da turma, com a situação de cada um (ativo, transferido...). A lista costuma chegar sozinha da gestão. Daqui também dá para importar uma lista (CSV), adicionar à mão e ver o painel da turma.' },
    { id: 'chamada', tab: 'chamada', titulo: '✅ Chamada',
      texto: 'Escolha a data, marque quem faltou e escreva o registro da aula (diário de classe). Termine em "💾 Confirmar e Salvar Chamada". O "📅 Relatório Mensal de Faltas" mostra o mês inteiro.' },
    { id: 'registros', tab: 'registros', titulo: '📂 Registros',
      texto: 'O histórico das aulas dadas: data e conteúdo de cada aula. Use "+ Novo Registro de Aula" para anotar uma aula fora da chamada.' },
    { id: 'atrasos', tab: 'atrasos', titulo: '⏰ Atrasos',
      texto: 'Registre o estudante que chegou atrasado. O histórico fica logo abaixo, e você pode remover um registro errado.' },
    { id: 'trabalhos', tab: 'trabalhos', titulo: '📝 Trabalhos',
      texto: 'A planilha de notas do bimestre. Crie atividades com peso em "+ Criar Nova Atividade", lance as notas de cada estudante e a média sai sozinha. Dá para importar atividades de outra turma.' },
    { id: 'compensacoes', tab: 'compensacoes', titulo: '⚖️ Compensações',
      texto: 'Compensação de ausências: escolha o mês e descreva a atividade. O sistema passa a atividade para todos os estudantes com falta no período, e você controla quem entregou.' },
    { id: 'caderno', tab: 'caderno', titulo: '📖 Caderno',
      texto: 'Visto do caderno por data: Completo, Incompleto ou Não fez, mais o engajamento (Total, Médio, Nada) e ponto extra. Os resumos mensais ficam nos botões de cima.' },
    { id: 'ocorrencias', tab: 'ocorrencias', titulo: '⚠️ Ocorrências',
      texto: 'Registre uma ocorrência (rápida ou completa, com um ou vários estudantes). Ela vai para a gestão, e a devolutiva da gestão volta para cá.' },
    { id: 'mapeamento', tab: 'mapeamento', titulo: '🗺️ Mapeamento',
      texto: 'O mapa de sala: monte as fileiras, ponha cada estudante no lugar e imprima. As mudanças ficam no histórico logo abaixo.' }
];

const TOURS = {
    inicio: {
        nome: 'Início e menu',
        preparar: () => irPara('dashboard'),
        passos: [
            { titulo: 'Bem-vindo ao SisProf 👋', texto: 'Este tour mostra onde fica cada coisa. Use "Próximo" (ou a seta → do teclado) para avançar e "Sair" (ou Esc) para fechar a qualquer momento.' },
            { alvo: '#appContainer nav.app-nav', titulo: 'O menu', texto: 'Todas as páginas ficam aqui, agrupadas por assunto: Dia a dia, Registros e Recursos. No celular, o menu fica embaixo e o botão "Mais" mostra o resto.' },
            { alvo: '#dashboard .ux-inicio', titulo: 'Início', texto: 'A saudação do dia e os atalhos: a busca rápida e o Estagiário.' },
            { alvo: cartaoDe('#agendaHoje'), titulo: '📅 Agenda do Dia', texto: 'As aulas e compromissos de hoje, tirados da sua agenda (Documentos › Minha Agenda). Se está vazio, a agenda ainda não foi montada.' },
            { alvo: cartaoDe('#tutoriasHoje'), titulo: '👥 Tutorias/Ações', texto: 'Os encontros de tutoria agendados para hoje.' },
            { alvo: () => { const b = $('#dashboard button[onclick*="exportarArquivoProfsis"]'); return b ? b.closest('.card') : null; }, titulo: '⚙️ Backups e Segurança', texto: 'Sincronize com a nuvem, baixe a sua cópia de segurança e, se trocar de computador, importe o arquivo de volta: é nele que estão os dados dos estudantes.' },
            { alvo: cartaoDe('#avisosGerais'), titulo: '📢 Quadro de Avisos', texto: 'Recados da gestão da escola.' },
            { id: 'perfil', alvo: '#uxBotaoBuscar', titulo: '🔎 Buscar', texto: 'Ache qualquer estudante, turma, trabalho, tela ou função digitando o nome. No computador, o atalho é Ctrl+K.' },
            { alvo: '#btnPerfilUser', titulo: '👤 Perfil', texto: 'Seu nome, o tema (cores) do sistema, o plano e a cópia de segurança dos seus dados (baixar e importar).' },
            { alvo: '#btnAjudaTour', titulo: '❓ Ajuda desta tela', texto: 'Em qualquer página, toque aqui para ver este tipo de tour explicando a tela em que você está.' },
            { alvo: botaoMenu('tutoriais'), titulo: '📘 Tutoriais', texto: 'Os manuais de todas as páginas e das ferramentas, e o passo a passo para quem está começando (aba "Iniciante"). No celular, fica dentro de "Mais".' }
        ]
    },

    turmas: {
        nome: 'Turmas',
        preparar: () => irPara('turmas'),
        passos: [
            { alvo: botaoMenu('turmas'), titulo: '👥 Turmas', texto: 'Aqui ficam todas as suas turmas. Cada turma é uma turma da escola com a sua disciplina.' },
            { alvo: '#turmas .card > .btn-primary', titulo: '+ Nova Turma', texto: 'Cadastre uma turma: escolha a turma da escola (a lista vem da gestão), a disciplina e o turno. Marque "Eletiva" para montar um grupo com alunos de várias turmas.' },
            { alvo: '#listaTurmas', titulo: 'Suas turmas', texto: 'Cada cartão é uma turma. Toque no cartão para entrar nela e ver as abas (estudantes, chamada, notas...).' },
            { alvo: '#listaTurmas > .card .btn-secondary', titulo: '✏️ Editar', texto: 'Muda a disciplina, o turno ou o professor parceiro da turma.' },
            { alvo: '#listaTurmas > .card .btn-danger', titulo: '🗑️ Remover', texto: 'Tira a turma da sua lista. O sistema pede confirmação antes.' }
        ]
    },

    novaTurma: {
        nome: 'Cadastrar turma',
        preparar: async () => {
            await irPara('turmas');
            if (!modalAberto('modalNovaTurma') && typeof abrirModalNovaTurma === 'function') {
                await abrirModalNovaTurma();
                await esperar(200);
                return { fechar: () => { if (typeof closeModal === 'function') closeModal('modalNovaTurma'); } };
            }
        },
        passos: [
            { alvo: '#modalNovaTurma .modal-content', titulo: 'Cadastrar uma turma', texto: 'Esta é a janela de nova turma. Vamos ver cada campo. Nada é salvo durante o tour.' },
            { alvo: '#divTurmaEletiva', titulo: '🎯 Eletiva', texto: 'Marque só se for uma eletiva: um grupo com alunos de várias turmas. Nesse caso você digita o nome (ex.: Teatro) e importa os alunos depois.' },
            { alvo: '#containerTurmaAnoSelect', titulo: 'Turma', texto: 'Escolha a turma da escola. A lista vem da gestão; se aparecer "Nenhuma turma cadastrada pela gestão", peça à coordenação para cadastrar as turmas.' },
            { alvo: '#divTurmaDisciplina', titulo: 'Disciplina', texto: 'A matéria que você dá nessa turma (ex.: Matemática). Se você dá duas matérias na mesma turma, cadastre a turma duas vezes.' },
            { alvo: () => { const s = $('#turmaTurno'); return s ? s.closest('label') : null; }, titulo: 'Turno', texto: 'Manhã, Tarde, Noite ou Integral.' },
            { alvo: '#modalNovaTurma button[type="submit"]', titulo: 'Salvar', texto: 'Pronto: a turma aparece em "Minhas Turmas" e os estudantes chegam da lista da escola.' }
        ]
    },

    turmaDetalhe: {
        nome: 'Dentro da turma',
        preparar: async () => {
            if (telaAtiva() === 'turmaDetalhe') {
                const voltar = abaTurmaVisivel();
                return { fechar: () => marcarAbaTurma(voltar) };
            }
            if (!temTurma() || typeof abrirTurma !== 'function') {
                return { trocarPara: 'turmas', aviso: 'Você ainda não tem turma cadastrada. Primeiro cadastre uma em "+ Nova Turma"; depois o tour mostra as abas por dentro dela.' };
            }
            await abrirTurma(data.turmas[0].id);
            await esperar(300);
            return { fechar: () => marcarAbaTurma('estudantes') };
        },
        passos: [
            { alvo: '#turmaDetalheTitulo', titulo: 'Dentro da turma', texto: 'O nome da turma e da disciplina. Tudo o que você lança aqui vale só para esta turma.' },
            { alvo: '#turmaDetalhe nav', titulo: 'As abas da turma', texto: 'Cada ícone é uma aba. Agora vamos abrir uma por uma.' }
        ].concat(PASSOS_ABAS_TURMA.map(p => ({
            id: p.id, alvo: abaTurma(p.tab), titulo: p.titulo, texto: p.texto,
            antes: () => marcarAbaTurma(p.tab)
        }))).concat([
            { alvo: '#turmaDetalhe .card > .btn-secondary', titulo: '← Voltar', texto: 'Volta para a lista de turmas. Dica: com uma aba aberta, o "?" no topo explica aquela aba botão por botão.' }
        ])
    },

    agenda: {
        nome: 'Minha Agenda',
        preparar: async () => {
            await irPara('documentos');
            const voltar = abaDocAtual();
            if (typeof showDocumentosTab === 'function') showDocumentosTab('agenda');
            await esperar(400);
            return { fechar: () => { if (voltar !== 'agenda' && typeof showDocumentosTab === 'function') showDocumentosTab(voltar); } };
        },
        passos: [
            { alvo: abaDoc('agenda'), titulo: '📅 Minha Agenda', texto: 'A sua semana de aulas fica em Documentos › Minha Agenda. É ela que preenche a "Agenda do Dia" no Início e a Agenda Mensal do Estagiário.' },
            { alvo: '#containerGradeHoraria', titulo: 'A grade da escola', texto: 'Os horários (segunda a sexta) vêm da grade que a gestão montou. Os blocos com 🔒 são fixos da escola, como almoço e ATPCA.' },
            { alvo: '#containerGradeHoraria select', titulo: 'Escolha a turma de cada horário', texto: 'Em cada horário, escolha a turma que você tem naquela aula, ou outra atividade (Tutoria, Estudo, Reunião...). Salva sozinho ao escolher. Cadastre as turmas antes, para elas aparecerem aqui.' },
            { alvo: '#gcalCard', titulo: '📆 Google Agenda', texto: 'Se quiser, ligue a sua conta Google para ver as aulas também no Google Agenda do celular.' }
        ]
    },

    documentos: {
        nome: 'Documentos',
        preparar: async () => {
            await irPara('documentos');
            const voltar = abaDocAtual();
            return { fechar: () => { if (typeof showDocumentosTab === 'function') showDocumentosTab(voltar); } };
        },
        passos: [
            { alvo: botaoMenu('documentos'), titulo: '📁 Documentos', texto: 'Sua agenda e tudo o que o Estagiário gera: planos de aula, Anexos IV e o histórico.' },
            { alvo: '#documentos .btn-info', titulo: '✨ Estagiário', texto: 'O assistente de IA que monta plano de aula, Agenda Mensal, Anexo III - PAEE e Anexo IV - PEI. Fica aqui no alto para estar à mão em qualquer aba.' },
            { alvo: '#navDocumentos', titulo: 'As abas', texto: 'Quatro abas. Vamos passar por elas.' },
            { alvo: abaDoc('agenda'), titulo: '📅 Minha Agenda', texto: 'A grade da semana: em cada horário da escola, escolha a sua turma. É a base da "Agenda do Dia" e da Agenda Mensal.', antes: () => showDocumentosTab('agenda') },
            { alvo: abaDoc('planos'), titulo: '📝 Planos de Aula', texto: 'Os planos que você salvou, baixou ou imprimiu pelo Estagiário ficam guardados aqui para consultar, baixar em PDF e reimprimir.', antes: () => showDocumentosTab('planos') },
            { alvo: abaDoc('anexoIV'), titulo: '📘 Anexo IV - PEI', texto: 'Os Anexos IV dos estudantes com PEI. Mostra os seus; um botão mostra os da escola inteira.', antes: () => showDocumentosTab('anexoIV') },
            { alvo: abaDoc('historico'), titulo: '🗂️ Histórico', texto: 'Tudo o que você gerou pelo Estagiário, em ordem.', antes: () => showDocumentosTab('historico') }
        ]
    },

    estagiario: {
        nome: 'Estagiário IA',
        preparar: async () => {
            if (modalAberto('modalGerarDocumentoIA')) return;
            if (typeof abrirModalGerarDocumentoIA !== 'function') return;
            await irPara('documentos');
            await abrirModalGerarDocumentoIA();
            await esperar(300);
            return { fechar: () => { if (typeof closeModal === 'function') closeModal('modalGerarDocumentoIA'); } };
        },
        passos: [
            { alvo: '#modalGerarDocumentoIA .modal-content', titulo: '🤖 Estagiário IA', texto: 'O Estagiário escreve o rascunho do documento para você revisar. Abre pelo botão "✨ Estagiário" (no Início ou em Documentos).' },
            { alvo: '#iaDocTipo', titulo: 'Tipo de documento', texto: 'Plano de Aula, Agenda Mensal (montada da sua agenda, sem IA), Anexo III - PAEE ou Anexo IV - PEI. Os campos de baixo mudam conforme o tipo.' },
            { alvo: '#iaDocSemanaData', titulo: 'Semana', texto: 'Para o plano de aula: clique num dia e a semana inteira (segunda a sexta) é escolhida.' },
            { alvo: '#iaDocSerie', titulo: 'Série e disciplina', texto: 'Vêm das suas turmas.' },
            { alvo: '#iaDocTema', titulo: 'Tema da aula', texto: 'Escreva o assunto (ex.: Frações).' },
            { alvo: '#btnSugerirTemasPlanoAula', titulo: '💡 Sugerir temas', texto: 'Sem ideia? A IA lê os materiais da Biblioteca e o currículo da série e sugere temas. Toque num tema para usá-lo.' },
            { alvo: () => { const t = $('#iaDocPrompt'); return t ? (t.parentElement || t) : null; }, titulo: 'Comando do Estagiário', texto: 'O pedido que vai para a IA. Pode ajustar; "Restaurar Padrão" volta ao original.' },
            { alvo: '#btnGerarDocumentoIA', titulo: 'Gerar Estrutura', texto: 'A IA monta o documento. Depois você revisa, edita, salva, baixa em PDF ou imprime. O que for salvo aparece em Documentos.' }
        ]
    },

    tutoria: {
        nome: 'Tutoria',
        preparar: () => irPara('tutoria'),
        passos: [
            { alvo: botaoMenu('tutoria'), titulo: '🎓 Tutoria', texto: 'Seus tutorados e os encontros de tutoria.' },
            { alvo: '#listaTutorados', titulo: 'Meus Tutorados', texto: 'Os estudantes que você acompanha, por turma. O número colorido antes do nome é quantos encontros já foram registrados (vermelho = nenhum). Toque no nome para abrir a ficha.' },
            { alvo: porTexto('#tutoria', 'Novo Tutorado'), titulo: '+ Novo Tutorado', texto: 'Escolha a turma e o estudante para começar a acompanhar.' },
            { alvo: '#tutoria .btn-registrar-extra', titulo: '+ Registrar Encontro', texto: 'Anote um encontro: data, tema e resumo da conversa.' },
            { alvo: porTexto('#tutoria', 'Tutoria Coletiva'), titulo: '👥 Tutoria Coletiva', texto: 'Registra o mesmo encontro para todos os tutorados de uma vez.' },
            { alvo: porTexto('#tutoria', 'Reorganizar'), titulo: 'Agendamento automático', texto: 'Distribui os tutorados nos horários livres de tutoria da sua agenda.' },
            { alvo: '#listaEncontros', titulo: 'Agenda de Tutoria', texto: 'Os próximos encontros e os já feitos.' }
        ]
    },

    registrosProfessor: {
        nome: 'Registros da gestão',
        preparar: async () => { await irPara('registrosProfessor'); await esperar(400); },
        passos: [
            { alvo: botaoMenu('registrosProfessor'), titulo: '📂 Registros', texto: 'O que a gestão registrou sobre os seus estudantes: faltas justificadas, atestados e alertas de faltoso.' },
            { alvo: '#registrosProfessor .card', titulo: 'Registros vigentes', texto: 'Separados por turma. Serve para você saber, antes da chamada, quem está com atestado ou em acompanhamento. Só a gestão altera esses registros.' }
        ]
    },

    aeeVisaoGeral: {
        nome: 'Painel AEE',
        preparar: async () => { await irPara('aeeVisaoGeral'); await esperar(400); },
        passos: [
            { alvo: botaoMenu('aeeVisaoGeral'), titulo: '🌟 Painel AEE', texto: 'Os estudantes da escola acompanhados pelo AEE (Atendimento Educacional Especializado).' },
            { alvo: '#aeeVisaoGeral .card', titulo: 'Estudantes e Anexos', texto: 'Veja quem tem acompanhamento e os Anexos IV - PEI já feitos (PDF e reimpressão). O Anexo IV se gera pelo "✨ Estagiário".' }
        ]
    },

    biblioteca: {
        nome: 'Biblioteca',
        preparar: async () => { await irPara('biblioteca'); await esperar(400); },
        passos: [
            { alvo: botaoMenu('biblioteca'), titulo: '📚 Biblioteca', texto: 'Materiais compartilhados entre os professores. O Estagiário usa esses materiais para montar os documentos e sugerir temas.' },
            { alvo: '#bibTabRapido', titulo: '⚡ Rápido', texto: 'Suba o arquivo e a IA escreve título, descrição e tags. Com um arquivo, você confere antes de publicar; com vários de uma vez, cada um é publicado direto.' },
            { alvo: '#bibTabDetalhado', titulo: '✍️ Detalhado', texto: 'Você mesmo preenche título, tags e descrição. Aceita arquivo ou link.' },
            { alvo: '#bibRapidoDisciplina', titulo: 'Disciplina e série', texto: 'Diga de que matéria e série é o material. O ➕ cria uma disciplina nova.' },
            { alvo: '#bibRapidoArquivo', titulo: 'Arquivo(s)', texto: 'PDF, Word, Excel, PowerPoint ou imagem. O arquivo não é guardado: só o texto dele é usado.' },
            { alvo: '#bibBtnRapido', titulo: '✨ Classificar e revisar', texto: 'A IA lê e classifica. Com um arquivo só, aparece a revisão para você confirmar antes de publicar.' },
            { alvo: '#bibBusca', titulo: 'Buscar materiais', texto: 'Ache por título, tag ou autor, e filtre por disciplina e série.' },
            { alvo: '#bibListaMateriais', titulo: 'Os materiais', texto: 'Tudo o que foi publicado. Abra, imprima ou use como referência.' }
        ]
    },

    ferramentas: {
        nome: 'Ferramentas',
        preparar: async () => {
            await irPara('ferramentas');
            await esperar(200);
            const voltar = abaFerrAtual();
            return { fechar: () => { if (typeof showFerramentasTab === 'function') showFerramentasTab(voltar); } };
        },
        passos: [
            { alvo: botaoMenu('ferramentas'), titulo: '🧰 Ferramentas', texto: 'Ferramentas de arquivo que rodam no seu aparelho: o arquivo do estudante não vai para site de terceiro. Ver é livre; usar é do plano Professor.' },
            { alvo: '#navFerramentas', titulo: 'Uma aba por ferramenta', texto: 'Vamos abrir uma por uma.' },
            { id: 'pdf', alvo: abaFerr('pdf'), titulo: '📕 PDF', texto: 'Juntar, dividir, comprimir, girar, assinar, pôr marca d\'água, converter para Word/imagem, proteger com senha e muito mais (49 ferramentas). Use a busca para achar a que precisa.', antes: () => showFerramentasTab('pdf') },
            { id: 'img', alvo: abaFerr('img'), titulo: '🖼️ IMG', texto: 'Comprimir, redimensionar, cortar, converter, remover fundo, aumentar resolução e desfocar rosto de estudante antes de postar.', antes: () => showFerramentasTab('img') },
            { id: 'poster', alvo: abaFerr('poster'), titulo: '🧱 Pôster', texto: 'Transforma uma imagem num cartaz grande, dividido em folhas A4 para imprimir e colar na parede, com marcas de corte.', antes: () => showFerramentasTab('poster') },
            { id: 'video', alvo: abaFerr('video'), titulo: '🎬 Vídeo', texto: 'Cortar, juntar, girar, comprimir, tirar ou pôr som e virar GIF, sem enviar o vídeo para ninguém.', antes: () => showFerramentasTab('video') },
            { id: 'quiz', alvo: abaFerr('quiz'), titulo: '🎯 Na Mosca!', texto: 'Quiz ao vivo na sala: você projeta o PIN e os alunos jogam pelo celular, sem conta. No fim sai o pódio e o relatório de acertos.', antes: () => showFerramentasTab('quiz') },
            { id: 'atelie', alvo: abaFerr('atelie'), titulo: '🖌️ Ateliê', texto: 'Editor de artes: certificado, cartaz, convite, crachá, comunicado. Parta de um modelo, da folha em branco ou de um pedido para a IA. Gera até um certificado por estudante da turma.', antes: () => showFerramentasTab('atelie') }
        ]
    },

    fichaEstudante: {
        nome: 'Ficha do estudante',
        passos: [
            { alvo: '#estudanteGeralNome', titulo: 'Ficha do estudante', texto: 'Tudo sobre um estudante nesta turma, em um lugar só.' },
            { alvo: cartaoDe('#estudanteGeralFrequencia'), titulo: 'Frequência e atrasos', texto: 'Faltas e atrasos registrados na chamada.' },
            { alvo: '#estudanteGeralNotas', titulo: 'Notas', texto: 'As notas dos trabalhos, por bimestre.' },
            { alvo: '#estudanteGeralOcorrencias', titulo: 'Ocorrências', texto: 'As ocorrências do estudante e a devolutiva da gestão.' },
            { alvo: '#estudanteGeralCompensacoes', titulo: 'Compensações', texto: 'As atividades de compensação de ausência e se foram entregues.' }
        ]
    },

    fichaTutorado: {
        nome: 'Ficha de tutoria',
        passos: [
            { alvo: '#tutoradoFichaNome', titulo: 'Ficha de tutoria', texto: 'O acompanhamento de um tutorado.' },
            { alvo: '#tutoradoFichaAgendamentos', titulo: 'Agendamentos', texto: 'Os próximos encontros marcados.' },
            { alvo: '#tutoradoFichaHistorico', titulo: 'Histórico', texto: 'Os encontros já registrados, com tema e resumo.' }
        ]
    },

    tutoriais: {
        nome: 'Tutoriais',
        preparar: () => irPara('tutoriais'),
        passos: [
            { alvo: '#tutNav', titulo: 'Tutoriais', texto: '"Iniciante" é o caminho desde o começo. "Páginas" tem o manual de cada tela e "Ferramentas" explica cada ferramenta.' },
            { alvo: '#tutBusca', titulo: 'Buscar', texto: 'Digite o que procura (ex.: chamada, PDF, certificado) para achar o manual certo.' },
            { alvo: '#tutConteudo .tut-ver', titulo: '▶ Mostrar na tela', texto: 'Abre a página de verdade e mostra, destacando, onde fica cada coisa.' }
        ]
    }
};

// ------------------------------------------------------------------ TOURS DE CADA ABA DA TURMA
// O "?" dentro da turma explica a aba que está aberta, botão por botão. Passo marcado com
// `opcional` só aparece quando existe na tela (ex.: "Registro Rápido" só existe se a gestão
// cadastrou as opções); os manuais da aba "Dentro da turma" contam esses casos.
function prepararAba(tab) {
    return async () => {
        let fechar = null;
        if (telaAtiva() !== 'turmaDetalhe') {
            if (!temTurma() || typeof abrirTurma !== 'function') {
                return { trocarPara: 'turmas', aviso: 'Você ainda não tem turma cadastrada. Primeiro cadastre uma em "+ Nova Turma"; depois o "?" dentro da turma explica cada aba.' };
            }
            await abrirTurma(data.turmas[0].id);
            await esperar(300);
            fechar = () => marcarAbaTurma('estudantes');
        } else {
            const voltar = abaTurmaVisivel();
            if (voltar !== tab) fechar = () => marcarAbaTurma(voltar);
        }
        if (abaTurmaVisivel() !== tab) { marcarAbaTurma(tab); await esperarAbaPronta(tab); }
        else { const b = $(abaTurma(tab)); if (b && !b.classList.contains('active')) { $$('#turmaDetalhe nav .turma-nav-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); } }
        return { fechar };
    };
}
// Algumas abas desenham depois de ler a nuvem (chamada, estudantes, mapa). Espera o conteúdo
// parar de mudar (até 4 s) antes de contar os passos.
async function esperarAbaPronta(tab) {
    const el = document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (!el) return;
    let antes = null, iguais = 0;
    for (let i = 0; i < 40; i++) {
        await esperar(100);
        const agora = el.innerHTML;
        const carregando = /Carregando|Sincronizando/.test(el.textContent) || !el.querySelector('button, table, input');
        if (agora === antes && !carregando) { if (++iguais >= 2) return; } else iguais = 0;
        antes = agora;
    }
}
const naAba = (tab, sel) => '#tab' + tab.charAt(0).toUpperCase() + tab.slice(1) + ' ' + sel;
function pai(sel, sobe) {
    return () => {
        let el = $(sel);
        for (let i = 0; el && i < (sobe || 1); i++) el = el.parentElement;
        return el;
    };
}
function maisPerto(sel, alvo) {
    return () => { const el = $(sel); return el ? el.closest(alvo) : null; };
}
const FIM_ABA = { rotulo: '🏫 Ver todas as abas', tour: 'turmaDetalhe' };

const TOURS_ABAS = {
    aba_estudantes: {
        nome: 'Aba Estudantes', preparar: prepararAba('estudantes'), acaoFinal: FIM_ABA,
        passos: [
            { alvo: abaTurma('estudantes'), titulo: '👥 Estudantes', texto: 'A lista da turma. É aqui que você vê quem está na turma, a situação de cada um e os avisos da gestão sobre eles.' },
            { opcional: true, alvo: () => { const h = $$('#tabEstudantes h4').find(x => /Atendimento AEE/.test(x.textContent)); return h ? h.parentElement : null; }, titulo: '🧩 Atendimento AEE agora', texto: 'Aparece quando um estudante desta turma está, neste momento, em atendimento no AEE. Mostra com quem e até que horas.' },
            { opcional: true, alvo: () => { const h = $$('#tabEstudantes h3').find(x => /Dashboard da Turma/.test(x.textContent)); return h ? h.closest('.card') : null; }, titulo: '📌 Dashboard da Turma', texto: 'Os avisos vigentes da gestão: 📢 recados para a turma, 🔵 atestados (com os dias), 🔴 estudantes faltosos e 🟡 observações. Atestado vencido some sozinho.' },
            { opcional: true, alvo: porTexto('#tabEstudantes', 'Importar de outra turma'), titulo: '👥 Importar de outra turma (eletiva)', texto: 'Só na eletiva: escolha a turma de origem e marque os alunos. Eles aparecem aqui sem duplicar o cadastro; se forem transferidos na turma deles, saem da eletiva também.' },
            { opcional: true, alvo: porTexto('#tabEstudantes', 'Novo Estudante'), titulo: '+ Novo Estudante', texto: 'Aparece nas turmas que não vêm da lista da escola. Digite o nome completo; o estudante entra como Ativo.' },
            { opcional: true, alvo: porTexto('#tabEstudantes', 'Importar lista'), titulo: '📂 Importar lista (CSV)', texto: 'Traz a turma inteira de uma planilha (CSV, Excel ou a página salva da Secretaria). O sistema acha as colunas de nome e situação; se não achar, você escolhe.' },
            { alvo: naAba('estudantes', 'table'), titulo: 'A lista', texto: 'Todos os estudantes da turma, em ordem alfabética, inclusive transferidos (para você ver o histórico). Só os Ativos aparecem na chamada, nas notas e no mapa.' },
            { alvo: naAba('estudantes', 'tbody tr td:first-child a'), titulo: 'Nome: abre a ficha', texto: 'Toque no nome para abrir a ficha do estudante: frequência, atrasos, notas, ocorrências e compensações juntas. Ao lado do nome podem aparecer: F vermelho (faltou hoje), 🧩 (atendido pelo AEE, com o diagnóstico) e "1B: 3d" (dias de atestado por bimestre).' },
            { alvo: naAba('estudantes', 'tbody tr td:nth-child(2)'), titulo: 'Status', texto: 'Ativo, Transferido, Remanejado, NCOM... Quem muda o status é a gestão; na sua turma ele atualiza sozinho quando a lista da escola muda.' }
        ]
    },
    aba_chamada: {
        nome: 'Aba Chamada', preparar: prepararAba('chamada'), acaoFinal: FIM_ABA,
        passos: [
            { alvo: abaTurma('chamada'), titulo: '✅ Chamada', texto: 'A chamada do dia e o diário de classe, juntos. Leva menos de um minuto por aula.' },
            { alvo: '#chamadaData', titulo: 'Data', texto: 'Já vem com hoje. Mude para lançar ou corrigir a chamada de outro dia: o que já foi salvo naquele dia aparece marcado. Se o dia não tem aula desta turma na sua agenda, aparece um aviso azul, mas a chamada continua liberada.' },
            { alvo: () => { const d = $('#chamadaData'); return d ? d.closest('.form-row').lastElementChild : null; }, titulo: 'Status do dia', texto: '"Pendente / Todos Presentes" (laranja) quando ainda não há falta salva nesse dia; "Registrada (Faltas)" (verde) depois que você salva faltas.' },
            { alvo: () => { const c = $('#tabChamada .presenca-check'); return c ? c.closest('td') : null; }, titulo: 'Presença', texto: 'Marcado (P verde) = presente. Toque para desmarcar = falta. Todo mundo começa presente, então você só toca em quem faltou.' },
            { alvo: naAba('chamada', 'table'), titulo: 'Avisos ao lado do nome', texto: '"Atestado (3d)": tem atestado nesse dia e já vem como falta. "Faltoso" e "Obs": alertas da gestão. "⚠️ 2 falta(s) hoje": outros professores já marcaram falta hoje; com 2 ou mais, o estudante já vem desmarcado como sugestão (confira antes de salvar).' },
            { alvo: '#chamadaRegistroAula', titulo: '📝 Registro da Aula', texto: 'O diário de classe: escreva o conteúdo ou as atividades da aula. Fica guardado na aba Registros, na data da chamada.' },
            { alvo: '#btnSalvarChamada', titulo: '💾 Confirmar e Salvar', texto: 'Só aqui a chamada é gravada. As faltas também seguem (cifradas) para a escola: os colegas veem na chamada deles e a gestão usa na Busca Ativa. Se a escola não receber na hora, o sistema avisa e tenta de novo no próximo salvamento.' },
            { alvo: porTexto('#tabChamada', 'Relatório Mensal'), titulo: '📅 Relatório Mensal de Faltas', texto: 'A grade do mês inteiro (dias úteis × estudantes) com o total de faltas de cada um, incluindo as marcadas por outros professores. Escolha mês e ano e imprima pelo 🖨️.' }
        ]
    },
    aba_registros: {
        nome: 'Aba Registros', preparar: prepararAba('registros'), acaoFinal: FIM_ABA,
        passos: [
            { alvo: abaTurma('registros'), titulo: '📂 Registros', texto: 'O histórico das aulas que você deu nesta turma: o diário de classe.' },
            { alvo: porTexto('#tabRegistros', 'Novo Registro de Aula'), titulo: '+ Novo Registro de Aula', texto: 'Anote uma aula sem fazer chamada (ou de um dia que passou): escolha a data e escreva o conteúdo.' },
            { alvo: () => { const h = $$('#tabRegistros h3').find(x => /Histórico/.test(x.textContent)); return h ? h.nextElementSibling : null; }, titulo: 'Histórico de Aulas', texto: 'Cada cartão é uma aula, da mais recente para a mais antiga. O que você escreve no "Registro da Aula" da Chamada aparece aqui também (é o mesmo registro).' },
            { opcional: true, alvo: naAba('registros', '.card .btn-secondary'), titulo: '✏️ Editar e 🗑️ Excluir', texto: 'Corrija a data ou o texto, ou apague o registro (o sistema pede confirmação).' }
        ]
    },
    aba_atrasos: {
        nome: 'Aba Atrasos', preparar: prepararAba('atrasos'), acaoFinal: FIM_ABA,
        passos: [
            { alvo: abaTurma('atrasos'), titulo: '⏰ Atrasos', texto: 'Para anotar quem chegou atrasado e, se repetir, gerar uma ocorrência.' },
            { alvo: maisPerto('#atrasoEstudante', '.card'), titulo: 'Registrar Atraso', texto: 'Escolha o estudante e toque em "Registrar". O atraso fica com a data de hoje. "(F)" antes do nome = faltou hoje.' },
            { alvo: pai('#filtroAtrasoMesInicio', 2), titulo: 'Período', texto: 'Escolha de que mês até que mês ver (do ano atual).' },
            { alvo: naAba('atrasos', 'table'), titulo: 'Histórico de Atrasos', texto: 'Um estudante por linha, com as datas e o total no período. O × numa data apaga aquele atraso.' },
            { opcional: true, alvo: porTexto('#tabAtrasos', 'Gerar'), titulo: '⚠️ Gerar ocorrência', texto: 'Monta uma ocorrência disciplinar com todas as datas de atraso do período, pedindo o comparecimento do responsável. Mostra o texto antes de registrar.' }
        ]
    },
    aba_trabalhos: {
        nome: 'Aba Trabalhos', preparar: prepararAba('trabalhos'), acaoFinal: FIM_ABA,
        passos: [
            { alvo: abaTurma('trabalhos'), titulo: '📝 Trabalhos', texto: 'A planilha de notas: atividades, pesos e a média de cada estudante no bimestre.' },
            { alvo: naAba('trabalhos', '> div:first-child'), titulo: 'Bimestre', texto: 'Cada bimestre tem as suas atividades. Escolha qual ver.' },
            { alvo: () => { const c = $('#chaveSugestaoSalaFuturo'); return c ? c.closest('label') : null; }, titulo: '💡 Sugestão para a Sala do Futuro', texto: 'Ligue para ver, por estudante, 3 notas inteiras cuja média dá a média dele aqui (arredondada para cima). Ajuda a lançar na Sala do Futuro, que pede 3 atividades. O lançamento lá continua sendo seu.' },
            { alvo: porTexto('#tabTrabalhos', 'Importar de outra turma'), titulo: '📥 Importar de outra turma', texto: 'Copia as atividades de outra turma sua (nome, tipo, peso e critérios), sem as notas. Bom para quem dá a mesma atividade em várias turmas.' },
            { alvo: porTexto('#tabTrabalhos', 'Criar Nova Atividade'), titulo: '+ Criar Nova Atividade', texto: 'Dê um título, o bimestre, o peso e o tipo: Comum (você digita a nota), Colar do Excel (nome + nota), Rubrica (critérios com peso, marque o que o aluno cumpriu) ou automáticas: Compensação de Faltas, Caderno, Participação e Avaliação da Gestão (ex.: Prova Paulista).' },
            { alvo: naAba('trabalhos', '.filtro-alunos'), titulo: 'Filtrar estudante', texto: 'Digite parte do nome para achar rápido em turma grande.' },
            { opcional: true, alvo: naAba('trabalhos', '.planilha-acoes th:nth-child(2)'), titulo: 'Botões da atividade', texto: '✏️ edita (e pode mudar o bimestre, levando as notas junto), "Peso" mostra o peso, 📋 copia as notas da coluna para colar na Sala do Futuro, × exclui a atividade.' },
            { alvo: naAba('trabalhos', '.planilha-notas-box'), titulo: 'A planilha', texto: 'Toque na célula e digite a nota (pode usar vírgula); salva sozinho quando sai da célula. Nas atividades automáticas a nota já vem calculada; se você digitar por cima, vale a sua.' },
            { alvo: naAba('trabalhos', '.planilha-titulos .col-media-fixa'), titulo: 'MÉDIA', texto: 'Média ponderada pelos pesos das atividades do bimestre. Fica vermelha abaixo de 5.' },
            { alvo: naAba('trabalhos', '.planilha-titulos .col-faltas-fixa'), titulo: 'FALTAS/AT.', texto: 'Faltas do estudante no bimestre e, entre parênteses, os dias de atestado. A tag "Faltoso" ao lado do nome vem da gestão.' }
        ]
    },
    aba_compensacoes: {
        nome: 'Aba Compensações', preparar: prepararAba('compensacoes'), acaoFinal: FIM_ABA,
        passos: [
            { alvo: abaTurma('compensacoes'), titulo: '⚖️ Compensações', texto: 'Compensação de ausências: uma atividade para quem faltou recuperar as aulas perdidas.' },
            { alvo: maisPerto('#compMes', '.card'), titulo: 'Nova Atribuição', texto: 'Escolha o mês e o ano de referência e descreva a atividade (ex.: "Resumo do Cap. 5").' },
            { alvo: porTexto('#tabCompensacoes', 'Gerar Compensações'), titulo: '🚀 Gerar Compensações', texto: 'O sistema procura todos os estudantes ativos com falta nesse mês e passa a atividade para cada um, com o número de aulas a compensar (aula dupla conta 2). Mostra quantos achou antes de confirmar e não repete a mesma atividade.' },
            { alvo: pai('#filtroCompMes', 2), titulo: 'Controle de Entregas', texto: 'Filtre por mês (ou "Todos") e ano.' },
            { alvo: naAba('compensacoes', 'table'), titulo: 'A lista de entregas', texto: 'Estudante, mês de referência, atividade e quantas aulas compensa. Embaixo do nome fica o histórico das mudanças de situação.' },
            { opcional: true, alvo: naAba('compensacoes', 'tbody td:nth-child(4) button'), titulo: 'Situação (toque para trocar)', texto: 'Cada toque passa para a próxima: ⏳ Pendente → 📩 Notificado → ✅ Entregue → ⏰ Entregue c/ atraso → ❌ Não entregue → 📄 Não fez / sem folha. Na atividade automática "Compensação de Faltas" (aba Trabalhos), Entregue devolve as aulas, com atraso devolve metade e "Não fez" tira 1 ponto.' }
        ]
    },
    aba_caderno: {
        nome: 'Aba Caderno', preparar: prepararAba('caderno'), acaoFinal: FIM_ABA,
        passos: [
            { alvo: abaTurma('caderno'), titulo: '📖 Caderno', texto: 'O visto do caderno e o engajamento na aula, por dia. Alimenta as notas automáticas "Caderno" e "Participação" da aba Trabalhos.' },
            { alvo: naAba('caderno', '> div:first-child'), titulo: 'Resumos do mês', texto: '"Resumo Mensal do Caderno" e "Resumo Mensal Participação" mostram o mês inteiro de cada estudante, para conferir ou imprimir.' },
            { alvo: '#cadernoData', titulo: 'Data da atividade', texto: 'O dia do visto. Vem com hoje; mude para lançar outro dia.' },
            { alvo: naAba('caderno', 'thead th:nth-child(2)'), titulo: 'Situação do Caderno', texto: 'C = Completo, I = Incompleto, N = Não fez. Todo mundo começa em C: toque só em quem não fez tudo. Salva na hora.' },
            { alvo: naAba('caderno', 'thead th:nth-child(3)'), titulo: 'Engajamento', texto: 'T = Total, M = Médio, N = Nada (não desenvolveu). Também começa em T.' },
            { alvo: naAba('caderno', 'thead th:nth-child(4)'), titulo: 'Ponto Extra (+1)', texto: '"Cad." soma 1 ponto na nota de Caderno; "Prat." soma 1 ponto na de Participação (as duas vão até 10).' },
            { alvo: naAba('caderno', '.filtro-alunos'), titulo: 'Filtrar estudante', texto: 'Para achar um nome rápido.' }
        ]
    },
    aba_ocorrencias: {
        nome: 'Aba Ocorrências', preparar: prepararAba('ocorrencias'), acaoFinal: FIM_ABA,
        passos: [
            { alvo: abaTurma('ocorrencias'), titulo: '⚠️ Ocorrências', texto: 'Registre fatos da aula (comportamento, material, conflito...). A ocorrência vai para a gestão e a resposta dela volta para cá.' },
            { opcional: true, alvo: maisPerto('#selEstudanteRapido', '.card'), titulo: '⚡ Registro Rápido', texto: 'Escolha o estudante e uma das ocorrências prontas que a gestão cadastrou (ex.: "Sem material"). Um toque e está registrado.' },
            { alvo: () => { const s = $('#selEstudanteOcorrencia'); return s ? s.closest('div').parentElement : null; }, titulo: 'Nova Ocorrência: estudantes', texto: 'Escolha o estudante e toque em "Adicionar". Repita para pôr vários na mesma ocorrência; o × tira alguém da lista.' },
            { alvo: '#novaOcorrenciaTexto', titulo: 'Relato', texto: 'Descreva o que aconteceu, com fatos (o que, quando, onde).' },
            { alvo: () => { const r = $('#radioTipoRapida'); return r ? r.closest('label').parentElement.parentElement : null; }, titulo: 'Classificação (obrigatória)', texto: '📝 Registro (Informativo): fica anotado. ⚠️ Atenção da Gestão: pede ação da coordenação. Na nota automática de Participação, o registro tira 2 pontos e o de atenção tira 3.' },
            { alvo: porTexto('#tabOcorrencias', 'Registrar Ocorrência'), titulo: 'Registrar Ocorrência', texto: 'Grava e envia para a gestão. Para corrigir depois, use ✏️ no histórico.' },
            { alvo: porTexto('#tabOcorrencias', 'Disciplinares'), titulo: 'Histórico', texto: 'Duas listas: ⚠️ Disciplinares e ⚡ Registros rápidos. Cada ocorrência mostra a data, quem registrou, os envolvidos, o relato, a situação (⏳ Pendente ou ✅ Confirmada pela gestão) e a Devolutiva da Gestão. ✏️ edita, 🖨️ imprime, 🗑️ exclui.' }
        ]
    },
    aba_mapeamento: {
        nome: 'Aba Mapeamento', preparar: prepararAba('mapeamento'), acaoFinal: FIM_ABA,
        passos: [
            { alvo: abaTurma('mapeamento'), titulo: '🗺️ Mapeamento', texto: 'O mapa de lugares da sala. Ele é da turma da escola: os professores da mesma turma veem e mexem no mesmo mapa.' },
            { alvo: () => { const b = porTexto('#tabMapeamento', '+ Linha')(); return b ? b.parentElement : null; }, titulo: 'Tamanho da sala', texto: '"+ Linha / - Linha" põe ou tira uma linha de carteiras no fundo; "+ Fileira / - Fileira" põe ou tira uma fileira na lateral. 🗑️ Resetar esvazia o mapa.' },
            { alvo: () => { const d = $$('#tabMapeamento div').find(x => /LOUSA/.test(x.textContent) && !x.children.length); return d ? d.parentElement : null; }, titulo: 'A sala vista de cima', texto: 'A lousa fica em cima. Cada quadrado é uma carteira, com o código F (fileira) e C (carteira). O × vermelho tira o estudante da carteira; "F" vermelho = faltou hoje.' },
            { alvo: () => { const h = $$('#tabMapeamento h4').find(x => /sem lugar/.test(x.textContent)); return h ? h.closest('div').parentElement : $$('#tabMapeamento div').find(x => /Todos os estudantes ativos/.test(x.textContent) && !x.children.length); }, titulo: 'Sentar os estudantes', texto: 'Os sem lugar aparecem em vermelho. Toque no nome e depois na carteira (ou arraste o nome até a carteira, no computador). Para trocar dois de lugar, arraste um sobre o outro.' },
            { alvo: porTexto('#tabMapeamento', 'Imprimir Mapa'), titulo: '🖨️ Imprimir Mapa', texto: 'Imprime só o mapa, sem botões, para deixar na mesa.' },
            { alvo: () => { const h = $$('#tabMapeamento h4').find(x => /Histórico de Alterações/.test(x.textContent)); return h ? h.parentElement : null; }, titulo: '🕒 Histórico', texto: 'Quem mexeu no mapa, quando e quantas mudanças fez.' }
        ]
    }
};
Object.assign(TOURS, TOURS_ABAS);

// Qual tour vale para o que está na tela agora.
function tourDaTelaAtual() {
    if (modalAberto('modalGerarDocumentoIA')) return 'estagiario';
    if (modalAberto('modalNovaTurma')) return 'novaTurma';
    const t = telaAtiva();
    if (t === 'estudanteDetalhe') return 'fichaEstudante';
    if (t === 'tutoradoDetalhe') return 'fichaTutorado';
    if (t === 'turmaDetalhe' && TOURS['aba_' + abaTurmaVisivel()]) return 'aba_' + abaTurmaVisivel();
    if (t === 'documentos' && abaDocAtual() === 'agenda') return 'documentos';
    return TOURS[t] ? t : 'inicio';
}

// ------------------------------------------------------------------ O MOTOR DO TOUR
let tour = null;   // { def, passos, i, fechar, origem, elementos }

async function iniciarTour(id, opcoes) {
    opcoes = opcoes || {};
    if (tour) encerrarTour();
    let def = TOURS[id];
    if (!def) return;
    guardar(CHAVE_JA_USOU, '1');
    const btn = $('#btnAjudaTour');
    if (btn) btn.classList.remove('tour-novo');
    if (typeof fecharTudoAntes === 'function') fecharTudoAntes();

    let preparo = null;
    try { preparo = def.preparar ? await def.preparar() : null; } catch (e) { console.warn('[SisProf] Tour:', e); }
    let aviso = null;
    if (preparo && preparo.trocarPara && TOURS[preparo.trocarPara]) {
        aviso = preparo.aviso;
        def = TOURS[preparo.trocarPara];
        try { preparo = def.preparar ? await def.preparar() : null; } catch (e) { preparo = null; }
    }
    let passos = def.passos.slice();
    // Tour que não abre nada no meio (sem `antes`): o que não está na tela agora não vai
    // aparecer depois, então sai da conta ("3 de 7" fica certo).
    if (!passos.some(p => p.antes)) passos = passos.filter(p => !p.alvo || acharAlvo(p));
    if (aviso) passos.unshift({ titulo: 'Antes de começar', texto: aviso });
    let inicio = 0;
    if (opcoes.passo) {
        const k = passos.findIndex(p => p.id === opcoes.passo);
        if (k !== -1) inicio = k;
    }
    tour = { def, passos, i: inicio, fechar: preparo && preparo.fechar, origem: opcoes.origem || null };
    montarCamada();
    await mostrarPasso(inicio, 1);
}

function montarCamada() {
    const camada = document.createElement('div');
    camada.className = 'tour-camada';
    camada.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); });
    const foco = document.createElement('div');
    foco.className = 'tour-foco';
    const balao = document.createElement('div');
    balao.className = 'tour-balao';
    balao.setAttribute('role', 'dialog');
    balao.setAttribute('aria-modal', 'true');
    balao.setAttribute('aria-live', 'polite');
    document.body.appendChild(camada);
    document.body.appendChild(foco);
    document.body.appendChild(balao);
    tour.elementos = { camada, foco, balao };
}

function acharAlvo(passo) {
    if (!passo.alvo) return null;
    try {
        const el = typeof passo.alvo === 'function' ? passo.alvo() : $(passo.alvo);
        return visivel(el) ? el : null;
    } catch (e) { return null; }
}

// `direcao` diz para onde pular quando o alvo do passo não existe (1 = frente, -1 = trás).
async function mostrarPasso(i, direcao) {
    if (!tour) return;
    const passos = tour.passos;
    while (i >= 0 && i < passos.length) {
        const p = passos[i];
        if (p.antes) { try { await p.antes(); } catch (e) {} await esperar(160); }
        if (!tour) return;
        const el = acharAlvo(p);
        if (el || !p.alvo) { tour.i = i; tour.alvoAtual = el; desenhar(); return; }
        i += direcao || 1;
    }
    if (i >= passos.length) encerrarTour();
    else { tour.i = 0; mostrarPasso(0, 1); }
}

function contarVisiveis() {
    return tour.passos.length;
}

function desenhar() {
    if (!tour) return;
    const p = tour.passos[tour.i];
    const { foco, balao } = tour.elementos;
    const el = tour.alvoAtual;
    const ultimo = tour.i >= tour.passos.length - 1;
    balao.innerHTML =
        '<div class="tour-topo"><span class="tour-conta">' + (tour.i + 1) + ' de ' + contarVisiveis() + ' · ' + esc(tour.def.nome) + '</span>' +
        '<button type="button" class="tour-x" data-acao="sair" aria-label="Fechar o tour">×</button></div>' +
        '<h3 class="tour-titulo">' + esc(p.titulo) + '</h3>' +
        '<p class="tour-texto">' + esc(p.texto) + '</p>' +
        '<div class="tour-barra"><span style="width:' + Math.round(((tour.i + 1) / tour.passos.length) * 100) + '%"></span></div>' +
        '<div class="tour-botoes">' +
        (tour.i > 0 ? '<button type="button" class="btn btn-sm btn-secondary" data-acao="voltar">← Voltar</button>' : '<button type="button" class="btn btn-sm btn-secondary" data-acao="sair">Sair</button>') +
        (ultimo && tour.origem === 'tutoriais' ? '<button type="button" class="btn btn-sm btn-secondary" data-acao="tutoriais">📘 Tutoriais</button>' : '') +
        (ultimo && tour.def.acaoFinal ? '<button type="button" class="btn btn-sm btn-secondary" data-acao="final">' + esc(tour.def.acaoFinal.rotulo) + '</button>' : '') +
        '<button type="button" class="btn btn-sm btn-primary" data-acao="' + (ultimo ? 'sair' : 'proximo') + '">' + (ultimo ? 'Concluir ✓' : 'Próximo →') + '</button>' +
        '</div>';
    balao.onclick = (e) => {
        const b = e.target.closest('button[data-acao]');
        if (!b) return;
        const a = b.dataset.acao;
        if (a === 'proximo') avancar(1);
        else if (a === 'voltar') avancar(-1);
        else if (a === 'tutoriais') { encerrarTour(); irPara('tutoriais'); }
        else if (a === 'final') { const prox = tour.def.acaoFinal.tour; const origem = tour.origem; encerrarTour(); iniciarTour(prox, { origem }); }
        else encerrarTour();
    };

    if (el) {
        try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { el.scrollIntoView(); }
        foco.style.display = '';
    } else {
        foco.style.display = 'none';
    }
    tour.elementos.camada.classList.toggle('tour-escuro', !el);
    posicionar();
    const prox = balao.querySelector('[data-acao="proximo"], .btn-primary');
    if (prox) prox.focus({ preventScroll: true });
}

function posicionar() {
    if (!tour) return;
    const { foco, balao } = tour.elementos;
    const el = tour.alvoAtual;
    const vw = window.innerWidth, vh = window.innerHeight;
    const celular = vw < 640;
    balao.classList.toggle('tour-celular', celular);
    balao.style.left = balao.style.top = balao.style.bottom = balao.style.right = '';

    if (!el || !el.isConnected) {
        // Sem alvo: no meio da tela
        balao.classList.add('tour-meio');
        return;
    }
    balao.classList.remove('tour-meio');
    const r = el.getBoundingClientRect();
    const folga = 6;
    const top = Math.max(r.top - folga, 4), left = Math.max(r.left - folga, 4);
    const bottom = Math.min(r.bottom + folga, vh - 4), right = Math.min(r.right + folga, vw - 4);
    foco.style.top = top + 'px';
    foco.style.left = left + 'px';
    foco.style.width = Math.max(right - left, 8) + 'px';
    foco.style.height = Math.max(bottom - top, 8) + 'px';

    const bw = balao.offsetWidth, bh = balao.offsetHeight;
    if (celular) {
        // No celular o balão fica preso embaixo (ou em cima, se o alvo estiver embaixo)
        const centroAlvo = (top + bottom) / 2;
        if (centroAlvo > vh * 0.55) balao.style.top = '16px';
        else balao.style.bottom = '16px';
        return;
    }
    let y;
    if (bottom + 12 + bh <= vh - 8) y = bottom + 12;
    else if (top - 12 - bh >= 8) y = top - 12 - bh;
    else y = Math.max(8, vh - bh - 8);
    let x = Math.min(Math.max(8, left), vw - bw - 8);
    // Alvo alto e largo (ex.: a lista inteira) sem espaço em cima nem embaixo: balão ao lado
    if (y < bottom && y + bh > top && right + 12 + bw <= vw - 8) { x = right + 12; y = Math.min(Math.max(8, top), vh - bh - 8); }
    balao.style.left = x + 'px';
    balao.style.top = y + 'px';
}

async function avancar(d) {
    if (!tour) return;
    const i = tour.i + d;
    if (i >= tour.passos.length) { encerrarTour(); return; }
    if (i < 0) return;
    await mostrarPasso(i, d);
}

function encerrarTour() {
    if (!tour) return;
    const t = tour;
    tour = null;
    Object.values(t.elementos || {}).forEach(e => e.remove());
    if (typeof t.fechar === 'function') { try { t.fechar(); } catch (e) {} }
}

document.addEventListener('keydown', (e) => {
    if (!tour) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); encerrarTour(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); avancar(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); avancar(-1); }
}, true);
let repintar = null;
const reposicionar = () => { if (!tour) return; cancelAnimationFrame(repintar); repintar = requestAnimationFrame(posicionar); };
window.addEventListener('resize', reposicionar);
window.addEventListener('scroll', reposicionar, true);

// Folha "Mais" e busca rápida abertas por cima atrapalhariam o tour.
function fecharTudoAntes() {
    $$('.ux-folha-fundo, .ux-paleta-fundo').forEach(e => e.remove());
}

// ------------------------------------------------------------------ O BOTÃO "?"
function montarBotaoAjuda() {
    const area = $('#headerUserArea');
    if (!area || $('#btnAjudaTour')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btnAjudaTour';
    btn.className = 'btn btn-sm btn-secondary tour-btn-ajuda' + (ler(CHAVE_JA_USOU) ? '' : ' tour-novo');
    btn.title = 'Como funciona esta tela?';
    btn.setAttribute('aria-label', 'Ajuda: como funciona esta tela');
    btn.innerHTML = '<span aria-hidden="true">?</span>';
    btn.addEventListener('click', () => iniciarTour(tourDaTelaAtual()));
    const buscar = $('#uxBotaoBuscar', area);
    const dataHoje = $('#currentDate', area);
    const depois = buscar || dataHoje;
    area.insertBefore(btn, depois ? depois.nextSibling : area.firstChild);
}

// O "?" também dentro do Estagiário: a janela cobre o topo da tela.
function montarAjudaNoEstagiario() {
    const modal = document.getElementById('modalGerarDocumentoIA');
    if (!modal || $('.tour-btn-modal', modal)) return;
    const fechar = $('.modal-header .btn-danger, .modal-header .close-btn', modal) || $('button', modal);
    if (!fechar || !fechar.parentNode) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-secondary tour-btn-modal';
    btn.title = 'Como usar o Estagiário';
    btn.textContent = '?';
    btn.style.marginRight = '6px';
    btn.addEventListener('click', () => iniciarTour('estagiario'));
    fechar.parentNode.insertBefore(btn, fechar);
}

// ------------------------------------------------------------------ OS MANUAIS
// Cada item: titulo, praQue (uma frase), passos (como usar), dicas, e o tour que mostra na tela.
const INICIANTE = [
    { id: 'i-menu', titulo: 'Conheça o menu e o Início', tour: 'inicio',
      praQue: 'Saber onde fica cada página antes de começar.',
      passos: ['O menu fica do lado (no computador) ou embaixo (no celular). No celular, "Mais" mostra todas as páginas.',
               'O Início mostra a agenda e as tutorias do dia, os avisos da gestão e a cópia de segurança.',
               'Em qualquer página, o botão "?" no topo explica a tela em que você está.'] },
    { id: 'i-turmas', titulo: 'Cadastre suas turmas', tour: 'novaTurma',
      praQue: 'Tudo no SisProf parte das turmas: chamada, notas, agenda e documentos.',
      passos: ['Abra "Turmas" e toque em "+ Nova Turma".',
               'Escolha a turma da escola (a lista vem da gestão), escreva a disciplina e o turno, e salve.',
               'Repita para cada turma. Se você dá duas disciplinas na mesma turma, cadastre as duas.',
               'Os estudantes chegam sozinhos da lista da escola. Se não chegarem, na aba Estudantes dá para importar uma lista (CSV) ou adicionar à mão.'],
      dicas: ['A lista de turmas da escola está vazia? A gestão ainda não cadastrou as turmas: fale com a coordenação.',
              'Eletiva: marque "Eletiva", dê um nome (ex.: Teatro) e, dentro dela, use "Importar de outra turma" para trazer os alunos.'] },
    { id: 'i-agenda', titulo: 'Monte sua agenda da semana', tour: 'agenda',
      praQue: 'A agenda alimenta a "Agenda do Dia" do Início, a Agenda Mensal e a tutoria automática.',
      passos: ['Abra "Documentos" e fique na aba "📅 Minha Agenda".',
               'Os horários de segunda a sexta vêm da grade da escola. Os blocos com 🔒 são fixos (almoço, ATPCA...).',
               'Em cada horário, escolha a turma daquela aula, ou Tutoria, Estudo, Reunião etc. Salva sozinho.',
               'Se quiser, ligue o Google Agenda no cartão "📆 Google Agenda" para ver as aulas no celular.'],
      dicas: ['Aparece "A gestão ainda não configurou a grade de horários"? A grade é feita pela gestão; peça para montarem.'] },
    { id: 'i-abas', titulo: 'Entre numa turma e conheça as abas', tour: 'turmaDetalhe',
      praQue: 'Cada turma tem nove abas, uma para cada tarefa do dia a dia.',
      passos: ['👥 Estudantes: a lista e a situação de cada um.',
               '✅ Chamada: faltas do dia e o registro da aula.',
               '📂 Registros: o histórico das aulas dadas.',
               '⏰ Atrasos: quem chegou atrasado.',
               '📝 Trabalhos: atividades, pesos e notas do bimestre.',
               '⚖️ Compensações: atividades para compensar faltas.',
               '📖 Caderno: visto do caderno e engajamento.',
               '⚠️ Ocorrências: ocorrências que vão para a gestão.',
               '🗺️ Mapeamento: o mapa de lugares da sala.'],
      dicas: ['O passo a passo de cada aba está na aba "Dentro da turma" destes Tutoriais. Dentro da turma, o "?" no topo explica a aba aberta.'] },
    { id: 'i-dia', titulo: 'O dia a dia: chamada e registro da aula', tour: 'aba_chamada',
      praQue: 'A rotina de cada aula leva menos de um minuto.',
      passos: ['Entre na turma e abra a aba "✅ Chamada". A data de hoje já vem marcada.',
               'Marque quem faltou. Quem tem atestado ou faltou na aula de outro professor hoje aparece sinalizado.',
               'Escreva o que foi dado em "Registro da Aula (Diário de Classe)".',
               'Toque em "💾 Confirmar e Salvar Chamada".'],
      dicas: ['Para achar um estudante rápido em listas grandes, use o campo de filtro acima da lista.'] },
    { id: 'i-tutoria', titulo: 'Tutoria', tour: 'tutoria',
      praQue: 'Acompanhar seus tutorados e registrar cada encontro.',
      passos: ['Abra "Tutoria" e toque em "+ Novo Tutorado" para escolher os estudantes.',
               'Depois de cada conversa, use "+ Registrar Encontro" (data, tema e resumo).',
               'Encontro em grupo? "👥 Tutoria Coletiva" registra para todos de uma vez.',
               'O agendamento automático distribui os tutorados nos horários de tutoria da sua agenda.'] },
    { id: 'i-estagiario', titulo: 'Estagiário IA: plano de aula e documentos', tour: 'estagiario',
      praQue: 'A IA escreve o rascunho; você revisa e usa.',
      passos: ['Toque em "✨ Estagiário" (no Início ou em Documentos).',
               'Escolha o tipo: Plano de Aula, Agenda Mensal, Anexo III - PAEE ou Anexo IV - PEI.',
               'No plano de aula: escolha a semana, a série, a disciplina e escreva o tema. Sem ideia? "💡 Sugerir temas".',
               'Toque em "Gerar Estrutura", revise o texto e salve, baixe em PDF ou imprima.',
               'O que você salvar fica em Documentos (Planos de Aula, Anexo IV e Histórico).'],
      dicas: ['Quanto mais materiais da sua disciplina estiverem na Biblioteca, melhores as sugestões do Estagiário.',
              'Sempre leia o que a IA escreveu antes de entregar: ela é um estagiário, não o professor.'] },
    { id: 'i-biblioteca', titulo: 'Biblioteca de materiais', tour: 'biblioteca',
      praQue: 'Compartilhar materiais com os colegas e dar referência ao Estagiário.',
      passos: ['Abra "Biblioteca" e fique no modo "⚡ Rápido".',
               'Escolha a disciplina e a série, e selecione o arquivo (PDF, Word, Excel, PPT ou imagem).',
               'Toque em "✨ Classificar e revisar": a IA escreve título, descrição e tags. Confira e publique.',
               'Pode selecionar vários arquivos de uma vez: aí cada um é classificado e publicado direto, sem a revisão.',
               'Na parte de baixo, busque e filtre os materiais de todos.'],
      dicas: ['O arquivo em si não é guardado: só o texto dele, que a IA usa.'] },
    { id: 'i-ferramentas', titulo: 'Ferramentas', tour: 'ferramentas',
      praQue: 'Mexer em PDF, imagem e vídeo, fazer quiz e artes, sem mandar arquivo para site de terceiro.',
      passos: ['Abra "Ferramentas" e escolha a aba: PDF, IMG, Pôster, Vídeo, Na Mosca! ou Ateliê.',
               'Na aba "Ferramentas" destes Tutoriais há o manual de cada uma.',
               'Ver as ferramentas é livre; usar é do plano Professor (veja em Perfil).'] },
    { id: 'i-perfil', titulo: 'Perfil, cópia de segurança e ajuda', tour: 'inicio', tourPasso: 'perfil',
      praQue: 'Deixar o sistema do seu jeito e com os dados protegidos.',
      passos: ['"👤 Perfil": seu nome, o tema de cores, o plano e a cópia de segurança.',
               'De vez em quando, baixe sua cópia de segurança pelo Perfil (ou pela busca: "Baixar minha cópia").',
               '"Buscar" (Ctrl+K) acha estudante, turma, trabalho ou função pelo nome.',
               'O "?" no topo de cada página mostra como ela funciona.'] }
];

const PAGINAS = [
    { id: 'p-inicio', icone: '📊', titulo: 'Início (Dashboard)', tour: 'inicio',
      praQue: 'O resumo do seu dia.',
      passos: ['Agenda do Dia: vem da sua agenda (Documentos › Minha Agenda).',
               'Tutorias/Ações: os encontros marcados para hoje.',
               'Backups e Segurança: sincronizar com a nuvem, baixar e importar a sua cópia.',
               'Quadro de Avisos: recados da gestão.',
               'Atalhos: busca rápida e Estagiário.'] },
    { id: 'p-turmas', icone: '👥', titulo: 'Turmas', tour: 'turmas',
      praQue: 'A lista das suas turmas.',
      passos: ['"+ Nova Turma" cadastra uma turma (turma da escola, disciplina e turno).',
               'Toque no cartão da turma para entrar nela.',
               '✏️ edita e 🗑️ remove a turma.'],
      dicas: ['A eletiva usa alunos de outras turmas sem duplicar o cadastro deles.'] },
    { id: 'p-turma', icone: '🏫', titulo: 'Dentro da turma (as nove abas)', tour: 'turmaDetalhe',
      praQue: 'Onde você lança tudo da turma. O manual completo de cada aba está na aba "Dentro da turma" destes Tutoriais.',
      passos: PASSOS_ABAS_TURMA.map(p => p.titulo + ': ' + p.texto) },
    { id: 'p-tutoria', icone: '🎓', titulo: 'Tutoria', tour: 'tutoria',
      praQue: 'Tutorados, encontros e agenda de tutoria.',
      passos: ['"+ Novo Tutorado" escolhe os estudantes.', '"+ Registrar Encontro" anota cada conversa.', '"👥 Tutoria Coletiva" registra para todos.', 'Toque no nome do tutorado para ver a ficha com o histórico.', 'O agendamento automático usa os horários de tutoria da sua agenda.'] },
    { id: 'p-documentos', icone: '📁', titulo: 'Documentos', tour: 'documentos',
      praQue: 'Agenda e os documentos gerados pelo Estagiário.',
      passos: ['📅 Minha Agenda: a grade da semana.', '📝 Planos de Aula: os planos salvos (PDF, reimprimir).', '📘 Anexo IV - PEI: os PEIs dos estudantes.', '🗂️ Histórico: tudo o que foi gerado.', '"✨ Estagiário" no alto da página.'] },
    { id: 'p-agenda', icone: '📅', titulo: 'Minha Agenda', tour: 'agenda',
      praQue: 'Dizer em que horário você está em cada turma.',
      passos: ['A grade vem da gestão.', 'Em cada horário, escolha a turma ou a atividade.', 'Salva sozinho.', 'Opcional: Google Agenda.'] },
    { id: 'p-estagiario', icone: '🤖', titulo: 'Estagiário IA', tour: 'estagiario',
      praQue: 'Rascunho de plano de aula, Agenda Mensal, Anexo III - PAEE e Anexo IV - PEI.',
      passos: INICIANTE.find(x => x.id === 'i-estagiario').passos },
    { id: 'p-registros', icone: '📂', titulo: 'Registros (da gestão)', tour: 'registrosProfessor',
      praQue: 'Faltas justificadas, atestados e alertas que a gestão lançou para os seus estudantes.',
      passos: ['Só para consulta: quem altera é a gestão.', 'Separado por turma.'] },
    { id: 'p-aee', icone: '🌟', titulo: 'Painel AEE', tour: 'aeeVisaoGeral',
      praQue: 'Os estudantes acompanhados pelo AEE e os Anexos IV - PEI.',
      passos: ['Veja quem tem acompanhamento.', 'Abra, baixe em PDF ou reimprima o Anexo IV.', 'Para criar um Anexo IV, use o "✨ Estagiário".'] },
    { id: 'p-biblioteca', icone: '📚', titulo: 'Biblioteca', tour: 'biblioteca',
      praQue: 'Materiais compartilhados entre professores, usados também pelo Estagiário.',
      passos: INICIANTE.find(x => x.id === 'i-biblioteca').passos },
    { id: 'p-perfil', icone: '👤', titulo: 'Perfil, busca e segurança', tour: 'inicio', tourPasso: 'perfil',
      praQue: 'Ajustes da conta e proteção dos dados.',
      passos: INICIANTE.find(x => x.id === 'i-perfil').passos }
];

const FERRAMENTAS = [
    { id: 'f-pdf', icone: '📕', titulo: 'PDF', tour: 'ferramentas', tourPasso: 'pdf',
      praQue: 'Tudo o que você faria num site de PDF, sem enviar o arquivo: 49 ferramentas.',
      passos: ['Organizar: juntar, dividir, tirar e reordenar páginas, girar.', 'Otimizar: comprimir para caber no e-mail.', 'Converter: Word, imagem e texto para PDF e de volta.', 'Editar: marca d\'água, numerar páginas, assinar desenhando, anotar, censurar.', 'Segurança: pôr e tirar senha.', 'Use a busca da aba para achar a ferramenta pelo nome.'] },
    { id: 'f-img', icone: '🖼️', titulo: 'IMG (imagens)', tour: 'ferramentas', tourPasso: 'img',
      praQue: 'Arrumar fotos e imagens antes de usar ou postar.',
      passos: ['Comprimir, redimensionar, cortar e girar.', 'Converter para JPG e de JPG.', 'Remover fundo (ex.: logotipo da escola).', 'Aumentar resolução de uma imagem pequena.', 'Desfocar o rosto de um estudante antes de postar.', 'Editor de fotos e gerador de memes.'] },
    { id: 'f-poster', icone: '🧱', titulo: 'Pôster', tour: 'ferramentas', tourPasso: 'poster',
      praQue: 'Um cartaz de parede impresso em várias folhas A4.',
      passos: ['Escolha a imagem (ou várias).', 'Diga a largura ou a altura do cartaz: a tela mostra quantas folhas vão sair.', 'Confira a prévia com a grade das folhas.', 'Baixe o PDF: cada folha tem marca de corte e o nome do lugar (ex.: L2-C3).'] },
    { id: 'f-video', icone: '🎬', titulo: 'Vídeo', tour: 'ferramentas', tourPasso: 'video',
      praQue: 'Editar vídeos da turma sem subir o vídeo para ninguém.',
      passos: ['Cortar, juntar, girar, espelhar e recortar.', 'Redimensionar e comprimir.', 'Mudar a velocidade e repetir.', 'Tirar ou pôr áudio.', 'Vídeo para GIF e imagens para GIF.', 'Na primeira vez, o programa de vídeo é baixado; o seu vídeo fica no aparelho.'] },
    { id: 'f-quiz', icone: '🎯', titulo: 'Na Mosca! (quiz ao vivo)', tour: 'ferramentas', tourPasso: 'quiz',
      praQue: 'Um jogo de perguntas na sala, com os alunos respondendo pelo celular.',
      passos: ['"➕ Novo quiz": escreva as perguntas (múltipla escolha, verdadeiro ou falso, enquete), o tempo e a resposta certa.', 'Ou "✨ Criar com IA" a partir de um tema ou de um material da Biblioteca.', '"▶️ Abrir sala" e projete o PIN.', 'Os alunos entram pelo celular com o PIN e um apelido, sem conta.', 'Quem acerta mais rápido ganha mais pontos. No fim: pódio, relatório e planilha (CSV).'] },
    { id: 'f-atelie', icone: '🖌️', titulo: 'Ateliê (editor de artes)', tour: 'ferramentas', tourPasso: 'atelie',
      praQue: 'Certificados, cartazes, convites, crachás, comunicados e capas.',
      passos: ['Comece de um modelo, de uma folha em branco ou peça à IA (ex.: "cartaz da feira de ciências dia 12/11").', 'Mexa em tudo: textos, cores, formas, imagens, figurinhas e fundo.', 'Arraste para mover; puxe as alças para mudar o tamanho; dois cliques no texto para editar.', 'Baixe em PNG, JPG ou PDF, ou imprima.', 'Use {nome} no texto e "Gerar em lote" para sair uma página por estudante da turma (ex.: certificados).'] }
];

// Manual detalhado de cada aba da turma. `secoes` são blocos com título; `ordem: true`
// numera os itens (passo a passo), os outros são marcadores.
const MANUAL_TURMA = [
    { id: 't-geral', icone: '🏫', titulo: 'Como a turma funciona', tour: 'turmaDetalhe',
      praQue: 'Tudo o que você lança de uma turma fica dentro dela, em nove abas.',
      secoes: [
          { t: 'Entrar na turma', itens: ['Abra "Turmas" e toque no cartão da turma.', 'No alto aparecem o nome da turma e a disciplina; "← Voltar" volta para a lista.', 'A fileira de ícones são as abas. A aba aberta mostra o nome; as outras, só o ícone.'] },
          { t: 'As nove abas', itens: PASSOS_ABAS_TURMA.map(p => p.titulo + ': ' + p.texto) },
          { t: 'Bom saber', itens: ['Em toda lista da turma (chamada, notas, caderno...) só aparecem os estudantes Ativos. Os transferidos continuam visíveis só na aba Estudantes.', 'Em listas grandes, use o campo "🔎 Filtrar estudante pelo nome".', 'Em qualquer aba, o botão "?" no topo explica aquela aba, botão por botão.'] }
      ] },
    { id: 't-estudantes', icone: '👥', titulo: 'Estudantes', tour: 'aba_estudantes',
      praQue: 'Ver quem está na turma, a situação de cada um e os avisos da gestão.',
      secoes: [
          { t: 'O que aparece', itens: [
              '🧩 Atendimento AEE em Andamento: só aparece quando um estudante da turma está sendo atendido pelo AEE naquele momento (com o professor e o horário).',
              '📌 Dashboard da Turma: avisos vigentes da gestão. 📢 Avisos para a turma, 🔵 Atestados (com os dias), 🔴 Faltosos e 🟡 Observações. Atestado vencido e aviso arquivado somem sozinhos.',
              'A lista: Nome, Status e Ações, em ordem alfabética, com todos os estudantes (inclusive transferidos).'] },
          { t: 'Símbolos ao lado do nome', itens: ['F vermelho: tem falta registrada hoje.', '🧩 com texto: estudante atendido pelo AEE, com o diagnóstico.', '"1B: 3d / 2B: 1d": dias de atestado em cada bimestre.'] },
          { t: 'De onde vem a lista', itens: [
              'Turma da escola (escolhida da lista da gestão): os estudantes chegam sozinhos e o status (Ativo, Transferido, Remanejado...) é atualizado pela gestão. Aqui você só consulta.',
              'Turma sem vínculo com a escola: aparecem "+ Novo Estudante" (digita o nome) e "📂 Importar lista (CSV)" (planilha CSV, Excel ou a página da Secretaria salva em .htm).',
              'Eletiva: "👥 Importar de outra turma" traz alunos das suas turmas sem duplicar o cadastro, "+ Adicionar manualmente" cria um nome, e 🗑️ tira da eletiva sem mexer na turma de origem.'] },
          { t: 'Como usar', ordem: true, itens: ['Toque no nome do estudante para abrir a ficha dele (frequência, atrasos, notas, ocorrências e compensações).', 'Confira o Dashboard da Turma antes da aula para saber quem tem atestado ou alerta.'] }
      ],
      dicas: ['Se a lista está vazia numa turma da escola, a gestão ainda não publicou a lista dessa turma.'] },
    { id: 't-chamada', icone: '✅', titulo: 'Chamada', tour: 'aba_chamada',
      praQue: 'Lançar as faltas do dia e o diário de classe.',
      secoes: [
          { t: 'Passo a passo', ordem: true, itens: [
              'Abra a aba Chamada. A data já vem com hoje (mude o campo "Data" para outro dia).',
              'Todos começam presentes (P verde). Toque em quem faltou para desmarcar.',
              'Escreva em "📝 Registro da Aula (Diário de Classe)" o conteúdo ou as atividades.',
              'Toque em "💾 Confirmar e Salvar Chamada". Aparece "Chamada salva e compartilhada com a escola!".'] },
          { t: 'Avisos na lista', itens: [
              '"Atestado (Xd)": atestado vigente nesse dia. O estudante já vem desmarcado (falta).',
              '"Faltoso" (vermelho) e "Obs" (amarelo): alertas da gestão. Passe o dedo/mouse em "Obs" para ler.',
              '"1B: 3d": dias de atestado acumulados no bimestre.',
              '"⚠️ N falta(s) hoje": outros professores marcaram falta hoje. Com 2 ou mais, o estudante já vem desmarcado como sugestão; se ele está na sua aula, marque de volta.'] },
          { t: 'Status e avisos da tela', itens: [
              'Status "Pendente / Todos Presentes" (laranja): nenhuma falta salva nesse dia. "Registrada (Faltas)" (verde): há faltas salvas.',
              'Aviso azul "Não há aula prevista na grade para este dia": a sua agenda não tem essa turma nesse dia da semana. A chamada continua liberada.'] },
          { t: '📅 Relatório Mensal de Faltas', itens: ['Grade com os dias úteis do mês e o total de faltas de cada estudante, incluindo as marcadas por outros professores.', 'Escolha mês e ano; 🖨️ Imprimir; "← Voltar para Chamada Diária" volta.'] },
          { t: 'Bom saber', itens: ['Nada é gravado até tocar em "Confirmar e Salvar". Salvar de novo no mesmo dia substitui a chamada daquele dia.', 'As faltas vão cifradas para a escola: os colegas veem na chamada deles e a gestão usa na Busca Ativa.', 'Apagar o texto do Registro da Aula e salvar apaga o registro daquele dia.'] }
      ] },
    { id: 't-registros', icone: '📂', titulo: 'Registros (diário de aulas)', tour: 'aba_registros',
      praQue: 'O histórico das aulas dadas na turma.',
      secoes: [
          { t: 'O que aparece', itens: ['"Histórico de Aulas": um cartão por aula, com a data e o conteúdo, da mais recente para a mais antiga.', 'O texto do "Registro da Aula" da Chamada cai aqui automaticamente (é o mesmo registro).'] },
          { t: 'Como usar', ordem: true, itens: ['"+ Novo Registro de Aula": escolha a data, escreva o conteúdo e salve.', '✏️ no cartão corrige data e texto.', '🗑️ apaga (pede confirmação).'] },
          { t: 'Bom saber', itens: ['Use para dias sem chamada (ex.: aula de reposição) ou para completar o diário depois.', 'Não confunda com a página "Registros" do menu: aquela mostra os registros da gestão (atestados, faltosos).'] }
      ] },
    { id: 't-atrasos', icone: '⏰', titulo: 'Atrasos', tour: 'aba_atrasos',
      praQue: 'Anotar quem chegou atrasado e transformar atrasos repetidos em ocorrência.',
      secoes: [
          { t: 'Como usar', ordem: true, itens: ['No quadro "Registrar Atraso", escolha o estudante ("(F)" antes do nome = faltou hoje).', 'Toque em "Registrar". O atraso fica com a data de hoje.'] },
          { t: 'Histórico de Atrasos', itens: ['Escolha o período em "De" e "Até" (meses do ano atual).', 'Cada linha mostra o estudante, as datas dos atrasos e o total.', 'O × numa data apaga aquele atraso.', '"⚠️ Gerar" monta uma ocorrência disciplinar com todas as datas do período, pedindo o comparecimento do responsável. O texto aparece para você confirmar antes.'] }
      ],
      dicas: ['Atraso de outro dia não pode ser lançado com data antiga: registre no dia.'] },
    { id: 't-trabalhos', icone: '📝', titulo: 'Trabalhos e notas', tour: 'aba_trabalhos',
      praQue: 'Atividades avaliativas, notas e média do bimestre.',
      secoes: [
          { t: 'Passo a passo', ordem: true, itens: [
              'Escolha o bimestre (1º a 4º) nos botões do alto.',
              'Toque em "+ Criar Nova Atividade": título, bimestre, tipo e peso.',
              'Lance as notas na planilha: toque na célula, digite (vírgula ou ponto) e saia da célula. Salva sozinho.',
              'Acompanhe a MÉDIA (ponderada pelos pesos; vermelha abaixo de 5) e FALTAS/AT. (faltas no bimestre e dias de atestado).'] },
          { t: 'Tipos de atividade', itens: [
              'Comum: você digita a nota de cada estudante.',
              'Colar do Excel: cole duas colunas (nome e nota), uma linha por estudante. O sistema acha cada um pelo nome.',
              'Rubrica: crie critérios com peso; na planilha, marque os critérios que o estudante cumpriu e a nota é a soma.',
              'Compensação de Faltas (automática, peso 10): começa em 10, perde 1 por aula faltada no bimestre e recupera pelas compensações entregues (com atraso, metade; "não fez", -1).',
              'Caderno (automático): cada aula prevista vale um pedaço de 10. Presente com caderno Completo ganha o pedaço todo, Incompleto metade, Não fez nada; "Cad." soma +1. Máximo 10.',
              'Participação (automático): cada aula presente vale um pedaço de 10, conforme o engajamento (Total inteiro, Médio metade, Nada zero); "Prat." soma +1; ocorrência no bimestre tira 2 (registro) ou 3 (atenção da gestão).',
              'Avaliação do Gestor (automático): puxa a nota de uma avaliação lançada pela gestão (ex.: Prova Paulista). Se sua disciplina não entrou na prova, vale a média geral do estudante nela.'] },
          { t: 'Botões de cada atividade', itens: ['✏️ edita. Mudar o bimestre leva a atividade com todas as notas.', '📋 copia as notas da coluna, uma por linha, para colar na Sala do Futuro.', '× exclui a atividade.', 'Nas automáticas, digitar uma nota por cima vale a sua; "🔄 Restaurar Cálculo Automático" (dentro de ✏️) volta ao cálculo.'] },
          { t: 'Extras', itens: ['📥 Importar de outra turma: copia atividades (nome, tipo, peso e critérios) de outra turma sua, sem as notas.', '💡 Sugestão de notas para a Sala do Futuro: 3 notas inteiras por estudante que dão a média dele (arredondada para cima). O lançamento na Sala do Futuro é seu.', '"Total de aulas previstas no período": calculado pela sua agenda e pelo calendário do bimestre.'] }
      ],
      dicas: ['As notas automáticas usam o calendário dos bimestres da escola e a sua agenda. Sem agenda montada, Caderno e Participação ficam em 10.'] },
    { id: 't-compensacoes', icone: '⚖️', titulo: 'Compensações', tour: 'aba_compensacoes',
      praQue: 'Passar e controlar atividades de compensação de ausências.',
      secoes: [
          { t: 'Passo a passo', ordem: true, itens: [
              'Em "Nova Atribuição de Compensação", escolha o Mês e o Ano de referência.',
              'Descreva a atividade (ex.: "Lista de exercícios 3").',
              'Toque em "🚀 Gerar Compensações". O sistema mostra quantos estudantes com falta achou; confirme.',
              'Cada estudante com falta no mês recebe a atividade, com o número de aulas a compensar (aula dupla conta 2).'] },
          { t: 'Controle de Entregas', itens: [
              'Filtre por mês (ou "Todos") e ano; use o filtro de nome em turma grande.',
              'Toque na situação para passar para a próxima: ⏳ Pendente → 📩 Notificado → ✅ Entregue → ⏰ Entregue c/ atraso → ❌ Não entregue → 📄 Não fez / sem folha.',
              'Embaixo do nome fica o histórico de cada mudança, com data.',
              '🗑️ apaga a compensação daquele estudante.'] },
          { t: 'Na nota', itens: ['Crie em Trabalhos uma atividade do tipo "Compensação de Faltas": Entregue devolve as aulas, Entregue com atraso devolve metade e "Não fez / sem folha" tira 1 ponto.'] }
      ],
      dicas: ['Gerar duas vezes a mesma atividade no mesmo mês não duplica.', 'Lance a chamada do mês antes de gerar: quem tem falta é tirado da chamada.'] },
    { id: 't-caderno', icone: '📖', titulo: 'Caderno', tour: 'aba_caderno',
      praQue: 'Visto do caderno e engajamento por aula.',
      secoes: [
          { t: 'Passo a passo', ordem: true, itens: ['Confira a "Data da Atividade" (vem com hoje).', 'Todos começam com Caderno C e Engajamento T. Toque só em quem foi diferente.', 'Marque "Cad." ou "Prat." para dar ponto extra.', 'Pronto: cada toque salva na hora, não há botão de salvar.'] },
          { t: 'O que cada letra quer dizer', itens: ['Situação do Caderno (CIN): C = Completo, I = Incompleto, N = Não fez.', 'Engajamento (TMN): T = Total, M = Médio, N = Nada / não desenvolveu.', 'Ponto Extra: "Cad." +1 na nota de Caderno; "Prat." +1 na de Participação.', 'F vermelho antes do nome: faltou nesse dia (aula com falta não ganha ponto de caderno nem de participação).'] },
          { t: 'Resumos', itens: ['"📅 Resumo Mensal do Caderno" e "📊 Resumo Mensal Participação": o mês inteiro, por estudante, para conferir e imprimir. "← Voltar para Lançamento" volta.'] }
      ],
      dicas: ['As notas automáticas "Caderno" e "Participação" da aba Trabalhos são calculadas a partir daqui (veja o manual de Trabalhos).'] },
    { id: 't-ocorrencias', icone: '⚠️', titulo: 'Ocorrências', tour: 'aba_ocorrencias',
      praQue: 'Registrar fatos da aula e acompanhar a resposta da gestão.',
      secoes: [
          { t: '⚡ Registro Rápido', itens: ['Só aparece se a gestão cadastrou opções prontas (ex.: "Sem material", "Uso de celular").', 'Escolha o estudante e a opção e toque em "Registrar".'] },
          { t: 'Nova Ocorrência, passo a passo', ordem: true, itens: [
              'Em "Adicionar Estudante", escolha o nome e toque em "Adicionar". Repita para pôr mais de um; o × tira.',
              'Descreva a ocorrência no campo de texto.',
              'Escolha a classificação (obrigatória): 📝 Registro (Informativo) ou ⚠️ Atenção da Gestão.',
              'Toque em "Registrar Ocorrência".'] },
          { t: 'Histórico', itens: [
              'Duas listas: "⚠️ Disciplinares" e "⚡ Registros rápidos", com a quantidade.',
              'Cada ocorrência mostra data, professor, envolvidos, relato e a situação: ⏳ Pendente ou ✅ Confirmada pela gestão.',
              '"Devolutiva da Gestão": a resposta da coordenação, quando houver.',
              '✏️ edita (aparece "💾 Salvar Alterações" e "Cancelar Edição"), 🖨️ imprime, 🗑️ exclui.'] },
          { t: 'Bom saber', itens: ['As ocorrências chegam à gestão cifradas, pelo ambiente da escola.', 'Na nota automática de Participação, cada ocorrência no bimestre tira 2 (registro) ou 3 (atenção da gestão).', 'Atrasos repetidos viram ocorrência pelo "⚠️ Gerar" da aba Atrasos.'] }
      ] },
    { id: 't-mapeamento', icone: '🗺️', titulo: 'Mapeamento da sala', tour: 'aba_mapeamento',
      praQue: 'Montar e imprimir o mapa de lugares.',
      secoes: [
          { t: 'Passo a passo', ordem: true, itens: [
              'Ajuste o tamanho: "+ Linha / - Linha" (carteiras no fundo) e "+ Fileira / - Fileira" (na lateral).',
              'Em "⚠️ Estudantes sem lugar definido", toque num nome (fica azul) e depois na carteira.',
              'No computador, também dá para arrastar o nome até a carteira.',
              'Para trocar dois de lugar, arraste uma carteira sobre a outra. Para esvaziar uma carteira, toque no × vermelho.',
              'Quando aparecer "✅ Todos os estudantes ativos estão mapeados!", imprima pelo "🖨️ Imprimir Mapa".'] },
          { t: 'O que aparece', itens: ['📺 LOUSA (Frente) no alto: a sala vista de cima.', 'Cada carteira mostra o nome e o código (F = fileira, C = carteira). "F" vermelho antes do nome = faltou hoje.', '🕒 Histórico de Alterações: quem mexeu, quando e quantas mudanças.'] },
          { t: 'Bom saber', itens: ['O mapa é da turma da escola: todos os professores dela usam o mesmo mapa.', '🗑️ Resetar esvazia o mapa inteiro (pede confirmação).'] }
      ] },
    { id: 't-ficha', icone: '🪪', titulo: 'Ficha do estudante', tour: 'fichaEstudante',
      praQue: 'Tudo de um estudante, em uma tela.',
      secoes: [
          { t: 'Como abrir', itens: ['Na aba Estudantes, toque no nome. Ou use "Buscar" (Ctrl+K) e digite o nome.'] },
          { t: 'O que aparece', itens: ['Frequência e atrasos.', 'Notas dos trabalhos.', 'Ocorrências, com a devolutiva da gestão.', 'Compensações e a situação de cada uma.'] }
      ] }
];

const GRUPOS_MANUAL = [
    { id: 'iniciante', icone: '🚀', nome: 'Iniciante', itens: INICIANTE },
    { id: 'paginas', icone: '📖', nome: 'Páginas', itens: PAGINAS },
    { id: 'turma', icone: '🏫', nome: 'Dentro da turma', itens: MANUAL_TURMA },
    { id: 'ferramentas', icone: '🧰', nome: 'Ferramentas', itens: FERRAMENTAS }
];

let abaTutoriais = 'iniciante';

function lerFeitos() {
    try { return JSON.parse(ler(CHAVE_FEITOS) || '[]') || []; } catch (e) { return []; }
}

function garantirTelaTutoriais() {
    let tela = document.getElementById('tutoriais');
    if (tela) return tela;
    const container = document.getElementById('appContainer');
    const interno = (container && container.querySelector('.container')) || container || document.body;
    tela = document.createElement('div');
    tela.id = 'tutoriais';
    tela.className = 'screen';
    tela.innerHTML =
        '<div class="card tut-cabeca">' +
            '<div class="tut-cabeca-linha"><h2>📘 Tutoriais</h2>' +
            '<button type="button" class="btn btn-sm btn-secondary" id="tutTourAqui">? Como usar esta página</button></div>' +
            '<p class="tut-sub">Manuais de todas as páginas e ferramentas do SisProf. Em cada um, "▶ Mostrar na tela" abre a página e destaca onde fica cada coisa. Em qualquer página, o botão "?" no topo faz o mesmo.</p>' +
            '<input type="search" id="tutBusca" class="tut-busca" placeholder="🔎 Buscar: chamada, notas, PDF, certificado, agenda…" autocomplete="off">' +
            '<nav id="tutNav" class="tut-nav" aria-label="Seções dos tutoriais"></nav>' +
        '</div>' +
        '<div id="tutConteudo"></div>';
    interno.appendChild(tela);
    $('#tutBusca', tela).addEventListener('input', desenharConteudo);
    $('#tutTourAqui', tela).addEventListener('click', () => iniciarTour('tutoriais'));
    $('#tutNav', tela).addEventListener('click', (e) => {
        const b = e.target.closest('button[data-aba]');
        if (!b) return;
        abaTutoriais = b.dataset.aba;
        const busca = $('#tutBusca');
        if (busca) busca.value = '';
        desenharConteudo();
    });
    $('#tutConteudo', tela).addEventListener('click', (e) => {
        const ver = e.target.closest('.tut-ver');
        if (ver) {
            const item = acharItem(ver.dataset.item);
            if (item) iniciarTour(item.tour, { passo: item.tourPasso, origem: 'tutoriais' });
        }
    });
    $('#tutConteudo', tela).addEventListener('change', (e) => {
        const chk = e.target.closest('.tut-feito input');
        if (!chk) return;
        const feitos = lerFeitos().filter(x => x !== chk.dataset.item);
        if (chk.checked) feitos.push(chk.dataset.item);
        guardar(CHAVE_FEITOS, JSON.stringify(feitos));
        desenharConteudo();
    });
    return tela;
}

function acharItem(id) {
    for (const g of GRUPOS_MANUAL) {
        const it = g.itens.find(x => x.id === id);
        if (it) return it;
    }
    return null;
}

function htmlItem(it, numero, feitos, abrir) {
    const feito = feitos.indexOf(it.id) !== -1;
    return '<details class="card tut-item' + (feito ? ' tut-ok' : '') + '"' + (abrir ? ' open' : '') + '>' +
        '<summary>' + (numero ? '<span class="tut-num">' + (feito ? '✓' : numero) + '</span>' : '<span class="tut-ico">' + (it.icone || '') + '</span>') +
        '<span class="tut-item-tit">' + esc(it.titulo) + '</span><span class="tut-seta" aria-hidden="true">›</span></summary>' +
        '<div class="tut-corpo">' +
            (it.praQue ? '<p class="tut-praque"><strong>Para que serve:</strong> ' + esc(it.praQue) + '</p>' : '') +
            (it.passos ? '<ol class="tut-passos">' + it.passos.map(p => '<li>' + esc(p) + '</li>').join('') + '</ol>' : '') +
            (it.secoes || []).map(sc => '<h4 class="tut-secao">' + esc(sc.t) + '</h4>' +
                (sc.ordem ? '<ol class="tut-passos">' : '<ul class="tut-passos">') + sc.itens.map(p => '<li>' + esc(p) + '</li>').join('') +
                (sc.ordem ? '</ol>' : '</ul>')).join('') +
            (it.dicas && it.dicas.length ? '<div class="tut-dicas">' + it.dicas.map(d => '<p>💡 ' + esc(d) + '</p>').join('') + '</div>' : '') +
            '<div class="tut-acoes">' +
                (it.tour ? '<button type="button" class="btn btn-primary btn-sm tut-ver" data-item="' + esc(it.id) + '">▶ Mostrar na tela</button>' : '') +
                (numero ? '<label class="tut-feito"><input type="checkbox" data-item="' + esc(it.id) + '"' + (feito ? ' checked' : '') + '> Já fiz este passo</label>' : '') +
            '</div>' +
        '</div></details>';
}

function desenharConteudo() {
    const alvo = $('#tutConteudo');
    const nav = $('#tutNav');
    if (!alvo || !nav) return;
    const busca = semAcento(($('#tutBusca') || {}).value || '').trim();
    nav.innerHTML = GRUPOS_MANUAL.map(g =>
        '<button type="button" class="tut-aba' + (!busca && g.id === abaTutoriais ? ' active' : '') + '" data-aba="' + g.id + '">' +
        '<span aria-hidden="true">' + g.icone + '</span> ' + g.nome + '</button>').join('');
    const feitos = lerFeitos();

    if (busca) {
        const partes = busca.split(/\s+/);
        const achados = [];
        GRUPOS_MANUAL.forEach(g => g.itens.forEach(it => {
            const texto = semAcento([it.titulo, it.praQue].concat(it.passos || [], it.dicas || [],
                ...(it.secoes || []).map(sc => [sc.t].concat(sc.itens))).join(' '));
            if (partes.every(p => texto.indexOf(p) !== -1)) achados.push({ g, it });
        }));
        alvo.innerHTML = achados.length
            ? achados.map(a => htmlItem(a.it, null, feitos, achados.length <= 3).replace('<span class="tut-item-tit">', '<span class="tut-item-tit"><small class="tut-grupo">' + esc(a.g.nome) + '</small> ')).join('')
            : '<div class="card"><p class="empty-state">Nada encontrado. Tente outra palavra.</p></div>';
        return;
    }

    const grupo = GRUPOS_MANUAL.find(g => g.id === abaTutoriais) || GRUPOS_MANUAL[0];
    let topo = '';
    if (grupo.id === 'iniciante') {
        const feitosAqui = grupo.itens.filter(it => feitos.indexOf(it.id) !== -1).length;
        const pct = Math.round(feitosAqui / grupo.itens.length * 100);
        topo = '<div class="card tut-progresso"><div><strong>Começando do zero</strong> — siga os passos em ordem. ' +
               'Marque "Já fiz" para acompanhar.</div><div class="tut-progresso-linha"><div class="tour-barra"><span style="width:' + pct + '%"></span></div>' +
               '<span>' + feitosAqui + ' de ' + grupo.itens.length + '</span></div></div>';
    } else if (grupo.id === 'turma') {
        topo = '<div class="card tut-progresso"><div>O manual de cada aba da turma, botão por botão. Dentro da turma, o "?" no topo ' +
               'explica a aba que estiver aberta.</div></div>';
    } else if (grupo.id === 'ferramentas') {
        topo = '<div class="card tut-progresso"><div>As ferramentas rodam no seu aparelho: o arquivo não vai para site de terceiro. ' +
               'Ver é livre; usar é do plano Professor.</div></div>';
    }
    const primeiroPendente = grupo.id === 'iniciante' ? grupo.itens.find(it => feitos.indexOf(it.id) === -1) : null;
    alvo.innerHTML = topo + grupo.itens.map((it, i) =>
        htmlItem(it, grupo.id === 'iniciante' ? i + 1 : null, feitos, primeiroPendente && primeiroPendente.id === it.id)).join('');
}

function renderTutoriais() {
    const tela = garantirTelaTutoriais();
    // A tela nasce sob demanda: o showScreen que trouxe até aqui pode ter rodado antes de ela
    // existir (mesmo caminho da Biblioteca e de Ferramentas).
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    tela.classList.add('active');
    tela.style.display = '';
    desenharConteudo();
}

// ------------------------------------------------------------------ estilo
function injetarEstilo() {
    if (document.getElementById('estiloTutoriais')) return;
    const st = document.createElement('style');
    st.id = 'estiloTutoriais';
    st.textContent = `
        .tour-camada { position: fixed; inset: 0; z-index: 100040; background: transparent; }
        .tour-camada.tour-escuro { background: rgba(8, 10, 16, 0.55); }
        .tour-foco { position: fixed; z-index: 100041; pointer-events: none; border-radius: 10px;
            box-shadow: 0 0 0 3px var(--accent, #2563c9), 0 0 0 9999px rgba(8, 10, 16, 0.55);
            transition: top 220ms ease, left 220ms ease, width 220ms ease, height 220ms ease; }
        .tour-balao { position: fixed; z-index: 100042; width: min(360px, calc(100vw - 32px)); box-sizing: border-box;
            background: var(--surface, #fff); color: var(--text, #1c2536); border: 1px solid var(--border, #e3e8ef);
            border-radius: 14px; padding: 14px 16px; box-shadow: 0 24px 56px rgba(0,0,0,0.28); font-size: 14px; }
        .tour-balao.tour-meio { left: 50% !important; top: 50% !important; transform: translate(-50%, -50%); }
        .tour-balao.tour-celular { left: 16px !important; right: 16px; width: auto; }
        .tour-balao.tour-celular.tour-meio { left: 16px !important; right: 16px; width: auto; transform: translateY(-50%); }
        .tour-topo { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .tour-conta { font-size: 12px; color: var(--text-3, #5f6b7f); }
        .tour-x { background: transparent; border: none; font-size: 20px; line-height: 1; cursor: pointer; color: var(--text-3, #5f6b7f); padding: 2px 6px; }
        .tour-titulo { margin: 6px 0 4px; font-size: 16px; color: var(--text, #1c2536); }
        .tour-texto { margin: 0 0 10px; line-height: 1.5; color: var(--text-2, #3d4759); }
        .tour-barra { height: 4px; background: var(--surface-3, #eef2f7); border-radius: 4px; overflow: hidden; flex: 1; }
        .tour-barra span { display: block; height: 100%; background: var(--accent, #2563c9); }
        .tour-botoes { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
        .tour-btn-ajuda { min-width: 34px; font-weight: 700; font-size: 15px; border-radius: 999px !important; }
        .tour-btn-ajuda.tour-novo { animation: tourPulso 1.6s ease-out 6; }
        @keyframes tourPulso { 0% { box-shadow: 0 0 0 0 var(--accent-ring, rgba(37,99,201,.35)); } 100% { box-shadow: 0 0 0 10px transparent; } }
        @media (prefers-reduced-motion: reduce) { .tour-foco { transition: none; } .tour-btn-ajuda.tour-novo { animation: none; } }

        #tutoriais .tut-cabeca { margin: 20px 0 12px; }
        #tutoriais .tut-cabeca-linha { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
        #tutoriais .tut-cabeca h2 { margin: 0; }
        #tutoriais .tut-sub { color: var(--text-3, #5f6b7f); font-size: 14px; margin: 8px 0 12px; }
        #tutoriais .tut-busca { width: 100%; box-sizing: border-box; padding: 9px 12px; margin-bottom: 12px; }
        #tutoriais .tut-nav { display: flex; gap: 6px; flex-wrap: wrap; border-bottom: 1px solid var(--border, #e3e8ef); }
        #tutoriais .tut-aba { background: transparent; border: none; cursor: pointer; padding: 9px 14px; font-size: 14px; font-weight: 600;
            color: var(--text-3, #5f6b7f); border-radius: 8px 8px 0 0; }
        #tutoriais .tut-aba.active { color: var(--accent-text, #2563c9); box-shadow: inset 0 -2px 0 var(--accent, #2563c9); }
        #tutoriais .tut-aba:hover { background: var(--surface-3, #eef2f7); }
        #tutoriais .tut-progresso { display: flex; flex-direction: column; gap: 8px; font-size: 14px; color: var(--text-2, #3d4759); margin-bottom: 12px; }
        #tutoriais .tut-progresso-linha { display: flex; align-items: center; gap: 10px; font-size: 13px; }
        #tutoriais .tut-item { margin: 0 0 10px; padding: 0; overflow: hidden; }
        #tutoriais .tut-item summary { list-style: none; display: flex; align-items: center; gap: 12px; padding: 14px 16px; cursor: pointer; font-weight: 600; }
        #tutoriais .tut-item summary::-webkit-details-marker { display: none; }
        #tutoriais .tut-num { flex: none; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
            background: var(--accent-soft, #edf3fd); color: var(--accent-text, #2563c9); font-size: 13px; }
        #tutoriais .tut-ok .tut-num { background: var(--success-soft, #eaf7ef); color: var(--success, #15803d); }
        #tutoriais .tut-ico { flex: none; font-size: 20px; width: 28px; text-align: center; }
        #tutoriais .tut-item-tit { flex: 1; }
        #tutoriais .tut-grupo { display: inline-block; font-size: 11px; font-weight: 600; color: var(--text-3, #5f6b7f); background: var(--surface-3, #eef2f7);
            padding: 1px 6px; border-radius: 4px; margin-right: 6px; vertical-align: middle; }
        #tutoriais .tut-seta { transition: transform 160ms ease; color: var(--text-4, #94a0b4); font-size: 20px; }
        #tutoriais .tut-item[open] .tut-seta { transform: rotate(90deg); }
        #tutoriais .tut-corpo { padding: 0 16px 14px 56px; font-size: 14px; color: var(--text-2, #3d4759); line-height: 1.55; }
        #tutoriais .tut-praque { margin: 0 0 8px; }
        #tutoriais .tut-passos { margin: 0 0 8px; padding-left: 20px; }
        #tutoriais .tut-passos li { margin-bottom: 4px; }
        #tutoriais .tut-secao { margin: 12px 0 4px; font-size: 14px; color: var(--text, #1c2536); }
        #tutoriais .tut-dicas { background: var(--warning-soft, #fdf4e3); color: var(--warning-ink, #7c3a0a); border-radius: 8px; padding: 8px 10px; margin: 8px 0; }
        #tutoriais .tut-dicas p { margin: 2px 0; }
        #tutoriais .tut-acoes { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 10px; }
        #tutoriais .tut-feito { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; margin: 0; }
        @media (max-width: 640px) {
            #tutoriais .tut-corpo { padding-left: 16px; }
            #tutoriais .tut-aba { padding: 8px 10px; }
        }
    `;
    document.head.appendChild(st);
}

injetarEstilo();
// O Estagiário cria a janela dele na primeira abertura: o "?" entra quando ela aparece.
new MutationObserver(() => { if (document.getElementById('modalGerarDocumentoIA')) montarAjudaNoEstagiario(); })
    .observe(document.body || document.documentElement, { childList: true });

window.TOURS_SISPROF = TOURS;
window.iniciarTour = iniciarTour;
window.encerrarTour = encerrarTour;
window.montarBotaoAjuda = montarBotaoAjuda;
window.renderTutoriais = renderTutoriais;
window.garantirTelaTutoriais = garantirTelaTutoriais;
window.tourDaTelaAtual = tourDaTelaAtual;

})();
