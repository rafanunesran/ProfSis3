package com.profsis3.sed.update

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.widget.Toast
import androidx.core.content.FileProvider
import com.profsis3.sed.BuildConfig
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Checagem de atualização para o APK distribuído fora da Play Store. O Android nunca
 * permite instalação 100% silenciosa de um app sideloaded (sempre exige confirmação do
 * usuário na tela do instalador do sistema - proteção do próprio SO); isso aqui
 * automatiza tudo até esse último passo.
 *
 * O download é feito por conta própria (HTTP simples, em background) e salvo no cache
 * privado do app - não usa o DownloadManager do sistema: a Uri que ele devolve
 * (`getUriForDownloadedFile`) depende de onde o arquivo foi salvo e, em testes reais,
 * o instalador do Android às vezes não consegue ler esse arquivo (baixa mas não
 * instala). Gerando a Uri nós mesmos via FileProvider, sobre um arquivo que nós mesmos
 * acabamos de escrever, elimina essa ambiguidade.
 */
object UpdateChecker {

    // Lê os dois endereços e fica com o que anuncia a versão MAIOR: a cópia da Vercel pode
    // ficar um envio atrás do github.io, e o github.io pode estar bloqueado no wi-fi da escola.
    private val VERSION_URLS = listOf(
        "https://ediprof.vercel.app/app-android/dist/version.json",
        "https://rafanunesran.github.io/ProfSis3/app-android/dist/version.json"
    )
    private const val APK_FILE_NAME = "profsis3-update.apk"

    /**
     * [manual] = true quando a pessoa tocou em "Verificar atualização" no site (ver
     * webview/AppBridge). Aí sempre dá uma resposta na tela: oferece atualizar, ou diz que
     * já está na versão mais nova e oferece instalar de novo mesmo assim (forçar).
     */
    fun checkForUpdate(activity: Activity, manual: Boolean = false) {
        if (manual) Toast.makeText(activity, "Verificando atualização...", Toast.LENGTH_SHORT).show()
        thread {
            try {
                var remote: JSONObject? = null
                for (url in VERSION_URLS) {
                    try {
                        val json = (URL(url).openConnection() as HttpURLConnection).run {
                            connectTimeout = 8000
                            readTimeout = 8000
                            inputStream.bufferedReader().use { it.readText() }
                        }
                        val lido = JSONObject(json)
                        if (remote == null || lido.getInt("versionCode") > remote.getInt("versionCode")) remote = lido
                    } catch (e: Exception) {
                        // tenta o próximo endereço
                    }
                }
                if (remote == null) {
                    if (manual) activity.runOnUiThread {
                        Toast.makeText(activity, "Não deu para verificar agora. Confira a internet e tente de novo.", Toast.LENGTH_LONG).show()
                    }
                    return@thread
                }
                val remoteVersionCode = remote.getInt("versionCode")
                val remoteVersionName = remote.optString("versionName", "")
                val apkUrl = remote.getString("apkUrl")

                if (remoteVersionCode > BuildConfig.VERSION_CODE) {
                    activity.runOnUiThread { showUpdateDialog(activity, remoteVersionName, apkUrl) }
                } else if (manual) {
                    activity.runOnUiThread { showUpToDateDialog(activity, apkUrl) }
                }
            } catch (e: Exception) {
                // Sem conexão ou version.json fora do ar - ignora, tenta de novo na próxima abertura.
            }
        }
    }

    private fun showUpToDateDialog(activity: Activity, apkUrl: String) {
        AlertDialog.Builder(activity)
            .setTitle("O app está atualizado")
            .setMessage("Você já tem a versão mais nova (${BuildConfig.VERSION_NAME}).\n\n" +
                "Se algo não estiver funcionando, dá para baixar e instalar o app de novo.")
            .setPositiveButton("Instalar de novo") { _, _ -> downloadAndInstall(activity, apkUrl) }
            .setNegativeButton("Fechar", null)
            .setCancelable(true)
            .show()
    }

    private fun showUpdateDialog(activity: Activity, versionName: String, apkUrl: String) {
        AlertDialog.Builder(activity)
            .setTitle("Nova versão disponível")
            .setMessage("Versão $versionName está disponível. Atualizar agora?")
            .setPositiveButton("Atualizar") { _, _ -> downloadAndInstall(activity, apkUrl) }
            .setNegativeButton("Depois", null)
            .setCancelable(true)
            .show()
    }

    private fun downloadAndInstall(activity: Activity, apkUrl: String) {
        Toast.makeText(activity, "Baixando atualização...", Toast.LENGTH_SHORT).show()

        thread {
            try {
                val apkFile = File(activity.cacheDir, APK_FILE_NAME)

                (URL(apkUrl).openConnection() as HttpURLConnection).run {
                    connectTimeout = 15000
                    readTimeout = 15000
                    inputStream.use { input ->
                        FileOutputStream(apkFile).use { output -> input.copyTo(output) }
                    }
                }

                activity.runOnUiThread {
                    val uri = FileProvider.getUriForFile(
                        activity,
                        "${activity.packageName}.fileprovider",
                        apkFile,
                    )
                    val installIntent = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, "application/vnd.android.package-archive")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    activity.startActivity(installIntent)
                }
            } catch (e: Exception) {
                activity.runOnUiThread {
                    Toast.makeText(activity, "Falha ao baixar a atualização: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
