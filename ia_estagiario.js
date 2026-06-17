// --- MÓDULO: ESTAGIÁRIO (IA E GERAÇÃO DE DOCUMENTOS) ---

function abrirModalGerarDocumentoIA() {
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

    // Calcula a próxima semana de segunda a sexta
    const hoje = new Date();
    const proximaSegunda = new Date(hoje);
    proximaSegunda.setDate(hoje.getDate() + ((1 + 7 - hoje.getDay()) % 7 || 7));
    const proximaSexta = new Date(proximaSegunda);
    proximaSexta.setDate(proximaSegunda.getDate() + 4);
    const formatData = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const semanaSugerida = `${formatData(proximaSegunda)} a ${formatData(proximaSexta)}`;

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
                        <select id="iaDocTipo" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                            <option value="plano_aula">Plano de Aula</option>
                        </select>
                    </div>
                    <div style="flex: 1;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Semana Vigente:</label>
                        <input type="text" id="iaDocSemana" value="${semanaSugerida}" style="width:100%; padding:8px; border:1px solid #cbd5e0; border-radius:4px;">
                    </div>
                </div>

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

                <div style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn btn-secondary" onclick="closeModal('modalGerarDocumentoIA')">Cancelar</button>
                    <button class="btn btn-primary" onclick="gerarDocumentoIA()">Gerar Estrutura</button>
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
    }
    
    const docTema = document.getElementById('iaDocTema');
    if (docTema) docTema.value = '';
    const docSerie = document.getElementById('iaDocSerie');
    if (docSerie) docSerie.value = '';
    const docDisciplina = document.getElementById('iaDocDisciplina');
    if (docDisciplina) docDisciplina.value = '';
    const docSemana = document.getElementById('iaDocSemana');
    if (docSemana) docSemana.value = semanaSugerida;
    
    const docPrompt = document.getElementById('iaDocPrompt');
    if (docPrompt) docPrompt.value = savedPrompt;

    showModal('modalGerarDocumentoIA');
}

function restaurarPromptPadraoIA() {
    const defaultPromptTemplate = `Você é um professor/coordenador pedagógico experiente do Estado de São Paulo. Crie a estrutura de um Plano de Aula de {{disciplina}} para a série/ano {{serie}} sobre o tema: "{{tema}}".\nUtilize seus profundos conhecimentos sobre o Currículo Paulista e os Materiais de Apoio (Caderno do Aluno/Professor) da SEDUC-SP.\nAs habilidades devem seguir estritamente o código e formato do Currículo Paulista específicos da disciplina de {{disciplina}} (ex: se for Matemática, use EF...MA..., se for Arte, EF...AR..., etc.).\nA Aprendizagem Essencial deve ser compatível com os documentos curriculares oficiais da disciplina.\nRetorne APENAS um objeto JSON válido (sem marcações markdown e escape corretamente aspas e quebras de linha usando \\n) com as seguintes chaves textuais estritas:\n{"aprendizagem_essencial": "Habilidade central do Currículo Paulista", "conteudos": "lista de conteúdos", "habilidades": "lista de habilidades cognitivas a desenvolver com os códigos do Currículo Paulista da disciplina solicitada", "objetivos": "objetivos da aula", "desenvolvimento": "introdução, desenvolvimento e conclusão com tempos sugeridos", "materiais": "recursos utilizados", "avaliacao": "critérios e instrumentos"}`;
    const txt = document.getElementById('iaDocPrompt');
    if (txt) {
        txt.value = defaultPromptTemplate;
        localStorage.setItem('ia_prompt_template', defaultPromptTemplate);
    }
}

async function gerarDocumentoIA() {
    const tipo = document.getElementById('iaDocTipo').value;
    const tema = document.getElementById('iaDocTema').value;
    const serie = document.getElementById('iaDocSerie') ? document.getElementById('iaDocSerie').value : '';
    const disciplina = document.getElementById('iaDocDisciplina') ? document.getElementById('iaDocDisciplina').value : '';
    const semana = document.getElementById('iaDocSemana') ? document.getElementById('iaDocSemana').value : '';
    
    if (!serie || !disciplina) return alert('Por favor, selecione a série e a disciplina.');
    if (!tema) return alert('Por favor, informe o tema/assunto.');

    // Busca a chave da API configurada com segurança no banco de dados
    let apiKeys = [];
    try {
        const configData = await getData('system', 'config_ia');
        if (configData && configData.apiKey) {
            apiKeys = configData.apiKey.split(',').map(k => k.trim()).filter(k => k);
        }
    } catch(e) {
        console.warn('Erro ao buscar chave da IA:', e);
    }

    if (apiKeys.length === 0) return alert('⚠️ A chave da API não foi configurada. Peça ao Administrador para entrar no painel Super Admin e adicioná-la na aba Migração.');

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

        if (tipo === 'plano_aula') {
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
        }

        let success = false;
        let lastError = '';
        let respostaTexto = '';

        let tentativas = 3; // Tenta até 3 vezes
        const modelosFallback = ['gemini-1.5-flash-latest', 'gemini-1.5-pro-latest', 'gemini-1.5-flash'];
        
        for (let i = 0; i < tentativas && !success; i++) {
            const modeloAtual = modelosFallback[i % modelosFallback.length];
            
            for (const currentKey of apiKeys) {
                try {
                    btn.textContent = `Gerando estrutura... ⏳ (Tentativa ${i+1}/3)`;
                    
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
            dadosEstruturados = JSON.parse(jsonLimpo);
        } catch (parseErr) {
            console.error("Erro no JSON retornado pela IA:", respostaTexto);
            throw new Error("A IA não retornou os dados no formato esperado. Por favor, tente gerar novamente.");
        }

        closeModal('modalGerarDocumentoIA');
        abrirModalRevisaoDocumento(tipo, serie, disciplina, tema, semana, turmasNomesStr, duracaoAulasStr, bimestreAtual, dadosEstruturados);

    } catch (e) {
        console.error(e);
        alert('Erro ao gerar documento com IA:\n' + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function abrirModalRevisaoDocumento(tipo, serie, disciplina, tema, semana, turmasStr, duracaoAulas, bimestreAtual, dados) {
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
            ${formHtml}
            <div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0; padding-top:15px;">
                <button class="btn btn-secondary" onclick="closeModal('modalRevisaoDocumento'); showModal('modalGerarDocumentoIA')">← Voltar</button>
                <button class="btn btn-success" onclick="exportarDocumentoFinal('${tipo}')" id="btnExportarDoc">💾 Gerar PDF Final</button>
            </div>
        </div>
    `;
    showModal('modalRevisaoDocumento');
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
        // Nova Abordagem: Carregar o layout externo da pasta Docs
        // Certifique-se de que a extensão do arquivo seja a mesma (.html, .txt, etc)
        const response = await fetch('Docs/Base_Plano_Aula.html');
        if (!response.ok) {
            throw new Error('Não foi possível carregar o arquivo Docs/Base_Plano_Aula.html. Verifique o caminho e a extensão!');
        }
        let templateHtml = await response.text();

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
        win.document.write(htmlFinal);
        win.document.close();
        
        closeModal('modalRevisaoDocumento');
        
        // [NOVO] AUTO-SALVAR DRAFT DO REGISTRO DE AULA
        try {
            const hoje = getTodayString();
            if (!data.registrosAula) data.registrosAula = [];
            
            const getSerieNomeLocal = (nome) => {
                if (!nome) return '';
                let n = nome.trim();
                n = n.replace(/[\s-]+[A-Za-z]$/i, '');
                n = n.replace(/(\d)[A-Za-z]$/i, '$1');
                n = n.replace(/([ºª])[A-Za-z]$/i, '$1');
                return n.trim();
            };

            const turmasAlvo = (data.turmas || []).filter(t => t.disciplina === payload.disciplina && getSerieNomeLocal(t.ano_serie || t.nome) === payload.serie);
            
            turmasAlvo.forEach(turma => {
                const registroExistente = data.registrosAula.find(r => r.id_turma == turma.id && r.data == hoje);
                const conteudoResumo = `Tema: ${payload.tema}\n\nObjetivo: ${payload.dados.objetivos || 'Apresentado no plano de aula.'}\n\nDesenvolvimento: ${payload.dados.desenvolvimento || ''}`;
                
                if (!registroExistente) {
                    data.registrosAula.push({ id: Date.now() + Math.random(), id_turma: turma.id, data: hoje, conteudo: conteudoResumo.substring(0, 1000) });
                }
            });
            persistirDados();
            if (typeof window.enviarDadosParaExtensao === 'function') window.enviarDadosParaExtensao(true);
        } catch(er) { console.warn("Erro ao auto-salvar registro", er); }

    } catch (e) {
        alert('Erro ao formatar o documento: ' + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}