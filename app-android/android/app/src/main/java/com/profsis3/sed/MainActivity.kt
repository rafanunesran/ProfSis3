package com.profsis3.sed

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.profsis3.sed.bridge.ProfSisNavigationBridge
import com.profsis3.sed.bridge.ProfSisStorageBridge
import com.profsis3.sed.update.UpdateChecker
import com.profsis3.sed.webview.BundleInjectingWebViewClient

/**
 * Tela unica do app: duas WebViews (Sala do Futuro e ProfSis) vivas o tempo todo desde
 * a abertura do app, alternadas por uma barra inferior - nunca pausadas/destruidas,
 * pra que o poll de sincronismo do content_profsis.js (a cada 10s, ver
 * vendor/content_profsis.js) continue rodando em segundo plano mesmo com a aba do
 * ProfSis fora de tela, do jeito que uma aba de verdade ficaria aberta em segundo
 * plano no Chrome (é isso que a extensão já depende para "aulas do dia" sincronizar).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var sedWebView: WebView
    private lateinit var profsisWebView: WebView
    private lateinit var bottomNav: BottomNavigationView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        sedWebView = createWebView()
        profsisWebView = createWebView()

        sedWebView.addJavascriptInterface(ProfSisStorageBridge(this), "ProfSisNativeStorage")
        sedWebView.addJavascriptInterface(
            ProfSisNavigationBridge { runOnUiThread { showTab(Tab.PROFSIS) } },
            "ProfSisNativeNav",
        )
        profsisWebView.addJavascriptInterface(ProfSisStorageBridge(this), "ProfSisNativeStorage")

        sedWebView.webViewClient = BundleInjectingWebViewClient(
            onPageFinishedExtra = { view, _ -> injectBundle(view, "bundles/sed-bundle.js") },
        )
        profsisWebView.webViewClient = BundleInjectingWebViewClient(
            onPageFinishedExtra = { view, _ -> injectBundle(view, "bundles/profsis-bundle.js") },
        )

        setContentView(buildLayout())
        showTab(Tab.SED)

        if (savedInstanceState == null) {
            sedWebView.loadUrl(SED_START_URL)
            profsisWebView.loadUrl(PROFSIS_START_URL)
        }

        UpdateChecker.checkForUpdate(this)
    }

    private fun createWebView(): WebView {
        val webView = WebView(this)
        webView.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.webChromeClient = WebChromeClient()

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        return webView
    }

    private fun buildLayout(): View {
        val webContainer = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f,
            )
            addView(sedWebView)
            addView(profsisWebView)
        }

        bottomNav = BottomNavigationView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            )
            inflateMenu(R.menu.bottom_nav_menu)
            setOnItemSelectedListener { item ->
                when (item.itemId) {
                    R.id.nav_sed -> {
                        showTab(Tab.SED)
                        true
                    }
                    R.id.nav_profsis -> {
                        showTab(Tab.PROFSIS)
                        true
                    }
                    else -> false
                }
            }
        }

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            addView(webContainer)
            addView(bottomNav)
        }
    }

    private fun showTab(tab: Tab) {
        sedWebView.visibility = if (tab == Tab.SED) View.VISIBLE else View.GONE
        profsisWebView.visibility = if (tab == Tab.PROFSIS) View.VISIBLE else View.GONE

        val targetId = if (tab == Tab.SED) R.id.nav_sed else R.id.nav_profsis
        if (bottomNav.selectedItemId != targetId) {
            bottomNav.selectedItemId = targetId
        }
    }

    private fun currentTab(): Tab = if (sedWebView.visibility == View.VISIBLE) Tab.SED else Tab.PROFSIS

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
        val current = if (currentTab() == Tab.SED) sedWebView else profsisWebView
        when {
            current.canGoBack() -> current.goBack()
            currentTab() == Tab.PROFSIS -> showTab(Tab.SED)
            else -> super.onBackPressed()
        }
    }

    private enum class Tab { SED, PROFSIS }

    companion object {
        private const val SED_START_URL = "https://saladofuturoprofessor.educacao.sp.gov.br/"
        private const val PROFSIS_START_URL = "https://rafanunesran.github.io/ProfSis3/"
    }
}
