# PDF Pro 2.0

<p align="center">
  <img width="120" height="120" alt="PDF Pro Logo" src="https://github.com/user-attachments/assets/15b4ca6f-0b37-4ee0-9123-90b1e3b8de18" />
</p>

<h3 align="center">Offline-first PDF annotation for Android / Android 本地 PDF 批注工具</h3>

<p align="center">
  <a href="#download--下载">Download</a> ·
  <a href="#features--功能">Features</a> ·
  <a href="#usage--使用">Usage</a> ·
  <a href="#architecture--架构">Architecture</a>
</p>

---

## Overview / 简介

PDF Pro is a lightweight Android app for annotating PDFs locally. It is designed for contracts, forms, papers, and quick markups where privacy and speed matter.

PDF Pro 是一款轻量级 Android PDF 批注应用，适合合同签字、表格填写、论文阅读和临时标记。文档处理全部在本机完成，无需账号，也不需要把 PDF 上传到服务器。

## Features / 功能

- **Offline PDF engine / 离线 PDF 引擎**: PDF.js, the PDF worker, and pdf-lib are bundled inside the APK. No CDN loading is required.
- **Text annotation / 文字批注**: add, edit, drag, delete, resize, recolor, and save text annotations.
- **Highlight and box / 高亮与矩形框**: mark passages with translucent highlights or draw visible boxes around important content.
- **Signature and freehand ink / 签名与手写**: draw signatures or quick freehand notes directly on the page.
- **Pinch zoom and fast scroll / 手势缩放与快速滚动**: pinch from 0.5x to 4.0x and use the side scroll thumb for long documents.
- **Standard PDF output / 标准 PDF 输出**: annotations are embedded into a saved PDF that can be opened by WPS, Adobe Acrobat, system viewers, and other PDF readers.
- **Safer WebView shell / 更安全的 WebView 外壳**: local HTTPS asset loading, no mixed-content loading, and reduced file-access surface.

## Download / 下载

Download the latest APK from [GitHub Releases](../../releases/latest).

从 [GitHub Releases](../../releases/latest) 下载最新 APK。

**Requirement / 系统要求**: Android 7.0 (API 24) or later.

## Usage / 使用

1. Tap **Open / 打开** and choose a PDF.
2. Choose an annotation mode: text, highlight, box, or signature.
3. Tap or draw on the page to create an annotation.
4. Tap an annotation to select it; drag to move it; tap selected text again to edit it.
5. Tap the red delete button on a selected annotation to remove it.
6. Tap **Save / 保存**. The exported PDF is saved to Downloads with a readable timestamped name.

## Architecture / 架构

- **Android shell**: Kotlin Activity + WebView.
- **Asset loading**: AndroidX WebKit `WebViewAssetLoader` serves bundled assets through a local HTTPS origin.
- **Rendering**: bundled PDF.js renders pages to canvas.
- **PDF writing**: bundled pdf-lib embeds text, highlights, boxes, and freehand ink into a new PDF.
- **Native bridge**: the JavaScript bridge exposes only save and system UI methods.

## Release Notes / 发布说明

See [v2.0.0 release notes](docs/release-notes/v2.0.0.md).

## Screenshots / 截图

<p align="center">
  <img src="https://github.com/user-attachments/assets/1cbd9ba7-d534-40ae-a6c2-06606199e067" width="30%" alt="Home"/>
  <img src="https://github.com/user-attachments/assets/99e2c21a-c443-49d5-83ff-d88d22af9e0b" width="30%" alt="Annotation"/>
  <img src="https://github.com/user-attachments/assets/d83e08eb-7256-4c03-8e25-fc9ca81df910" width="30%" alt="Color picker"/>
</p>

## Development / 开发

```bash
./gradlew :app:assembleDebug :app:testDebugUnitTest
```

For release signing, provide these Gradle properties:

```properties
PDF_PRO_STORE_FILE=/path/to/release.jks
PDF_PRO_STORE_PASSWORD=...
PDF_PRO_KEY_ALIAS=...
PDF_PRO_KEY_PASSWORD=...
```

If the original v1.0.0 signing key is unavailable, a newly signed APK may require users to uninstall the previous version before installing v2.0.0.

如果无法沿用 v1.0.0 的原签名密钥，新签名 APK 可能需要用户先卸载旧版再安装 v2.0.0。

## License / 协议

MIT License. See [LICENSE](LICENSE).
