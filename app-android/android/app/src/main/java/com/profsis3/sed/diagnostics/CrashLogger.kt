package com.profsis3.sed.diagnostics

import android.content.Context
import android.util.Log
import java.io.File

/**
 * Sem acesso a logcat do aparelho do usuário pra diagnosticar crashes reportados,
 * isso guarda o stack trace do último crash num arquivo interno e devolve na próxima
 * abertura do app (ver MainActivity.onCreate/showLastCrashDialog) - dá pra copiar e
 * colar de volta pra investigação, sem precisar de adb/computador.
 */
object CrashLogger {

    private const val FILE_NAME = "crash_log.txt"

    fun install(context: Context) {
        val appContext = context.applicationContext
        val previousHandler = Thread.getDefaultUncaughtExceptionHandler()

        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                logFile(appContext).writeText(Log.getStackTraceString(throwable))
            } catch (e: Exception) {
                // Se nem isso der certo, segue pro handler padrão mesmo assim.
            }
            previousHandler?.uncaughtException(thread, throwable)
        }
    }

    /** Lê e apaga o log do último crash, se houver. */
    fun consumeLastCrash(context: Context): String? {
        val file = logFile(context.applicationContext)
        if (!file.exists()) return null
        val content = file.readText()
        file.delete()
        return content.ifBlank { null }
    }

    private fun logFile(context: Context): File = File(context.filesDir, FILE_NAME)
}
