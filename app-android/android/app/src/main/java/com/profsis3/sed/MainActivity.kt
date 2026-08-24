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
import com.profsis3.sed.diagnostics.CrashLogger
import com.profsis3.sed.update.UpdateChecker
import com.profsis3.sed.webview.ProfSisWebViewClient

/**
 * Tela unica do app: uma WebView com o proprio ProfSis.
 *
 * O app NAO acessa, injeta script nem interage de qualquer forma com sistemas da SEDUC
 * (Sala do Futuro / Secretaria Escolar Digital) - ver CONFORMIDADE-SEDUC.md na raiz do
 * repositorio. O lancamento nos sistemas da Secretaria e' sempre feito pelo profissional,
 * no ambiente oficial dela.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    // A WebView vive dentro de um SwipeRefreshLayout (puxar pra baixo -> recarrega). O
    // SwipeRefreshLayout só dispara o gesto quando a WebView está no topo (canChildScrollUp usa
    // WebView.canScrollVertically), então não atrapalha a rolagem normal da página.
    private lateinit var refresh: SwipeRefreshLayout
    private lateinit var webContainer: FrameLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        CrashLogger.install(this)

        webView = createWebView()
        refresh = wrapInRefresh(webView)

        setContentView(buildLayout())

        if (savedInstanceState == null) {
            webView.loadUrl(PROFSIS_START_URL)
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
                clipboard.setPrimaryClip(ClipData.newPlainText("Crash ProfSis3", crashText))
                Toast.makeText(this, "Copiado!", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("Fechar", null)
            .setCancelable(true)
            .show()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(): WebView {
        val webView = WebView(this)
        webView.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
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

        webView.webViewClient = ProfSisWebViewClient(
            onPageFinishedExtra = { _, _ -> stopRefresh() },
            onRenderProcessGoneExtra = { recreateWebView() },
        )

        return webView
    }

    /**
     * Envolve a WebView num SwipeRefreshLayout: puxar a página pra baixo (estando no topo)
     * recarrega a WebView. O spinner é escondido quando a página termina de carregar (ver
     * stopRefresh no onPageFinished).
     */
    private fun wrapInRefresh(webView: WebView): SwipeRefreshLayout {
        return SwipeRefreshLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            addView(webView)
            setOnRefreshListener { this@MainActivity.webView.reload() }
        }
    }

    /** Esconde o spinner do pull-to-refresh (chamado quando a página termina de carregar). */
    private fun stopRefresh() {
        if (::refresh.isInitialized) refresh.isRefreshing = false
    }

    /**
     * Sem isso, quando o processo de renderizacao do WebView cai (comum sob pressao de
     * memoria), o Android mata o app inteiro (ver ProfSisWebViewClient.onRenderProcessGone).
     * Recria a WebView preservando a sessao/cookies (que sao globais ao app).
     */
    private fun recreateWebView() {
        try {
            refresh.removeView(webView)
            webView.destroy()

            val fresh = createWebView()
            refresh.addView(fresh)
            refresh.isRefreshing = false
            webView = fresh

            fresh.loadUrl(PROFSIS_START_URL)
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
            addView(refresh)
        }

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            addView(webContainer)
        }
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    companion object {
        private const val PROFSIS_START_URL = "https://rafanunesran.github.io/ProfSis3/"
    }
}
