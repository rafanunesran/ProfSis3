// TESTE MÍNIMO - content_sed.js
console.log("🤖 content_sed.js EXECUTADO!");

// Tenta criar um elemento visível imediatamente
try {
    var div = document.createElement('div');
    div.id = 'sisprof-menu-flutuante';
    div.style.cssText = 'position:fixed; top:20px; right:20px; width:300px; background:white; border:3px solid red; border-radius:10px; z-index:999999; padding:20px; font-family:Arial; box-shadow:0 5px 20px rgba(0,0,0,0.5);';
    div.innerHTML = '<h3 style="margin:0 0 10px 0; color:#333;">🤖 Robô SisProf</h3><p style="margin:0; color:#666; font-size:13px;">✅ Extensão funcionando!</p><button id="btnTeste" style="margin-top:10px; padding:8px 16px; background:#38a169; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">Testar Storage</button>';
    document.body.appendChild(div);
    console.log("✅ Menu injetado com sucesso!");
    
    document.getElementById('btnTeste').onclick = function() {
        chrome.storage.local.get(['rpaTask'], function(result) {
            alert('Storage: ' + (result.rpaTask ? '✅ Dados encontrados!' : '⚠️ Nenhum dado.'));
        });
    };
} catch(e) {
    console.error("❌ Erro ao injetar menu:", e);
    alert("Erro na extensão: " + e.message);
}