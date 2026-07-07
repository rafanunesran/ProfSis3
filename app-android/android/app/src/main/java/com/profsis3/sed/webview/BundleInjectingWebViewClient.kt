package com.profsis3.sed.webview

import android.content.ActivityNotFoundException
import android.content.Intent
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Navegação livre (sem whitelist de domínios): o login gov.br às vezes passa por
 * domínios não previstos (ex: provedores de MFA/verificação), e restringir a navegação
 * estava quebrando o próprio login. Além de injetar o bundle de automação depois de
 * cada página carregar, lida com dois jeitos de crash bem conhecidos de apps WebView:
 *
 * - Links com esquema que não é http/https (ex: "intent://", "tel:", "mailto:",
 *   "market://" - o ProfSis/SED podem ter algum desses) fariam o WebView tentar
 *   carregar a URL e falhar; aqui em vez disso abre via Intent externa, e ignora
 *   silenciosamente se não houver app instalado pra lidar com aquele esquema (sem o
 *   try/catch, isso derruba o app inteiro com ActivityNotFoundException).
 * - Se o processo de renderização do WebView cair (comum sob pressão de memória -
 *   agora há duas WebViews vivas ao mesmo tempo), o Android MATA O APP INTEIRO a
 *   menos que onRenderProcessGone seja implementado - aqui só avisa quem criou este
 *   client (via [onRenderProcessGoneExtra]) pra recriar a WebView, em vez de deixar
 *   o app fechar sozinho.
 */
class BundleInjectingWebViewClient(
    private val onPageFinishedExtra: (WebView, String) -> Unit = { _, _ -> },
    private val onRenderProcessGoneExtra: () -> Unit = {},
) : WebViewClient() {

    override fun onPageFinished(view: WebView, url: String) {
        super.onPageFinished(view, url)
        onPageFinishedExtra(view, url)
    }

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val scheme = request.url.scheme
        if (scheme == "http" || scheme == "https") return false

        return try {
            view.context.startActivity(Intent(Intent.ACTION_VIEW, request.url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (e: ActivityNotFoundException) {
            true
        }
    }

    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        onRenderProcessGoneExtra()
        return true
    }
}
