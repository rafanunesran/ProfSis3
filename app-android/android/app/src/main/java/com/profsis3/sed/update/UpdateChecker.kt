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

    private const val VERSION_URL = "https://rafanunesran.github.io/ProfSis3/app-android/dist/version.json"
    private const val APK_FILE_NAME = "profsis3-sed-update.apk"

    fun checkForUpdate(activity: Activity) {
        thread {
            try {
                val json = (URL(VERSION_URL).openConnection() as HttpURLConnection).run {
                    connectTimeout = 8000
                    readTimeout = 8000
                    inputStream.bufferedReader().use { it.readText() }
                }
                val remote = JSONObject(json)
                val remoteVersionCode = remote.getInt("versionCode")
                val remoteVersionName = remote.optString("versionName", "")
                val apkUrl = remote.getString("apkUrl")

                if (remoteVersionCode > BuildConfig.VERSION_CODE) {
                    activity.runOnUiThread { showUpdateDialog(activity, remoteVersionName, apkUrl) }
                }
            } catch (e: Exception) {
                // Sem conexão ou version.json fora do ar - ignora, tenta de novo na próxima abertura.
            }
        }
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
