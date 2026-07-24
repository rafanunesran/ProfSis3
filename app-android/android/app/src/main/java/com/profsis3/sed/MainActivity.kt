package com.profsis3.sed

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.profsis3.sed.bridge.ProfSisNavigationBridge
import com.profsis3.sed.bridge.ProfSisStorageBridge
import com.profsis3.sed.diagnostics.CrashLogger
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
    // Cada WebView vive dentro de um SwipeRefreshLayout (puxar pra baixo -> recarrega). O
    // SwipeRefreshLayout só dispara o gesto quando a WebView está no topo (canChildScrollUp usa
    // WebView.canScrollVertically), então não atrapalha a rolagem normal da página.
    private lateinit var sedRefresh: SwipeRefreshLayout
    private lateinit var profsisRefresh: SwipeRefreshLayout
    private lateinit var webContainer: FrameLayout
    private lateinit var bottomNav: BottomNavigationView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        CrashLogger.install(this)

        sedWebView = createWebView(Tab.SED)
        profsisWebView = createWebView(Tab.PROFSIS)
        sedRefresh = wrapInRefresh(sedWebView, Tab.SED)
        profsisRefresh = wrapInRefresh(profsisWebView, Tab.PROFSIS)

        setContentView(buildLayout())
        // Nao usar bottomNav.selectedItemId aqui: o menu ja comeca com nav_sed selecionado
        // (primeiro item de bottom_nav_menu.xml) - so precisa aplicar a visibilidade.
        switchWebViewVisibility(Tab.SED)

        if (savedInstanceState == null) {
            sedWebView.loadUrl(SED_START_URL)
            profsisWebView.loadUrl(PROFSIS_START_URL)
        }

        UpdateChecker.checkForUpdate(this)

        CrashLogger.consumeLastCrash(this)?.let { crashText -> showLastCrashDialog(crashText) }
    }

    /**
     * Sem acesso a logcat do aparelho do usuario pra diagnosticar os crashes reportados -
     * isso mostra o stack trace do ultimo crash (capturado por CrashLogger) com um botao
     * de copiar, pra dar pra colar de volta na conversa com o dev sem precisar de adb.
     */
    private fun showLastCrashDialog(crashText: String) {
        AlertDialog.Builder(this)
            .setTitle("O app fechou da última vez")
            .setMessage(crashText.take(4000))
            .setPositiveButton("Copiar") { _, _ ->
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("Crash ProfSis3 SED", crashText))
                Toast.makeText(this, "Copiado!", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("Fechar", null)
            .setCancelable(true)
            .show()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(tab: Tab): WebView {
        val webView = WebView(this)
        webView.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        // A visibilidade quem controla é o SwipeRefreshLayout que envolve a WebView (ver
        // switchWebViewVisibility) - a WebView em si fica sempre VISIBLE dentro do wrapper.
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        // NAO habilitar setSupportMultipleWindows/javaScriptCanOpenWindowsAutomatically nem
        // usar um WebChromeClient com onCreateWindow aqui: a versao anterior (sem nenhum dos
        // dois) nunca fechava sozinha; assim que isso foi habilitado (pra tentar suportar
        // window.open(), muito usado pelo ProfSis em preview de relatorio/PDF), o app passou a
        // fechar sozinho ao logar/abrir a "engrenagem" do ProfSis. Sem suporte a multiplas
        // janelas, window.open() volta a ser um no-op inofensivo (como era antes) em vez de
        // acionar esse caminho de codigo.
        webView.webChromeClient = WebChromeClient()

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.addJavascriptInterface(ProfSisStorageBridge(this), "ProfSisNativeStorage")
        if (tab == Tab.SED) {
            webView.addJavascriptInterface(
                // So mexe na selecao da barra inferior - o listener dela e' quem troca a
                // visibilidade das WebViews (ver switchWebViewVisibility). Chamar
                // switchWebViewVisibility() direto aqui deixaria a barra "dessincronizada"
                // da aba realmente visivel (ela so' reage a toque do usuario/selectedItemId).
                ProfSisNavigationBridge { runOnUiThread { bottomNav.selectedItemId = R.id.nav_profsis } },
                "ProfSisNativeNav",
            )
        }

        val bundleAsset = if (tab == Tab.SED) "bundles/sed-bundle.js" else "bundles/profsis-bundle.js"
        webView.webViewClient = BundleInjectingWebViewClient(
            onPageFinishedExtra = { view, _ ->
                injectBundle(view, bundleAsset)
                stopRefresh(tab) // some com o spinner do pull-to-refresh quando a página terminou de carregar
            },
            onRenderProcessGoneExtra = { recreateWebView(tab) },
        )

        return webView
    }

    /**
     * Envolve a WebView num SwipeRefreshLayout: puxar a página pra baixo (estando no topo)
     * recarrega a WebView - útil porque a Sala do Futuro perde a conexão com o tempo. O spinner
     * é escondido quando a página termina de carregar (ver stopRefresh no onPageFinished).
     */
    private fun wrapInRefresh(webView: WebView, tab: Tab): SwipeRefreshLayout {
        return SwipeRefreshLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            visibility = View.GONE // switchWebViewVisibility decide qual aparece
            addView(webView)
            setOnRefreshListener {
                val target = if (tab == Tab.SED) sedWebView else profsisWebView
                target.reload()
            }
        }
    }

    /** Esconde o spinner do pull-to-refresh da aba indicada (chamado quando a página termina). */
    private fun stopRefresh(tab: Tab) {
        val wrapper = when (tab) {
            Tab.SED -> if (::sedRefresh.isInitialized) sedRefresh else null
            Tab.PROFSIS -> if (::profsisRefresh.isInitialized) profsisRefresh else null
        }
        wrapper?.isRefreshing = false
    }

    /**
     * Sem isso, quando o processo de renderizacao do WebView cai (comum sob pressao de
     * memoria - ha duas WebViews vivas ao mesmo tempo agora), o Android mata o app
     * inteiro (ver BundleInjectingWebViewClient.onRenderProcessGone). Recria só a
     * WebView afetada, preservando a outra e a sessao/cookies (que sao globais ao app).
     */
    private fun recreateWebView(tab: Tab) {
        try {
            // A WebView vive dentro do seu SwipeRefreshLayout - troca só a WebView, mantendo o wrapper.
            val wrapper = if (tab == Tab.SED) sedRefresh else profsisRefresh
            val old = if (tab == Tab.SED) sedWebView else profsisWebView
            wrapper.removeView(old)
            old.destroy()

            val fresh = createWebView(tab)
            wrapper.addView(fresh)
            wrapper.isRefreshing = false

            if (tab == Tab.SED) sedWebView = fresh else profsisWebView = fresh

            fresh.loadUrl(if (tab == Tab.SED) SED_START_URL else PROFSIS_START_URL)
            // Reaplica a visibilidade da aba atualmente selecionada (nao mudou) - so' a
            // instancia da WebView foi trocada.
            switchWebViewVisibility(currentTab())
        } catch (e: Exception) {
            // Este e' o proprio tratamento de crash do WebView (onRenderProcessGone) -
            // se ele mesmo falhar, so' loga; nao pode propagar e derrubar o app de novo.
            android.util.Log.e("MainActivity", "Falha ao recriar WebView apos crash do processo de renderizacao.", e)
        }
    }

    private fun buildLayout(): View {
        webContainer = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f,
            )
            addView(sedRefresh)
            addView(profsisRefresh)
        }

        bottomNav = BottomNavigationView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            )
            inflateMenu(R.menu.bottom_nav_menu)
            // So troca a visibilidade das WebViews aqui - nunca reescrever
            // bottomNav.selectedItemId dentro deste listener (isso re-dispara o proprio
            // listener e causa StackOverflowError, ja visto em producao).
            setOnItemSelectedListener { item ->
                when (item.itemId) {
                    R.id.nav_sed -> {
                        switchWebViewVisibility(Tab.SED)
                        true
                    }
                    R.id.nav_profsis -> {
                        switchWebViewVisibility(Tab.PROFSIS)
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

    /** So mexe na visibilidade dos wrappers (SwipeRefreshLayout) - nunca no bottomNav (ver listener). */
    private fun switchWebViewVisibility(tab: Tab) {
        sedRefresh.visibility = if (tab == Tab.SED) View.VISIBLE else View.GONE
        profsisRefresh.visibility = if (tab == Tab.PROFSIS) View.VISIBLE else View.GONE
    }

    private fun currentTab(): Tab = if (sedRefresh.visibility == View.VISIBLE) Tab.SED else Tab.PROFSIS

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
            // Seta a selecao da barra (nao chama switchWebViewVisibility direto): isso
            // dispara o listener do bottomNav, que e' quem troca a visibilidade.
            currentTab() == Tab.PROFSIS -> bottomNav.selectedItemId = R.id.nav_sed
            else -> super.onBackPressed()
        }
    }

    private enum class Tab { SED, PROFSIS }

    companion object {
        private const val SED_START_URL = "https://saladofuturoprofessor.educacao.sp.gov.br/"
        private const val PROFSIS_START_URL = "https://rafanunesran.github.io/ProfSis3/"
    }
}
