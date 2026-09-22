// pdf_ferramentas.js — A TELA "PDF": a primeira funcao premium do SisProf.
//
// POR QUE ISTO EXISTE
//   Todo professor acaba num site de PDF gratuito: juntar dois anexos, tirar uma
//   pagina, assinar uma ficha, comprimir para caber no e-mail da diretoria. Esses
//   sites pedem que o arquivo seja ENVIADO para o servidor deles. E o arquivo, aqui,
//   costuma ter nome de estudante, laudo, endereco, nota. Isso e' tratamento de dado
//   pessoal de crianca por terceiro que ninguem autorizou — e a escola quem responde.
//
//   As ferramentas desta tela rodam INTEIRAS no navegador (ver pdf_operacoes.js).
//   Nenhum byte sai do aparelho. E' por isso que ela e' a funcao premium que vale a
//   pena: nao e' "o mesmo site, dentro do sistema" — e' o mesmo trabalho sem o
//   problema de conformidade que o site gratuito cria.
//
// COMO A TELA E' FEITA
//   Nenhuma das 48 ferramentas tem HTML escrito a mao. Cada uma se DESCREVE no
//   catalogo (CATALOGO_PDF) — quais campos pede, de que tipo, com que padrao — e um
//   unico motor de formulario monta a tela, le os arquivos, chama a operacao,
//   acompanha o andamento e oferece o download (em .zip quando sai mais de um
//   arquivo). Acrescentar uma ferramenta nova e' acrescentar uma entrada no catalogo
//   e uma funcao em pdf_operacoes.js.
//
//   As sete ferramentas que precisam de mais do que campos — visualizar, reorganizar
//   com miniaturas, anotar, assinar desenhando, censurar arrastando o mouse,
//   preencher formulario e a camera — declaram `extra` e entram em PDF_EXTRAS.
//
// O PORTAO PREMIUM
//   O catalogo fica VISIVEL para todo mundo (quem nao assina precisa poder ver o que
//   existe). Abrir uma ferramenta chama exigirPremium(), de assinatura.js, que abre o
//   convite do plano Professor quando a conta nao tem direito.

// ---------------------------------------------------------------------------
// Estado da tela
// ---------------------------------------------------------------------------

const PDF_MAX_MB = 120;              // acima disso o navegador costuma cair sozinho
let pdfFiltroGrupo = 'todos';
let pdfBusca = '';
let pdfFerramentaAberta = null;      // id da ferramenta aberta, ou null (catalogo)
let pdfEntradas = {};                // campo -> valor (arquivos ja' lidos como bytes)
let pdfExtra = {};                   // estado das ferramentas interativas
let pdfResultado = null;             // { arquivos: [{nome, blob, tipo}], mensagem }
let pdfOcupado = false;
let pdfUrlsAbertas = [];             // URLs de blob para revogar ao sair (senao vaza memoria)

function escPdf(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function pdfTamanho(bytes) {
    return (window.PDFOPS && PDFOPS.formatarTamanho) ? PDFOPS.formatarTamanho(bytes)
         : Math.round((bytes || 0) / 1024) + ' KB';
}

// O portao. Fica em UM lugar so' para nao haver ferramenta esquecida do lado de fora.
function pdfPodeUsar(nomeDaFerramenta) {
    if (typeof exigirPremium !== 'function') {
        // assinatura.js nao carregou. Barrar aqui puniria quem paga por causa de um
        // script que faltou; o registro no console diz o que aconteceu.
        console.warn('[PDF] assinatura.js indisponivel — portao premium nao aplicado.');
        return true;
    }
    return exigirPremium('Ferramentas PDF' + (nomeDaFerramenta ? ' — ' + nomeDaFerramenta : ''));
}

function pdfEhPremium() {
    return (typeof ehPremium === 'function') ? ehPremium() : true;
}

// ---------------------------------------------------------------------------
// O CATALOGO
// ---------------------------------------------------------------------------
// Cada ferramenta declara: onde fica (grupo), como se chama, o que faz e QUAIS
// CAMPOS pede. O motor de formulario mais abaixo cuida do resto.
//
// Campo: { id, tipo, rotulo, ajuda, padrao, opcoes, quando }
//   tipo       arquivo | arquivos | imagem | imagens | qualquer | texto | textarea |
//              numero | faixa | select | cor | checkbox | senha
//   quando(e)  mostra o campo so' quando a funcao devolver verdadeiro (campo que
//              depende de outro, tipo "qualidade" aparecer so' no modo JPG)
//   acao       nome da funcao em PDFOPS.ops
//   extra      nome em PDF_EXTRAS, para a parte interativa

const PDF_GRUPOS = [
    { id: 'organizar',  nome: 'Organizar',              emoji: '🗂️' },
    { id: 'editar',     nome: 'Editar',                  emoji: '✏️' },
    { id: 'paraPdf',    nome: 'Converter para PDF',      emoji: '📥' },
    { id: 'dePdf',      nome: 'Converter de PDF',        emoji: '📤' },
    { id: 'otimizar',   nome: 'Otimizar e reparar',      emoji: '🛠️' },
    { id: 'seguranca',  nome: 'Segurança e privacidade', emoji: '🔒' },
    { id: 'verificar',  nome: 'Ver e verificar',         emoji: '🔍' },
    { id: 'extras',     nome: 'Imagens e extras',        emoji: '🖼️' }
];

// Atalhos para os campos que se repetem em quase toda ferramenta.
const cPdf = (rotulo, ajuda) => ({ id: 'arquivo', tipo: 'arquivo', rotulo: rotulo || 'Arquivo PDF', ajuda: ajuda });
const cPaginas = (padrao, ajuda) => ({
    id: 'paginas', tipo: 'faixa', rotulo: 'Páginas', padrao: padrao == null ? 'todas' : padrao,
    ajuda: ajuda || 'Ex.: 1-3, 5, 8-10. Vale também "todas", "pares", "ímpares" e "última".'
});
const cPosicao = (padrao) => ({
    id: 'posicao', tipo: 'select', rotulo: 'Posição', padrao: padrao || 'centro',
    opcoes: [
        { v: 'topo-esquerda', t: 'Topo, à esquerda' }, { v: 'topo-centro', t: 'Topo, centralizado' },
        { v: 'topo-direita', t: 'Topo, à direita' }, { v: 'centro-esquerda', t: 'Meio, à esquerda' },
        { v: 'centro', t: 'Centro da página' }, { v: 'centro-direita', t: 'Meio, à direita' },
        { v: 'rodape-esquerda', t: 'Rodapé, à esquerda' }, { v: 'rodape-centro', t: 'Rodapé, centralizado' },
        { v: 'rodape-direita', t: 'Rodapé, à direita' }
    ]
});
const cTamanho = (padrao) => ({
    id: 'tamanho', tipo: 'select', rotulo: 'Tamanho da folha', padrao: padrao || 'A4',
    opcoes: ['A3', 'A4', 'A5', 'Carta', 'Oficio', 'Tabloide', 'B5'].map(t => ({ v: t, t: t === 'Oficio' ? 'Ofício' : t }))
});
const cOrientacao = (padrao) => ({
    id: 'orientacao', tipo: 'select', rotulo: 'Orientação', padrao: padrao || 'retrato',
    opcoes: [{ v: 'retrato', t: 'Retrato (em pé)' }, { v: 'paisagem', t: 'Paisagem (deitado)' },
             { v: 'auto', t: 'Automática (segue cada página)' }]
});
const cSenhaSeProtegido = () => ({
    id: 'senha', tipo: 'senha', rotulo: 'Senha do PDF (se houver)',
    ajuda: 'Só preencha se este arquivo pedir senha para abrir.'
});
const cDpi = (padrao) => ({
    id: 'dpi', tipo: 'select', rotulo: 'Resolução', padrao: String(padrao || 150),
    opcoes: [{ v: '72', t: '72 DPI — tela, arquivo pequeno' }, { v: '110', t: '110 DPI — leitura' },
             { v: '150', t: '150 DPI — padrão' }, { v: '200', t: '200 DPI — boa impressão' },
             { v: '300', t: '300 DPI — impressão gráfica (pesado)' }]
});

const CATALOGO_PDF = [
    // ---------------------------------------------------------------- organizar
    {
        id: 'juntar', grupo: 'organizar', emoji: '🔗', nome: 'Juntar PDF', acao: 'juntar',
        resumo: 'Vários PDFs em um só, na ordem que você escolher.',
        detalhe: 'Arraste para reordenar antes de juntar. Serve para montar o dossiê do estudante ' +
                 'a partir dos anexos que chegaram separados.',
        campos: [
            { id: 'arquivos', tipo: 'arquivos', rotulo: 'PDFs a juntar (dois ou mais)', ordenavel: true }
        ]
    },
    {
        id: 'dividir', grupo: 'organizar', emoji: '✂️', nome: 'Dividir PDF', acao: 'dividir',
        resumo: 'Reparte um PDF em vários arquivos.',
        campos: [
            cPdf(),
            { id: 'modo', tipo: 'select', rotulo: 'Como dividir', padrao: 'cada', opcoes: [
                { v: 'cada', t: 'A cada N páginas' },
                { v: 'todas', t: 'Uma página por arquivo' },
                { v: 'faixas', t: 'Por faixas que eu escrever' },
                { v: 'apos', t: 'Cortar depois de certas páginas' }
            ] },
            { id: 'cada', tipo: 'numero', rotulo: 'N páginas por arquivo', padrao: 2, min: 1,
              quando: e => e.modo === 'cada' },
            { id: 'faixas', tipo: 'textarea', rotulo: 'Faixas (uma por linha)', padrao: '1-3\n4-8',
              ajuda: 'Cada linha vira um arquivo.', quando: e => e.modo === 'faixas' },
            Object.assign(cPaginas('3'), { rotulo: 'Cortar depois das páginas', quando: e => e.modo === 'apos' })
        ]
    },
    {
        id: 'reorganizar', grupo: 'organizar', emoji: '🔀', nome: 'Reorganizar páginas', acao: 'reorganizar',
        extra: 'reorganizar',
        resumo: 'Muda a ordem das páginas vendo as miniaturas.',
        detalhe: 'Pode repetir uma página (a mesma capa duas vezes, por exemplo) e pode deixar página de fora.',
        campos: [
            cPdf(),
            { id: 'ordem', tipo: 'texto', rotulo: 'Nova ordem', ajuda: 'Ex.: 3, 1, 2. Use as miniaturas abaixo para montar.' }
        ]
    },
    {
        id: 'remover-paginas', grupo: 'organizar', emoji: '🗑️', nome: 'Remover páginas', acao: 'removerPaginas',
        resumo: 'Apaga as páginas que você indicar.',
        campos: [cPdf(), Object.assign(cPaginas(''), { rotulo: 'Páginas a REMOVER', obrigatorio: true })]
    },
    {
        id: 'extrair-paginas', grupo: 'organizar', emoji: '📑', nome: 'Extrair páginas', acao: 'extrairPaginas',
        resumo: 'Tira algumas páginas e guarda num PDF novo.',
        campos: [
            cPdf(), Object.assign(cPaginas(''), { rotulo: 'Páginas a EXTRAIR', obrigatorio: true }),
            { id: 'separados', tipo: 'checkbox', rotulo: 'Um arquivo para cada página' }
        ]
    },
    {
        id: 'rotacionar', grupo: 'organizar', emoji: '🔄', nome: 'Rotacionar páginas', acao: 'rotacionar',
        resumo: 'Gira páginas que foram digitalizadas de lado.',
        detalhe: 'O giro SOMA ao que a página já tinha, então digitalização já corrigida não desanda.',
        campos: [
            cPdf(), cPaginas(),
            { id: 'graus', tipo: 'select', rotulo: 'Girar', padrao: '90', opcoes: [
                { v: '90', t: '90° para a direita' }, { v: '180', t: '180° (de cabeça para baixo)' },
                { v: '270', t: '90° para a esquerda' }
            ] }
        ]
    },
    {
        id: 'paginas-por-folha', grupo: 'organizar', emoji: '🧮', nome: 'Páginas por folha', acao: 'paginasPorFolha',
        resumo: 'Várias páginas em cada folha — economiza papel na impressão.',
        detalhe: 'Bom para imprimir prova de rascunho e material de apoio da turma sem gastar uma resma.',
        campos: [
            cPdf(),
            { id: 'porFolha', tipo: 'select', rotulo: 'Páginas por folha', padrao: '2',
              opcoes: [2, 4, 6, 8, 9, 16].map(n => ({ v: String(n), t: n + ' por folha' })) },
            cTamanho(), Object.assign(cOrientacao('auto'), {}),
            { id: 'margem', tipo: 'numero', rotulo: 'Margem (pontos)', padrao: 14, min: 0 },
            { id: 'vao', tipo: 'numero', rotulo: 'Espaço entre páginas', padrao: 8, min: 0 },
            { id: 'borda', tipo: 'checkbox', rotulo: 'Desenhar moldura em cada página', padrao: true }
        ]
    },
    {
        id: 'cortar-ao-meio', grupo: 'organizar', emoji: '📖', nome: 'Cortar páginas ao meio', acao: 'cortarAoMeio',
        resumo: 'Folha digitalizada com duas páginas vira duas páginas.',
        detalhe: 'É o caso do livro apoiado no scanner: cada folha sai com a página par e a ímpar juntas.',
        campos: [
            cPdf(),
            { id: 'direcao', tipo: 'select', rotulo: 'Cortar', padrao: 'vertical', opcoes: [
                { v: 'vertical', t: 'Ao meio, na vertical (livro aberto)' },
                { v: 'horizontal', t: 'Ao meio, na horizontal' }
            ] },
            { id: 'daDireita', tipo: 'checkbox', rotulo: 'A metade da direita vem primeiro',
              quando: e => e.direcao !== 'horizontal' }
        ]
    },
    {
        id: 'marcadores', grupo: 'organizar', emoji: '🔖', nome: 'Adicionar marcadores', acao: 'marcadores',
        resumo: 'Cria o sumário que o leitor de PDF mostra na lateral.',
        campos: [
            cPdf(),
            { id: 'marcadores', tipo: 'textarea', rotulo: 'Marcadores', padrao: 'Capa | 1\nDesenvolvimento | 2',
              ajuda: 'Um por linha, no formato: Título | número da página.', linhas: 6 },
            { id: 'abrirSumario', tipo: 'checkbox', rotulo: 'Abrir o documento já com o sumário à vista', padrao: true }
        ]
    },
    {
        id: 'extrair-imagens', grupo: 'organizar', emoji: '🏞️', nome: 'Extrair imagens do PDF', acao: 'extrairImagens',
        resumo: 'Salva as fotos e figuras embutidas no PDF.',
        detalhe: 'JPEG sai sem nenhuma perda (os bytes originais). Para transformar a PÁGINA em imagem, ' +
                 'use "PDF para imagens".',
        campos: [
            cPdf(),
            { id: 'minimoPx', tipo: 'numero', rotulo: 'Ignorar imagens menores que (px)', padrao: 64, min: 0,
              ajuda: 'Deixa de fora ícone, linha e enfeite de rodapé.' }
        ]
    },

    // ------------------------------------------------------------------ editar
    {
        id: 'anotar', grupo: 'editar', emoji: '🖍️', nome: 'Editar e anotar PDF', acao: 'anotar', extra: 'anotar',
        resumo: 'Escreve texto, destaca, desenha caixa e tarja sobre a página.',
        detalhe: 'Clique na página para marcar o ponto. O que você escreve passa a fazer parte do PDF.',
        campos: [cPdf()]
    },
    {
        id: 'marca-dagua', grupo: 'editar', emoji: '💧', nome: "Adicionar marca d'água", acao: 'marcaDagua',
        resumo: 'Escreve CÓPIA, RASCUNHO ou o nome da escola por cima das páginas.',
        campos: [
            cPdf(),
            { id: 'tipo', tipo: 'select', rotulo: 'Tipo', padrao: 'texto',
              opcoes: [{ v: 'texto', t: 'Texto' }, { v: 'imagem', t: 'Imagem (logotipo)' }] },
            { id: 'texto', tipo: 'texto', rotulo: 'Texto', padrao: 'CONFIDENCIAL', quando: e => e.tipo !== 'imagem' },
            { id: 'imagem', tipo: 'imagem', rotulo: 'Imagem (PNG ou JPG)', quando: e => e.tipo === 'imagem' },
            { id: 'tamanho', tipo: 'numero', rotulo: 'Tamanho', padrao: 48, min: 4,
              ajuda: 'Texto: corpo da fonte. Imagem: porcentagem do tamanho original.' },
            { id: 'cor', tipo: 'cor', rotulo: 'Cor do texto', padrao: '#e53e3e', quando: e => e.tipo !== 'imagem' },
            { id: 'opacidade', tipo: 'numero', rotulo: 'Opacidade (0 a 1)', padrao: 0.25, min: 0.02, max: 1, passo: 0.05 },
            { id: 'rotacao', tipo: 'numero', rotulo: 'Inclinação (graus)', padrao: 45 },
            { id: 'repetir', tipo: 'checkbox', rotulo: 'Repetir cobrindo a página inteira' },
            Object.assign(cPosicao('centro'), { quando: e => !e.repetir }),
            cPaginas()
        ]
    },
    {
        id: 'numeros-pagina', grupo: 'editar', emoji: '🔢', nome: 'Adicionar números de página', acao: 'numerosPagina',
        resumo: 'Numera as páginas, com o formato que você quiser.',
        campos: [
            cPdf(),
            { id: 'formato', tipo: 'texto', rotulo: 'Formato', padrao: '{n}',
              ajuda: 'Use {n} para o número e {total} para o total. Ex.: "Página {n} de {total}".' },
            { id: 'inicio', tipo: 'numero', rotulo: 'Começar a contar em', padrao: 1 },
            cPosicao('rodape-centro'),
            { id: 'tamanho', tipo: 'numero', rotulo: 'Tamanho da fonte', padrao: 10, min: 5 },
            { id: 'cor', tipo: 'cor', rotulo: 'Cor', padrao: '#4a5568' },
            { id: 'negrito', tipo: 'checkbox', rotulo: 'Negrito' },
            { id: 'margem', tipo: 'numero', rotulo: 'Distância da borda', padrao: 24, min: 0 },
            Object.assign(cPaginas(), { ajuda: 'Só estas páginas recebem número. Ex.: 2- para não numerar a capa.' })
        ]
    },
    {
        id: 'sobrepor', grupo: 'editar', emoji: '🗂️', nome: 'Sobreposição de PDF', acao: 'sobrepor',
        resumo: 'Põe um PDF por cima do outro — papel timbrado, moldura, carimbo.',
        campos: [
            cPdf('PDF de baixo (o conteúdo)'),
            { id: 'sobreposicao', tipo: 'arquivo', rotulo: 'PDF de cima (o timbre)' },
            { id: 'modo', tipo: 'select', rotulo: 'Aplicar', padrao: 'repetir', opcoes: [
                { v: 'repetir', t: 'Repetir em todas as páginas' },
                { v: 'uma-vez', t: 'Página por página, na ordem' }
            ] },
            { id: 'ajustar', tipo: 'checkbox', rotulo: 'Encaixar no tamanho da página', padrao: true },
            { id: 'escala', tipo: 'numero', rotulo: 'Escala', padrao: 1, min: 0.05, passo: 0.05, quando: e => !e.ajustar },
            Object.assign(cPosicao('centro'), { quando: e => !e.ajustar }),
            { id: 'opacidade', tipo: 'numero', rotulo: 'Opacidade (0 a 1)', padrao: 1, min: 0.02, max: 1, passo: 0.05 }
        ]
    },
    {
        id: 'cortar', grupo: 'editar', emoji: '📐', nome: 'Cortar PDF (margens)', acao: 'cortar',
        resumo: 'Corta as bordas — tira a margem preta da digitalização.',
        detalhe: 'O corte ESCONDE a margem (muda a área visível). Para apagá-la de vez, rasterize depois.',
        campos: [
            cPdf(), cPaginas(),
            { id: 'esquerda', tipo: 'numero', rotulo: 'Cortar à esquerda (mm)', padrao: 0, min: 0 },
            { id: 'direita', tipo: 'numero', rotulo: 'Cortar à direita (mm)', padrao: 0, min: 0 },
            { id: 'topo', tipo: 'numero', rotulo: 'Cortar no topo (mm)', padrao: 0, min: 0 },
            { id: 'base', tipo: 'numero', rotulo: 'Cortar embaixo (mm)', padrao: 0, min: 0 }
        ]
    },
    {
        id: 'tamanho-pagina', grupo: 'editar', emoji: '📏', nome: 'Alterar tamanho da página', acao: 'tamanhoPagina',
        resumo: 'Passa o documento todo para A4, Carta, A5...',
        campos: [
            cPdf(), cTamanho(), cOrientacao('auto'),
            { id: 'margem', tipo: 'numero', rotulo: 'Margem em branco (pontos)', padrao: 0, min: 0 }
        ]
    },
    {
        id: 'info-documento', grupo: 'editar', emoji: 'ℹ️', nome: 'Informações do documento', acao: 'infoDocumento',
        extra: 'infoDocumento',
        resumo: 'Vê e muda título, autor, assunto e palavras-chave.',
        detalhe: 'Campo em branco fica como está. Para APAGAR tudo, use "Remover metadados".',
        campos: [
            cPdf(),
            { id: 'titulo', tipo: 'texto', rotulo: 'Título' },
            { id: 'autor', tipo: 'texto', rotulo: 'Autor' },
            { id: 'assunto', tipo: 'texto', rotulo: 'Assunto' },
            { id: 'palavrasChave', tipo: 'texto', rotulo: 'Palavras-chave', ajuda: 'Separadas por vírgula.' },
            { id: 'criador', tipo: 'texto', rotulo: 'Programa criador' },
            { id: 'idioma', tipo: 'texto', rotulo: 'Idioma', padrao: 'pt-BR' }
        ]
    },
    {
        id: 'preencher', grupo: 'editar', emoji: '🖊️', nome: 'Preencher formulário PDF', acao: 'preencher',
        extra: 'preencher',
        resumo: 'Digita nos campos de um PDF de formulário, sem imprimir.',
        detalhe: 'Achatar no fim deixa o valor fixo: ninguém reabre e muda a nota depois.',
        campos: [
            cPdf(),
            { id: 'achatar', tipo: 'checkbox', rotulo: 'Achatar (deixar não editável) no fim' }
        ]
    },
    {
        id: 'assinar', grupo: 'editar', emoji: '✍️', nome: 'Assinar PDF', acao: 'assinar', extra: 'assinar',
        resumo: 'Desenha a assinatura com o dedo ou o mouse e aplica no PDF.',
        detalhe: 'É assinatura DESENHADA, como assinar papel e digitalizar. Documento que exija validade ' +
                 'jurídica pede certificado — use o gov.br/assinaturaeletronica.',
        campos: [
            cPdf(),
            { id: 'nome', tipo: 'texto', rotulo: 'Nome por extenso (embaixo da assinatura)' },
            { id: 'cargo', tipo: 'texto', rotulo: 'Cargo / função' },
            { id: 'comData', tipo: 'checkbox', rotulo: 'Escrever a data', padrao: true },
            { id: 'comHora', tipo: 'checkbox', rotulo: 'Escrever também a hora', quando: e => e.comData !== false },
            { id: 'largura', tipo: 'numero', rotulo: 'Largura da assinatura (pontos)', padrao: 170, min: 20 },
            cPosicao('rodape-direita'),
            { id: 'linhaDeApoio', tipo: 'checkbox', rotulo: 'Desenhar a linha de assinatura', padrao: true },
            { id: 'todasAsPaginas', tipo: 'checkbox', rotulo: 'Assinar todas as páginas' },
            Object.assign(cPaginas('última'), { quando: e => !e.todasAsPaginas })
        ]
    },

    // --------------------------------------------------------------- para PDF
    {
        id: 'imagens-para-pdf', grupo: 'paraPdf', emoji: '🖼️', nome: 'Imagens para PDF', acao: 'imagensParaPdf',
        resumo: 'Fotos e digitalizações viram um PDF só.',
        detalhe: 'Aceita JPG, PNG, WEBP, BMP, GIF e HEIC (foto de iPhone).',
        campos: [
            { id: 'imagens', tipo: 'imagens', rotulo: 'Imagens', ordenavel: true },
            { id: 'tamanho', tipo: 'select', rotulo: 'Tamanho da página', padrao: 'imagem', opcoes: [
                { v: 'imagem', t: 'Do tamanho de cada imagem' },
                { v: 'A4', t: 'A4' }, { v: 'A3', t: 'A3' }, { v: 'A5', t: 'A5' }, { v: 'Carta', t: 'Carta' }
            ] },
            Object.assign(cOrientacao('auto'), { quando: e => e.tamanho !== 'imagem' }),
            { id: 'margem', tipo: 'numero', rotulo: 'Margem (pontos)', padrao: 0, min: 0 },
            { id: 'nomeSaida', tipo: 'texto', rotulo: 'Nome do arquivo', padrao: 'imagens' }
        ]
    },
    {
        id: 'camera-para-pdf', grupo: 'paraPdf', emoji: '📷', nome: 'PDF pela câmera', acao: 'imagensParaPdf',
        extra: 'camera',
        resumo: 'Fotografa o documento com a câmera e monta o PDF.',
        detalhe: 'A foto fica no aparelho: nada é enviado. Serve para digitalizar sem scanner.',
        campos: [
            { id: 'tamanho', tipo: 'select', rotulo: 'Tamanho da página', padrao: 'A4', opcoes: [
                { v: 'A4', t: 'A4' }, { v: 'imagem', t: 'Do tamanho da foto' }, { v: 'Carta', t: 'Carta' }
            ] },
            Object.assign(cOrientacao('auto'), { quando: e => e.tamanho !== 'imagem' }),
            { id: 'nomeSaida', tipo: 'texto', rotulo: 'Nome do arquivo', padrao: 'digitalizado' }
        ]
    },
    {
        id: 'word-para-pdf', grupo: 'paraPdf', emoji: '📝', nome: 'Word para PDF', acao: 'wordParaPdf',
        resumo: 'Documento .docx vira PDF com texto pesquisável.',
        detalhe: 'Vão títulos, parágrafos, listas, tabelas e imagens. Colunas, caixas de texto e fontes ' +
                 'próprias do Word não são reproduzidas.',
        campos: [
            { id: 'arquivo', tipo: 'qualquer', aceita: '.docx', rotulo: 'Arquivo Word (.docx)' },
            cTamanho(), cOrientacao('retrato'),
            { id: 'margem', tipo: 'numero', rotulo: 'Margem (pontos)', padrao: 56, min: 0 },
            { id: 'autor', tipo: 'texto', rotulo: 'Autor (metadado)' }
        ]
    },
    {
        id: 'planilha-para-pdf', grupo: 'paraPdf', emoji: '📊', nome: 'Planilha para PDF', acao: 'planilhaParaPdf',
        resumo: 'Excel ou CSV vira tabela em PDF, uma aba por página.',
        campos: [
            { id: 'arquivo', tipo: 'qualquer', aceita: '.xlsx,.xls,.csv,.tsv', rotulo: 'Planilha' },
            cTamanho(), cOrientacao('paisagem'),
            { id: 'tamanhoFonte', tipo: 'numero', rotulo: 'Tamanho da fonte', padrao: 8, min: 4 },
            { id: 'umaAbaPorPagina', tipo: 'checkbox', rotulo: 'Cada aba começa em página nova', padrao: true }
        ]
    },
    {
        id: 'texto-para-pdf', grupo: 'paraPdf', emoji: '🔤', nome: 'Texto para PDF', acao: 'textoParaPdf',
        resumo: 'Texto digitado ou arquivo .txt/.md vira PDF.',
        detalhe: 'Entende marcação simples: # título, - lista, 1. numerada, > citação, --- nova página.',
        campos: [
            { id: 'texto', tipo: 'textarea', rotulo: 'Texto', linhas: 10,
              ajuda: '# Título · ## Subtítulo · - item · 1. item · > citação · --- nova página' },
            { id: 'arquivo', tipo: 'qualquer', aceita: '.txt,.md,.markdown', rotulo: 'Ou um arquivo de texto' },
            { id: 'titulo', tipo: 'texto', rotulo: 'Título (metadado)' },
            cTamanho(), cOrientacao('retrato'),
            { id: 'nomeSaida', tipo: 'texto', rotulo: 'Nome do arquivo', padrao: 'documento' }
        ]
    },
    {
        id: 'html-para-pdf', grupo: 'paraPdf', emoji: '🌐', nome: 'Página da web para PDF', acao: 'htmlParaPdf',
        resumo: 'HTML colado, arquivo .html ou endereço vira PDF.',
        detalhe: 'Endereço só funciona em site que permita leitura por outro domínio — a maioria não permite. ' +
                 'O caminho garantido é salvar a página (Ctrl+S) e enviar o .html, ou colar o código.',
        campos: [
            { id: 'url', tipo: 'texto', rotulo: 'Endereço (opcional)', ajuda: 'Começando com https://' },
            { id: 'arquivo', tipo: 'qualquer', aceita: '.html,.htm', rotulo: 'Ou um arquivo .html' },
            { id: 'html', tipo: 'textarea', rotulo: 'Ou cole o HTML aqui', linhas: 8 },
            cTamanho(), cOrientacao('retrato'),
            { id: 'nomeSaida', tipo: 'texto', rotulo: 'Nome do arquivo', padrao: 'pagina' }
        ]
    },
    {
        id: 'criar', grupo: 'paraPdf', emoji: '✨', nome: 'Criar PDF', acao: 'criarPdf',
        resumo: 'Escreve um documento do zero e baixa em PDF.',
        campos: [
            { id: 'titulo', tipo: 'texto', rotulo: 'Título', padrao: '' },
            { id: 'subtitulo', tipo: 'texto', rotulo: 'Subtítulo / linha de apoio' },
            { id: 'corpo', tipo: 'textarea', rotulo: 'Conteúdo', linhas: 14,
              ajuda: '# Título · ## Subtítulo · - item · 1. item · > citação · --- nova página' },
            { id: 'autor', tipo: 'texto', rotulo: 'Autor' },
            cTamanho(), cOrientacao('retrato')
        ]
    },

    // ----------------------------------------------------------------- de PDF
    {
        id: 'pdf-para-imagens', grupo: 'dePdf', emoji: '🎞️', nome: 'PDF para imagens', acao: 'pdfParaImagens',
        resumo: 'Cada página vira um PNG ou JPG.',
        campos: [
            cPdf(), cPaginas(),
            { id: 'formato', tipo: 'select', rotulo: 'Formato', padrao: 'png',
              opcoes: [{ v: 'png', t: 'PNG (sem perda, arquivo maior)' }, { v: 'jpg', t: 'JPG (menor)' }] },
            cDpi(150),
            { id: 'qualidade', tipo: 'numero', rotulo: 'Qualidade do JPG (0 a 1)', padrao: 0.9, min: 0.3, max: 1, passo: 0.05,
              quando: e => e.formato === 'jpg' },
            cSenhaSeProtegido()
        ]
    },
    {
        id: 'pdf-para-texto', grupo: 'dePdf', emoji: '📄', nome: 'PDF para texto', acao: 'pdfParaTexto',
        resumo: 'Extrai o texto do PDF para um .txt.',
        detalhe: 'Só funciona em PDF que TEM texto. Digitalização precisa passar antes pelo OCR.',
        campos: [
            cPdf(), cPaginas(),
            { id: 'marcarPaginas', tipo: 'checkbox', rotulo: 'Escrever "Página N" entre as páginas', padrao: true },
            { id: 'separados', tipo: 'checkbox', rotulo: 'Um arquivo por página' },
            cSenhaSeProtegido()
        ]
    },
    {
        id: 'pdf-para-word', grupo: 'dePdf', emoji: '📘', nome: 'PDF para Word', acao: 'pdfParaWord',
        resumo: 'Gera um .docx editável com o texto do PDF.',
        detalhe: 'O texto vem inteiro; a diagramação original (colunas, tabelas, imagens) não é reconstruída.',
        campos: [
            cPdf(),
            { id: 'marcarPaginas', tipo: 'checkbox', rotulo: 'Marcar o início de cada página', padrao: true },
            cSenhaSeProtegido()
        ]
    },
    {
        id: 'pdf-para-planilha', grupo: 'dePdf', emoji: '📈', nome: 'PDF para Excel', acao: 'pdfParaPlanilha',
        resumo: 'Tenta reconstruir as tabelas do PDF em .xlsx ou .csv.',
        detalhe: 'Não existe "tabela" dentro de um PDF — existe texto posicionado. As colunas são deduzidas ' +
                 'pela posição, então CONFIRA antes de usar em nota ou frequência.',
        campos: [
            cPdf(), cPaginas(),
            { id: 'formato', tipo: 'select', rotulo: 'Formato', padrao: 'xlsx',
              opcoes: [{ v: 'xlsx', t: 'Excel (.xlsx), uma aba por página' }, { v: 'csv', t: 'CSV (ponto e vírgula)' }] },
            cSenhaSeProtegido()
        ]
    },
    {
        id: 'pdf-para-html', grupo: 'dePdf', emoji: '🧾', nome: 'PDF para HTML', acao: 'pdfParaHtml',
        resumo: 'Página da web com o texto do PDF, pronta para publicar.',
        campos: [cPdf(), cPaginas(), cSenhaSeProtegido()]
    },

    // --------------------------------------------------------------- otimizar
    {
        id: 'comprimir', grupo: 'otimizar', emoji: '🗜️', nome: 'Comprimir PDF', acao: 'comprimir',
        resumo: 'Diminui o arquivo para caber no e-mail ou no formulário.',
        detalhe: 'Sem perda mexe só na estrutura e mantém o texto. Recompor imagens diminui muito mais, ' +
                 'mas o texto vira imagem.',
        campos: [
            cPdf(),
            { id: 'modo', tipo: 'select', rotulo: 'Como comprimir', padrao: 'estrutura', opcoes: [
                { v: 'estrutura', t: 'Sem perda — mantém o texto' },
                { v: 'imagem', t: 'Recompor imagens — diminui muito mais' }
            ] },
            { id: 'nivel', tipo: 'select', rotulo: 'Nível', padrao: 'media', quando: e => e.modo === 'imagem', opcoes: [
                { v: 'alta', t: 'Alta qualidade (200 DPI)' }, { v: 'media', t: 'Equilibrada (150 DPI)' },
                { v: 'baixa', t: 'Arquivo pequeno (110 DPI)' }, { v: 'minima', t: 'O menor possível (72 DPI)' }
            ] },
            cSenhaSeProtegido()
        ]
    },
    {
        id: 'otimizar-web', grupo: 'otimizar', emoji: '⚡', nome: 'Otimizar PDF para a web', acao: 'otimizarWeb',
        resumo: 'Reconstrói o arquivo para abrir rápido no navegador.',
        detalhe: 'Comprime os objetos internos, descarta lixo de editor e faz o título aparecer na aba.',
        campos: [cPdf()]
    },
    {
        id: 'ocr', grupo: 'otimizar', emoji: '🔎', nome: 'OCR de PDF', acao: 'ocr',
        resumo: 'Reconhece o texto de uma digitalização e o torna pesquisável.',
        detalhe: 'A página continua com a aparência do papel, mas o Ctrl+F passa a encontrar as palavras. ' +
                 'Na primeira vez baixa ~15 MB do reconhecedor.',
        campos: [
            cPdf(), cPaginas(),
            { id: 'idioma', tipo: 'select', rotulo: 'Idioma', padrao: 'por', opcoes: [
                { v: 'por', t: 'Português' }, { v: 'eng', t: 'Inglês' }, { v: 'spa', t: 'Espanhol' },
                { v: 'por+eng', t: 'Português + Inglês' }
            ] },
            cDpi(200),
            { id: 'tambemTxt', tipo: 'checkbox', rotulo: 'Salvar também o texto em .txt', padrao: true },
            cSenhaSeProtegido()
        ]
    },
    {
        id: 'reparar', grupo: 'otimizar', emoji: '🩹', nome: 'Reparar PDF', acao: 'reparar',
        resumo: 'Tenta salvar um PDF que não abre mais.',
        detalhe: 'Primeiro remonta a estrutura (mantendo o texto). Se nem isso funcionar, redesenha as ' +
                 'páginas como imagem — perde o texto, salva o conteúdo.',
        campos: [cPdf()]
    },
    {
        id: 'rasterizar', grupo: 'otimizar', emoji: '🧊', nome: 'Rasterizar PDF', acao: 'rasterizar',
        resumo: 'Redesenha tudo como imagem — nada mais é editável.',
        detalhe: 'Some fonte que faltava, campo de formulário e camada escondida. O documento fica "chapado".',
        campos: [
            cPdf(), cDpi(200),
            { id: 'formato', tipo: 'select', rotulo: 'Compressão interna', padrao: 'jpg',
              opcoes: [{ v: 'jpg', t: 'JPG (arquivo menor)' }, { v: 'png', t: 'PNG (sem perda, maior)' }] },
            { id: 'qualidade', tipo: 'numero', rotulo: 'Qualidade do JPG', padrao: 0.85, min: 0.3, max: 1, passo: 0.05,
              quando: e => e.formato !== 'png' },
            cSenhaSeProtegido()
        ]
    },
    {
        id: 'achatar', grupo: 'otimizar', emoji: '🧯', nome: 'Achatar PDF', acao: 'achatar',
        resumo: 'Incorpora formulários e anotações ao conteúdo da página.',
        campos: [
            cPdf(),
            { id: 'modo', tipo: 'select', rotulo: 'Como achatar', padrao: 'formulario', opcoes: [
                { v: 'formulario', t: 'Só o formulário — mantém o texto pesquisável' },
                { v: 'imagem', t: 'Redesenhar tudo — achata inclusive carimbos' }
            ] },
            { id: 'removerAnotacoes', tipo: 'checkbox', rotulo: 'Remover comentários e destaques',
              quando: e => e.modo !== 'imagem' },
            Object.assign(cDpi(200), { quando: e => e.modo === 'imagem' })
        ]
    },
    {
        id: 'pdf-a', grupo: 'otimizar', emoji: '🏛️', nome: 'PDF para PDF/A', acao: 'paraPdfA',
        resumo: 'Converte para o formato de arquivamento de longo prazo.',
        detalhe: 'É o formato que órgão público pede para guardar documento por anos. Exige que toda fonte ' +
                 'esteja embutida no arquivo.',
        campos: [
            cPdf(),
            { id: 'conformidade', tipo: 'select', rotulo: 'Nível', padrao: '3B', opcoes: [
                { v: '1B', t: 'PDF/A-1b — o mais restrito e compatível' },
                { v: '2B', t: 'PDF/A-2b' },
                { v: '3B', t: 'PDF/A-3b — aceita anexos (recomendado)' }
            ] }
        ]
    },

    // -------------------------------------------------------------- seguranca
    {
        id: 'proteger', grupo: 'seguranca', emoji: '🔐', nome: 'Proteger PDF com senha', acao: 'proteger',
        resumo: 'Cifra o arquivo com AES-256: sem a senha, ninguém lê.',
        detalhe: 'GUARDE A SENHA. Ela não fica salva em lugar nenhum e não existe como recuperar.',
        campos: [
            cPdf(),
            { id: 'senha', tipo: 'senha', rotulo: 'Senha para abrir o arquivo' },
            { id: 'senhaDono', tipo: 'senha', rotulo: 'Senha de permissões (opcional)',
              ajuda: 'Quem tem esta senha pode remover as restrições abaixo.' },
            { id: 'permitirImprimir', tipo: 'checkbox', rotulo: 'Permitir imprimir', padrao: true },
            { id: 'permitirCopiar', tipo: 'checkbox', rotulo: 'Permitir copiar o texto', padrao: true },
            { id: 'permitirFormulario', tipo: 'checkbox', rotulo: 'Permitir preencher formulário', padrao: true },
            { id: 'permitirAnotar', tipo: 'checkbox', rotulo: 'Permitir comentar' },
            { id: 'permitirEditar', tipo: 'checkbox', rotulo: 'Permitir editar o conteúdo' },
            { id: 'permitirMontar', tipo: 'checkbox', rotulo: 'Permitir reorganizar páginas' }
        ]
    },
    {
        id: 'desbloquear', grupo: 'seguranca', emoji: '🔓', nome: 'Desbloquear PDF', acao: 'desbloquear',
        resumo: 'Remove a senha de um PDF cuja senha você tem.',
        detalhe: 'Não quebra cifra nenhuma: sem a senha correta, nada acontece.',
        campos: [
            cPdf(),
            { id: 'senha', tipo: 'senha', rotulo: 'Senha atual do arquivo' }
        ]
    },
    {
        id: 'censurar', grupo: 'seguranca', emoji: '⬛', nome: 'Censurar PDF', acao: 'censurar', extra: 'censurar',
        resumo: 'Apaga de verdade o que está embaixo da tarja.',
        detalhe: 'Desenhar retângulo preto por cima (o que muita ferramenta faz) esconde o nome na tela e ' +
                 'deixa o texto no arquivo — qualquer um copia e lê. Aqui a página é REDESENHADA: o que ' +
                 'estava sob a tarja deixa de existir.',
        campos: [
            cPdf(),
            { id: 'termos', tipo: 'textarea', rotulo: 'Palavras a censurar (uma por linha)', linhas: 4,
              ajuda: 'Acha e cobre todas as ocorrências no texto. Ignora acento e maiúscula.' },
            { id: 'somenteMarcadas', tipo: 'checkbox', rotulo: 'Manter intactas as páginas sem tarja', padrao: true,
              ajuda: 'Desmarcado, o documento inteiro é redesenhado (e perde o texto).' },
            cDpi(200),
            cSenhaSeProtegido()
        ]
    },
    {
        id: 'remover-metadados', grupo: 'seguranca', emoji: '🫥', nome: 'Remover metadados', acao: 'removerMetadados',
        resumo: 'Apaga autor, título, programa e datas escondidos no arquivo.',
        detalhe: 'Metadado não é conteúdo: o nome ESCRITO na página continua lá. Para aquilo, use "Censurar PDF".',
        campos: [
            cPdf(),
            { id: 'limparDatas', tipo: 'checkbox', rotulo: 'Apagar também as datas de criação e alteração', padrao: true }
        ]
    },
    {
        id: 'gerar-senha', grupo: 'seguranca', emoji: '🎲', nome: 'Gerar senha', acao: 'gerarSenha',
        resumo: 'Senhas fortes de verdade, sorteadas no seu aparelho.',
        detalhe: 'Usa o sorteador criptográfico do navegador. Nada é gravado nem enviado.',
        campos: [
            { id: 'comprimento', tipo: 'numero', rotulo: 'Caracteres', padrao: 16, min: 6, max: 64 },
            { id: 'quantidade', tipo: 'numero', rotulo: 'Quantas senhas', padrao: 5, min: 1, max: 20 },
            { id: 'minusculas', tipo: 'checkbox', rotulo: 'Letras minúsculas', padrao: true },
            { id: 'maiusculas', tipo: 'checkbox', rotulo: 'Letras maiúsculas', padrao: true },
            { id: 'numeros', tipo: 'checkbox', rotulo: 'Números', padrao: true },
            { id: 'simbolos', tipo: 'checkbox', rotulo: 'Símbolos (!@#$)' }
        ]
    },

    // -------------------------------------------------------------- verificar
    {
        id: 'visualizar', grupo: 'verificar', emoji: '👁️', nome: 'Visualizar PDF', acao: null, extra: 'visualizar',
        resumo: 'Abre o PDF aqui, página por página, sem sair do sistema.',
        campos: [cPdf(), cSenhaSeProtegido()]
    },
    {
        id: 'comparar', grupo: 'verificar', emoji: '🔬', nome: 'Comparar PDFs', acao: 'comparar',
        resumo: 'Mostra o que mudou entre duas versões do mesmo documento.',
        detalhe: 'Compara o TEXTO, palavra por palavra. Mudança só visual (cor, posição) não aparece.',
        campos: [
            cPdf('Primeiro PDF (o antigo)'),
            { id: 'arquivo2', tipo: 'arquivo', rotulo: 'Segundo PDF (o novo)' }
        ]
    },
    {
        id: 'preferencias-visualizador', grupo: 'verificar', emoji: '🎛️',
        nome: 'Preferências do visualizador', acao: 'preferenciasVisualizador',
        resumo: 'Define como o PDF deve ABRIR: no sumário, em duas páginas, em tela cheia.',
        detalhe: 'É um pedido ao leitor de PDF. O Acrobat obedece quase tudo; o visualizador do navegador, pouco.',
        campos: [
            cPdf(),
            { id: 'modoAbertura', tipo: 'select', rotulo: 'Abrir mostrando', padrao: 'paginas', opcoes: [
                { v: 'paginas', t: 'Só as páginas' }, { v: 'miniaturas', t: 'Painel de miniaturas' },
                { v: 'sumario', t: 'Sumário (marcadores)' }, { v: 'anexos', t: 'Anexos' },
                { v: 'tela', t: 'Tela cheia' }
            ] },
            { id: 'disposicao', tipo: 'select', rotulo: 'Disposição das páginas', padrao: 'continua', opcoes: [
                { v: 'unica', t: 'Uma página por vez' }, { v: 'continua', t: 'Rolagem contínua' },
                { v: 'duas', t: 'Duas páginas lado a lado' }, { v: 'livro', t: 'Como um livro' }
            ] },
            { id: 'titulo', tipo: 'texto', rotulo: 'Título a mostrar na aba' },
            { id: 'mostrarTitulo', tipo: 'checkbox', rotulo: 'Mostrar o título em vez do nome do arquivo', padrao: true },
            { id: 'ajustarJanela', tipo: 'checkbox', rotulo: 'Ajustar a janela ao documento' },
            { id: 'centralizarJanela', tipo: 'checkbox', rotulo: 'Centralizar a janela na tela' },
            { id: 'esconderBarra', tipo: 'checkbox', rotulo: 'Esconder a barra de ferramentas' },
            { id: 'esconderMenu', tipo: 'checkbox', rotulo: 'Esconder o menu' },
            { id: 'impressao', tipo: 'select', rotulo: 'Escala na impressão', padrao: 'aplicativo', opcoes: [
                { v: 'aplicativo', t: 'Deixar o programa decidir' }, { v: 'nenhuma', t: 'Tamanho real (100%)' }
            ] },
            { id: 'duplex', tipo: 'select', rotulo: 'Frente e verso', padrao: '', opcoes: [
                { v: '', t: 'Não sugerir' }, { v: 'simples', t: 'Só frente' },
                { v: 'borda-longa', t: 'Frente e verso (borda longa)' },
                { v: 'borda-curta', t: 'Frente e verso (borda curta)' }
            ] }
        ]
    },

    // ------------------------------------------------------------------ extras
    {
        id: 'converter-imagens', grupo: 'extras', emoji: '🔁', nome: 'Converter imagens', acao: 'converterImagens',
        resumo: 'HEIC do iPhone, WEBP e afins viram JPG ou PNG.',
        detalhe: 'Resolve o caso da foto do celular que o sistema da Secretaria não aceita.',
        campos: [
            { id: 'imagens', tipo: 'imagens', rotulo: 'Imagens' },
            { id: 'destino', tipo: 'select', rotulo: 'Converter para', padrao: 'jpg',
              opcoes: [{ v: 'jpg', t: 'JPG' }, { v: 'png', t: 'PNG' }, { v: 'webp', t: 'WEBP' }] },
            { id: 'qualidade', tipo: 'numero', rotulo: 'Qualidade (0 a 1)', padrao: 0.9, min: 0.3, max: 1, passo: 0.05,
              quando: e => e.destino !== 'png' },
            { id: 'larguraMax', tipo: 'numero', rotulo: 'Largura máxima (px, 0 = não redimensionar)', padrao: 0, min: 0 }
        ]
    },
    {
        id: 'qr-code', grupo: 'extras', emoji: '🔳', nome: 'Gerar código QR', acao: 'qrCode',
        resumo: 'Código QR para link, texto ou recado — em PNG e em PDF.',
        detalhe: 'Serve para colar no mural com o link da atividade ou do formulário da turma.',
        campos: [
            { id: 'texto', tipo: 'textarea', rotulo: 'Conteúdo do código', linhas: 3,
              ajuda: 'Um endereço (https://...), um texto, um recado.' },
            { id: 'escala', tipo: 'numero', rotulo: 'Tamanho do ponto (px)', padrao: 8, min: 2, max: 40 },
            { id: 'borda', tipo: 'numero', rotulo: 'Borda branca (pontos)', padrao: 4, min: 0,
              ajuda: 'O leitor precisa dessa folga. Menos de 4 costuma falhar.' },
            { id: 'correcao', tipo: 'select', rotulo: 'Correção de erro', padrao: 'media', opcoes: [
                { v: 'baixa', t: 'Baixa (~7%) — cabe mais texto' },
                { v: 'media', t: 'Média (~15%) — recomendada' },
                { v: 'alta', t: 'Alta (~25%)' },
                { v: 'maxima', t: 'Máxima (~30%) — sobrevive a papel sujo' }
            ] },
            { id: 'corFrente', tipo: 'cor', rotulo: 'Cor do código', padrao: '#000000' },
            { id: 'corFundo', tipo: 'cor', rotulo: 'Cor do fundo', padrao: '#ffffff' },
            { id: 'tambemPdf', tipo: 'checkbox', rotulo: 'Gerar também uma folha A4 em PDF', padrao: true }
        ]
    }
];

function pdfFerramentaPorId(id) {
    return CATALOGO_PDF.find(f => f.id === id) || null;
}

// ---------------------------------------------------------------------------
// O MOTOR DE FORMULARIO
// ---------------------------------------------------------------------------

// Campo com `quando` some e volta conforme o valor de OUTRO campo. Para isso o
// formulario precisa ser remontado — mas remontar a cada tecla digitada faria o
// cursor pular fora da caixa de texto. Entao descobrimos quais campos MANDAM em
// algum `quando` (lendo o codigo da propria funcao) e so' esses remontam a tela.
function pdfCamposControladores(ferramenta) {
    const controladores = new Set();
    (ferramenta.campos || []).forEach(campo => {
        if (typeof campo.quando !== 'function') return;
        const codigo = String(campo.quando);
        (ferramenta.campos || []).forEach(outro => {
            // \b para "e.modo" nao casar com "e.modoAbertura".
            if (new RegExp('\\be\\.' + outro.id + '\\b').test(codigo)) controladores.add(outro.id);
        });
    });
    return controladores;
}

function pdfCamposVisiveis(ferramenta) {
    return (ferramenta.campos || []).filter(c => typeof c.quando !== 'function' || c.quando(pdfEntradas));
}

function pdfValor(campo) {
    const v = pdfEntradas[campo.id];
    if (v !== undefined) return v;
    return campo.padrao !== undefined ? campo.padrao : (campo.tipo === 'checkbox' ? false : '');
}

function pdfAjudaHtml(campo) {
    return campo.ajuda ? `<div style="font-size:11px; color:#718096; margin-top:3px;">${escPdf(campo.ajuda)}</div>` : '';
}

function pdfCampoHtml(campo, ferramenta) {
    const id = 'pdfC_' + campo.id;
    const valor = pdfValor(campo);
    const controlador = pdfCamposControladores(ferramenta).has(campo.id);
    // O campo que manda em outro remonta a tela; os demais so' guardam o valor.
    const aoMudar = `onchange="pdfDefinir('${campo.id}', this, ${controlador})"`;
    const comum = 'width:100%; padding:8px 10px; border:1px solid #cbd5e0; border-radius:6px; font-size:14px; box-sizing:border-box;';
    const rotulo = `<label for="${id}" style="display:block; font-size:13px; font-weight:600; color:#4a5568; margin-bottom:4px;">${escPdf(campo.rotulo)}</label>`;

    if (campo.tipo === 'arquivo' || campo.tipo === 'arquivos' || campo.tipo === 'imagem' ||
        campo.tipo === 'imagens' || campo.tipo === 'qualquer') {
        const varios = (campo.tipo === 'arquivos' || campo.tipo === 'imagens');
        const aceita = campo.aceita ||
            (campo.tipo === 'imagem' || campo.tipo === 'imagens'
                ? 'image/*,.heic,.heif'
                : (campo.tipo === 'qualquer' ? '' : 'application/pdf,.pdf'));
        const lista = pdfListaArquivosHtml(campo);
        return `<div style="margin-bottom:14px;">
            ${rotulo}
            <input type="file" id="${id}" ${varios ? 'multiple' : ''} ${aceita ? `accept="${aceita}"` : ''}
                   onchange="pdfLerArquivos('${campo.id}', this, ${varios})"
                   style="${comum} background:#f7fafc; cursor:pointer;">
            ${pdfAjudaHtml(campo)}
            ${lista}
        </div>`;
    }

    if (campo.tipo === 'textarea') {
        return `<div style="margin-bottom:14px;">${rotulo}
            <textarea id="${id}" rows="${campo.linhas || 4}" ${aoMudar}
                      oninput="pdfDefinir('${campo.id}', this, false)"
                      style="${comum} font-family:inherit; resize:vertical;">${escPdf(valor)}</textarea>
            ${pdfAjudaHtml(campo)}</div>`;
    }

    if (campo.tipo === 'select') {
        const opcoes = (campo.opcoes || []).map(o =>
            `<option value="${escPdf(o.v)}" ${String(o.v) === String(valor) ? 'selected' : ''}>${escPdf(o.t)}</option>`
        ).join('');
        return `<div style="margin-bottom:14px;">${rotulo}
            <select id="${id}" ${aoMudar} style="${comum} background:white;">${opcoes}</select>
            ${pdfAjudaHtml(campo)}</div>`;
    }

    if (campo.tipo === 'checkbox') {
        return `<div style="margin-bottom:12px;">
            <label style="display:flex; align-items:flex-start; gap:8px; font-size:13px; color:#4a5568; cursor:pointer;">
                <input type="checkbox" id="${id}" ${valor ? 'checked' : ''} ${aoMudar} style="margin-top:2px;">
                <span>${escPdf(campo.rotulo)}${pdfAjudaHtml(campo)}</span>
            </label></div>`;
    }

    if (campo.tipo === 'cor') {
        return `<div style="margin-bottom:14px;">${rotulo}
            <div style="display:flex; gap:8px; align-items:center;">
                <input type="color" id="${id}" value="${escPdf(valor)}" ${aoMudar}
                       style="width:52px; height:36px; padding:2px; border:1px solid #cbd5e0; border-radius:6px; cursor:pointer;">
                <code style="font-size:12px; color:#718096;">${escPdf(valor)}</code>
            </div>${pdfAjudaHtml(campo)}</div>`;
    }

    if (campo.tipo === 'numero') {
        const limites = (campo.min !== undefined ? `min="${campo.min}" ` : '') +
                        (campo.max !== undefined ? `max="${campo.max}" ` : '') +
                        (campo.passo !== undefined ? `step="${campo.passo}" ` : '');
        return `<div style="margin-bottom:14px;">${rotulo}
            <input type="number" id="${id}" value="${escPdf(valor)}" ${limites} ${aoMudar}
                   oninput="pdfDefinir('${campo.id}', this, false)" style="${comum}">
            ${pdfAjudaHtml(campo)}</div>`;
    }

    if (campo.tipo === 'senha') {
        return `<div style="margin-bottom:14px;">${rotulo}
            <div style="position:relative;">
                <input type="password" id="${id}" value="${escPdf(valor)}" autocomplete="off" ${aoMudar}
                       oninput="pdfDefinir('${campo.id}', this, false)" style="${comum} padding-right:40px;">
                <button type="button" onclick="pdfVerSenha('${id}', this)"
                        style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; font-size:15px;">👁️</button>
            </div>${pdfAjudaHtml(campo)}</div>`;
    }

    // texto e faixa
    return `<div style="margin-bottom:14px;">${rotulo}
        <input type="text" id="${id}" value="${escPdf(valor)}" ${aoMudar}
               oninput="pdfDefinir('${campo.id}', this, false)"
               ${campo.tipo === 'faixa' ? 'placeholder="todas"' : ''} style="${comum}">
        ${pdfAjudaHtml(campo)}</div>`;
}

function pdfListaArquivosHtml(campo) {
    const lista = pdfEntradas[campo.id];
    const arquivos = !lista ? [] : (Array.isArray(lista) ? lista : [lista]);
    if (!arquivos.length) return '';
    const itens = arquivos.map((a, i) => `
        <li style="display:flex; align-items:center; gap:8px; padding:5px 8px; background:#f7fafc; border-radius:5px; margin-top:4px; font-size:12px;">
            ${campo.ordenavel && arquivos.length > 1 ? `
                <button type="button" title="Subir" onclick="pdfMoverArquivo('${campo.id}', ${i}, -1)"
                        ${i === 0 ? 'disabled' : ''} style="border:none; background:none; cursor:pointer; opacity:${i === 0 ? '.3' : '1'};">▲</button>
                <button type="button" title="Descer" onclick="pdfMoverArquivo('${campo.id}', ${i}, 1)"
                        ${i === arquivos.length - 1 ? 'disabled' : ''} style="border:none; background:none; cursor:pointer; opacity:${i === arquivos.length - 1 ? '.3' : '1'};">▼</button>` : ''}
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escPdf(a.nome)}</span>
            <span style="color:#718096;">${pdfTamanho(a.bytes.length)}</span>
            <button type="button" title="Tirar da lista" onclick="pdfTirarArquivo('${campo.id}', ${i})"
                    style="border:none; background:none; cursor:pointer; color:#e53e3e;">×</button>
        </li>`).join('');
    return `<ul style="list-style:none; padding:0; margin:8px 0 0;">${itens}</ul>`;
}

// ---------------------------------------------------------------------------
// Leitura dos arquivos (para a memoria, nunca para a rede)
// ---------------------------------------------------------------------------

function pdfDefinir(campoId, elemento, remontar) {
    let valor;
    if (elemento.type === 'checkbox') valor = elemento.checked;
    else if (elemento.type === 'number') valor = elemento.value === '' ? '' : Number(elemento.value);
    else valor = elemento.value;
    pdfEntradas[campoId] = valor;
    if (remontar) pdfRenderFormulario();
    else if (elemento.type === 'color') {
        const codigo = elemento.parentElement && elemento.parentElement.querySelector('code');
        if (codigo) codigo.textContent = valor;
    }
}

function pdfVerSenha(id, botao) {
    const campo = document.getElementById(id);
    if (!campo) return;
    const escondida = campo.type === 'password';
    campo.type = escondida ? 'text' : 'password';
    botao.textContent = escondida ? '🙈' : '👁️';
}

async function pdfLerArquivos(campoId, input, varios) {
    const escolhidos = Array.prototype.slice.call(input.files || []);
    if (!escolhidos.length) return;

    const grandes = escolhidos.filter(f => f.size > PDF_MAX_MB * 1024 * 1024);
    if (grandes.length) {
        alert('Arquivo grande demais para o navegador (limite de ' + PDF_MAX_MB + ' MB):\n\n' +
              grandes.map(f => '• ' + f.name + ' — ' + pdfTamanho(f.size)).join('\n') +
              '\n\nTudo aqui roda dentro do navegador, na memoria do aparelho; acima disso a aba costuma ' +
              'fechar sozinha. Divida o arquivo antes (num computador) ou use um aparelho com mais memoria.');
        input.value = '';
        return;
    }

    pdfAviso('Lendo ' + escolhidos.length + ' arquivo(s)...', 'info');
    try {
        const lidos = [];
        for (const f of escolhidos) {
            lidos.push({ nome: f.name, bytes: new Uint8Array(await f.arrayBuffer()), tipoMime: f.type });
        }
        if (varios) {
            const atual = Array.isArray(pdfEntradas[campoId]) ? pdfEntradas[campoId] : [];
            pdfEntradas[campoId] = atual.concat(lidos);
        } else {
            pdfEntradas[campoId] = lidos[0];
        }
        pdfAviso('', '');
        input.value = '';                     // permite escolher o mesmo arquivo de novo
        await pdfAoTrocarArquivo(campoId);
        pdfRenderFormulario();
    } catch (erro) {
        pdfAviso('Nao consegui ler o arquivo: ' + (erro.message || erro), 'erro');
    }
}

function pdfMoverArquivo(campoId, indice, passo) {
    const lista = pdfEntradas[campoId];
    if (!Array.isArray(lista)) return;
    const destino = indice + passo;
    if (destino < 0 || destino >= lista.length) return;
    const [item] = lista.splice(indice, 1);
    lista.splice(destino, 0, item);
    pdfRenderFormulario();
}

function pdfTirarArquivo(campoId, indice) {
    const lista = pdfEntradas[campoId];
    if (Array.isArray(lista)) lista.splice(indice, 1);
    else delete pdfEntradas[campoId];
    pdfExtra = {};
    pdfRenderFormulario();
    pdfRenderExtra();
}

// Algumas ferramentas precisam LER o arquivo antes de mostrar o formulario:
// "Informacoes do documento" preenche os campos com o que ja' esta la', e
// "Preencher formulario" so' sabe quais campos existem depois de abrir o PDF.
async function pdfAoTrocarArquivo(campoId) {
    const ferramenta = pdfFerramentaPorId(pdfFerramentaAberta);
    if (!ferramenta || campoId !== 'arquivo') return;
    const extra = ferramenta.extra && PDF_EXTRAS[ferramenta.extra];

    // Extra que NAO depende do arquivo fica como esta'. Sem esta saida, escolher o PDF
    // depois de desenhar a assinatura (ordem natural para muita gente) remontaria o
    // quadro e apagaria o desenho.
    if (!extra || !extra.aoTrocarArquivo) return;

    pdfExtra = {};
    pdfAviso('Lendo o documento...', 'info');
    try {
        await extra.aoTrocarArquivo();
        pdfAviso('', '');
    } catch (erro) {
        pdfAviso(erro.message || String(erro), 'erro');
    }
    pdfRenderExtra();
}

// ---------------------------------------------------------------------------
// Executar e entregar o resultado
// ---------------------------------------------------------------------------

function pdfAviso(texto, tipo) {
    const caixa = document.getElementById('pdfAviso');
    if (!caixa) return;
    if (!texto) { caixa.innerHTML = ''; return; }
    const cores = {
        erro:  ['#fff5f5', '#fc8181', '#742a2a', '⚠️'],
        ok:    ['#f0fff4', '#9ae6b4', '#22543d', '✅'],
        info:  ['#ebf8ff', '#90cdf4', '#2a4365', 'ℹ️']
    };
    const [fundo, borda, cor, icone] = cores[tipo] || cores.info;
    caixa.innerHTML = `<div style="background:${fundo}; border:1px solid ${borda}; color:${cor};
        border-radius:6px; padding:10px 12px; font-size:13px; line-height:1.5; margin-bottom:14px;">
        ${icone} ${escPdf(texto)}</div>`;
}

function pdfProgresso(pct, texto) {
    const barra = document.getElementById('pdfBarraProgresso');
    const rotulo = document.getElementById('pdfTextoProgresso');
    if (barra) barra.style.width = Math.max(0, Math.min(100, pct || 0)) + '%';
    if (rotulo) rotulo.textContent = texto || '';
}

async function pdfExecutar() {
    if (pdfOcupado) return;
    const ferramenta = pdfFerramentaPorId(pdfFerramentaAberta);
    if (!ferramenta || !ferramenta.acao) return;
    if (!pdfPodeUsar(ferramenta.nome)) return;
    if (!window.PDFOPS || !PDFOPS.ops[ferramenta.acao]) {
        pdfAviso('O motor de PDF nao carregou (pdf_operacoes.js). Recarregue a pagina.', 'erro');
        return;
    }

    // Os campos de arquivo obrigatorios: reclamar aqui poupa o professor de esperar
    // a biblioteca baixar para so' depois descobrir que faltou escolher o PDF.
    const visiveis = pdfCamposVisiveis(ferramenta);
    const faltando = visiveis.filter(c => {
        if (['arquivo', 'arquivos', 'imagem', 'imagens', 'qualquer'].indexOf(c.tipo) === -1) return false;
        if (c.quando && !c.quando(pdfEntradas)) return false;
        // Ferramenta que aceita mais de uma origem (texto OU arquivo) resolve isso
        // dentro da operacao; aqui so' cobramos o campo que e' a entrada principal.
        if (c.id !== 'arquivo' && c.id !== 'arquivos' && c.id !== 'imagens') return false;
        if (ferramenta.id === 'texto-para-pdf' || ferramenta.id === 'html-para-pdf') return false;
        const v = pdfEntradas[c.id];
        return !v || (Array.isArray(v) && !v.length);
    });
    if (faltando.length) {
        pdfAviso('Escolha primeiro: ' + faltando.map(c => c.rotulo).join(', ') + '.', 'erro');
        return;
    }

    // Entradas = campos do formulario + o que a parte interativa juntou.
    const entradas = Object.assign({}, pdfEntradas);
    visiveis.forEach(c => { if (entradas[c.id] === undefined && c.padrao !== undefined) entradas[c.id] = c.padrao; });
    const extra = ferramenta.extra && PDF_EXTRAS[ferramenta.extra];
    if (extra && extra.coletar) {
        try {
            Object.assign(entradas, extra.coletar() || {});
        } catch (erro) {
            pdfAviso(erro.message || String(erro), 'erro');
            return;
        }
    }

    pdfOcupado = true;
    pdfResultado = null;
    pdfAviso('', '');
    pdfLimparUrls();
    const botao = document.getElementById('pdfBotaoExecutar');
    if (botao) { botao.disabled = true; botao.textContent = '⏳ Processando...'; }
    const areaProgresso = document.getElementById('pdfProgresso');
    if (areaProgresso) areaProgresso.style.display = 'block';
    const areaResultado = document.getElementById('pdfResultado');
    if (areaResultado) areaResultado.innerHTML = '';
    pdfProgresso(2, 'Preparando as bibliotecas...');

    try {
        const inicio = Date.now();
        const saida = await PDFOPS.ops[ferramenta.acao](entradas, pdfProgresso);
        pdfProgresso(100, 'Pronto');
        const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

        // Os bytes viram Blob so' aqui: a operacao nao precisa saber de navegador.
        const arquivos = (saida.arquivos || []).map(a => ({
            nome: a.nome,
            tipo: a.tipo || 'application/octet-stream',
            blob: a.blob || new Blob([a.bytes], { type: a.tipo || 'application/octet-stream' })
        }));
        pdfResultado = Object.assign({}, saida, { arquivos: arquivos, segundos: segundos });
        pdfRenderResultado();
    } catch (erro) {
        console.error('[PDF] ' + ferramenta.id, erro);
        pdfAviso(erro && erro.message ? erro.message : String(erro), 'erro');
        pdfProgresso(0, '');
        if (areaProgresso) areaProgresso.style.display = 'none';
    } finally {
        pdfOcupado = false;
        if (botao) { botao.disabled = false; botao.textContent = '▶️ ' + (ferramenta.rotuloBotao || 'Executar'); }
    }
}

function pdfLimparUrls() {
    pdfUrlsAbertas.forEach(u => { try { URL.revokeObjectURL(u); } catch (_) { /* ja' foi */ } });
    pdfUrlsAbertas = [];
}

function pdfRenderResultado() {
    const area = document.getElementById('pdfResultado');
    if (!area || !pdfResultado) return;
    const arquivos = pdfResultado.arquivos || [];

    // "Gerar senha" nao produz arquivo: produz texto para copiar.
    const senhas = pdfResultado.senhas
        ? `<div style="margin:12px 0;">
             ${pdfResultado.senhas.map(s => `
               <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                 <code style="flex:1; background:#1a202c; color:#68d391; padding:8px 10px; border-radius:6px;
                              font-size:15px; letter-spacing:.06em; overflow-x:auto;">${escPdf(s)}</code>
                 <button class="btn btn-sm btn-secondary" onclick="pdfCopiar('${escPdf(s).replace(/'/g, "\\'")}', this)">Copiar</button>
               </div>`).join('')}
           </div>` : '';

    const itens = arquivos.map((a, i) => `
        <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:white;
                    border:1px solid #e2e8f0; border-radius:8px; margin-bottom:8px;">
            <span style="font-size:20px;">${a.tipo.indexOf('image') === 0 ? '🖼️' : a.tipo.indexOf('pdf') !== -1 ? '📕' : '📄'}</span>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:600; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escPdf(a.nome)}</div>
                <div style="font-size:11px; color:#718096;">${pdfTamanho(a.blob.size)}</div>
            </div>
            ${/(html|text)/.test(a.tipo) || a.tipo.indexOf('image') === 0 || a.tipo.indexOf('pdf') !== -1
                ? `<button class="btn btn-sm btn-secondary" onclick="pdfAbrirEmNovaAba(${i})">Abrir</button>` : ''}
            <button class="btn btn-sm btn-primary" onclick="pdfBaixar(${i})">⬇️ Baixar</button>
        </div>`).join('');

    area.innerHTML = `
        <div style="background:#f0fff4; border:1px solid #9ae6b4; border-radius:8px; padding:14px 16px; margin-top:16px;">
            <div style="font-weight:700; color:#22543d; margin-bottom:6px;">
                ✅ Pronto ${pdfResultado.segundos ? `<span style="font-weight:400; font-size:12px; color:#38a169;">em ${pdfResultado.segundos}s</span>` : ''}
            </div>
            <div style="font-size:13px; color:#22543d; line-height:1.55;">${escPdf(pdfResultado.mensagem || '')}</div>
        </div>
        ${senhas}
        ${arquivos.length ? `<div style="margin-top:14px;">
            ${arquivos.length > 1 ? `<button class="btn btn-success" onclick="pdfBaixarZip()" style="margin-bottom:12px;">
                📦 Baixar todos em .zip (${arquivos.length} arquivos)</button>` : ''}
            ${itens}
        </div>` : ''}
        <div style="font-size:11px; color:#a0aec0; margin-top:12px;">
            🔒 Nada disso foi enviado para a internet: o arquivo foi lido, transformado e devolvido dentro
            deste aparelho. Ao sair da pagina, o resultado se perde — baixe antes.
        </div>`;
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function pdfUrlDe(indice) {
    const a = pdfResultado && pdfResultado.arquivos[indice];
    if (!a) return null;
    const url = URL.createObjectURL(a.blob);
    pdfUrlsAbertas.push(url);
    return url;
}

function pdfBaixar(indice) {
    const a = pdfResultado && pdfResultado.arquivos[indice];
    if (!a) return;
    const url = pdfUrlDe(indice);
    const link = document.createElement('a');
    link.href = url;
    link.download = a.nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function pdfAbrirEmNovaAba(indice) {
    const url = pdfUrlDe(indice);
    if (url) window.open(url, '_blank');
}

async function pdfBaixarZip() {
    if (!pdfResultado || !pdfResultado.arquivos.length) return;
    try {
        const JSZip = await PDFOPS.lib.jsZip();
        const zip = new JSZip();
        pdfResultado.arquivos.forEach(a => zip.file(a.nome, a.blob));
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        const url = URL.createObjectURL(blob);
        pdfUrlsAbertas.push(url);
        const link = document.createElement('a');
        link.href = url;
        link.download = (pdfFerramentaAberta || 'resultado') + '.zip';
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (erro) {
        pdfAviso('Nao consegui montar o .zip: ' + (erro.message || erro) + '. Baixe os arquivos um por um.', 'erro');
    }
}

function pdfCopiar(texto, botao) {
    const antigo = botao.textContent;
    const feito = () => { botao.textContent = '✓ Copiado'; setTimeout(() => { botao.textContent = antigo; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(feito).catch(() => { botao.textContent = 'Copie a mao'; });
    } else {
        // Navegador antigo / pagina sem HTTPS: a area de transferencia moderna nao existe.
        const caixa = document.createElement('textarea');
        caixa.value = texto;
        document.body.appendChild(caixa);
        caixa.select();
        try { document.execCommand('copy'); feito(); } catch (_) { botao.textContent = 'Copie a mao'; }
        caixa.remove();
    }
}

// ---------------------------------------------------------------------------
// AS FERRAMENTAS INTERATIVAS
// ---------------------------------------------------------------------------
// Sete ferramentas nao cabem em campos de formulario: e' preciso VER a pagina.
// Cada uma implementa, no maximo, tres coisas:
//   aoTrocarArquivo()  le o PDF escolhido e prepara o estado
//   render(div)        desenha a parte interativa
//   coletar()          devolve as entradas extras para a operacao
//
// A conversao entre o pixel do <canvas> e o ponto do PDF sai do proprio pdf.js
// (`viewport.convertToPdfPoint`), que ja' leva em conta a rotacao e a area visivel
// da pagina. Fazer essa conta a mao erra em qualquer PDF digitalizado de lado.

let pdfVisorEstado = null;   // { doc, pagina, escala, viewport }

async function pdfAbrirNoVisor() {
    const arquivo = pdfEntradas.arquivo;
    if (!arquivo) return null;
    const doc = await PDFOPS.util.abrirPdfJs(arquivo, pdfEntradas.senha);
    return doc;
}

async function pdfDesenharPaginaEm(canvas, doc, numero, escala) {
    const pagina = await doc.getPage(numero);
    const viewport = pagina.getViewport({ scale: escala });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: ctx, viewport: viewport }).promise;
    return viewport;
}

// Escala que faz a pagina caber na largura disponivel, sem passar de 2 (acima disso
// so' gasta memoria: a exibicao e' por CSS).
function pdfEscalaParaCaber(viewportBase, larguraDisponivel) {
    const alvo = Math.max(320, Math.min(1100, larguraDisponivel || 760));
    return Math.max(0.3, Math.min(2, alvo / viewportBase.width));
}

const PDF_EXTRAS = {

    // --------------------------------------------------------------- visualizar
    visualizar: {
        async aoTrocarArquivo() {
            const doc = await pdfAbrirNoVisor();
            if (!doc) return;
            pdfExtra = { doc: doc, pagina: 1, zoom: 1 };
        },
        render(div) {
            if (!pdfExtra.doc) {
                div.innerHTML = '<p style="color:#718096; font-size:13px;">Escolha um PDF para vê-lo aqui.</p>';
                return;
            }
            div.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                    <button class="btn btn-sm btn-secondary" onclick="pdfVisorIr(-1)">◀ Anterior</button>
                    <span style="font-size:13px; color:#4a5568;">
                        Página <strong id="pdfVisorNumero">${pdfExtra.pagina}</strong> de ${pdfExtra.doc.numPages}
                    </span>
                    <button class="btn btn-sm btn-secondary" onclick="pdfVisorIr(1)">Próxima ▶</button>
                    <span style="flex:1;"></span>
                    <button class="btn btn-sm btn-secondary" onclick="pdfVisorZoom(-0.25)">➖</button>
                    <button class="btn btn-sm btn-secondary" onclick="pdfVisorZoom(0.25)">➕</button>
                    <input type="number" min="1" max="${pdfExtra.doc.numPages}" value="${pdfExtra.pagina}"
                           onchange="pdfVisorIrPara(this.value)"
                           style="width:70px; padding:5px; border:1px solid #cbd5e0; border-radius:5px;">
                </div>
                <div id="pdfVisorArea" style="overflow:auto; max-height:70vh; background:#edf2f7; border-radius:8px; padding:12px; text-align:center;">
                    <canvas id="pdfVisorCanvas" style="max-width:100%; box-shadow:0 2px 12px rgba(0,0,0,.15); background:white;"></canvas>
                </div>`;
            pdfVisorRedesenhar();
        }
    },

    // -------------------------------------------------------------- reorganizar
    reorganizar: {
        async aoTrocarArquivo() {
            const doc = await pdfAbrirNoVisor();
            if (!doc) return;
            pdfExtra = { doc: doc, ordem: Array.from({ length: doc.numPages }, (_, i) => i + 1) };
            pdfEntradas.ordem = pdfExtra.ordem.join(', ');
        },
        render(div) {
            if (!pdfExtra.doc) {
                div.innerHTML = '<p style="color:#718096; font-size:13px;">Escolha um PDF para ver as miniaturas.</p>';
                return;
            }
            div.innerHTML = `
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                    <button class="btn btn-sm btn-secondary" onclick="pdfOrdemRefazer('original')">↺ Ordem original</button>
                    <button class="btn btn-sm btn-secondary" onclick="pdfOrdemRefazer('inverter')">⇅ Inverter tudo</button>
                    <button class="btn btn-sm btn-secondary" onclick="pdfOrdemRefazer('impares')">Só ímpares</button>
                    <button class="btn btn-sm btn-secondary" onclick="pdfOrdemRefazer('pares')">Só pares</button>
                    <button class="btn btn-sm btn-secondary" onclick="pdfOrdemRefazer('intercalar')">🔀 Intercalar (frente/verso)</button>
                </div>
                <div id="pdfMiniaturas" style="display:flex; flex-wrap:wrap; gap:10px;"></div>`;
            pdfRenderMiniaturas();
        },
        coletar() {
            if (!pdfExtra.ordem || !pdfExtra.ordem.length) throw new Error('A ordem ficou vazia — nao sobraria pagina nenhuma.');
            return { ordem: pdfExtra.ordem.join(', ') };
        }
    },

    // -------------------------------------------------------------------- anotar
    anotar: {
        async aoTrocarArquivo() {
            const doc = await pdfAbrirNoVisor();
            if (!doc) return;
            pdfExtra = { doc: doc, pagina: 1, itens: [], modo: 'texto', cor: '#e53e3e', tamanho: 12, texto: '' };
        },
        render(div) {
            if (!pdfExtra.doc) {
                div.innerHTML = '<p style="color:#718096; font-size:13px;">Escolha um PDF para começar a anotar.</p>';
                return;
            }
            const modos = [
                { v: 'texto', t: '🔤 Escrever texto' }, { v: 'destaque', t: '🖍️ Destacar' },
                { v: 'retangulo', t: '▭ Caixa' }, { v: 'linha', t: '／ Linha' }, { v: 'tarja', t: '⬛ Tarja preta' }
            ];
            div.innerHTML = `
                <div style="background:#f7fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:12px;">
                    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
                        ${modos.map(m => `<button class="btn btn-sm ${pdfExtra.modo === m.v ? 'btn-primary' : 'btn-secondary'}"
                            onclick="pdfAnotarModo('${m.v}')">${m.t}</button>`).join('')}
                    </div>
                    ${pdfExtra.modo === 'texto' ? `
                        <input type="text" id="pdfAnotarTexto" placeholder="Digite aqui e clique na página onde o texto deve entrar"
                               value="${escPdf(pdfExtra.texto)}" oninput="pdfExtra.texto = this.value"
                               style="width:100%; padding:8px 10px; border:1px solid #cbd5e0; border-radius:6px; box-sizing:border-box; margin-bottom:8px;">` : ''}
                    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; font-size:12px; color:#4a5568;">
                        <label>Cor <input type="color" value="${escPdf(pdfExtra.cor)}" onchange="pdfExtra.cor = this.value"
                               style="vertical-align:middle; width:42px; height:28px; border:1px solid #cbd5e0; border-radius:5px;"></label>
                        ${pdfExtra.modo === 'texto' ? `<label>Tamanho <input type="number" min="5" max="72" value="${pdfExtra.tamanho}"
                               onchange="pdfExtra.tamanho = Number(this.value)" style="width:60px; padding:4px; border:1px solid #cbd5e0; border-radius:5px;"></label>` : ''}
                        <span style="color:#718096;">${pdfExtra.modo === 'texto'
                            ? 'Clique no ponto onde o texto começa.'
                            : pdfExtra.modo === 'linha' ? 'Arraste do início ao fim da linha.'
                            : 'Arraste para desenhar a área.'}</span>
                    </div>
                </div>
                ${pdfBarraDePaginaHtml('pdfAnotarPagina')}
                <div id="pdfPalcoArea" style="position:relative; display:inline-block; max-width:100%;
                     box-shadow:0 2px 12px rgba(0,0,0,.15); background:white;">
                    <canvas id="pdfPalcoFundo" style="display:block; max-width:100%;"></canvas>
                    <canvas id="pdfPalcoMarcas" style="position:absolute; left:0; top:0; width:100%; height:100%; cursor:crosshair;"></canvas>
                </div>
                <div id="pdfListaItens" style="margin-top:12px;"></div>`;
            pdfPalcoRedesenhar();
        },
        coletar() {
            if (!pdfExtra.itens || !pdfExtra.itens.length) {
                throw new Error('Nenhuma anotacao marcada. Clique (ou arraste) sobre a pagina.');
            }
            return { itens: pdfExtra.itens };
        }
    },

    // ------------------------------------------------------------------ censurar
    censurar: {
        async aoTrocarArquivo() {
            const doc = await pdfAbrirNoVisor();
            if (!doc) return;
            pdfExtra = { doc: doc, pagina: 1, itens: [], modo: 'tarja', cor: '#000000' };
        },
        render(div) {
            if (!pdfExtra.doc) {
                div.innerHTML = '<p style="color:#718096; font-size:13px;">Escolha um PDF para marcar o que deve ser apagado. ' +
                                'Você também pode usar só o campo de palavras acima.</p>';
                return;
            }
            div.innerHTML = `
                <div style="background:#fffaf0; border:1px solid #fbd38d; border-radius:8px; padding:10px 12px; margin-bottom:12px; font-size:12px; color:#744210;">
                    Arraste sobre a página para cobrir. A página marcada é <strong>redesenhada</strong>:
                    o texto embaixo da tarja deixa de existir no arquivo.
                </div>
                ${pdfBarraDePaginaHtml('pdfCensurarPagina')}
                <div id="pdfPalcoArea" style="position:relative; display:inline-block; max-width:100%;
                     box-shadow:0 2px 12px rgba(0,0,0,.15); background:white;">
                    <canvas id="pdfPalcoFundo" style="display:block; max-width:100%;"></canvas>
                    <canvas id="pdfPalcoMarcas" style="position:absolute; left:0; top:0; width:100%; height:100%; cursor:crosshair;"></canvas>
                </div>
                <div id="pdfListaItens" style="margin-top:12px;"></div>`;
            pdfPalcoRedesenhar();
        },
        coletar() {
            const temTermos = String(pdfEntradas.termos || '').trim().length > 0;
            if ((!pdfExtra.itens || !pdfExtra.itens.length) && !temTermos) {
                throw new Error('Marque as areas com o mouse ou escreva as palavras a censurar.');
            }
            return { itens: pdfExtra.itens || [] };
        }
    },

    // ------------------------------------------------------------------- assinar
    assinar: {
        render(div) {
            div.innerHTML = `
                <div style="background:#f7fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
                    <div style="font-size:13px; font-weight:600; color:#4a5568; margin-bottom:6px;">Desenhe a assinatura</div>
                    <div style="font-size:11px; color:#718096; margin-bottom:8px;">
                        Com o dedo (celular/tablet) ou com o mouse. Fica melhor no tablet.
                    </div>
                    <canvas id="pdfAssinaturaCanvas" width="900" height="300"
                            style="width:100%; height:auto; background:white; border:2px dashed #cbd5e0;
                                   border-radius:8px; touch-action:none; cursor:crosshair;"></canvas>
                    <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
                        <button class="btn btn-sm btn-secondary" onclick="pdfAssinaturaLimpar()">🧽 Limpar</button>
                        <label class="btn btn-sm btn-secondary" style="cursor:pointer; margin:0;">
                            🖼️ Usar imagem
                            <input type="file" accept="image/*" onchange="pdfAssinaturaDeImagem(this)" style="display:none;">
                        </label>
                        <span id="pdfAssinaturaEstado" style="font-size:12px; color:#718096; align-self:center;"></span>
                    </div>
                </div>`;
            pdfAssinaturaLigar();
        },
        coletar() {
            const bytes = pdfAssinaturaBytes();
            if (!bytes) throw new Error('Desenhe a assinatura no quadro (ou escolha uma imagem dela).');
            return { assinaturaBytes: bytes };
        }
    },

    // ----------------------------------------------------------------- preencher
    preencher: {
        async aoTrocarArquivo() {
            const arquivo = pdfEntradas.arquivo;
            if (!arquivo) return;
            const campos = await PDFOPS.inspecionar.camposFormulario(arquivo);
            pdfExtra = { campos: campos, valores: {} };
            campos.forEach(c => { pdfExtra.valores[c.nome] = c.valor; });
        },
        render(div) {
            if (!pdfExtra.campos) {
                div.innerHTML = '<p style="color:#718096; font-size:13px;">Escolha o PDF de formulário para ver os campos.</p>';
                return;
            }
            if (!pdfExtra.campos.length) {
                div.innerHTML = `<div style="background:#fff5f5; border:1px solid #fc8181; color:#742a2a;
                    border-radius:8px; padding:12px; font-size:13px;">
                    Este PDF <strong>não tem campos de formulário</strong> — é um documento comum.
                    Para escrever sobre ele, use a ferramenta <strong>Editar e anotar PDF</strong>.</div>`;
                return;
            }
            const linhas = pdfExtra.campos.map((c, i) => {
                const valor = pdfExtra.valores[c.nome];
                const comum = 'width:100%; padding:7px 9px; border:1px solid #cbd5e0; border-radius:6px; font-size:13px; box-sizing:border-box;';
                let entrada;
                if (c.tipo === 'marcacao') {
                    entrada = `<label style="font-size:13px; cursor:pointer;">
                        <input type="checkbox" ${valor ? 'checked' : ''} onchange="pdfCampoForm(${i}, this.checked)"> marcado</label>`;
                } else if (c.tipo === 'lista' || c.tipo === 'escolha') {
                    entrada = `<select onchange="pdfCampoForm(${i}, this.value)" style="${comum} background:white;">
                        <option value="">— em branco —</option>
                        ${(c.opcoes || []).map(o => `<option value="${escPdf(o)}" ${o === valor ? 'selected' : ''}>${escPdf(o)}</option>`).join('')}
                    </select>`;
                } else if (c.tipo === 'botao') {
                    entrada = '<em style="font-size:12px; color:#a0aec0;">(botão — não recebe valor)</em>';
                } else if (c.multilinha) {
                    entrada = `<textarea rows="3" oninput="pdfCampoForm(${i}, this.value)" style="${comum} font-family:inherit;">${escPdf(valor)}</textarea>`;
                } else {
                    entrada = `<input type="text" value="${escPdf(valor)}" oninput="pdfCampoForm(${i}, this.value)" style="${comum}">`;
                }
                return `<div style="margin-bottom:12px;">
                    <label style="display:block; font-size:12px; font-weight:600; color:#4a5568; margin-bottom:3px;">
                        ${escPdf(c.nome)} ${c.somenteLeitura ? '<span class="badge badge-warning" style="font-size:9px;">só leitura</span>' : ''}
                    </label>${entrada}</div>`;
            }).join('');
            div.innerHTML = `<div style="background:#f7fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px;">
                <div style="font-size:13px; font-weight:600; color:#2d3748; margin-bottom:10px;">
                    ${pdfExtra.campos.length} campo(s) encontrado(s)
                </div>${linhas}</div>`;
        },
        coletar() {
            if (!pdfExtra.campos || !pdfExtra.campos.length) throw new Error('Este PDF nao tem campos de formulario.');
            return { valores: pdfExtra.valores || {} };
        }
    },

    // -------------------------------------------------------------------- camera
    camera: {
        render(div) {
            const fotos = pdfExtra.fotos || [];
            div.innerHTML = `
                <div style="background:#f7fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                        <button class="btn btn-sm btn-primary" onclick="pdfCameraLigar()">📷 Ligar a câmera</button>
                        <button class="btn btn-sm btn-success" onclick="pdfCameraFotografar()" ${pdfExtra.stream ? '' : 'disabled'}>📸 Fotografar</button>
                        <button class="btn btn-sm btn-secondary" onclick="pdfCameraDesligar()" ${pdfExtra.stream ? '' : 'disabled'}>⏹️ Desligar</button>
                        <label class="btn btn-sm btn-secondary" style="cursor:pointer; margin:0;">
                            🖼️ Ou escolher fotos
                            <input type="file" accept="image/*" multiple capture="environment"
                                   onchange="pdfCameraDoArquivo(this)" style="display:none;">
                        </label>
                    </div>
                    <video id="pdfCameraVideo" autoplay playsinline muted
                           style="width:100%; max-height:52vh; background:#1a202c; border-radius:8px; display:${pdfExtra.stream ? 'block' : 'none'};"></video>
                    <div style="font-size:11px; color:#718096; margin-top:8px;">
                        🔒 A imagem fica no aparelho. O navegador vai pedir permissão de câmera — e ela não é
                        usada para mais nada.
                    </div>
                </div>
                <div style="margin-top:12px;">
                    <div style="font-size:13px; font-weight:600; color:#4a5568; margin-bottom:6px;">
                        ${fotos.length} página(s) capturada(s)
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        ${fotos.map((f, i) => `
                            <div style="position:relative; width:104px;">
                                <img src="${f.url}" style="width:100%; border:1px solid #cbd5e0; border-radius:6px; display:block;">
                                <div style="font-size:10px; text-align:center; color:#718096;">${i + 1}</div>
                                <button onclick="pdfCameraApagar(${i})" title="Apagar"
                                        style="position:absolute; top:2px; right:2px; background:#e53e3e; color:white; border:none;
                                               border-radius:50%; width:20px; height:20px; cursor:pointer; line-height:1;">×</button>
                            </div>`).join('')}
                    </div>
                </div>`;
        },
        coletar() {
            const fotos = pdfExtra.fotos || [];
            if (!fotos.length) throw new Error('Nenhuma foto ainda. Ligue a camera e fotografe as paginas.');
            return { imagens: fotos.map((f, i) => ({ nome: 'pagina-' + (i + 1) + '.jpg', bytes: f.bytes })) };
        }
    },

    // ------------------------------------------------------------- infoDocumento
    infoDocumento: {
        async aoTrocarArquivo() {
            const arquivo = pdfEntradas.arquivo;
            if (!arquivo) return;
            const info = await PDFOPS.inspecionar.infoDocumento(arquivo);
            pdfExtra = { info: info };
            // Preenche o formulario com o que ja' esta no arquivo: e' "editar", nao "escrever de novo".
            ['titulo', 'autor', 'assunto', 'criador', 'palavrasChave'].forEach(k => {
                if (info[k]) pdfEntradas[k] = info[k];
            });
            pdfRenderFormulario();
        },
        render(div) {
            if (!pdfExtra.info) { div.innerHTML = ''; return; }
            const i = pdfExtra.info;
            const linha = (r, v) => v ? `<tr><td style="padding:4px 10px 4px 0; color:#718096; white-space:nowrap;">${r}</td>
                                         <td style="padding:4px 0; color:#2d3748;">${escPdf(v)}</td></tr>` : '';
            div.innerHTML = `<div style="background:#f7fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; font-size:12px;">
                <div style="font-weight:600; color:#2d3748; margin-bottom:6px;">O que está gravado neste arquivo hoje</div>
                <table style="border-collapse:collapse;">
                    ${linha('Páginas', String(i.paginas))}
                    ${linha('Título', i.titulo)}${linha('Autor', i.autor)}${linha('Assunto', i.assunto)}
                    ${linha('Palavras-chave', i.palavrasChave)}${linha('Criado por', i.criador)}
                    ${linha('Produzido por', i.produtor)}${linha('Criado em', i.criadoEm)}${linha('Alterado em', i.alteradoEm)}
                </table>
                ${!i.titulo && !i.autor ? '<div style="color:#718096; margin-top:6px;">Sem título nem autor declarados.</div>' : ''}
            </div>`;
        }
    }
};

// ---------------------------------------------------------------------------
// Apoio das ferramentas interativas
// ---------------------------------------------------------------------------

// --- visualizador ---------------------------------------------------------
async function pdfVisorRedesenhar() {
    const canvas = document.getElementById('pdfVisorCanvas');
    if (!canvas || !pdfExtra.doc) return;
    const pagina = await pdfExtra.doc.getPage(pdfExtra.pagina);
    const base = pagina.getViewport({ scale: 1 });
    const area = document.getElementById('pdfVisorArea');
    const escala = pdfEscalaParaCaber(base, area ? area.clientWidth - 24 : 760) * (pdfExtra.zoom || 1);
    await pdfDesenharPaginaEm(canvas, pdfExtra.doc, pdfExtra.pagina, escala);
    // Acima de 100% a pagina passa a ser maior que a area e o <div> rola — e' o que se
    // espera de um zoom. Por isso o maxWidth:100% do canvas e' desligado aqui.
    canvas.style.maxWidth = (pdfExtra.zoom || 1) > 1 ? 'none' : '100%';
    const rotulo = document.getElementById('pdfVisorNumero');
    if (rotulo) rotulo.textContent = String(pdfExtra.pagina);
}

function pdfVisorIr(passo) {
    if (!pdfExtra.doc) return;
    pdfExtra.pagina = Math.max(1, Math.min(pdfExtra.doc.numPages, (pdfExtra.pagina || 1) + passo));
    pdfVisorRedesenhar();
}

function pdfVisorIrPara(numero) {
    if (!pdfExtra.doc) return;
    const n = parseInt(numero, 10);
    if (isNaN(n)) return;
    pdfExtra.pagina = Math.max(1, Math.min(pdfExtra.doc.numPages, n));
    pdfVisorRedesenhar();
}

function pdfVisorZoom(passo) {
    pdfExtra.zoom = Math.max(0.35, Math.min(4, (pdfExtra.zoom || 1) + passo));
    pdfVisorRedesenhar();
}

// --- miniaturas e ordem ---------------------------------------------------
async function pdfRenderMiniaturas() {
    const area = document.getElementById('pdfMiniaturas');
    if (!area || !pdfExtra.doc) return;
    const ordem = pdfExtra.ordem || [];
    area.innerHTML = ordem.map((numero, i) => `
        <div style="width:118px; border:1px solid #cbd5e0; border-radius:8px; overflow:hidden; background:white;">
            <canvas data-pagina="${numero}" style="width:100%; display:block; background:#f7fafc;"></canvas>
            <div style="display:flex; align-items:center; justify-content:space-between; padding:3px 4px; background:#edf2f7;">
                <button onclick="pdfOrdemMover(${i}, -1)" title="Para a esquerda" ${i === 0 ? 'disabled' : ''}
                        style="border:none; background:none; cursor:pointer; font-size:12px; opacity:${i === 0 ? '.3' : '1'};">◀</button>
                <span style="font-size:11px; color:#4a5568;">pág. ${numero}</span>
                <button onclick="pdfOrdemMover(${i}, 1)" title="Para a direita" ${i === ordem.length - 1 ? 'disabled' : ''}
                        style="border:none; background:none; cursor:pointer; font-size:12px; opacity:${i === ordem.length - 1 ? '.3' : '1'};">▶</button>
            </div>
            <div style="display:flex; gap:2px; padding:0 4px 4px;">
                <button onclick="pdfOrdemDuplicar(${i})" title="Repetir esta página" class="btn btn-xs btn-secondary" style="flex:1; font-size:10px;">⧉</button>
                <button onclick="pdfOrdemRemover(${i})" title="Tirar da ordem" class="btn btn-xs btn-danger" style="flex:1; font-size:10px;">×</button>
            </div>
        </div>`).join('');

    // As miniaturas sao desenhadas depois do HTML e uma a uma: em PDF de 200 paginas,
    // desenhar tudo de uma vez trava a aba.
    const canvases = Array.prototype.slice.call(area.querySelectorAll('canvas'));
    for (const canvas of canvases) {
        const numero = parseInt(canvas.getAttribute('data-pagina'), 10);
        try {
            const pagina = await pdfExtra.doc.getPage(numero);
            const base = pagina.getViewport({ scale: 1 });
            await pdfDesenharPaginaEm(canvas, pdfExtra.doc, numero, Math.min(0.45, 220 / base.width));
        } catch (_) { /* pagina que nao desenha: fica o quadro vazio */ }
    }
}

function pdfOrdemAplicar() {
    pdfEntradas.ordem = (pdfExtra.ordem || []).join(', ');
    const campo = document.getElementById('pdfC_ordem');
    if (campo) campo.value = pdfEntradas.ordem;
    pdfRenderMiniaturas();
}

function pdfOrdemMover(indice, passo) {
    const ordem = pdfExtra.ordem;
    const destino = indice + passo;
    if (!ordem || destino < 0 || destino >= ordem.length) return;
    const [n] = ordem.splice(indice, 1);
    ordem.splice(destino, 0, n);
    pdfOrdemAplicar();
}

function pdfOrdemRemover(indice) {
    if (!pdfExtra.ordem) return;
    if (pdfExtra.ordem.length <= 1) { alert('Tem de sobrar pelo menos uma pagina.'); return; }
    pdfExtra.ordem.splice(indice, 1);
    pdfOrdemAplicar();
}

function pdfOrdemDuplicar(indice) {
    if (!pdfExtra.ordem) return;
    pdfExtra.ordem.splice(indice + 1, 0, pdfExtra.ordem[indice]);
    pdfOrdemAplicar();
}

function pdfOrdemRefazer(modo) {
    if (!pdfExtra.doc) return;
    const total = pdfExtra.doc.numPages;
    const todas = Array.from({ length: total }, (_, i) => i + 1);
    if (modo === 'original') pdfExtra.ordem = todas;
    else if (modo === 'inverter') pdfExtra.ordem = todas.slice().reverse();
    else if (modo === 'impares') pdfExtra.ordem = todas.filter(n => n % 2 === 1);
    else if (modo === 'pares') pdfExtra.ordem = todas.filter(n => n % 2 === 0);
    else if (modo === 'intercalar') {
        // O caso real: digitalizar as frentes e depois os versos da' dois blocos.
        // Intercalar devolve a ordem do documento (1, verso-1, 2, verso-2...).
        const metade = Math.ceil(total / 2);
        const frentes = todas.slice(0, metade);
        const versos = todas.slice(metade);
        const saida = [];
        frentes.forEach((n, i) => { saida.push(n); if (versos[i]) saida.push(versos[i]); });
        pdfExtra.ordem = saida;
    }
    pdfOrdemAplicar();
}

// --- palco (anotar e censurar) --------------------------------------------
function pdfBarraDePaginaHtml() {
    if (!pdfExtra.doc) return '';
    return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
        <button class="btn btn-sm btn-secondary" onclick="pdfPalcoIr(-1)">◀</button>
        <span style="font-size:13px; color:#4a5568;">Página <strong>${pdfExtra.pagina}</strong> de ${pdfExtra.doc.numPages}</span>
        <button class="btn btn-sm btn-secondary" onclick="pdfPalcoIr(1)">▶</button>
        <input type="number" min="1" max="${pdfExtra.doc.numPages}" value="${pdfExtra.pagina}"
               onchange="pdfPalcoIrPara(this.value)"
               style="width:70px; padding:5px; border:1px solid #cbd5e0; border-radius:5px;">
    </div>`;
}

async function pdfPalcoRedesenhar() {
    const fundo = document.getElementById('pdfPalcoFundo');
    const marcas = document.getElementById('pdfPalcoMarcas');
    if (!fundo || !marcas || !pdfExtra.doc) return;

    const pagina = await pdfExtra.doc.getPage(pdfExtra.pagina);
    const base = pagina.getViewport({ scale: 1 });
    const area = document.getElementById('pdfPainelExtra');
    const escala = pdfEscalaParaCaber(base, area ? area.clientWidth - 8 : 760);
    const viewport = await pdfDesenharPaginaEm(fundo, pdfExtra.doc, pdfExtra.pagina, escala);
    pdfExtra.viewport = viewport;

    marcas.width = fundo.width;
    marcas.height = fundo.height;
    const areaPalco = document.getElementById('pdfPalcoArea');
    if (areaPalco) areaPalco.style.width = Math.round(fundo.width) + 'px';

    pdfPalcoLigar();
    pdfPalcoPintarMarcas();
    pdfRenderListaItens();
}

function pdfPalcoIr(passo) {
    if (!pdfExtra.doc) return;
    pdfExtra.pagina = Math.max(1, Math.min(pdfExtra.doc.numPages, (pdfExtra.pagina || 1) + passo));
    pdfRenderExtra();
}

function pdfPalcoIrPara(numero) {
    const n = parseInt(numero, 10);
    if (!pdfExtra.doc || isNaN(n)) return;
    pdfExtra.pagina = Math.max(1, Math.min(pdfExtra.doc.numPages, n));
    pdfRenderExtra();
}

function pdfAnotarModo(modo) {
    pdfExtra.modo = modo;
    pdfRenderExtra();
}

// Pixel do canvas -> ponto do PDF. O canvas e' exibido esticado por CSS, entao antes
// de tudo desfazemos essa esticada (offsetWidth != width).
function pdfPontoDoPdf(canvas, evento) {
    const caixa = canvas.getBoundingClientRect();
    const px = (evento.clientX - caixa.left) * (canvas.width / caixa.width);
    const py = (evento.clientY - caixa.top) * (canvas.height / caixa.height);
    const [x, y] = pdfExtra.viewport.convertToPdfPoint(px, py);
    return { x: x, y: y, px: px, py: py };
}

function pdfPalcoLigar() {
    const marcas = document.getElementById('pdfPalcoMarcas');
    if (!marcas || marcas.dataset.ligado === '1') return;
    marcas.dataset.ligado = '1';

    let inicio = null;

    const comecar = (ev) => {
        ev.preventDefault();
        inicio = pdfPontoDoPdf(marcas, ev.touches ? ev.touches[0] : ev);
        if (pdfExtra.modo === 'texto') {
            const texto = String(pdfExtra.texto || '').trim();
            if (!texto) { pdfAviso('Digite o texto antes de clicar na pagina.', 'erro'); inicio = null; return; }
            pdfExtra.itens.push({
                tipo: 'texto', pagina: pdfExtra.pagina - 1, x: inicio.x, y: inicio.y,
                texto: texto, tamanho: pdfExtra.tamanho || 12, cor: pdfExtra.cor
            });
            inicio = null;
            pdfAviso('', '');
            pdfPalcoPintarMarcas();
            pdfRenderListaItens();
        }
    };

    const arrastando = (ev) => {
        if (!inicio) return;
        ev.preventDefault();
        const agora = pdfPontoDoPdf(marcas, ev.touches ? ev.touches[0] : ev);
        pdfPalcoPintarMarcas({ de: inicio, para: agora });
    };

    const terminar = (ev) => {
        if (!inicio) return;
        const fonte = (ev.changedTouches && ev.changedTouches[0]) || ev;
        const fim = pdfPontoDoPdf(marcas, fonte);
        const modo = pdfExtra.modo || 'tarja';

        if (modo === 'linha') {
            if (Math.abs(fim.x - inicio.x) > 2 || Math.abs(fim.y - inicio.y) > 2) {
                pdfExtra.itens.push({ tipo: 'linha', pagina: pdfExtra.pagina - 1,
                                      x: inicio.x, y: inicio.y, x2: fim.x, y2: fim.y, cor: pdfExtra.cor });
            }
        } else {
            const x = Math.min(inicio.x, fim.x), y = Math.min(inicio.y, fim.y);
            const largura = Math.abs(fim.x - inicio.x), altura = Math.abs(fim.y - inicio.y);
            // Arrasto de 3 pontos e' clique tremido, nao area: ignorar evita tarja invisivel.
            if (largura > 3 && altura > 3) {
                pdfExtra.itens.push({ tipo: modo, pagina: pdfExtra.pagina - 1,
                                      x: x, y: y, largura: largura, altura: altura, cor: pdfExtra.cor });
            }
        }
        inicio = null;
        pdfPalcoPintarMarcas();
        pdfRenderListaItens();
    };

    marcas.addEventListener('mousedown', comecar);
    marcas.addEventListener('mousemove', arrastando);
    marcas.addEventListener('mouseup', terminar);
    marcas.addEventListener('mouseleave', () => { inicio = null; pdfPalcoPintarMarcas(); });
    marcas.addEventListener('touchstart', comecar, { passive: false });
    marcas.addEventListener('touchmove', arrastando, { passive: false });
    marcas.addEventListener('touchend', terminar);
}

// Desenha, sobre a pagina, o que ja' foi marcado (e o retangulo em andamento).
function pdfPalcoPintarMarcas(emAndamento) {
    const marcas = document.getElementById('pdfPalcoMarcas');
    if (!marcas || !pdfExtra.viewport) return;
    const ctx = marcas.getContext('2d');
    ctx.clearRect(0, 0, marcas.width, marcas.height);

    const daPagina = (pdfExtra.itens || []).filter(it => it.pagina === pdfExtra.pagina - 1);
    daPagina.forEach(it => {
        if (it.tipo === 'texto') {
            const [px, py] = pdfExtra.viewport.convertToViewportPoint(it.x, it.y);
            const escala = pdfExtra.viewport.scale;
            ctx.fillStyle = it.cor || '#e53e3e';
            ctx.font = 'bold ' + Math.max(8, it.tamanho * escala) + 'px Helvetica, Arial, sans-serif';
            ctx.fillText(it.texto, px, py);
            return;
        }
        if (it.tipo === 'linha') {
            const [x1, y1] = pdfExtra.viewport.convertToViewportPoint(it.x, it.y);
            const [x2, y2] = pdfExtra.viewport.convertToViewportPoint(it.x2, it.y2);
            ctx.strokeStyle = it.cor || '#e53e3e';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            return;
        }
        const [xa, ya] = pdfExtra.viewport.convertToViewportPoint(it.x, it.y + it.altura);
        const [xb, yb] = pdfExtra.viewport.convertToViewportPoint(it.x + it.largura, it.y);
        const l = xb - xa, a = yb - ya;
        if (it.tipo === 'tarja') { ctx.fillStyle = '#000'; ctx.fillRect(xa, ya, l, a); }
        else if (it.tipo === 'destaque') {
            ctx.fillStyle = it.cor || '#faf089'; ctx.globalAlpha = 0.4;
            ctx.fillRect(xa, ya, l, a); ctx.globalAlpha = 1;
        } else {
            ctx.strokeStyle = it.cor || '#e53e3e'; ctx.lineWidth = 2; ctx.strokeRect(xa, ya, l, a);
        }
    });

    if (emAndamento) {
        const { de, para } = emAndamento;
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#3182ce';
        ctx.lineWidth = 1.5;
        if ((pdfExtra.modo || '') === 'linha') {
            ctx.beginPath(); ctx.moveTo(de.px, de.py); ctx.lineTo(para.px, para.py); ctx.stroke();
        } else {
            ctx.strokeRect(Math.min(de.px, para.px), Math.min(de.py, para.py),
                           Math.abs(para.px - de.px), Math.abs(para.py - de.py));
        }
        ctx.setLineDash([]);
    }
}

function pdfRenderListaItens() {
    const area = document.getElementById('pdfListaItens');
    if (!area) return;
    const itens = pdfExtra.itens || [];
    if (!itens.length) {
        area.innerHTML = '<p style="font-size:12px; color:#a0aec0;">Nada marcado ainda.</p>';
        return;
    }
    const nomes = { texto: 'Texto', destaque: 'Destaque', retangulo: 'Caixa', linha: 'Linha', tarja: 'Tarja' };
    area.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <span style="font-size:13px; font-weight:600; color:#4a5568;">${itens.length} marcação(ões)</span>
            <button class="btn btn-sm btn-danger" onclick="pdfLimparItens()">Limpar todas</button>
        </div>
        ${itens.map((it, i) => `
            <div style="display:flex; align-items:center; gap:8px; font-size:12px; padding:5px 8px;
                        background:#f7fafc; border-radius:5px; margin-bottom:4px;">
                <span style="width:10px; height:10px; border-radius:2px; background:${it.tipo === 'tarja' ? '#000' : escPdf(it.cor || '#e53e3e')};"></span>
                <span style="flex:1;">${nomes[it.tipo] || it.tipo} — página ${it.pagina + 1}${it.texto ? ': "' + escPdf(it.texto.slice(0, 40)) + '"' : ''}</span>
                <button onclick="pdfRemoverItem(${i})" style="border:none; background:none; cursor:pointer; color:#e53e3e;">×</button>
            </div>`).join('')}`;
}

function pdfRemoverItem(indice) {
    if (!pdfExtra.itens) return;
    pdfExtra.itens.splice(indice, 1);
    pdfPalcoPintarMarcas();
    pdfRenderListaItens();
}

function pdfLimparItens() {
    pdfExtra.itens = [];
    pdfPalcoPintarMarcas();
    pdfRenderListaItens();
}

// --- assinatura -----------------------------------------------------------
function pdfAssinaturaLigar() {
    const canvas = document.getElementById('pdfAssinaturaCanvas');
    if (!canvas || canvas.dataset.ligado === '1') return;
    canvas.dataset.ligado = '1';
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a202c';

    let desenhando = false;
    const ponto = (ev) => {
        const fonte = ev.touches ? ev.touches[0] : ev;
        const caixa = canvas.getBoundingClientRect();
        return {
            x: (fonte.clientX - caixa.left) * (canvas.width / caixa.width),
            y: (fonte.clientY - caixa.top) * (canvas.height / caixa.height)
        };
    };
    const comecar = (ev) => { ev.preventDefault(); desenhando = true; const p = ponto(ev); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const seguir = (ev) => {
        if (!desenhando) return;
        ev.preventDefault();
        const p = ponto(ev);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        pdfExtra.assinouAMao = true;
        const estado = document.getElementById('pdfAssinaturaEstado');
        if (estado) estado.textContent = 'assinatura desenhada';
    };
    const parar = () => { desenhando = false; };

    canvas.addEventListener('mousedown', comecar);
    canvas.addEventListener('mousemove', seguir);
    canvas.addEventListener('mouseup', parar);
    canvas.addEventListener('mouseleave', parar);
    canvas.addEventListener('touchstart', comecar, { passive: false });
    canvas.addEventListener('touchmove', seguir, { passive: false });
    canvas.addEventListener('touchend', parar);
}

function pdfAssinaturaLimpar() {
    const canvas = document.getElementById('pdfAssinaturaCanvas');
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    pdfExtra.assinouAMao = false;
    pdfExtra.assinaturaImagem = null;
    const estado = document.getElementById('pdfAssinaturaEstado');
    if (estado) estado.textContent = '';
}

async function pdfAssinaturaDeImagem(input) {
    const arquivo = (input.files || [])[0];
    if (!arquivo) return;
    const estado = document.getElementById('pdfAssinaturaEstado');
    try {
        const bytes = new Uint8Array(await arquivo.arrayBuffer());
        pdfExtra.assinaturaImagem = bytes;
        pdfExtra.assinouAMao = false;
        // Mostra a imagem no quadro, para a pessoa ver que foi aceita.
        const canvas = document.getElementById('pdfAssinaturaCanvas');
        const url = URL.createObjectURL(new Blob([bytes]));
        const img = new Image();
        img.onload = () => {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const f = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
            const l = img.naturalWidth * f, a = img.naturalHeight * f;
            ctx.drawImage(img, (canvas.width - l) / 2, (canvas.height - a) / 2, l, a);
            URL.revokeObjectURL(url);
        };
        img.src = url;
        if (estado) estado.textContent = 'imagem: ' + arquivo.name;
    } catch (erro) {
        if (estado) estado.textContent = 'nao consegui ler a imagem';
    }
}

// PNG com fundo TRANSPARENTE: assim a assinatura nao cobre a linha nem o texto do PDF.
function pdfAssinaturaBytes() {
    if (pdfExtra.assinaturaImagem) return pdfExtra.assinaturaImagem;
    const canvas = document.getElementById('pdfAssinaturaCanvas');
    if (!canvas || !pdfExtra.assinouAMao) return null;
    const recortado = pdfRecortarCanvas(canvas) || canvas;
    const dados = recortado.toDataURL('image/png').split(',')[1];
    const cru = atob(dados);
    const bytes = new Uint8Array(cru.length);
    for (let i = 0; i < cru.length; i++) bytes[i] = cru.charCodeAt(i);
    return bytes;
}

// Tira a moldura vazia em volta do traco. Sem isso a assinatura entra no PDF como um
// retangulo de 900x300 quase todo transparente, e fica minuscula no meio do espaco.
function pdfRecortarCanvas(canvas) {
    try {
        const ctx = canvas.getContext('2d');
        const dados = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                if (dados[(y * canvas.width + x) * 4 + 3] > 8) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return null;
        const folga = 6;
        minX = Math.max(0, minX - folga); minY = Math.max(0, minY - folga);
        maxX = Math.min(canvas.width - 1, maxX + folga); maxY = Math.min(canvas.height - 1, maxY + folga);
        const corte = document.createElement('canvas');
        corte.width = maxX - minX + 1;
        corte.height = maxY - minY + 1;
        corte.getContext('2d').drawImage(canvas, minX, minY, corte.width, corte.height, 0, 0, corte.width, corte.height);
        return corte;
    } catch (_) {
        return null;    // canvas "sujo" por imagem de outra origem: usa o quadro inteiro
    }
}

// --- camera ---------------------------------------------------------------
async function pdfCameraLigar() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('este navegador nao da acesso a camera');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
            audio: false
        });
        pdfExtra.stream = stream;
        pdfExtra.fotos = pdfExtra.fotos || [];
        pdfRenderExtra();
        const video = document.getElementById('pdfCameraVideo');
        if (video) { video.srcObject = stream; }
    } catch (erro) {
        pdfAviso('Nao consegui abrir a camera: ' + (erro.message || erro) +
                 '. Voce ainda pode usar "Escolher fotos" e tirar a foto pelo aplicativo da camera.', 'erro');
    }
}

function pdfCameraDesligar() {
    if (pdfExtra.stream) {
        pdfExtra.stream.getTracks().forEach(t => t.stop());
        pdfExtra.stream = null;
    }
    pdfRenderExtra();
}

async function pdfCameraFotografar() {
    const video = document.getElementById('pdfCameraVideo');
    if (!video || !video.videoWidth) { pdfAviso('A camera ainda esta abrindo — tente de novo em um instante.', 'info'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await PDFOPS.util.canvasParaBlob(canvas, 'image/jpeg', 0.92);
    pdfExtra.fotos = pdfExtra.fotos || [];
    pdfExtra.fotos.push({ bytes: await PDFOPS.util.blobParaBytes(blob), url: URL.createObjectURL(blob) });
    canvas.width = canvas.height = 0;
    pdfRenderExtra();
}

async function pdfCameraDoArquivo(input) {
    const arquivos = Array.prototype.slice.call(input.files || []);
    if (!arquivos.length) return;
    pdfExtra.fotos = pdfExtra.fotos || [];
    for (const f of arquivos) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        pdfExtra.fotos.push({ bytes: bytes, url: URL.createObjectURL(new Blob([bytes], { type: f.type || 'image/jpeg' })) });
    }
    input.value = '';
    pdfRenderExtra();
}

function pdfCameraApagar(indice) {
    if (!pdfExtra.fotos) return;
    const [f] = pdfExtra.fotos.splice(indice, 1);
    if (f && f.url) { try { URL.revokeObjectURL(f.url); } catch (_) { /* ja' foi */ } }
    pdfRenderExtra();
}

// --- formulario -----------------------------------------------------------
function pdfCampoForm(indice, valor) {
    const campo = pdfExtra.campos && pdfExtra.campos[indice];
    if (!campo) return;
    pdfExtra.valores[campo.nome] = valor;
}

// ---------------------------------------------------------------------------
// A TELA
// ---------------------------------------------------------------------------

function garantirTelaPdf() {
    if (document.getElementById('pdf')) return;
    const container = document.getElementById('appContainer');
    const interno = (container && container.querySelector('.container')) || container || document.body;
    const tela = document.createElement('div');
    tela.id = 'pdf';
    tela.className = 'screen';
    interno.appendChild(tela);
}

// Chamada pelo showScreen('pdf') — ver app.js.
function renderPdf() {
    garantirTelaPdf();
    const tela = document.getElementById('pdf');
    if (!tela) return;

    // A tela nasce sob demanda, entao o showScreen que disparou este render pode ter
    // rodado antes de ela existir. Garante a exibicao aqui (mesmo caminho da Biblioteca).
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    tela.classList.add('active');
    tela.style.display = '';

    if (pdfFerramentaAberta) pdfRenderPainel();
    else pdfRenderCatalogo();
}

function pdfSeloPro() {
    return (typeof selosPremiumHtml === 'function') ? selosPremiumHtml()
        : '<span class="badge" style="background:#faf089; color:#744210; font-size:10px; padding:1px 5px; border-radius:4px; margin-left:4px;">PRO</span>';
}

function pdfRenderCatalogo() {
    const tela = document.getElementById('pdf');
    const premium = pdfEhPremium();

    const chips = [{ id: 'todos', nome: 'Todas', emoji: '🧰' }].concat(PDF_GRUPOS).map(g => `
        <button onclick="pdfFiltrar('${g.id}')" class="btn btn-sm ${pdfFiltroGrupo === g.id ? 'btn-primary' : 'btn-secondary'}"
                style="font-size:12px;">${g.emoji} ${escPdf(g.nome)}</button>`).join('');

    tela.innerHTML = `
        <div class="card" style="margin:20px 0;">
            <h2>📕 Ferramentas PDF ${pdfSeloPro()}</h2>
            <p style="color:#4a5568; font-size:14px; line-height:1.6; margin-bottom:6px;">
                ${CATALOGO_PDF.length} ferramentas de PDF dentro do sistema: juntar, dividir, comprimir, assinar,
                proteger com senha, OCR, converter de e para Word, Excel e imagem, censurar de verdade.
            </p>
            <div style="background:#f0fff4; border:1px solid #9ae6b4; border-radius:8px; padding:12px 14px; margin:12px 0; font-size:13px; color:#22543d; line-height:1.6;">
                🔒 <strong>O arquivo não sai deste aparelho.</strong> Todo o processamento acontece aqui, no
                navegador — nada é enviado para servidor nenhum, nem para o nosso. É a diferença que importa:
                um laudo, uma ata ou uma ficha com nome de estudante <strong>não pode</strong> ser jogado num
                site gratuito de PDF, porque isso é entregar dado pessoal de criança a um terceiro que a
                escola não autorizou (ver <code>CONFORMIDADE-SEDUC.md</code>).
            </div>
            ${premium ? '' : `
                <div style="background:#fffaf0; border:1px solid #fbd38d; border-radius:8px; padding:12px 14px; margin:12px 0; font-size:13px; color:#744210; line-height:1.6;">
                    ⭐ Estas ferramentas fazem parte do <strong>plano Professor</strong>. Você pode ver tudo o que
                    existe aqui; para usar, é preciso assinar — é o que paga servidor, banco e IA do SisProf.
                    <div style="margin-top:8px;">
                        <button class="btn btn-sm btn-primary" onclick="abrirModalApoie({ destaque: 'professor' })">
                            Ver o plano Professor</button>
                    </div>
                </div>`}
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin:14px 0 10px;">
                <input type="search" id="pdfBusca" value="${escPdf(pdfBusca)}" placeholder="🔍 Buscar ferramenta (ex.: senha, juntar, Word...)"
                       oninput="pdfBuscar(this.value)"
                       style="flex:1; min-width:220px; padding:9px 12px; border:1px solid #cbd5e0; border-radius:6px; font-size:14px;">
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;">${chips}</div>
        </div>
        <div id="pdfGrade"></div>`;

    pdfRenderGrade();
    const busca = document.getElementById('pdfBusca');
    if (busca && pdfBusca) { busca.focus(); busca.setSelectionRange(pdfBusca.length, pdfBusca.length); }
}

function pdfFiltrar(grupo) {
    pdfFiltroGrupo = grupo;
    pdfRenderCatalogo();
}

function pdfBuscar(valor) {
    pdfBusca = valor || '';
    // So' a grade e' remontada: remontar a tela toda tiraria o cursor da caixa de busca.
    pdfRenderGrade();
}

function pdfRenderGrade() {
    const area = document.getElementById('pdfGrade');
    if (!area) return;

    // Quem procura escreve "marca dagua", "pdf pra word", "SENHA" — e tem de achar
    // "Adicionar marca d'agua", "PDF para Word" e "Proteger PDF com senha". Entao a
    // comparacao tira o acento, TIRA o apostrofo (sem virar espaco: e' o que faz
    // "d'agua" casar com "dagua") e trata o resto da pontuacao como espaco. Cada
    // palavra digitada precisa aparecer, em qualquer ordem.
    const normalizar = s => String(s || '')
        .toLowerCase()
        .replace(/[\u0027\u2018\u2019\u0060]/g, '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const palavras = normalizar(pdfBusca).split(' ').filter(Boolean);
    const combina = (f) => {
        if (pdfFiltroGrupo !== 'todos' && f.grupo !== pdfFiltroGrupo) return false;
        if (!palavras.length) return true;
        const texto = normalizar(f.nome + ' ' + f.resumo + ' ' + (f.detalhe || '') + ' ' + f.id + ' ' + f.grupo);
        return palavras.every(p => texto.indexOf(p) !== -1);
    };

    const grupos = PDF_GRUPOS.map(g => {
        const ferramentas = CATALOGO_PDF.filter(f => f.grupo === g.id && combina(f));
        if (!ferramentas.length) return '';
        return `
            <div class="card" style="margin-bottom:18px;">
                <h3 style="margin-top:0; color:#2c5282;">${g.emoji} ${escPdf(g.nome)}
                    <span style="font-weight:400; font-size:12px; color:#a0aec0;">(${ferramentas.length})</span></h3>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:10px;">
                    ${ferramentas.map(f => `
                        <button onclick="abrirFerramentaPdf('${f.id}')"
                                style="text-align:left; background:white; border:1px solid #e2e8f0; border-radius:8px;
                                       padding:12px; cursor:pointer; transition:all .15s; font:inherit;"
                                onmouseover="this.style.borderColor='#3182ce'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 10px rgba(0,0,0,.07)';"
                                onmouseout="this.style.borderColor='#e2e8f0'; this.style.transform=''; this.style.boxShadow='';">
                            <div style="font-size:20px; line-height:1.2;">${f.emoji}</div>
                            <div style="font-weight:700; font-size:13px; color:#2d3748; margin:5px 0 3px;">${escPdf(f.nome)}</div>
                            <div style="font-size:11.5px; color:#718096; line-height:1.45;">${escPdf(f.resumo)}</div>
                        </button>`).join('')}
                </div>
            </div>`;
    }).join('');

    area.innerHTML = grupos || `
        <div class="card" style="text-align:center; color:#718096;">
            Nenhuma ferramenta com "<strong>${escPdf(pdfBusca)}</strong>".
            <div style="margin-top:8px;"><button class="btn btn-sm btn-secondary" onclick="pdfLimparBusca()">Limpar a busca</button></div>
        </div>`;
}

function pdfLimparBusca() {
    pdfBusca = '';
    pdfFiltroGrupo = 'todos';
    pdfRenderCatalogo();
}

function abrirFerramentaPdf(id) {
    const ferramenta = pdfFerramentaPorId(id);
    if (!ferramenta) return;
    // O portao: o catalogo e' livre, usar e' do plano Professor.
    if (!pdfPodeUsar(ferramenta.nome)) return;

    pdfFerramentaAberta = id;
    pdfEntradas = {};
    pdfExtra = {};
    pdfResultado = null;
    pdfLimparUrls();
    // Padroes declarados no catalogo entram de uma vez, para a operacao nunca
    // receber undefined onde o catalogo prometeu um valor.
    (ferramenta.campos || []).forEach(c => { if (c.padrao !== undefined) pdfEntradas[c.id] = c.padrao; });
    pdfRenderPainel();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fecharFerramentaPdf() {
    // Camera ligada continua ligada (a luz do aparelho fica acesa) se ninguem parar.
    if (pdfExtra && pdfExtra.stream) pdfCameraDesligar();
    (pdfExtra && pdfExtra.fotos || []).forEach(f => { try { URL.revokeObjectURL(f.url); } catch (_) { /* ja' foi */ } });
    pdfLimparUrls();
    pdfFerramentaAberta = null;
    pdfEntradas = {};
    pdfExtra = {};
    pdfResultado = null;
    pdfRenderCatalogo();
}

function pdfRenderPainel() {
    const tela = document.getElementById('pdf');
    const ferramenta = pdfFerramentaPorId(pdfFerramentaAberta);
    if (!tela || !ferramenta) return;
    const grupo = PDF_GRUPOS.find(g => g.id === ferramenta.grupo) || { nome: '', emoji: '' };

    tela.innerHTML = `
        <div class="card" style="margin:20px 0;">
            <div style="display:flex; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                <button class="btn btn-sm btn-secondary" onclick="fecharFerramentaPdf()">← Todas as ferramentas</button>
                <div style="flex:1; min-width:200px;">
                    <h2 style="margin:0; border:none; padding:0;">${ferramenta.emoji} ${escPdf(ferramenta.nome)} ${pdfSeloPro()}</h2>
                    <div style="font-size:12px; color:#a0aec0;">${grupo.emoji} ${escPdf(grupo.nome)}</div>
                </div>
            </div>
            <p style="color:#4a5568; font-size:14px; margin:12px 0 0;">${escPdf(ferramenta.resumo)}</p>
            ${ferramenta.detalhe ? `<p style="color:#718096; font-size:12.5px; line-height:1.6; margin:8px 0 0;">${escPdf(ferramenta.detalhe)}</p>` : ''}
        </div>

        <div class="card">
            <div id="pdfAviso"></div>
            <div id="pdfPainelForm"></div>
            <div id="pdfPainelExtra" style="margin:6px 0 16px;"></div>
            ${ferramenta.acao ? `
                <button class="btn btn-primary" id="pdfBotaoExecutar" onclick="pdfExecutar()"
                        style="padding:11px 24px; font-size:15px;">▶️ ${escPdf(ferramenta.rotuloBotao || 'Executar')}</button>
                <div id="pdfProgresso" style="display:none; margin-top:14px;">
                    <div style="background:#e2e8f0; border-radius:99px; height:8px; overflow:hidden;">
                        <div id="pdfBarraProgresso" style="background:#3182ce; height:100%; width:0; transition:width .25s;"></div>
                    </div>
                    <div id="pdfTextoProgresso" style="font-size:12px; color:#718096; margin-top:6px;"></div>
                </div>` : ''}
            <div id="pdfResultado"></div>
        </div>`;

    pdfRenderFormulario();
    pdfRenderExtra();
}

function pdfRenderFormulario() {
    const area = document.getElementById('pdfPainelForm');
    const ferramenta = pdfFerramentaPorId(pdfFerramentaAberta);
    if (!area || !ferramenta) return;

    const campos = pdfCamposVisiveis(ferramenta);
    // Duas colunas quando ha' muito campo curto; uma coluna em tela estreita (CSS grid
    // resolve sozinho com minmax).
    area.innerHTML = `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:0 18px;">
        ${campos.map(c => pdfCampoHtml(c, ferramenta)).join('')}
    </div>`;
}

function pdfRenderExtra() {
    const area = document.getElementById('pdfPainelExtra');
    const ferramenta = pdfFerramentaPorId(pdfFerramentaAberta);
    if (!area) return;
    if (!ferramenta || !ferramenta.extra || !PDF_EXTRAS[ferramenta.extra]) { area.innerHTML = ''; return; }
    const extra = PDF_EXTRAS[ferramenta.extra];
    if (!extra.render) { area.innerHTML = ''; return; }
    try {
        extra.render(area);
    } catch (erro) {
        console.error('[PDF] extra ' + ferramenta.extra, erro);
        area.innerHTML = `<div style="background:#fff5f5; border:1px solid #fc8181; color:#742a2a; border-radius:6px; padding:10px; font-size:13px;">
            Nao consegui montar esta parte da tela: ${escPdf(erro.message || String(erro))}</div>`;
    }
}

// Deixa acessivel para o onclick do HTML gerado (o app nao usa modulos).
window.renderPdf = renderPdf;
window.abrirFerramentaPdf = abrirFerramentaPdf;
window.fecharFerramentaPdf = fecharFerramentaPdf;
window.pdfExecutar = pdfExecutar;
window.CATALOGO_PDF = CATALOGO_PDF;
window.PDF_GRUPOS = PDF_GRUPOS;
window.PDF_EXTRAS = PDF_EXTRAS;
