package com.profsis3.sed.profsis

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.profsis3.sed.bridge.ProfSisStorageBridge
import com.profsis3.sed.kiosk.AllowedHosts
import com.profsis3.sed.kiosk.KioskWebViewClient

/**
 * "Aba do ProfSis": usada so para o login inicial/reautenticacao (chrome.tabs.create
 * no codigo original). Storage nativo e global ao app (mesmo SharedPreferences que a
 * MainActivity usa), entao o que for gravado aqui (profsis_user, profsis_firebase_session,
 * profsis_app_data) ja fica visivel para o WebView do SED assim que essa tela fechar.
 */
class ProfSisLoginActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = "Login ProfSis"

        webView = WebView(this)
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        // Mesmo bridge de storage da MainActivity - mesmo SharedPreferences, global ao app.
        webView.addJavascriptInterface(ProfSisStorageBridge(this), "ProfSisNativeStorage")

        webView.webViewClient = KioskWebViewClient(
            allowedHosts = AllowedHosts.PROFSIS_HOSTS,
            onBlocked = { blockedUrl ->
                Toast.makeText(this, "Domínio não permitido: $blockedUrl", Toast.LENGTH_SHORT).show()
            },
            onPageFinishedExtra = { view, _ -> injectBundle(view, "bundles/profsis-bundle.js") },
        )

        if (savedInstanceState == null) {
            webView.loadUrl(PROFSIS_START_URL)
        }
    }

    private fun injectBundle(view: WebView, assetPath: String) {
        val script = assets.open(assetPath).bufferedReader(Charsets.UTF_8).use { it.readText() }
        view.evaluateJavascript(script, null)
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
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
        // Confirmado com o usuario: mesmo dominio do update_url da extensao (GitHub Pages).
        private const val PROFSIS_START_URL = "https://rafanunesran.github.io/ProfSis3/"
    }
}
