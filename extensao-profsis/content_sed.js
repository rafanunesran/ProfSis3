// CONTENT SCRIPT - Sala do Futuro SED (Injetado em saladofuturo.educacao.sp.gov.br)
// Injeta o menu flutuante do Robô + Automatiza preenchimento

console.log("🤖 Robô do ProfSis3 carregado no portal do Estado.");

// ============================================================
// INJETAR MENU FLUTUANTE
// ============================================================
function injetarMenuFlutuante() {
    if (window.sisprofRoboAtivo) {
        console.log("ℹ️ Robô já está ativo nesta aba.");
        return;
    }
    
    window.sisprofRoboAtivo = true;
    window.extHistory = {};
    window.extDoneMarks = {};
    window.currentSelectedDate = "";
    
    // Cria o menu flutuante
    const ui = document.createElement('div');
    ui.id = 'sisprof-menu-flutuante';
    ui.style.cssText = 'position:fixed; top:20px; right:20px; width:340px; background:#fff; border:2px solid #38a169; border-radius:12px; z-index:999999; box-shadow:0 10px 25px rgba(0,0,0,0.3); font-family:sans-serif; overflow:hidden; display:flex; flex-direction:column; max-height:90vh;';
    
    ui.innerHTML = `
        <div style="background:#38a169; color:#fff; padding:12px 14px; font-weight:bold; display:flex; justify-content:space-between; align-items:center; font-size:14px;">
            <span>🤖 Robô SisProf <span style="font-size:10px; background:rgba(255,255,255,0.2); padding:2px 6px; border-radius:4px;">EXTENSÃO</span></span>
            <span style="cursor:pointer; font-size:18px;" onclick="fecharMenuFlutuante()">✖</span>
        </div>
        <div style="padding:16px; overflow-y:auto;" id="sisprof-content">
            <!-- Seção 1: Selecionar Data -->
            <div style="margin-bottom:14px;">
                <label style="font-size:12px; font-weight:bold; color:#4a5568; display:block; margin-bottom:4px;">📅 Dia Sincronizado:</label>
                <select id="rpaDiaSelect" style="width:100%; padding:8px; border-radius:6px; border:1px solid #cbd5e0; font-size:12px; background:#fff;">
                    <option value="">Carregando...</option>
                </select>
            </div>
            
            <!-- Seção 2: Informações do Dia -->
            <div id="rpaDiaInfo" style="margin-bottom:14px; font-size:12px; color:#2d3748; background:#f7fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0; min-height:50px;">
                Aguardando dados da nuvem...
            </div>
            
            <!-- Seção 3: Aulas a Lançar -->
            <div style="margin-bottom:14px;">
                <label style="font-size:12px; font-weight:bold; color:#4a5568; display:flex; justify-content:space-between; align-items:center;">
                    📚 Aulas a Lançar:
                    <span style="font-weight:normal; font-size:10px; cursor:pointer; color:#3182ce; padding:2px 6px; border:1px solid #3182ce; border-radius:4px;" onclick="window.lerAulasDaTelaRPA()">Ler da Tela 🔄</span>
                </label>
                <div id="rpaListaAulas" style="margin-top:6px; max-height:130px; overflow-y:auto; border:1px solid #e2e8f0; padding:6px; border-radius:6px; font-size:11px; background:#fff;"></div>
            </div>
            
            <!-- Seção 4: Botão Principal -->
            <button id="rpaBtnPreencher" onclick="window.preencherTudoRPA()" style="width:100%; background:#3182ce; color:#fff; border:none; padding:12px; border-radius:8px; font-weight:bold; cursor:pointer; margin-bottom:12px; font-size:13px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                1️⃣ Preencher Chamada / Aula
            </button>
            
            <!-- Seção 5: Modo Rápido (Auto) -->
            <div style="background:#f0fff4; padding:10px; border-radius:8px; border:1px solid #c6f6d5; margin-bottom:14px;">
                <label style="font-size:11px; font-weight:bold; color:#276749; display:block; margin-bottom:6px;">
                    ⚡ Modo Automático:
                </label>
                <label style="font-size:11px; color:#4a5568; display:flex; align-items:center; gap:6px; cursor:pointer;">
                    <input type="checkbox" id="rpaAutoExecutar"> Executar automaticamente ao carregar dados
                </label>
            </div>
            
            <hr style="border:0; border-top:1px solid #e2e8f0; margin:14px 0;">
            
            <!-- Seção 6: Extrair Alunos -->
            <p style="font-size:11px; color:#718096; margin-bottom:8px; font-weight:bold;">📥 Extrair Alunos da SED:</p>
            <button onclick="window.iniciarExtrairAlunos()" style="width:100%; background:#38a169; color:#fff; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer; margin-bottom:8px; font-size:12px;">📥 Extrair Alunos (Turma Atual)</button>
            <button onclick="window.iniciarExtrairTodasTurmas()" style="width:100%; background:#276749; color:#fff; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer; margin-bottom:8px; font-size:12px;">📥 Extrair TODAS Turmas (Auto)</button>
            
            <hr style="border:0; border-top:1px solid #e2e8f0; margin:14px 0;">
            
            <!-- Seção 7: Carregar dados manualmente -->
            <p style="font-size:11px; color:#718096; margin-bottom:8px; font-weight:bold;">🔄 Dados:</p>
            <div style="display:flex; gap:8px;">
                <button onclick="window.carregarDadosDoStorage()" style="flex:1; background:#805ad5; color:#fff; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:11px;">📦 Ler Storage</button>
                <button onclick="window.abrirIframeConexao()" style="flex:1; background:#dd6b20; color:#fff; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:11px;">🌐 Conectar App</button>
            </div>
            
            <!-- Status da conexão -->
            <div id="rpaStatusConexao" style="margin-top:10px; font-size:11px; color:#718096; text-align:center; padding:6px; background:#edf2f7; border-radius:6px;">
                🔌 Aguardando dados...
            </div>
        </div>
    `;
    
    document.body.appendChild(ui);
    
    // Cria iframe oculto para comunicação com o SisProf
    criarIframeConexao();
    
    // Registra funções globais
    window.fecharMenuFlutuante = function() {
        const menu = document.getElementById('sisprof-menu-flutuante');
        if (menu) menu.remove();
        window.sisprofRoboAtivo = false;
    };
    
    window.mudarDiaRPA = function(dateStr) {
        window.currentSelectedDate = dateStr;
        const info = document.getElementById('rpaDiaInfo');
        if (!window.currentSelectedDate || !window.extHistory[window.currentSelectedDate]) {
            if (info) info.innerHTML = 'Sem dados para esta data.';
            return;
        }
        const payload = window.extHistory[window.currentSelectedDate];
        const numFaltas = (payload.faltas && payload.faltas.length) ? payload.faltas.length : 0;
        const temRegistro = (payload.registros && payload.registros.length > 0 && payload.registros[0].conteudo) ? 'Sim' : 'Não';
        if (info) {
            info.innerHTML = `
                <div style="display:flex; gap:12px; flex-wrap:wrap;">
                    <span style="background:#fed7d7; padding:3px 8px; border-radius:4px; color:#c53030;"><strong>Faltas:</strong> ${numFaltas}</span>
                    <span style="background:#c6f6d5; padding:3px 8px; border-radius:4px; color:#276749;"><strong>Registro:</strong> ${temRegistro}</span>
                    <span style="background:#bee3f8; padding:3px 8px; border-radius:4px; color:#2b6cb0;"><strong>Data:</strong> ${dateStr.split('-').reverse().join('/')}</span>
                </div>
            `;
        }
        window.lerAulasDaTelaRPA();
    };
    
    window.renderRpaHistory = function() {
        const select = document.getElementById('rpaDiaSelect');
        if (!select) return;
        select.innerHTML = '';
        const dates = Object.keys(window.extHistory).sort((a, b) => b.localeCompare(a));
        if (dates.length === 0) {
            select.innerHTML = '<option value="">Nenhum dado recebido</option>';
            document.getElementById('rpaDiaInfo').innerHTML = 'Volte ao SisProf e use "🧩 Enviar para Extensão" no seu Perfil.';
            return;
        }
        dates.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            const parts = d.split('-');
            opt.textContent = parts[2] + '/' + parts[1] + '/' + parts[0];
            select.appendChild(opt);
        });
        if (!window.currentSelectedDate || !window.extHistory[window.currentSelectedDate]) {
            window.currentSelectedDate = dates[0];
        }
        select.value = window.currentSelectedDate;
        window.mudarDiaRPA(window.currentSelectedDate);
        
        // Verifica se deve executar automaticamente
        const autoChk = document.getElementById('rpaAutoExecutar');
        if (autoChk && autoChk.checked) {
            setTimeout(() => window.preencherTudoRPA(), 1500);
        }
    };
    
    window.lerAulasDaTelaRPA = function() {
        const lista = document.getElementById('rpaListaAulas');
        if (!lista) return;
        
        const checkboxes = document.querySelectorAll('.multi-select-menuitem input[type="checkbox"]');
        if (checkboxes.length === 0) {
            lista.innerHTML = '<div style="color:#a0aec0; text-align:center; padding:10px 0;">Nenhuma aula encontrada.<br>Abra a aba de Chamada e selecione a Turma.</div>';
            return;
        }
        
        lista.innerHTML = '';
        checkboxes.forEach((chk, index) => {
            const label = chk.parentElement.textContent.trim();
            const val = chk.value;
            const markKey = window.currentSelectedDate + '_' + val;
            const isDone = window.extDoneMarks[markKey] || false;
            
            const div = document.createElement('div');
            div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f0f0f0; padding:4px 0;';
            
            const chkId = 'rpa_aula_' + index;
            const doneId = 'rpa_done_' + index;
            
            div.innerHTML = '<label style="cursor:pointer; display:flex; align-items:center; gap:5px; flex:1; font-size:11px;"><input type="checkbox" class="rpa-aula-chk" id="' + chkId + '" data-val="' + val + '"> ' + label + '</label>' +
                '<label style="cursor:pointer; font-size:10px; color:' + (isDone ? '#38a169' : '#a0aec0') + '; font-weight:bold; display:flex; align-items:center; gap:2px;" title="Marcar como Lançado"><input type="checkbox" class="rpa-done-chk" id="' + doneId + '" ' + (isDone ? 'checked' : '') + '> ✅</label>';
            
            lista.appendChild(div);
            
            const doneChk = document.getElementById(doneId);
            doneChk.addEventListener('change', (e) => {
                window.extDoneMarks[markKey] = e.target.checked;
                try { localStorage.setItem('rpa_done_marks', JSON.stringify(window.extDoneMarks)); } catch (err) {}
                doneChk.parentElement.style.color = e.target.checked ? '#38a169' : '#a0aec0';
            });
        });
    };
    
    window.preencherTudoRPA = function() {
        if (!window.currentSelectedDate || !window.extHistory[window.currentSelectedDate]) {
            alert('Selecione um dia válido com dados primeiro.');
            return;
        }
        const btn = document.getElementById('rpaBtnPreencher');
        const oldText = btn.textContent;
        btn.textContent = '⏳ Preenchendo...';
        btn.disabled = true;
        btn.style.opacity = '0.6';
        
        window.selecionarDataSED(window.currentSelectedDate);
        setTimeout(() => {
            window.selecionarAulasSED();
            setTimeout(() => {
                const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
                let btnBuscar = null;
                buttons.forEach(b => {
                    const text = (b.innerText || b.value || '').toLowerCase();
                    if (text.includes('pesquisar') || text.includes('buscar') || text.includes('listar')) btnBuscar = b;
                });
                if (btnBuscar) btnBuscar.click();
                setTimeout(() => {
                    window.executarPreenchimentoRPA(window.extHistory[window.currentSelectedDate]);
                    btn.textContent = oldText;
                    btn.disabled = false;
                    btn.style.opacity = '1';
                }, 3000);
            }, 1200);
        }, 1000);
    };
    
    window.selecionarDataSED = function(dataStr) {
        if (!dataStr) return;
        const parts = dataStr.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        
        const monthSelect = document.querySelector('.ui-datepicker-month');
        const yearSelect = document.querySelector('.ui-datepicker-year');
        
        if (!monthSelect || !yearSelect) {
            console.warn("⚠️ Calendário não encontrado");
            return;
        }
        
        let changed = false;
        if (monthSelect.value != month) {
            monthSelect.value = month;
            monthSelect.dispatchEvent(new Event('change', { bubbles: true }));
            changed = true;
        }
        if (yearSelect.value != year) {
            yearSelect.value = year;
            yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
            changed = true;
        }
        
        const clickDay = () => {
            const cells = document.querySelectorAll('td[data-handler="selectDay"]');
            for (let i = 0; i < cells.length; i++) {
                const cellMonth = cells[i].getAttribute('data-month');
                const cellYear = cells[i].getAttribute('data-year');
                const link = cells[i].querySelector('a');
                if (cellMonth == month && cellYear == year && link && link.textContent.trim() == day) {
                    link.click();
                    return true;
                }
            }
            return false;
        };
        
        if (changed) {
            setTimeout(clickDay, 500);
        } else {
            clickDay();
        }
    };
    
    window.selecionarAulasSED = function() {
        const chks = document.querySelectorAll('.rpa-aula-chk:checked');
        if (chks.length === 0) return;
        const selecionados = Array.from(chks).map(c => c.getAttribute('data-val'));
        
        const btnAbrir = document.querySelector('.multi-select-button');
        if (btnAbrir) btnAbrir.click();
        
        setTimeout(() => {
            const checkboxes = document.querySelectorAll('.multi-select-menuitem input[type="checkbox"]');
            checkboxes.forEach(chk => {
                const val = chk.value;
                if (selecionados.includes(val) && !chk.checked) {
                    chk.click();
                } else if (!selecionados.includes(val) && chk.checked) {
                    chk.click();
                }
            });
            if (btnAbrir) btnAbrir.click();
        }, 300);
    };
    
    window.executarPreenchimentoRPA = function(payload) {
        const normalize = s => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase() : "";
        let interagidos = 0;
        
        if (payload.faltas) {
            const alunosAlvo = payload.faltas.map(a => normalize(a.nome));
            const cardsAlunos = document.querySelectorAll('.card_aluno1, .card_aluno, .grid-listagem > div[class*="card_aluno"]');
            if (cardsAlunos.length > 0) {
                cardsAlunos.forEach(card => {
                    const nomeElement = card.querySelector('.nome_aluno');
                    if (!nomeElement) return;
                    let nomeAluno = normalize(nomeElement.textContent).replace(/^\d+\s*[-.]?\s*/, '');
                    const checkbox = card.querySelector('.falta_presenca_container input[type="checkbox"], input[type="checkbox"]');
                    if (!checkbox) return;
                    const levouFalta = alunosAlvo.includes(nomeAluno);
                    if (levouFalta && !checkbox.checked) { checkbox.click(); interagidos++; }
                    else if (!levouFalta && checkbox.checked) { checkbox.click(); }
                });
            }
            
            // Tenta usar o botão "Marcar Falta em Massa" se disponível
            if (alunosAlvo.length > 3) {
                const btnFalta = document.querySelector('.btn_falta_presenca.falta');
                const btnPresenca = document.querySelector('.btn_falta_presenca.presenca');
                if (btnFalta && btnPresenca) {
                    // Se a maioria dos alunos da turma levou falta, usa marcar todos como falta
                    const totalCards = cardsAlunos.length;
                    if (totalCards > 0 && (alunosAlvo.length / totalCards) > 0.5) {
                        btnFalta.click();
                        interagidos++;
                    }
                }
            }
        }
        
        if (payload.registros && payload.registros.length > 0) {
            const txt = document.querySelector('textarea[name="o.Descricao"], textarea#conteudoAula, textarea.form-control, textarea');
            if (txt) {
                txt.value = payload.registros[0].conteudo;
                txt.dispatchEvent(new Event("input", { bubbles: true }));
                txt.dispatchEvent(new Event("change", { bubbles: true }));
                interagidos++;
            }
        }
        
        setTimeout(() => {
            if (interagidos > 0) {
                const btnSalvar = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a')).find(b => {
                    const text = (b.innerText || b.value || '').toLocaleLowerCase();
                    return text.includes('salvar') || text.includes('cadastrar') || text.includes('gravar') || text.includes('finalizar');
                });
                if (btnSalvar) {
                    btnSalvar.click();
                    alert('✅ Concluído! Lançamentos preenchidos e salvos na SED.');
                } else {
                    alert('✅ Concluído! ⚠️ Clique em "Salvar" manualmente se necessário.');
                }
            } else {
                alert('ℹ️ Nenhum dado pendente para esta data/turma.');
            }
        }, 800);
    };
    
    window.iniciarExtrairAlunos = function() {
        const cardsAlunos = document.querySelectorAll('.grid-listagem > div[class*="card_aluno"], .card_aluno1, .card_aluno');
        if (cardsAlunos.length === 0) return alert('Nenhum aluno na tela. Abra a Chamada da turma primeiro!');
        
        const alunos = [];
        cardsAlunos.forEach(card => {
            const nomeElement = card.querySelector('.nome_aluno');
            if (!nomeElement) return;
            let nomeCompleto = nomeElement.textContent.trim();
            nomeCompleto = nomeCompleto.replace(/^\d+\s*[-.]?\s*/, '');
            alunos.push({ nome: nomeCompleto.toUpperCase(), status: 'Ativo' });
        });
        
        let turmaSelecionada = "Desconhecida";
        const spans = document.querySelectorAll('.font-cabecalho-filtro');
        spans.forEach(span => {
            if (span.textContent.includes('Turma:')) turmaSelecionada = span.textContent.replace('Turma:', '').trim();
        });
        
        salvarAlunosNaNuvem(alunos, turmaSelecionada);
    };
    
    window.iniciarExtrairTodasTurmas = async function() {
        let selectTurma = document.querySelector('select#filtroTurma, select[name*="turma"]');
        let isCustomDropdown = false;
        let turmaWrapper = null;
        
        if (!selectTurma) {
            const labels = document.querySelectorAll('.form-label-dropdown');
            labels.forEach(l => {
                if (l.textContent.trim() === 'Turma') turmaWrapper = l.parentElement;
            });
            if (turmaWrapper) isCustomDropdown = true;
        }
        
        if (!selectTurma && !isCustomDropdown) {
            return alert('Filtro de turma não encontrado.');
        }
        
        const todasTurmas = [];
        
        if (!isCustomDropdown) {
            const options = Array.from(selectTurma.options).filter(o => o.value && o.text && !o.text.toLowerCase().includes('selecione') && !o.text.toLowerCase().includes('todos'));
            if (options.length === 0) return alert('Nenhuma turma encontrada.');
            if (!confirm('Processar ' + options.length + ' turmas automaticamente?\nNÃO CLIQUE em nada até terminar.')) return;
            
            for (let i = 0; i < options.length; i++) {
                const opt = options[i];
                selectTurma.value = opt.value;
                selectTurma.dispatchEvent(new Event('change', { bubbles: true }));
                
                const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
                let btnBuscar = null;
                buttons.forEach(b => {
                    const text = (b.innerText || b.value || '').toLowerCase();
                    if (text.includes('pesquisar') || text.includes('buscar')) btnBuscar = b;
                });
                if (btnBuscar) btnBuscar.click();
                
                await new Promise(r => setTimeout(r, 4000));
                
                const cardsAlunos = document.querySelectorAll('.grid-listagem > div[class*="card_aluno"], .card_aluno1, .card_aluno');
                const alunos = [];
                cardsAlunos.forEach(card => {
                    const nomeElement = card.querySelector('.nome_aluno');
                    if (!nomeElement) return;
                    let nomeCompleto = nomeElement.textContent.trim();
                    nomeCompleto = nomeCompleto.replace(/^\d+\s*[-.]?\s*/, '');
                    alunos.push({ nome: nomeCompleto.toUpperCase(), status: 'Ativo' });
                });
                
                if (alunos.length > 0) {
                    todasTurmas.push({ turmaSED: opt.text.trim(), alunos: alunos });
                }
            }
        } else {
            if (!confirm('Extrair todas as turmas automaticamente?\nNÃO CLIQUE EM NADA.')) return;
            
            const input = turmaWrapper.querySelector('input');
            input.click();
            await new Promise(r => setTimeout(r, 1000));
            
            const listItems = document.querySelectorAll('.custom-dropdown li');
            const optionsTexts = Array.from(listItems).map(li => li.textContent.trim()).filter(t => !t.toLowerCase().includes('selecione') && !t.toLowerCase().includes('todos'));
            
            input.click();
            await new Promise(r => setTimeout(r, 500));
            
            for (let i = 0; i < optionsTexts.length; i++) {
                const text = optionsTexts[i];
                input.click();
                await new Promise(r => setTimeout(r, 1000));
                
                const currentListItems = document.querySelectorAll('.custom-dropdown li');
                const targetLi = Array.from(currentListItems).find(li => li.textContent.trim() === text);
                if (targetLi) targetLi.click();
                
                await new Promise(r => setTimeout(r, 1000));
                
                const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
                let btnBuscar = null;
                buttons.forEach(b => {
                    const btext = (b.innerText || b.value || '').toLowerCase();
                    if (btext.includes('pesquisar') || btext.includes('buscar')) btnBuscar = b;
                });
                if (btnBuscar) btnBuscar.click();
                
                await new Promise(r => setTimeout(r, 4000));
                
                const cardsAlunos = document.querySelectorAll('.grid-listagem > div[class*="card_aluno"], .card_aluno1, .card_aluno');
                const alunos = [];
                cardsAlunos.forEach(card => {
                    const nomeElement = card.querySelector('.nome_aluno');
                    if (!nomeElement) return;
                    let nomeCompleto = nomeElement.textContent.trim();
                    nomeCompleto = nomeCompleto.replace(/^\d+\s*[-.]?\s*/, '');
                    alunos.push({ nome: nomeCompleto.toUpperCase(), status: 'Ativo' });
                });
                
                if (alunos.length > 0) {
                    todasTurmas.push({ turmaSED: text, alunos: alunos });
                }
            }
        }
        
        if (todasTurmas.length === 0) return alert('Nenhum aluno encontrado.');
        
        // Salva na nuvem
        if (todasTurmas.length === 1) {
            salvarAlunosNaNuvem(todasTurmas[0].alunos, todasTurmas[0].turmaSED);
        } else {
            // Salva múltiplas turmas
            salvarMultiplasTurmasNaNuvem(todasTurmas);
        }
    };
    
    window.carregarDadosDoStorage = function() {
        chrome.storage.local.get(['rpaTask', 'rpaType'], (result) => {
            if (result.rpaTask) {
                const dataStr = result.rpaTask.data || result.rpaTask.dataChamada || new Date().toISOString().split('T')[0];
                window.extHistory = {};
                window.extHistory[dataStr] = result.rpaTask;
                window.renderRpaHistory();
                atualizarStatusConexao('📦 Dados carregados do storage!', '#38a169');
            } else {
                atualizarStatusConexao('⚠️ Nenhum dado no storage. Use "🧩 Enviar para Extensão" no SisProf.', '#dd6b20');
            }
        });
    };
    
    window.abrirIframeConexao = function() {
        criarIframeConexao();
    };
    
    // Tenta carregar dados automaticamente
    setTimeout(() => {
        window.carregarDadosDoStorage();
    }, 500);
}

function criarIframeConexao() {
    // Remove iframe antigo se existir
    const oldIframe = document.getElementById('sisprof-iframe');
    if (oldIframe) oldIframe.remove();
    
    // Cria um iframe oculto para se comunicar com o SisProf via postMessage
    const iframe = document.createElement('iframe');
    iframe.id = 'sisprof-iframe';
    iframe.style.display = 'none';
    // A origem do iframe será o próprio SisProf (definido dinamicamente)
    document.body.appendChild(iframe);
    
    window.addEventListener('message', function(e) {
        if (e.data && e.data.type === 'SISPROF_RPA_DATA') {
            const payload = e.data.payload;
            if (payload && payload.history) {
                window.extHistory = payload.history;
            } else if (payload && payload.data) {
                window.extHistory = {};
                window.extHistory[payload.data] = payload;
            }
            
            try {
                const marks = localStorage.getItem('rpa_done_marks');
                if (marks) window.extDoneMarks = JSON.parse(marks);
                else window.extDoneMarks = {};
            } catch (err) { window.extDoneMarks = {}; }
            
            window.renderRpaHistory();
            
            atualizarStatusConexao('✅ Conectado ao SisProf! Dados carregados.', '#38a169');
        } else if (e.data && e.data.type === 'SISPROF_SAVE_SUCCESS') {
            alert('✅ Lista salva na nuvem com sucesso! Volte ao SisProf e clique em "Atualizar Turma (Puxar da Nuvem)".');
        } else if (e.data && e.data.type === 'SISPROF_SAVE_ERROR') {
            alert('Erro ao salvar na nuvem: ' + e.data.error);
        } else if (e.data && e.data.type === 'EXT_LOADED') {
            atualizarStatusConexao('✅ Extensão ativa!', '#38a169');
        }
    });
    
    // Avisa o iframe (quando carregar) que a extensão está pronta
    setTimeout(() => {
        try {
            iframe.contentWindow.postMessage({ type: 'EXT_LOADED' }, '*');
        } catch (e) {}
    }, 2000);
}

function atualizarStatusConexao(texto, cor) {
    const el = document.getElementById('rpaStatusConexao');
    if (el) {
        el.textContent = texto;
        el.style.background = cor ? (cor + '18') : '#edf2f7';
        el.style.color = cor || '#718096';
        el.style.fontWeight = 'bold';
    }
}

function salvarAlunosNaNuvem(alunos, turmaSED) {
    const payload = {
        type: 'SISPROF_IMPORT_ALUNOS',
        alunos: alunos,
        turmaSED: turmaSED,
        timestamp: Date.now()
    };
    
    // Tenta salvar via iframe
    const frame = document.getElementById('sisprof-iframe');
    if (frame) {
        frame.contentWindow.postMessage({ type: 'SISPROF_SAVE_ALUNOS', payload: payload }, '*');
    } else {
        // Fallback: salva no storage para o app.js pegar depois
        try {
            localStorage.setItem('rpa_import_pending', JSON.stringify(payload));
            alert(`✅ ${alunos.length} aluno(s) extraídos!\n\nVolte ao SisProf e clique em "Atualizar Turma (Puxar da Nuvem)".`);
        } catch (e) {
            alert('Erro ao salvar localmente.');
        }
    }
}

function salvarMultiplasTurmasNaNuvem(turmas) {
    const payload = {
        type: 'SISPROF_IMPORT_ALUNOS_MULTI',
        turmas: turmas,
        timestamp: Date.now()
    };
    
    const frame = document.getElementById('sisprof-iframe');
    if (frame) {
        frame.contentWindow.postMessage({ type: 'SISPROF_SAVE_ALUNOS', payload: payload }, '*');
    } else {
        try {
            localStorage.setItem('rpa_import_pending_multi', JSON.stringify(payload));
            alert(`✅ ${turmas.length} turma(s) extraídas! Volte ao SisProf e atualize.`);
        } catch (e) {
            alert('Erro ao salvar.');
        }
    }
}

// ============================================================
// AUTOMAÇÃO EM SEGUNDO PLANO (ORIGINAL)
// ============================================================

const CONFIG = {
    DELAY_SHORT: 800,
    DELAY_MEDIUM: 1500,
    DELAY_LONG: 3000,
    SELECTOR_MONTH: '.ui-datepicker-month',
    SELECTOR_YEAR: '.ui-datepicker-year',
    SELECTOR_DAY_CELL: 'td[data-handler="selectDay"]',
    SELECTOR_MULTI_BUTTON: '.multi-select-button',
    SELECTOR_AULA_CHECKBOX: '.multi-select-menuitem input[type="checkbox"]',
    SELECTOR_CARD_ALUNO: '.card_aluno',
    SELECTOR_NOME_ALUNO: '.nome_aluno'
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizarNome(nome) {
    if (!nome) return '';
    return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function encontrarBotao(textos) {
    const botoes = document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn');
    for (const btn of botoes) {
        const texto = (btn.innerText || btn.value || '').toLowerCase();
        for (const termo of textos) {
            if (texto.includes(termo)) return btn;
        }
    }
    return null;
}

async function aguardarPaginaPronta() {
    for (let i = 0; i < 30; i++) {
        const loadingModal = document.querySelector('.modal-loading');
        if (!loadingModal || loadingModal.style.display === 'none') {
            if (document.querySelector(CONFIG.SELECTOR_MONTH)) {
                return true;
            }
        }
        await sleep(1000);
    }
    return false;
}

function estaLogado() {
    if (document.querySelector('input[type="password"]')) return false;
    if (document.querySelector('.usuario-nome, .perfil-wrapper')) return true;
    return false;
}

async function executarAutomacaoAutomatica() {
    const result = await chrome.storage.local.get(['rpaTask', 'rpaType']);
    if (!result.rpaTask) return;
    
    const payload = result.rpaTask;
    const tipo = result.rpaType || 'CHAMADA';
    
    if (!estaLogado()) {
        for (let i = 0; i < 60; i++) {
            await sleep(1000);
            if (estaLogado()) break;
        }
        if (!estaLogado()) return;
    }
    
    // Injeta o menu flutuante com os dados
    if (!window.sisprofRoboAtivo) {
        injetarMenuFlutuante();
        await sleep(1000);
    }
    
    // Carrega os dados do storage no menu
    const dataStr = payload.data || payload.dataChamada || new Date().toISOString().split('T')[0];
    window.extHistory = {};
    window.extHistory[dataStr] = payload;
    
    setTimeout(() => {
        window.renderRpaHistory();
    }, 1500);
    
    // Limpa a tarefa do storage (já foi lida)
    chrome.storage.local.remove(['rpaTask', 'rpaType']);
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

(async () => {
    await aguardarPaginaPronta();
    
    // Injeta o menu flutuante SEMPRE que a página carregar
    injetarMenuFlutuante();
    
    // Tenta executar automação automática se houver tarefa pendente
    executarAutomacaoAutomatica();
})();