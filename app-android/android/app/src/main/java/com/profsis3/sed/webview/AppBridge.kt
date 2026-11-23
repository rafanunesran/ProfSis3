package com.profsis3.sed.webview

import android.app.Activity
import android.webkit.JavascriptInterface
import com.profsis3.sed.BuildConfig
import com.profsis3.sed.update.UpdateChecker

/**
 * Ponte entre o site e o app, exposta na WebView como `window.EdiProfApp`.
 * Só serve para o botão "Verificar atualização" do próprio site (ver index.html,
 * instalarApp). Não lê nem envia dados da pessoa.
 */
class AppBridge(private val activity: Activity) {

    @JavascriptInterface
    fun versao(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun verificarAtualizacao() {
        activity.runOnUiThread { UpdateChecker.checkForUpdate(activity, manual = true) }
    }
}
