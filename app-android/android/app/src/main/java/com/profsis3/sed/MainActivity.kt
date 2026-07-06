package com.profsis3.sed

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.profsis3.sed.bridge.ProfSisNavigationBridge
import com.profsis3.sed.bridge.ProfSisStorageBridge
import com.profsis3.sed.kiosk.AllowedHosts
import com.profsis3.sed.kiosk.KioskWebViewClient

/**
 * Tela principal (kiosk): WebView nativa restrita ao Sala do Futuro + login gov.br,
 * com o bundle de automacao (chrome-shim + background.js + content_sed.js, ver
 * scripts/build-bundles.mjs) injetado a cada carregamento de pagina.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.addJavascriptInterface(ProfSisStorageBridge(this), "ProfSisNativeStorage")
        webView.addJavascriptInterface(ProfSisNavigationBridge(this), "ProfSisNativeNav")

        webView.webViewClient = KioskWebViewClient(
            allowedHosts = AllowedHosts.SED_HOSTS + AllowedHosts.LOGIN_HOSTS,
            onBlocked = { blockedUrl ->
                Toast.makeText(this, "Domínio não permitido: $blockedUrl", Toast.LENGTH_SHORT).show()
            },
            onPageFinishedExtra = { view, _ -> injectBundle(view, "bundles/sed-bundle.js") },
        )

        if (savedInstanceState == null) {
            webView.loadUrl(SED_START_URL)
        }
    }

    private fun injectBundle(view: WebView, assetPath: String) {
        val script = assets.open(assetPath).bufferedReader(Charsets.UTF_8).use { it.readText() }
        view.evaluateJavascript(script, null)
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    companion object {
        private const val SED_START_URL = "https://saladofuturoprofessor.educacao.sp.gov.br/"
    }
}
