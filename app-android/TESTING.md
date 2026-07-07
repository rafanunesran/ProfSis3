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
3. **Login inicial do ProfSis + sincronismo de aulas/registros**: tocar na aba
   "ProfSis" da barra inferior (ou deixar o botão "Abrir ProfSis" do painel do SED
   trocar de aba sozinho) → fazer login → **voltar pra aba "Sala do Futuro"
   imediatamente, sem esperar** → aguardar uns 15s com o app em primeiro plano (a
   WebView do ProfSis continua rodando escondida, com `visibility=GONE`, não é
   destruída) → conferir (via `adb shell run-as com.profsis3.sed cat
   /data/data/com.profsis3.sed/shared_prefs/profsis_storage.xml` ou `chrome://inspect`)
   que `profsis_logged_in`/`profsis_user`/`profsis_app_data` foram gravados — isso
   valida que o poll de 10s do `content_profsis.js` (que só roda enquanto a WebView
   está viva, mesmo escondida) teve tempo de disparar. Recarregar o painel do SED →
   "aulas do dia" devem aparecer. Se não aparecerem mesmo depois de esperar, testar
   de novo com uma conta de **professor** (não gestor) — o usuário observou que o
   teste inicial foi feito com uma conta de gestor, e nesse caso o ProfSis deveria
   puxar os dados de professor associados a essa conta; se isso não acontecer, o
   problema está do lado do ProfSis (`core.js`), fora do escopo deste app.
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
6. **Barra inferior**: trocar entre "Sala do Futuro" e "ProfSis" várias vezes →
   confirmar que nenhuma das duas WebViews recarrega do zero (sessão/scroll
   preservados) e que o botão "voltar" do Android navega no histórico da aba atual,
   volta pra aba do SED se estiver na do ProfSis sem mais histórico, e só fecha o
   app se estiver na aba do SED sem mais histórico.
7. **Atualização automática**: publicar uma nova versão (novo `versionCode` gerado
   pelo CI) → abrir o app numa instalação com versão antiga → confirmar que aparece
   o diálogo "Nova versão disponível" → tocar "Atualizar" → confirmar notificação de
   download → ao concluir, confirmar que o instalador do Android abre sozinho.
8. **App fechando sozinho ao logar/usar o ProfSis (corrigido nesta sessão)**: entrar
   no ProfSis, logar, e abrir uma tela que use `window.open()` (ex: preview de
   relatório/PDF) → confirmar que abre um popup em tela cheia em vez de travar/fechar
   o app (`PopupWebChromeClient`). Deixar o app aberto por bastante tempo alternando
   entre as abas (memória sob pressão com 2 WebViews vivas) → se o app fechar sozinho
   mesmo assim, é sinal de que `onRenderProcessGone` não está sendo suficiente — puxar
   o logcat (`adb logcat` filtrando `AndroidRuntime`/`chromium`) pra ver a causa real.

## Coisas para observar (podem indicar regressão)

- Qualquer chamada JS que lance `TypeError: chrome.X is not a function` no
  `console.log` do WebView (visível via `chrome://inspect` conectando o dispositivo)
  indica uma API do shim (`www/shim/chrome-shim.js`) não coberta — checar contra o
  código real de `vendor/background.js`/`vendor/content_sed.js`/`vendor/content_profsis.js`.
- SPA do SED pode não redisparar `onPageFinished` em navegação interna de rota — se o
  painel sumir depois de navegar dentro do próprio SED, pode ser necessário revisar o
  gatilho de reinjeção do bundle (hoje só o listener `onPageFinished` em
  `BundleInjectingWebViewClient`).
