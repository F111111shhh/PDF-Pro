package com.example.pdfpro

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.view.Window
import android.webkit.*
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.io.IOException

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "PDFPro"
    }

    private lateinit var webView: WebView
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        // 【修复】先取出callback引用再清空，防止重入问题
        val callback = fileUploadCallback
        fileUploadCallback = null
        if (callback == null) return@registerForActivityResult

        val results: Array<Uri>? = if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val dataString = result.data?.dataString
            if (dataString != null) arrayOf(Uri.parse(dataString)) else null
        } else {
            null
        }
        // 【修复】无论成功失败都必须调用onReceiveValue，否则WebView文件选择会永久失效
        callback.onReceiveValue(results)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportRequestWindowFeature(Window.FEATURE_NO_TITLE)
        setContentView(R.layout.activity_main)

        val windowInsetsController = WindowCompat.getInsetsController(window, window.decorView)
        windowInsetsController.isAppearanceLightStatusBars = true

        webView = findViewById(R.id.webView)

        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        // 【优化】关闭过度滚动边缘发光效果
        webView.overScrollMode = WebView.OVER_SCROLL_NEVER

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        // 【优化】确保本地file://页面能加载https CDN资源
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        // 【优化】合理缓存策略
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        webView.addJavascriptInterface(WebAppInterface(this), "Android")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                // 如果上一次的callback还未完成，先取消
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = filePathCallback

                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "application/pdf"
                }
                try {
                    fileChooserLauncher.launch(intent)
                } catch (e: Exception) {
                    Log.e(TAG, "无法启动文件选择器", e)
                    fileUploadCallback?.onReceiveValue(null)
                    fileUploadCallback = null
                    return false
                }
                return true
            }
        }

        // 【优化】添加WebViewClient捕获加载错误
        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                Log.e(TAG, "WebView加载错误: ${error?.description}, URL: ${request?.url}")
            }
        }

        webView.loadUrl("file:///android_asset/index.html")
    }

    // 【新增】返回键处理：让JS侧有机会处理（关闭弹窗/退出批注模式等）
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        webView.evaluateJavascript(
            "(function() { return typeof handleBackPress === 'function' ? handleBackPress() : false; })()"
        ) { result ->
            if (result != "true") {
                @Suppress("DEPRECATION")
                super.onBackPressed()
            }
        }
    }

    private fun toggleSystemUI(show: Boolean) {
        val windowInsetsController = WindowCompat.getInsetsController(window, window.decorView)
        windowInsetsController.isAppearanceLightStatusBars = true
        windowInsetsController.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

        if (show) {
            windowInsetsController.show(WindowInsetsCompat.Type.statusBars())
        } else {
            windowInsetsController.hide(WindowInsetsCompat.Type.statusBars())
        }
    }

    inner class WebAppInterface(private val activity: Activity) {
        @JavascriptInterface
        fun saveBase64Pdf(base64Data: String, fileName: String) {
            runOnUiThread {
                Toast.makeText(activity, "正在保存...", Toast.LENGTH_SHORT).show()
            }
            Thread {
                try {
                    // 【修复】检查Activity是否仍然存活
                    if (isFinishing || isDestroyed) return@Thread
                    val pdfAsBytes = Base64.decode(base64Data, Base64.DEFAULT)
                    saveFileToDownloads(pdfAsBytes, fileName)
                } catch (e: Exception) {
                    Log.e(TAG, "保存PDF失败", e)
                    if (!isFinishing && !isDestroyed) {
                        runOnUiThread {
                            Toast.makeText(activity, "保存失败: ${e.message}", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }.start()
        }

        @JavascriptInterface
        fun toggleStatusBar(show: Boolean) {
            runOnUiThread {
                toggleSystemUI(show)
            }
        }
    }

    private fun saveFileToDownloads(bytes: ByteArray, fileName: String) {
        val resolver = applicationContext.contentResolver
        val contentValues = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
            put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        }
        try {
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
            if (uri != null) {
                resolver.openOutputStream(uri)?.use { it.write(bytes) }
                    ?: throw IOException("无法打开输出流")
                if (!isFinishing && !isDestroyed) {
                    runOnUiThread {
                        Toast.makeText(this, "成功！已保存到下载文件夹", Toast.LENGTH_LONG).show()
                    }
                }
            } else {
                throw IOException("无法创建文件")
            }
        } catch (e: Exception) {
            Log.e(TAG, "保存到下载目录失败", e)
            if (!isFinishing && !isDestroyed) {
                runOnUiThread {
                    Toast.makeText(this, "保存出错: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    // 【优化】Activity销毁时清理WebView防止内存泄露
    override fun onDestroy() {
        webView.stopLoading()
        webView.removeJavascriptInterface("Android")
        webView.destroy()
        super.onDestroy()
    }
}