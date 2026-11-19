// mudanca_endereco.js — aviso de que o site mudou de endereço (SisProf virou EdiProf).
//
// O endereço antigo (rafanunesran.github.io/ProfSis3) continua funcionando igual. Este
// arquivo só mostra, nele, um cartão flutuante com o endereço novo. O cartão NÃO cobre a
// tela: o resto do site segue clicável por trás.
//
// Quando aparece:
//   - só no github.io, no navegador (no endereço novo, no app Android e em qualquer
//     outro lugar não aparece);
//   - uma vez por aparelho (fica guardado no localStorage);
//   - se a pessoa já tinha visto o aviso comum e depois entra com uma conta que
//     assina um plano, aparece de novo UMA vez, na versão para assinantes.
//
// Atenção: localStorage e IndexedDB são separados por endereço. No endereço novo o
// aparelho é como um aparelho novo: entra com o mesmo e-mail e senha e os dados vêm da
// nuvem. Por isso o aviso oferece baixar a cópia de segurança antes de ir.

(function () {
    const ENDERECO_NOVO = 'https://ediprof.vercel.app/';
    const CHAVE_VISTO = 'ediprof_aviso_endereco_v1';   // '' | 'geral' | 'assinante'

    function noEnderecoAntigo() {
        if (!/(^|\.)github\.io$/i.test(location.hostname)) return false;
        // O app Android (APK) ainda abre o github.io por dentro. Lá o aviso só confundiria:
        // o botão levaria para o endereço novo e, na próxima abertura, o app voltaria ao antigo.
        if (/; wv\)/.test(navigator.userAgent || '')) return false;
        return true;
    }

    function ler() { try { return localStorage.getItem(CHAVE_VISTO) || ''; } catch (e) { return ''; } }
    function guardar(v) { try { localStorage.setItem(CHAVE_VISTO, v); } catch (e) { /* aba anônima */ } }

    function usuario() {
        try { return (typeof currentUser !== 'undefined') ? currentUser : null; } catch (e) { return null; }
    }

    function ehAssinante() {
        try {
            if (!usuario()) return false;
            if (usuario().role === 'super_admin') return false; // o dono não precisa do destaque
            return typeof planoDoUsuario === 'function' && planoDoUsuario() !== 'free';
        } catch (e) { return false; }
    }

    function nomeDoPlano() {
        try { return (typeof infoPlanoAtual === 'function' && infoPlanoAtual().nome) || ''; } catch (e) { return ''; }
    }

    function estilo() {
        if (document.getElementById('estiloAvisoEndereco')) return;
        const s = document.createElement('style');
        s.id = 'estiloAvisoEndereco';
        s.textContent = `
#avisoEndereco { position: fixed; right: 16px; bottom: 16px; z-index: 1500; width: min(380px, calc(100vw - 32px));
  background: var(--bg-card, #fff); color: var(--text, #1f2430); border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0,0,0,.25); border: 1px solid rgba(0,0,0,.08); padding: 18px 18px 16px;
  font-size: 14px; line-height: 1.45; animation: avisoEndSobe 260ms cubic-bezier(.2,.8,.2,1); }
@keyframes avisoEndSobe { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { #avisoEndereco { animation: none; } }
#avisoEndereco .ae-fechar { position: absolute; top: 8px; right: 8px; width: 32px; height: 32px; border: 0;
  background: transparent; color: inherit; font-size: 20px; line-height: 1; cursor: pointer; border-radius: 8px; opacity: .7; padding: 0; }
#avisoEndereco .ae-fechar:hover { opacity: 1; background: rgba(0,0,0,.06); }
#avisoEndereco .ae-titulo { font-size: 16px; font-weight: 700; margin: 0 28px 6px 0; }
#avisoEndereco .ae-texto { margin: 0 0 10px; }
#avisoEndereco .ae-endereco { display: block; font-weight: 700; word-break: break-all; margin: 0 0 12px;
  padding: 8px 10px; border-radius: 8px; background: rgba(0,0,0,.05); color: inherit; text-decoration: none; }
#avisoEndereco .ae-assinante { margin: 0 0 12px; padding: 10px 12px; border-radius: 10px;
  background: #fff6db; color: #5a4300; border: 1px solid #f5d77a; font-size: 13px; }
#avisoEndereco .ae-passos { margin: 0 0 12px; padding-left: 18px; font-size: 13px; }
#avisoEndereco .ae-passos li { margin-bottom: 3px; }
#avisoEndereco .ae-botoes { display: flex; flex-wrap: wrap; gap: 8px; }
#avisoEndereco .ae-botoes button, #avisoEndereco .ae-botoes a { flex: 1 1 auto; min-height: 40px; border-radius: 10px;
  font-size: 14px; font-weight: 600; cursor: pointer; padding: 8px 12px; text-align: center; text-decoration: none;
  display: inline-flex; align-items: center; justify-content: center; }
#avisoEndereco .ae-ir { background: var(--accent, #2563eb); color: #fff; border: 0; }
#avisoEndereco .ae-depois { background: transparent; color: inherit; border: 1px solid rgba(0,0,0,.18); }
#avisoEndereco .ae-copia { background: transparent; color: inherit; border: 1px dashed rgba(0,0,0,.25); flex-basis: 100%; }
@media (max-width: 520px) { #avisoEndereco { right: 16px; left: 16px; bottom: 12px; width: auto; } }`;
        document.head.appendChild(s);
    }

    function fechar(marca) {
        guardar(marca);
        const el = document.getElementById('avisoEndereco');
        if (el) el.remove();
    }

    function mostrar(assinante) {
        if (document.getElementById('avisoEndereco')) {
            // Já está na tela na versão comum e agora sabemos que é assinante: troca.
            if (!assinante || document.getElementById('avisoEndereco').dataset.assinante === '1') return;
            document.getElementById('avisoEndereco').remove();
        }
        estilo();
        const logado = !!usuario();
        const plano = assinante ? nomeDoPlano() : '';
        const marca = assinante ? 'assinante' : 'geral';

        const el = document.createElement('div');
        el.id = 'avisoEndereco';
        el.dataset.assinante = assinante ? '1' : '0';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-labelledby', 'avisoEnderecoTitulo');
        el.innerHTML =
            '<button type="button" class="ae-fechar" aria-label="Fechar aviso">×</button>' +
            '<p class="ae-titulo" id="avisoEnderecoTitulo">📢 O SisProf agora é EdiProf</p>' +
            '<p class="ae-texto">Mudamos de nome e de endereço. Este endereço continua funcionando por enquanto, ' +
            'e o novo abre também nas escolas que bloqueiam o antigo. Salve o novo nos favoritos:</p>' +
            '<a class="ae-endereco" href="' + ENDERECO_NOVO + '">ediprof.vercel.app</a>' +
            (assinante
                ? '<div class="ae-assinante"><b>💛 Sua assinatura' + (plano ? ' (' + plano + ')' : '') +
                  ' continua valendo.</b> Entre no endereço novo com o <b>mesmo e-mail e senha</b>: o plano, as turmas ' +
                  'e os dados vão junto. Não precisa pagar de novo.</div>'
                : '<ol class="ae-passos"><li>Abra <b>ediprof.vercel.app</b>.</li>' +
                  '<li>Entre com o <b>mesmo e-mail e senha</b> de sempre.</li>' +
                  '<li>Seus dados vêm da nuvem. Se instalou o app na tela inicial, instale de novo pelo endereço novo.</li></ol>') +
            '<div class="ae-botoes">' +
                '<a class="ae-ir" href="' + ENDERECO_NOVO + '">Ir para o EdiProf</a>' +
                '<button type="button" class="ae-depois">Agora não</button>' +
                (logado && typeof exportarArquivoProfsis === 'function'
                    ? '<button type="button" class="ae-copia">💾 Antes, baixar minha cópia de segurança</button>' : '') +
            '</div>';
        document.body.appendChild(el);

        el.querySelector('.ae-fechar').onclick = () => fechar(marca);
        el.querySelector('.ae-depois').onclick = () => fechar(marca);
        el.querySelector('.ae-ir').addEventListener('click', () => guardar(marca));
        const copia = el.querySelector('.ae-copia');
        if (copia) copia.onclick = () => { try { exportarArquivoProfsis(); } catch (e) { /* o próprio botão avisa */ } };
    }

    function verificar() {
        if (!noEnderecoAntigo()) return;
        const visto = ler();
        if (visto === 'assinante') return;
        const assinante = ehAssinante();
        if (visto === 'geral' && !assinante) return;
        mostrar(assinante);
    }

    window.verificarAvisoEndereco = verificar;

    if (!noEnderecoAntigo()) return;

    // Primeiro aviso logo depois que a página abre; depois confere de tempos em tempos
    // (por uns 10 minutos) se a pessoa entrou e é assinante, para mostrar o destaque.
    function comecar() {
        setTimeout(verificar, 1500);
        let voltas = 0;
        const t = setInterval(() => {
            voltas++;
            if (ler() === 'assinante' || voltas > 120) { clearInterval(t); return; }
            if (usuario()) verificar();
        }, 5000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', comecar);
    else comecar();
})();
