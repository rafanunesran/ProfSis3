package com.profsis3.sed.bridge

import android.webkit.JavascriptInterface

/**
 * Substitui o unico uso real de chrome.tabs.create no codigo original: o botao
 * "Abrir ProfSis" do painel do content_sed.js. Como as duas WebViews (SED e ProfSis)
 * ja vivem na mesma Activity (ver MainActivity), isso vira so trocar a aba visivel
 * na barra inferior - nao ha mais uma Activity separada pra abrir/fechar.
 */
class ProfSisNavigationBridge(private val switchToProfSisTab: () -> Unit) {

    @JavascriptInterface
    fun openProfSisLogin() {
        switchToProfSisTab()
    }
}
