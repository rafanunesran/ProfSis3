// CONTENT SCRIPT - Sala do Futuro SED (Blazor)
// Injeta o menu flutuante do Robô SisProf

console.log("🤖 content_sed.js EXECUTADO!");

function injetarMenu() {
    if (document.getElementById('sisprof-menu-flutuante')) return;
    
    // Aguarda o body existir
    if (!document.body) {
        setTimeout(injetarMenu, 500);
        return;
    }
    
    console.log("🔄 Injetando menu flutuante...");
    
    var div = document.createElement('div');
    div.id = 'sisprof-menu-flutuante';
    div.style.cssText = 'position:fixed; top:20px; right:20px; width:300px; background:white; border:3px solid #38a169; border-radius:10px; z-index:999999; padding:20px; font-family:Arial; box-shadow:0 5px 20px rgba(0,0,0,0.5);';
    div.innerHTML = 
        '<div style="background:#38a169; color:white; margin:-20px -20px 15px -20px; padding:12px 20px; border-radius:8px 8px 0 0; font-weight:bold; display:flex; justify-content:space-between; align-items:center;">' +
            '<span>🤖 Robô SisProf</span>' +
            '<span id="sisprof-fechar" style="cursor:pointer; font-size:20px;">✖</span>' +
        '</div>' +
        '<p style="margin:0 0 10px 0; color:#4a5568; font-size:13px;">✅ Extensão funcionando!</p>' +
        '<div style="background:#f0fff4; padding:10px; border-radius:8px; border:1px solid #c6f6d5; margin-bottom:10px;">' +
            '<p style="font-size:11px; color:#276749; margin:0 0 6px 0; font-weight:bold;">📦 Status:</p>' +
            '<div id="sisprof-status" style="font-size:11px; color:#718096;">Verificando...</div>' +
        '</div>' +
        '<button id="sisprof-btn-preencher" style="width:100%; background:#3182ce; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:13px; margin-bottom:8px;">1️⃣ Preencher Chamada</button>' +
        '<button id="sisprof-btn-extrair" style="width:100%; background:#38a169; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px;">📥 Extrair Alunos</button>';
    
    document.body.appendChild(div);
    console.log("✅ Menu injetado!");
    
    // Evento fechar
    document.getElementById('sisprof-fechar').onclick = function() { div.remove(); };
    
    // Evento preencher
    document.getElementById('sisprof-btn-preencher').onclick = function() {
        chrome.storage.local.get(['rpaTask'], function(result) {
            if (!result.rpaTask) {
                alert('Nenhum dado. Use "Enviar para Extensão" no SisProf primeiro.');
                return;
            }
            alert('✅ Dados carregados! Iniciando preenchimento...');
            var payload = result.rpaTask;
            var dataStr = payload.data || payload.dataChamada;
            
            if (dataStr) {
                var parts = dataStr.split('-');
                var month = parseInt(parts[1], 10) - 1;
                var day = parseInt(parts[2], 10);
                var year = parseInt(parts[0], 10);
                
                var ms = document.querySelector('.ui-datepicker-month');
                var ys = document.querySelector('.ui-datepicker-year');
                if (ms && ys) {
                    if (ms.value != month) { ms.value = month; ms.dispatchEvent(new Event('change', {bubbles:true})); }
                    if (ys.value != year) { ys.value = year; ys.dispatchEvent(new Event('change', {bubbles:true})); }
                    setTimeout(function() {
                        var cells = document.querySelectorAll('td[data-handler="selectDay"]');
                        for (var i = 0; i < cells.length; i++) {
                            var a = cells[i].querySelector('a');
                            if (cells[i].getAttribute('data-month') == month && cells[i].getAttribute('data-year') == year && a && a.textContent.trim() == day) {
                                a.click(); break;
                            }
                        }
                    }, 500);
                }
            }
            
            setTimeout(function() {
                var btns = document.querySelectorAll('button');
                for (var i = 0; i < btns.length; i++) {
                    var t = (btns[i].innerText || '').toLowerCase();
                    if (t.indexOf('pesquisar') >= 0 || t.indexOf('buscar') >= 0) { btns[i].click(); break; }
                }
                setTimeout(function() {
                    var faltas = payload.faltas || [];
                    if (faltas.length > 0) {
                        var fn = faltas.map(function(a) { return a.nome ? a.nome.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim() : ''; });
                        document.querySelectorAll('.card_aluno').forEach(function(c) {
                            var ne = c.querySelector('.nome_aluno');
                            if (!ne) return;
                            var n = ne.textContent.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim().replace(/^\d+\s*[-.]?\s*/,'');
                            var ch = c.querySelector('input[type="checkbox"]');
                            if (!ch) return;
                            if (fn.indexOf(n) >= 0 && !ch.checked) ch.click();
                            else if (fn.indexOf(n) < 0 && ch.checked) ch.click();
                        });
                    }
                    var regs = payload.registros || [];
                    if (regs.length > 0 && regs[0].conteudo) {
                        var ta = document.querySelector('textarea');
                        if (ta) { ta.value = regs[0].conteudo; ta.dispatchEvent(new Event('input', {bubbles:true})); }
                    }
                    setTimeout(function() {
                        var btns2 = document.querySelectorAll('button');
                        for (var i = 0; i < btns2.length; i++) {
                            var t2 = (btns2[i].innerText || '').toLowerCase();
                            if (t2.indexOf('salvar') >= 0 || t2.indexOf('gravar') >= 0) { btns2[i].click(); alert('✅ Salvo!'); return; }
                        }
                        alert('✅ Preenchido! Clique em Salvar manualmente.');
                    }, 1000);
                }, 2000);
            }, 1500);
        });
    };
    
    // Evento extrair
    document.getElementById('sisprof-btn-extrair').onclick = function() {
        var cards = document.querySelectorAll('.card_aluno');
        if (cards.length === 0) { alert('Nenhum aluno. Abra a Chamada primeiro.'); return; }
        var alunos = [];
        cards.forEach(function(c) {
            var ne = c.querySelector('.nome_aluno');
            if (!ne) return;
            alunos.push({ nome: ne.textContent.trim().replace(/^\d+\s*[-.]?\s*/,'').toUpperCase(), status: 'Ativo' });
        });
        var turma = "Desconhecida";
        document.querySelectorAll('.font-cabecalho-filtro').forEach(function(s) {
            if (s.textContent.indexOf('Turma:') >= 0) turma = s.textContent.replace('Turma:','').trim();
        });
        try {
            localStorage.setItem('rpa_import_pending', JSON.stringify({alunos:alunos, turmaSED:turma, timestamp:Date.now()}));
            alert('✅ ' + alunos.length + ' aluno(s) extraídos! Volte ao SisProf e clique em "Atualizar Turma".');
        } catch(e) { alert('Erro ao salvar.'); }
    };
    
    // Verifica storage
    setTimeout(function() {
        chrome.storage.local.get(['rpaTask'], function(result) {
            var el = document.getElementById('sisprof-status');
            if (el) {
                el.innerHTML = result.rpaTask ? '✅ Dados prontos! Clique em "Preencher Chamada".' : '⏳ Aguardando dados do SisProf...';
                el.style.color = result.rpaTask ? '#38a169' : '#718096';
            }
        });
    }, 500);
}

// Tenta injetar a cada 2 segundos até conseguir (lida com Blazor que carrega dinamicamente)
var tentativas = 0;
var intervalo = setInterval(function() {
    tentativas++;
    if (document.body && !document.getElementById('sisprof-menu-flutuante')) {
        try { injetarMenu(); } catch(e) { console.error("Erro:", e); }
    }
    if (document.getElementById('sisprof-menu-flutuante') || tentativas > 20) {
        clearInterval(intervalo);
    }
}, 2000);

// Também tenta imediatamente
setTimeout(injetarMenu, 1000);