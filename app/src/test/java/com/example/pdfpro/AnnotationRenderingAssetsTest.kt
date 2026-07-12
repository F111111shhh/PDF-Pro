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
    fun annotationPlacementUsesTheActualPageBoxAndFinalDragDelta() {
        assertTrue(html.contains("var ratioX = info.pdfW / info.cssW;"))
        assertTrue(html.contains("var ratioY = info.pdfH / info.cssH;"))
        assertTrue(html.contains("applyDragPosition();"))
    }

    @Test
    fun pageRenderingUsesABoundedQueue() {
        assertTrue(html.contains("MAX_ACTIVE_RENDERS = 2"))
        assertTrue(html.contains("state.renderTask.cancel()"))
        assertTrue(html.contains("requestRenderPage(pageNumber"))
    }

    @Test
    fun zoomSliderCoalescesUpdatesByAnimationFrame() {
        assertTrue(html.contains("sliderZoomFrame = requestAnimationFrame"))
        assertTrue(html.contains("applyZoom(pendingSliderZoom)"))
    }
}
