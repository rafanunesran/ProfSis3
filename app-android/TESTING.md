# Checklist de verificação manual — ProfSis3 (Android)

Não há harness de testes automatizados neste projeto. A verificação é manual, num
dispositivo/emulador real, após instalar o APK gerado (debug via CI, ou
`./gradlew assembleDebug` localmente com Android Studio/JDK instalados).

O app é uma WebView única do próprio ProfSis. Ele **não** acessa, injeta script nem
interage de qualquer forma com sistemas da SEDUC (Sala do Futuro / Secretaria Escolar
Digital) — ver `CONFORMIDADE-SEDUC.md` na raiz do repositório.

## Fluxo principal

1. **Instalação limpa** → abrir o app → o ProfSis carrega direto na WebView → login
   completa normalmente.
2. **Persistência de sessão**: matar o app completamente (remover dos recentes) e
   reabrir → continua logado (valida `CookieManager`/`flush()` em
   `MainActivity.onPause`).
3. **Uso normal**: percorrer perfil, turmas, agenda, chamada, registros e relatórios —
   tudo deve funcionar como no navegador.
4. **Pull-to-refresh**: com a página no topo, puxar para baixo → recarrega e o spinner
   some quando a página termina (`onPageFinished` → `stopRefresh`).
5. **Botão voltar**: navega no histórico da WebView; no início do histórico, fecha o app.
6. **Links externos** (`tel:`, `mailto:`, `intent://`): abrem no app externo, ou são
   ignorados silenciosamente se não houver app instalado — nunca derrubam o app
   (`ProfSisWebViewClient.shouldOverrideUrlLoading`).
7. **Atualização**: com um `version.json` publicado anunciando um `versionCode` maior
   que o instalado, abrir o app → diálogo "Nova versão disponível" → o download e o
   instalador do sistema abrem normalmente (`UpdateChecker`).
8. **Crash do renderizador**: sob pressão de memória, a WebView é recriada em vez de o
   app fechar (`onRenderProcessGone` → `recreateWebView`).

## Observação sobre o applicationId

O pacote continua `com.profsis3.sed` (herdado da versão anterior). Renomeá-lo impediria
que as instalações existentes atualizassem por cima, então o nome foi mantido apesar de
o app não ter mais relação com a SED.
