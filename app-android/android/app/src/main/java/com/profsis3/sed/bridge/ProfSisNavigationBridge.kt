package com.profsis3.sed.bridge

import android.app.Activity
import android.content.Intent
import android.webkit.JavascriptInterface
import com.profsis3.sed.profsis.ProfSisLoginActivity

/**
 * Substitui o unico uso real de chrome.tabs.create no codigo original: o botao
 * "Abrir ProfSis" do painel do content_sed.js. Aqui nao existe conceito de "abas",
 * entao isso vira abrir a segunda tela (ProfSisLoginActivity).
 */
class ProfSisNavigationBridge(private val activity: Activity) {

    @JavascriptInterface
    fun openProfSisLogin() {
        activity.runOnUiThread {
            activity.startActivity(Intent(activity, ProfSisLoginActivity::class.java))
        }
    }
}
