package com.example.pdfpro

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class OfflineAssetsTest {
    private val assets = File("src/main/assets")

    @Test
    fun pageDoesNotLoadScriptsOrStylesFromTheNetwork() {
        val html = File(assets, "index.html").readText()
        val remoteAsset = Regex("""<(script|link)[^>]+(src|href)=[\"']https?://""", RegexOption.IGNORE_CASE)
        assertFalse(remoteAsset.containsMatchIn(html))
    }

    @Test
    fun requiredPdfLibrariesAreBundled() {
        assertTrue(File(assets, "vendor/pdfjs/pdf.min.js").isFile)
        assertTrue(File(assets, "vendor/pdfjs/pdf.worker.min.js").isFile)
        assertTrue(File(assets, "vendor/pdf-lib/pdf-lib.min.js").isFile)
    }
}
