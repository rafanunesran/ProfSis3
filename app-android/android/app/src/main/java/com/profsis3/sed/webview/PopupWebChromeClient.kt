package com.profsis3.sed.webview

import android.app.Activity
import android.app.Dialog
import android.os.Message
import android.webkit.WebChromeClient
import android.webkit.WebView

/**
 * O ProfSis usa `window.open('', '', 'width=..,height=..')` em vários lugares (preview de
 * relatório/PDF, escrevendo HTML via document.write no retorno). Sem tratar
 * `onCreateWindow`, `window.open()` devolve `null` pro JS da própria página, quebrando
 * esses fluxos silenciosamente (e, combinado com outras causas, contribuindo pro app
 * fechar sozinho ao interagir com telas que dependem disso). Isso abre um Dialog em tela
 * cheia com uma WebView nova só pra satisfazer esse contrato; fecha via botão "voltar"
 * do Android ou quando a própria página chama `window.close()`.
 */
class PopupWebChromeClient(private val activity: Activity) : WebChromeClient() {

    override fun onCreateWindow(
        view: WebView,
        isDialog: Boolean,
        isUserGesture: Boolean,
        resultMsg: Message,
    ): Boolean {
        val popupWebView = WebView(activity).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
        }

        val dialog = Dialog(activity, android.R.style.Theme_Black_NoTitleBar_Fullscreen)
        dialog.setContentView(popupWebView)
        dialog.setOnDismissListener { popupWebView.destroy() }

        popupWebView.webChromeClient = object : WebChromeClient() {
            override fun onCloseWindow(window: WebView) {
                dialog.dismiss()
            }
        }

        dialog.show()

        val transport = resultMsg.obj as WebView.WebViewTransport
        transport.webView = popupWebView
        resultMsg.sendToTarget()
        return true
    }
}
