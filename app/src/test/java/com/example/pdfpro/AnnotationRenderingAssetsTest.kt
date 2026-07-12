package com.example.pdfpro

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class AnnotationRenderingAssetsTest {
    private val html = File("src/main/assets/index.html").readText()

    @Test
    fun annotationExportPreservesGlyphProportions() {
        assertTrue(html.contains("ctx.setTransform(DPR, 0, 0, DPR, 0, 0);"))
        assertFalse(html.contains("ctx.scale(scaleX"))
    }

    @Test
    fun zoomSliderCoalescesUpdatesByAnimationFrame() {
        assertTrue(html.contains("sliderZoomFrame = requestAnimationFrame"))
        assertTrue(html.contains("applyZoom(pendingSliderZoom)"))
    }
}
