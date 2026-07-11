package com.example.pdfpro

import android.Manifest
import android.annotation.SuppressLint
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
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "PDFPro"
        private const val ASSET_HOST = "appassets.androidplatform.net"
        private const val APP_URL = "https://$ASSET_HOST/assets/index.html"
    }

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSave: PendingSave? = null
    private val saveInProgress = AtomicBoolean(false)

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
            Thread { saveFileToDownloads(save.bytes, save.fileName) }.start()
        } else {
            notifySaveResult(false, "未获得存储权限")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportRequestWindowFeature(Window.FEATURE_NO_TITLE)
        setContentView(R.layout.activity_main)

        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = true
        webView = findViewById(R.id.webView)
        assetLoader = WebViewAssetLoader.Builder()
            .setDomain(ASSET_HOST)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        configureWebView()
        configureBackNavigation()
        webView.loadUrl(APP_URL)
    }

    @SuppressLint("SetJavaScriptEnabled")
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
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = true
        }

        webView.addJavascriptInterface(WebAppInterface(), "Android")
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
                val url = request?.url ?: return emptyResponse()
                return if (isTrustedAsset(url)) {
                    assetLoader.shouldInterceptRequest(url) ?: emptyResponse()
                } else {
                    Log.w(TAG, "Blocked external WebView request: $url")
                    emptyResponse()
                }
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean = request?.url?.let { !isTrustedAsset(it) } ?: true

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    Log.e(TAG, "WebView load error: ${error?.description}, url=${request.url}")
                }
            }
        }
    }

    private fun configureBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript(
                    "(function(){return typeof handleBackPress==='function' && handleBackPress();})()"
                ) { handled ->
                    if (handled != "true") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        })
    }

    private fun isTrustedAsset(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host == ASSET_HOST

    private fun emptyResponse(): WebResourceResponse =
        WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))

    private fun openPdfPicker(): Boolean {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/pdf"
        }
        return try {
            fileChooserLauncher.launch(intent)
            true
        } catch (e: Exception) {
            Log.e(TAG, "无法启动文件选择器", e)
            fileUploadCallback?.onReceiveValue(null)
            fileUploadCallback = null
            false
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

    inner class WebAppInterface {
        @JavascriptInterface
        fun saveBase64Pdf(base64Data: String, fileName: String) {
            if (!saveInProgress.compareAndSet(false, true)) {
                notifySaveResult(false, "已有保存任务正在进行")
                return
            }
            runOnUiThread {
                Toast.makeText(this@MainActivity, "正在保存...", Toast.LENGTH_SHORT).show()
            }
            Thread {
                try {
                    if (isFinishing || isDestroyed) {
                        saveInProgress.set(false)
                        return@Thread
                    }
                    val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                    saveFileWithPermissionIfNeeded(bytes, PdfFileNames.sanitize(fileName))
                } catch (e: Exception) {
                    Log.e(TAG, "保存 PDF 失败", e)
                    notifySaveResult(false, e.message ?: "未知错误")
                }
            }.start()
        }

        @JavascriptInterface
        fun toggleStatusBar(show: Boolean) {
            runOnUiThread { toggleSystemUI(show) }
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
            ?: run {
                notifySaveResult(false, "无法创建下载文件")
                return
            }

        try {
            resolver.openOutputStream(uri)?.use { it.write(bytes) }
                ?: throw IOException("无法打开输出流")
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            notifySaveResult(true, fileName)
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            Log.e(TAG, "写入 PDF 失败", e)
            notifySaveResult(false, e.message ?: "未知错误")
        }
    }

    @Suppress("DEPRECATION")
    private fun saveFileToLegacyDownloads(bytes: ByteArray, fileName: String) {
        try {
            val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloads.exists() && !downloads.mkdirs()) {
                throw IOException("无法创建下载目录")
            }
            val output = uniqueFile(downloads, fileName)
            FileOutputStream(output).use { it.write(bytes) }
            notifySaveResult(true, output.name)
        } catch (e: Exception) {
            Log.e(TAG, "保存到旧版下载目录失败", e)
            notifySaveResult(false, e.message ?: "未知错误")
        }
    }

    private fun uniqueFile(directory: File, fileName: String): File {
        val dot = fileName.lastIndexOf('.')
        val base = if (dot > 0) fileName.substring(0, dot) else fileName
        val extension = if (dot > 0) fileName.substring(dot) else ".pdf"
        var candidate = File(directory, fileName)
        var suffix = 1
        while (candidate.exists()) {
            candidate = File(directory, "$base-$suffix$extension")
            suffix++
        }
        return candidate
    }

    private fun notifySaveResult(success: Boolean, message: String) {
        saveInProgress.set(false)
        if (isFinishing || isDestroyed) return
        runOnUiThread {
            Toast.makeText(
                this,
                if (success) "已保存到下载文件夹" else "保存失败：$message",
                Toast.LENGTH_LONG
            ).show()
            webView.evaluateJavascript(
                "window.onNativeSaveResult && window.onNativeSaveResult($success, ${JSONObject.quote(message)});",
                null
            )
        }
    }

    override fun onDestroy() {
        fileUploadCallback?.onReceiveValue(null)
        fileUploadCallback = null
        pendingSave = null
        saveInProgress.set(false)
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
