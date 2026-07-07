package com.profsis3.sed.webview

import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Navegação livre (sem whitelist de domínios): o login gov.br às vezes passa por
 * domínios não previstos (ex: provedores de MFA/verificação), e restringir a navegação
 * estava quebrando o próprio login. Só injeta o bundle de automação depois de cada
 * página carregar (o WebViewClient padrão já deixa a navegação seguir livremente).
 */
class BundleInjectingWebViewClient(
    private val onPageFinishedExtra: (WebView, String) -> Unit = { _, _ -> },
) : WebViewClient() {

    override fun onPageFinished(view: WebView, url: String) {
        super.onPageFinished(view, url)
        onPageFinishedExtra(view, url)
    }
}
