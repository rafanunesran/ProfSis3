// CONTENT SCRIPT - Sala do Futuro SED
// Injeta o menu flutuante do Robô SisProf

console.log("🤖 Robô do ProfSis3: content_sed.js CARREGADO!");

// ============================================================
// INJETAR MENU FLUTUANTE (VERSÃO MÁXIMA SIMPLICIDADE)
// ============================================================
function injetarMenu() {
    // Evita duplicar
    if (document.getElementById('sisprof-menu-flutuante')) {
        return;
    }
    
    console.log("🔄 Injetando menu flutuante...");
    
    var ui = document.createElement('div');
    ui.id = 'sisprof-menu-flutuante';
    ui.style.cssText = 'position:fixed; top:20px; right:20px; width:300px; background:white; border:2px solid #38a169; border-radius:10px; z-index:999999; box-shadow:0 5px 20px rgba(0,0,0,0.3); font-family:Arial,sans-serif;';
    
    ui.innerHTML = 
        '<div style="background:#38a169; color:white; padding:10px 14px; font-weight:bold; display:flex; justify-content:space-between; align-items:center; font-size:14px; border-radius:8px 8px 0 0;">' +
            '<span>🤖 Robô SisProf</span>' +
            '<span id="sisprof-fechar" style="cursor:pointer; font-size:18px;">✖</span>' +
        '</div>' +
        '<div style="padding:14px;">' +
            '<p style="font-size:12px; color:#4a5568; margin:0 0 10px 0;">✅ Extensão ativa!</p>' +
            '<div style="background:#f0fff4; padding:10px; border-radius:8px; border:1px solid #c6f6d5; margin-bottom:10px;">' +
                '<p style="font-size:11px; color:#276749; margin:0 0 6px 0; font-weight:bold;">📦 Status:</p>' +
                '<div id="sisprof-status" style="font-size:11px; color:#718096;">Verificando storage...</div>' +
            '</div>' +
            '<button id="sisprof-btn-preencher" style="width:100%; background:#3182ce; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:13px; margin-bottom:8px;">1️⃣ Preencher Chamada</button>' +
            '<button id="sisprof-btn-extrair" style="width:100%; background:#38a169; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px;">📥 Extrair Alunos</button>' +
        '</div>';
    
    document.body.appendChild(ui);
    
    // Evento fechar
    document.getElementById('sisprof-fechar').onclick = function() {
        ui.remove();
    };
    
    // Evento preencher
    document.getElementById('sisprof-btn-preencher').onclick = function() {
        chrome.storage.local.get(['rpaTask'], function(result) {
            if (!result.rpaTask) {
                alert('Nenhum dado. Use "Enviar para Extensão" no SisProf primeiro.');
                return;
            }
            var payload = result.rpaTask;
            var dataStr = payload.data || payload.dataChamada;
            
            if (dataStr) {
                var parts = dataStr.split('-');
                var year = parseInt(parts[0], 10);
                var month = parseInt(parts[1], 10) - 1;
                var day = parseInt(parts[2], 10);
                
                var monthSelect = document.querySelector('.ui-datepicker-month');
                var yearSelect = document.querySelector('.ui-datepicker-year');
                
                if (monthSelect && yearSelect) {
                    if (monthSelect.value != month) {
                        monthSelect.value = month;
                        monthSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    if (yearSelect.value != year) {
                        yearSelect.value = year;
                        yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    
                    setTimeout(function() {
                        var cells = document.querySelectorAll('td[data-handler="selectDay"]');
                        for (var i = 0; i < cells.length; i++) {
                            var cm = cells[i].getAttribute('data-month');
                            var cy = cells[i].getAttribute('data-year');
                            var a = cells[i].querySelector('a');
                            if (cm == month && cy == year && a && a.textContent.trim() == day) {
                                a.click();
                                break;
                            }
                        }
                    }, 500);
                }
            }
            
            setTimeout(function() {
                var botoes = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
                for (var i = 0; i < botoes.length; i++) {
                    var txt = (botoes[i].innerText || botoes[i].value || '').toLowerCase();
                    if (txt.indexOf('pesquisar') >= 0 || txt.indexOf('buscar') >= 0 || txt.indexOf('listar') >= 0) {
                        botoes[i].click();
                        break;
                    }
                }
                
                setTimeout(function() {
                    var faltas = payload.faltas || [];
                    if (faltas.length > 0) {
                        var nomesFalt = faltas.map(function(a) {
                            return a.nome ? a.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim() : '';
                        });
                        
                        var cards = document.querySelectorAll('.card_aluno');
                        cards.forEach(function(card) {
                            var nomeEl = card.querySelector('.nome_aluno');
                            if (!nomeEl) return;
                            var nome = nomeEl.textContent.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
                            nome = nome.replace(/^\d+\s*[-.]?\s*/, '');
                            var chk = card.querySelector('input[type="checkbox"]');
                            if (!chk) return;
                            if (nomesFalt.indexOf(nome) >= 0 && !chk.checked) {
                                chk.click();
                            } else if (nomesFalt.indexOf(nome) < 0 && chk.checked) {
                                chk.click();
                            }
                        });
                    }
                    
                    var registros = payload.registros || [];
                    if (registros.length > 0 && registros[0].conteudo) {
                        var txt = document.querySelector('textarea');
                        if (txt) {
                            txt.value = registros[0].conteudo;
                            txt.dispatchEvent(new Event("input", { bubbles: true }));
                            txt.dispatchEvent(new Event("change", { bubbles: true }));
                        }
                    }
                    
                    setTimeout(function() {
                        var botoes2 = document.querySelectorAll('button, input[type="button"], input[type="submit"], a');
                        for (var i = 0; i < botoes2.length; i++) {
                            var txt2 = (botoes2[i].innerText || botoes2[i].value || '').toLowerCase();
                            if (txt2.indexOf('salvar') >= 0 || txt2.indexOf('gravar') >= 0 || txt2.indexOf('finalizar') >= 0) {
                                botoes2[i].click();
                                alert('✅ Chamada preenchida e salva!');
                                chrome.storage.local.remove(['rpaTask', 'rpaType']);
                                return;
                            }
                        }
                        alert('✅ Preenchido! Clique em "Salvar" manualmente.');
                        chrome.storage.local.remove(['rpaTask', 'rpaType']);
                    }, 1000);
                }, 2000);
            }, 1500);
        });
    };
    
    // Evento extrair
    document.getElementById('sisprof-btn-extrair').onclick = function() {
        var cards = document.querySelectorAll('.card_aluno');
        if (cards.length === 0) {
            alert('Nenhum aluno. Abra a Chamada primeiro.');
            return;
        }
        var alunos = [];
        cards.forEach(function(card) {
            var nomeEl = card.querySelector('.nome_aluno');
            if (!nomeEl) return;
            var nome = nomeEl.textContent.trim().replace(/^\d+\s*[-.]?\s*/, '');
            alunos.push({ nome: nome.toUpperCase(), status: 'Ativo' });
        });
        var turma = "Desconhecida";
        var spans = document.querySelectorAll('.font-cabecalho-filtro');
        spans.forEach(function(s) {
            if (s.textContent.indexOf('Turma:') >= 0) turma = s.textContent.replace('Turma:', '').trim();
        });
        try {
            localStorage.setItem('rpa_import_pending', JSON.stringify({ alunos: alunos, turmaSED: turma, timestamp: Date.now() }));
            alert('✅ ' + alunos.length + ' aluno(s) extraídos! Volte ao SisProf e clique em "Atualizar Turma".');
        } catch(e) {
            alert('Erro ao salvar.');
        }
    };
    
    // Verifica storage
    setTimeout(function() {
        chrome.storage.local.get(['rpaTask'], function(result) {
            var el = document.getElementById('sisprof-status');
            if (el) {
                if (result.rpaTask) {
                    el.innerHTML = '✅ Dados prontos! Clique em "Preencher Chamada".';
                    el.style.color = '#38a169';
                } else {
                    el.innerHTML = '⏳ Aguardando dados do SisProf...';
                    el.style.color = '#718096';
                }
            }
        });
    }, 500);
    
    console.log("✅ Menu flutuante injetado!");
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

// Tenta injetar imediatamente
try {
    injetarMenu();
} catch(e) {
    console.error("Erro ao injetar menu:", e);
}

// Tenta novamente após 1s (caso o DOM não estivesse pronto)
setTimeout(function() {
    if (!document.getElementById('sisprof-menu-flutuante')) {
        try {
            injetarMenu();
        } catch(e) {
            console.error("Erro 2ª tentativa:", e);
        }
    }
}, 1000);

// Tenta novamente após 3s
setTimeout(function() {
    if (!document.getElementById('sisprof-menu-flutuante')) {
        try {
            injetarMenu();
        } catch(e) {
            console.error("Erro 3ª tentativa:", e);
        }
    }
}, 3000);