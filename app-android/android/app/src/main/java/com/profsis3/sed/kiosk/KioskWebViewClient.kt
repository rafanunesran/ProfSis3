package com.profsis3.sed.kiosk

import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Restringe navegacao de main-frame a [allowedHosts]. Subrecursos (fontes, CDN, captcha
 * embutido na propria pagina) nao sao filtrados de proposito - filtrar so main-frame
 * evita quebrar a pagina do SED por causa de recursos legitimos de terceiros.
 */
class KioskWebViewClient(
    private val allowedHosts: List<String>,
    private val onBlocked: (String) -> Unit = {},
    private val onPageFinishedExtra: (WebView, String) -> Unit = { _, _ -> },
) : WebViewClient() {

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        if (!request.isForMainFrame) return false

        val host = request.url.host
        if (host == null || !AllowedHosts.isAllowed(host, allowedHosts)) {
            onBlocked(request.url.toString())
            return true
        }
        return false
    }

    override fun onPageFinished(view: WebView, url: String) {
        super.onPageFinished(view, url)
        onPageFinishedExtra(view, url)
    }
}
