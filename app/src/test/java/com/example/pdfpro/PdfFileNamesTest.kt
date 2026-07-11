package com.example.pdfpro

import org.junit.Assert.assertEquals
import org.junit.Test

class PdfFileNamesTest {
    @Test
    fun keepsReadablePdfName() {
        assertEquals("report-PDF-Pro-annotated.pdf", PdfFileNames.sanitize("report-PDF-Pro-annotated.pdf"))
    }

    @Test
    fun replacesInvalidCharactersAndAddsExtension() {
        assertEquals("a-b-c.pdf", PdfFileNames.sanitize(" a/b:c "))
    }

    @Test
    fun fallsBackForBlankName() {
        assertEquals("PDF-Pro-annotated.pdf", PdfFileNames.sanitize("   "))
    }
}
