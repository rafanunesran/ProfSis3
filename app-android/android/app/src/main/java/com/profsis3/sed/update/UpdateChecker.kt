package com.profsis3.sed.update

import android.app.Activity
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import com.profsis3.sed.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Checagem de atualização para o APK distribuído fora da Play Store. O Android nunca
 * permite instalação 100% silenciosa de um app sideloaded (sempre exige confirmação do
 * usuário na tela do instalador do sistema - proteção do próprio SO); isso aqui
 * automatiza tudo até esse último passo: checa versão, baixa e abre o instalador
 * sozinho assim que o download termina.
 */
object UpdateChecker {

    private const val VERSION_URL = "https://rafanunesran.github.io/ProfSis3/app-android/dist/version.json"

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
        val downloadManager = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val request = DownloadManager.Request(Uri.parse(apkUrl))
            .setTitle("Atualizando ProfSis3 SED")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(activity, null, "profsis3-sed-update.apk")

        val downloadId = downloadManager.enqueue(request)

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val finishedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                if (finishedId != downloadId) return
                context.unregisterReceiver(this)

                val uri = downloadManager.getUriForDownloadedFile(downloadId) ?: return
                val installIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                activity.startActivity(installIntent)
            }
        }

        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            activity.registerReceiver(receiver, filter)
        }
    }
}
