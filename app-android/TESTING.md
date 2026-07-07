# Checklist de verificação manual — ProfSis3 SED (Android)

Não há harness de testes automatizados neste projeto (nem no repo original da extensão).
Verificação é manual, num dispositivo/emulador real, após instalar o APK gerado (debug
via CI, ou `./gradlew assembleDebug` localmente com Android Studio/JDK instalados).

## Antes de instalar

- [ ] Rodar `npm run prebuild` (ou deixar o CI rodar) para garantir que `vendor/*.js` e
      os bundles em `android/app/src/main/assets/bundles/` estão atualizados com a
      versão mais recente de `extensao-profsis/`.
- [x] Navegação é livre (sem whitelist de domínios) desde que o login gov.br mostrou
      dificuldade passando por domínios não previstos (ex: verificação/MFA). O app não
      bloqueia mais nenhum domínio — ver `webview/BundleInjectingWebViewClient.kt`.

## Fluxo principal

1. **Instalação limpa** → abrir o app → SED carrega direto na WebView (sem passar por
   nenhuma tela intermediária) → login gov.br completa normalmente (navegação livre,
   sem bloqueio de domínio) → o painel flutuante do `content_sed.js` aparece com a
   versão correta (`chrome.runtime.getManifest().version`).
2. **Persistência de sessão**: matar o app completamente (remover dos recentes) e
   reabrir → sessão do SED/gov.br continua logada (valida `CookieManager`/`flush()`
   em `MainActivity.onPause`).
3. **Login inicial do ProfSis**: tocar "Abrir ProfSis" no painel do SED → abre
   `ProfSisLoginActivity` → fazer login → conferir (via `adb shell run-as
   com.profsis3.sed cat /data/data/com.profsis3.sed/shared_prefs/profsis_storage.xml`
   ou logs) que `profsis_logged_in`/`profsis_user`/`profsis_firebase_session` foram
   gravados → fechar essa tela (seta "up") → voltar para o SED e recarregar a página →
   o painel deve reconhecer o login (`CHECK_PROFSIS_LOGIN` resolvendo `loggedIn: true`
   só via storage, sem precisar abrir a tela do ProfSis de novo).
4. **Extração de alunos** (teste mais crítico): numa turma real, usar "Extrair Alunos"
   → confirmar que os dados aparecem no Firestore do projeto ProfSis (banco real) via
   o caminho `atualizarAlunosDiretoFirebase` — isso valida a premissa central do
   projeto: com `chrome.tabs.query` sempre retornando `[]`, o background.js precisa
   cair automaticamente no fallback de escrita direta via REST, sem qualquer edição
   de código.
5. **Robustez do fluxo "Auto"**: iniciar o preenchimento automático de Chamada/Registro,
   matar o app no meio do processo, reabrir → conferir que o painel não duplica
   listeners/intervals (guard `window.__sisprofSedInjected` no bundle) e que o estado
   do fluxo (`rpa_auto_workflow`, armazenado via `chrome.storage.local`) sobrevive à
   reabertura.

## Coisas para observar (podem indicar regressão)

- Qualquer chamada JS que lance `TypeError: chrome.X is not a function` no
  `console.log` do WebView (visível via `chrome://inspect` conectando o dispositivo)
  indica uma API do shim (`www/shim/chrome-shim.js`) não coberta — checar contra o
  código real de `vendor/background.js`/`vendor/content_sed.js`/`vendor/content_profsis.js`.
- SPA do SED pode não redisparar `onPageFinished` em navegação interna de rota — se o
  painel sumir depois de navegar dentro do próprio SED, pode ser necessário revisar o
  gatilho de reinjeção do bundle (hoje só o listener `onPageFinished` em
  `BundleInjectingWebViewClient`).
