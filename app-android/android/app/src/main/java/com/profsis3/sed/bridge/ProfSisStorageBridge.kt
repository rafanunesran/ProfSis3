package com.profsis3.sed.bridge

import android.content.Context
import android.webkit.JavascriptInterface

/**
 * Substitui chrome.storage.local: um unico blob JSON em SharedPreferences, global ao
 * app (compartilhado entre as duas WebViews de MainActivity, igual a chrome.storage.local
 * ser compartilhado entre background e content scripts).
 *
 * chrome-shim.js sempre le o blob inteiro antes de get/set/remove e regrava o blob
 * inteiro depois, entao nao ha necessidade de expor chaves individuais aqui.
 */
class ProfSisStorageBridge(context: Context) {

    private val prefs = context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    @JavascriptInterface
    fun getAll(): String = prefs.getString(KEY_BLOB, "{}") ?: "{}"

    @JavascriptInterface
    fun setAll(json: String) {
        prefs.edit().putString(KEY_BLOB, json).apply()
    }

    companion object {
        private const val PREFS_NAME = "profsis_storage"
        private const val KEY_BLOB = "data_json"
    }
}
