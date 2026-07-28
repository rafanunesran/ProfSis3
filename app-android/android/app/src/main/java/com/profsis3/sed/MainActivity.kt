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
import java.io.File
import java.util.concurrent.Executors
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
    // Thread única pro download dos bundles do robô (auto-update), fora da UI thread.
    private val bundleExecutor = Executors.newSingleThreadExecutor()

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
        // Atualiza o robô (bundles) em segundo plano; aplica na próxima abertura (ver injectBundle).
        baixarBundlesEmBackground()

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
        // Ponte do botão "Atualizar Robô" (baixa o bundle novo e recarrega) - nas duas WebViews, pra
        // funcionar tanto do painel da SED quanto de qualquer tela.
        webView.addJavascriptInterface(ProfSisNativeUpdate(), "ProfSisNativeUpdate")
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

        webView.webViewClient = BundleInjectingWebViewClient(
            onPageFinishedExtra = { view, _ ->
                injectBundle(view, tab)
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

    private fun bundleFileName(tab: Tab): String =
        if (tab == Tab.SED) "sed-bundle.js" else "profsis-bundle.js"

    /**
     * Injeta o robô na página. Prefere a cópia baixada do Pages (filesDir) - assim o robô se
     * atualiza sozinho, como a extensão do Chrome, sem precisar de um APK novo. Se ainda não houver
     * cópia baixada (1ª execução / offline), usa a versão embutida nos assets do APK.
     */
    private fun injectBundle(view: WebView, tab: Tab) {
        val fileName = bundleFileName(tab)
        val script = try {
            val cached = File(filesDir, fileName)
            if (cached.exists() && cached.length() > 0) cached.readText(Charsets.UTF_8)
            else assets.open("bundles/$fileName").bufferedReader(Charsets.UTF_8).use { it.readText() }
        } catch (e: Exception) {
            // Qualquer problema ao ler o cache -> volta pro embutido (nunca deixa de injetar o robô).
            assets.open("bundles/$fileName").bufferedReader(Charsets.UTF_8).use { it.readText() }
        }
        view.evaluateJavascript(script, null)
    }

    /**
     * Baixa em segundo plano a versão mais recente dos bundles do robô (publicada no GitHub Pages
     * pelo build) e salva em filesDir. É aplicada na PRÓXIMA abertura do app (injectBundle lê o
     * cache). Falha em silêncio (offline / rede da escola) - o app segue com a versão que já tem.
     */
    private fun baixarBundlesEmBackground() {
        baixarBundles(null)
    }

    /**
     * Baixa os bundles do robô do Pages para filesDir (thread de fundo, escrita atômica) e, ao
     * terminar, chama onConcluido na própria thread de fundo. onConcluido recebe quantos bundles
     * foram efetivamente atualizados. Usado tanto pelo update em background (onCreate) quanto pelo
     * botão "Atualizar Robô" (ProfSisNativeUpdate), que recarrega as WebViews ao concluir.
     */
    private fun baixarBundles(onConcluido: ((Int) -> Unit)?) {
        bundleExecutor.execute {
            var atualizados = 0
            for (fileName in listOf("sed-bundle.js", "profsis-bundle.js")) {
                try {
                    val conn = (java.net.URL(BUNDLE_BASE_URL + fileName).openConnection() as java.net.HttpURLConnection).apply {
                        connectTimeout = 8000
                        readTimeout = 8000
                        requestMethod = "GET"
                    }
                    try {
                        if (conn.responseCode == 200) {
                            val text = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                            // Sanidade: só grava se parece mesmo com o nosso bundle (evita salvar uma
                            // página de erro/captive portal por cima do robô).
                            if (text.length > 500 && text.contains("__PROFSIS_APP_VERSION__")) {
                                // Escrita atômica (tmp + rename) pra injectBundle nunca ler um arquivo
                                // pela metade se o download coincidir com o carregamento de uma página.
                                val tmp = File(filesDir, "$fileName.tmp")
                                tmp.writeText(text, Charsets.UTF_8)
                                tmp.renameTo(File(filesDir, fileName))
                                atualizados++
                            }
                        }
                    } finally {
                        conn.disconnect()
                    }
                } catch (e: Exception) {
                    android.util.Log.w("MainActivity", "Falha ao baixar bundle $fileName: ${e.message}")
                }
            }
            onConcluido?.invoke(atualizados)
        }
    }

    /**
     * Ponte JS -> nativo para o botão "Atualizar Robô" do painel: baixa o bundle mais novo do Pages e
     * recarrega as duas WebViews, aplicando a atualização NA HORA (o reload dispara onPageFinished ->
     * injectBundle, que passa a ler o bundle novo de filesDir). Sem isso, a atualização só valeria na
     * próxima abertura do app.
     */
    inner class ProfSisNativeUpdate {
        @android.webkit.JavascriptInterface
        fun atualizarRobo() {
            baixarBundles {
                runOnUiThread {
                    if (::sedWebView.isInitialized) sedWebView.reload()
                    if (::profsisWebView.isInitialized) profsisWebView.reload()
                }
            }
        }
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
        // Bundles do robô publicados pelo build (build-bundles.mjs -> dist/bundles), servidos pelo
        // GitHub Pages. O app baixa daqui pra atualizar o robô sem precisar de um APK novo.
        private const val BUNDLE_BASE_URL = "https://rafanunesran.github.io/ProfSis3/app-android/dist/bundles/"
    }
}
