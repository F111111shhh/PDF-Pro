package com.example.pdfpro

internal object PdfFileNames {
    private val invalidCharacters = Regex("""[\\/:*?\"<>|]""")

    fun sanitize(fileName: String): String {
        val cleaned = fileName
            .replace(invalidCharacters, "-")
            .trim()
            .trimEnd('.')
            .ifBlank { "PDF-Pro-annotated" }
        return if (cleaned.endsWith(".pdf", ignoreCase = true)) cleaned else "$cleaned.pdf"
    }
}
