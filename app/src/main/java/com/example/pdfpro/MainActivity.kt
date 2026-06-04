package com.example.pdfpro

import android.Manifest
import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.view.Window
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "PDFPro"
        private const val APP_URL = "https://appassets.androidplatform.net/assets/index.html"
    }

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSave: PendingSave? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = fileUploadCallback ?: return@registerForActivityResult
        fileUploadCallback = null
        val uri = result.data?.data
        callback.onReceiveValue(
            if (result.resultCode == Activity.RESULT_OK && uri != null) arrayOf(uri) else null
        )
    }

    private val storagePermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val save = pendingSave
        pendingSave = null
        if (granted && save != null) {
            Thread {
                saveFileToDownloads(save.bytes, save.fileName)
            }.start()
        } else {
            notifySaveResult(false, "Storage permission denied")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportRequestWindowFeature(Window.FEATURE_NO_TITLE)
        setContentView(R.layout.activity_main)

        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = true

        webView = findViewById(R.id.webView)
        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        configureWebView()
        webView.loadUrl(APP_URL)
    }

    private fun configureWebView() {
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.overScrollMode = WebView.OVER_SCROLL_NEVER

        WebView.setWebContentsDebuggingEnabled(false)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            allowFileAccessFromFileURLs = false
            allowUniversalAccessFromFileURLs = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = true
        }

        webView.addJavascriptInterface(WebAppInterface(this), "Android")
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = filePathCallback
                return openPdfPicker()
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                return request?.url?.let { assetLoader.shouldInterceptRequest(it) }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: android.webkit.WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    Log.e(TAG, "WebView load error: ${error?.description}, url=${request.url}")
                }
            }
        }
    }

    private fun openPdfPicker(): Boolean {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/pdf"
        }
        return try {
            fileChooserLauncher.launch(intent)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Could not launch file picker", e)
            fileUploadCallback?.onReceiveValue(null)
            fileUploadCallback = null
            false
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        webView.evaluateJavascript(
            "(function(){return typeof handleBackPress==='function' ? handleBackPress() : false;})()"
        ) { handled ->
            if (handled != "true") {
                @Suppress("DEPRECATION")
                super.onBackPressed()
            }
        }
    }

    private fun toggleSystemUI(show: Boolean) {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = true
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        if (show) {
            controller.show(WindowInsetsCompat.Type.statusBars())
        } else {
            controller.hide(WindowInsetsCompat.Type.statusBars())
        }
    }

    inner class WebAppInterface(private val activity: Activity) {
        @JavascriptInterface
        fun saveBase64Pdf(base64Data: String, fileName: String) {
            runOnUiThread {
                Toast.makeText(activity, "Saving PDF...", Toast.LENGTH_SHORT).show()
            }
            Thread {
                try {
                    if (isFinishing || isDestroyed) return@Thread
                    val pdfBytes = Base64.decode(base64Data, Base64.DEFAULT)
                    saveFileWithPermissionIfNeeded(pdfBytes, sanitizeFileName(fileName))
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to save PDF", e)
                    notifySaveResult(false, e.message ?: "unknown error")
                }
            }.start()
        }

        @JavascriptInterface
        fun toggleStatusBar(show: Boolean) {
            runOnUiThread { toggleSystemUI(show) }
        }
    }

    private fun saveFileToDownloads(bytes: ByteArray, fileName: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            saveFileToLegacyDownloads(bytes, fileName)
            return
        }

        val resolver = applicationContext.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
            put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }

        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IOException("Could not create Downloads entry")

        try {
            resolver.openOutputStream(uri)?.use { it.write(bytes) }
                ?: throw IOException("Could not open output stream")
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            notifySaveResult(true, fileName)
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            Log.e(TAG, "Failed to write PDF", e)
            notifySaveResult(false, e.message ?: "unknown error")
        }
    }

    private fun saveFileWithPermissionIfNeeded(bytes: ByteArray, fileName: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            saveFileToDownloads(bytes, fileName)
            return
        }
        pendingSave = PendingSave(bytes, fileName)
        runOnUiThread {
            storagePermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }
    }

    private fun saveFileToLegacyDownloads(bytes: ByteArray, fileName: String) {
        try {
            val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloads.exists() && !downloads.mkdirs()) {
                throw IOException("Could not create Downloads folder")
            }
            val output = uniqueFile(downloads, fileName)
            FileOutputStream(output).use { it.write(bytes) }
            notifySaveResult(true, output.name)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save legacy PDF", e)
            notifySaveResult(false, e.message ?: "unknown error")
        }
    }

    private fun uniqueFile(directory: File, fileName: String): File {
        val dot = fileName.lastIndexOf('.')
        val base = if (dot > 0) fileName.substring(0, dot) else fileName
        val ext = if (dot > 0) fileName.substring(dot) else ".pdf"
        var candidate = File(directory, fileName)
        var counter = 1
        while (candidate.exists()) {
            candidate = File(directory, "$base-$counter$ext")
            counter++
        }
        return candidate
    }

    private fun sanitizeFileName(fileName: String): String {
        val cleaned = fileName
            .replace(Regex("""[\\/:*?"<>|]"""), "-")
            .trim()
        return if (cleaned.endsWith(".pdf", ignoreCase = true)) cleaned else "$cleaned.pdf"
    }

    private fun notifySaveResult(success: Boolean, message: String) {
        if (isFinishing || isDestroyed) return
        val escaped = message
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", " ")
        runOnUiThread {
            Toast.makeText(
                this,
                if (success) "Saved to Downloads" else "Save failed: $message",
                Toast.LENGTH_LONG
            ).show()
            webView.evaluateJavascript(
                "if(window.onNativeSaveResult){window.onNativeSaveResult($success,'$escaped');}",
                null
            )
        }
    }

    override fun onDestroy() {
        fileUploadCallback?.onReceiveValue(null)
        fileUploadCallback = null
        webView.stopLoading()
        webView.removeJavascriptInterface("Android")
        webView.destroy()
        super.onDestroy()
    }

    private data class PendingSave(
        val bytes: ByteArray,
        val fileName: String
    )
}
