(function () {
    "use strict";

    var PDFDocument = PDFLib.PDFDocument;
    var rgb = PDFLib.rgb;

    var PAD = 6;
    var LINE_HEIGHT = 1.4;
    var BASE_DPR = 2;
    var TEXT_DPR = 4;
    var FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif';
    var HIGHLIGHT_ALPHA = 0.32;
    var BOX_LINE_WIDTH = 2;
    var INK_LINE_WIDTH = 2.5;

    var state = {
        fileName: "document.pdf",
        originalFileBuffer: null,
        pdfDoc: null,
        totalPages: 0,
        annotations: {},
        pageInfoMap: {},
        mode: "text",
        color: { r: 255, g: 59, b: 48, a: 1 },
        fontSize: 14,
        opacity: 1,
        scale: 1,
        baseWidth: 0,
        baseHeight: 0,
        pageObserver: null,
        isToolbarVisible: true,
        justDeleted: false,
        lastTextCommitAt: 0,
        activeTextArea: null,
        tempShape: null,
        tempInk: null
    };

    var el = {
        openBtn: document.getElementById("openBtn"),
        fileInput: document.getElementById("fileInput"),
        emptyState: document.getElementById("emptyState"),
        saveBtn: document.getElementById("saveBtn"),
        toolbar: document.getElementById("mainToolbar"),
        modeButtons: Array.prototype.slice.call(document.querySelectorAll(".mode-button")),
        colorBtn: document.getElementById("colorBtn"),
        colorModal: document.getElementById("colorModal"),
        colorGrid: document.getElementById("colorGrid"),
        presetRow: document.getElementById("presetRow"),
        closeColorBtn: document.getElementById("closeColorBtn"),
        sizeSlider: document.getElementById("sizeSlider"),
        sizeValue: document.getElementById("sizeValue"),
        opacitySlider: document.getElementById("opacitySlider"),
        opacityValue: document.getElementById("opacityValue"),
        zoomSlider: document.getElementById("zoomSlider"),
        zoomValue: document.getElementById("zoomValue"),
        scrollWindow: document.getElementById("scrollWindow"),
        sizingContainer: document.getElementById("sizingContainer"),
        contentLayer: document.getElementById("contentLayer"),
        scrollThumb: document.getElementById("scrollThumb"),
        scrollTrack: document.getElementById("customScrollbarTrack"),
        pageIndicator: document.getElementById("pageIndicator"),
        toast: document.getElementById("toast")
    };

    var colorChoices = [
        "#FFFFFF", "#E6E6E6", "#CCCCCC", "#999999", "#666666", "#333333", "#000000", "#FF3B30", "#FF9500",
        "#FFD60A", "#34C759", "#30B0C7", "#0A84FF", "#5E5CE6", "#AF52DE", "#FF2D55", "#8E8E93", "#111827",
        "#FFF59D", "#FFE082", "#FFCC80", "#EF9A9A", "#CE93D8", "#90CAF9", "#80CBC4", "#A5D6A7", "#C5E1A5",
        "#F44336", "#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#2196F3", "#009688", "#4CAF50", "#8BC34A",
        "#CDDC39", "#FFC107", "#FF9800", "#795548", "#607D8B", "#455A64", "#263238", "#1565C0", "#00695C"
    ];
    var presetChoices = ["#FF3B30", "#FFD60A", "#0A84FF", "#34C759", "#000000", "#FFFFFF"];

    var measureSpan = document.createElement("span");
    measureSpan.style.cssText = [
        "position:fixed",
        "left:-99999px",
        "top:-99999px",
        "visibility:hidden",
        "white-space:pre",
        "font-weight:700",
        "padding:0",
        "border:0",
        "margin:0",
        "line-height:" + LINE_HEIGHT,
        "font-family:" + FONT_FAMILY
    ].join(";");
    document.body.appendChild(measureSpan);

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function uniqueId() {
        return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    }

    function hexToColor(hex) {
        var normalized = hex.replace("#", "");
        return {
            r: parseInt(normalized.slice(0, 2), 16),
            g: parseInt(normalized.slice(2, 4), 16),
            b: parseInt(normalized.slice(4, 6), 16),
            a: state.opacity
        };
    }

    function colorToCss(color, alphaOverride) {
        var alpha = typeof alphaOverride === "number" ? alphaOverride : color.a;
        return "rgba(" + color.r + ", " + color.g + ", " + color.b + ", " + alpha + ")";
    }

    function colorToPdf(color) {
        return rgb(color.r / 255, color.g / 255, color.b / 255);
    }

    function showToast(message) {
        el.toast.textContent = message;
        el.toast.classList.add("visible");
        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(function () {
            el.toast.classList.remove("visible");
        }, 2600);
    }

    function showError(message, err) {
        if (err) {
            console.error(message, err);
        }
        showToast(message);
    }

    function setMode(mode) {
        state.mode = mode;
        deselectAll();
        commitActiveText();
        el.modeButtons.forEach(function (btn) {
            btn.classList.toggle("active", btn.getAttribute("data-mode") === mode);
        });
        showToast(modeLabel(mode));
        toggleToolbar(true);
    }

    function modeLabel(mode) {
        var labels = {
            text: "文字模式 / Text",
            highlight: "高亮模式 / Highlight",
            box: "矩形模式 / Box",
            ink: "签名/手写模式 / Signature"
        };
        return labels[mode] || mode;
    }

    function pageElement(pageNumber) {
        return document.getElementById("page-" + pageNumber);
    }

    function annotationsForPage(pageNumber) {
        var key = String(pageNumber);
        if (!state.annotations[key]) {
            state.annotations[key] = [];
        }
        return state.annotations[key];
    }

    function saveAnnotation(annotation) {
        var list = annotationsForPage(annotation.page);
        var idx = list.findIndex(function (item) { return item.id === annotation.id; });
        if (idx >= 0) {
            list[idx] = annotation;
        } else {
            list.push(annotation);
        }
        el.saveBtn.disabled = false;
    }

    function removeAnnotation(pageNumber, id) {
        var key = String(pageNumber);
        if (!state.annotations[key]) return;
        state.annotations[key] = state.annotations[key].filter(function (item) {
            return item.id !== id;
        });
    }

    function hasAnnotations() {
        return Object.keys(state.annotations).some(function (key) {
            return state.annotations[key] && state.annotations[key].length > 0;
        });
    }

    function deselectAll() {
        document.querySelectorAll(".annotation.selected").forEach(function (node) {
            node.classList.remove("selected");
        });
    }

    function getPagePoint(event, page) {
        var rect = page.getBoundingClientRect();
        var pageWidth = parseFloat(page.style.width);
        var pageHeight = parseFloat(page.style.height);
        var scale = rect.width / pageWidth;
        return {
            x: clamp((event.clientX - rect.left) / scale, 0, pageWidth),
            y: clamp((event.clientY - rect.top) / scale, 0, pageHeight)
        };
    }

    function measureLine(text, fontSize) {
        measureSpan.style.fontSize = fontSize + "px";
        measureSpan.textContent = text || "\u00A0";
        return measureSpan.getBoundingClientRect();
    }

    function measureTextBox(text, fontSize) {
        var lines = (text || "\u00A0").split("\n");
        var width = 0;
        var lineHeight = 0;
        lines.forEach(function (line) {
            var rect = measureLine(line, fontSize);
            width = Math.max(width, rect.width);
            lineHeight = Math.max(lineHeight, rect.height);
        });
        return {
            width: Math.max(34, Math.ceil(width) + PAD * 2),
            height: Math.max(28, Math.ceil(lineHeight * lines.length) + PAD * 2),
            lineHeight: lineHeight
        };
    }

    function baselineOffset(fontSize) {
        var div = document.createElement("div");
        div.style.cssText = [
            "position:absolute",
            "left:-9999px",
            "top:-9999px",
            "font-family:" + FONT_FAMILY,
            "font-size:" + fontSize + "px",
            "font-weight:700",
            "line-height:" + LINE_HEIGHT,
            "white-space:nowrap",
            "padding:0",
            "margin:0",
            "border:0"
        ].join(";");
        var text = document.createElement("span");
        text.textContent = "Mg中测ABC";
        var probe = document.createElement("span");
        probe.style.cssText = "display:inline-block;vertical-align:baseline;width:1px;height:0;overflow:hidden;";
        div.appendChild(text);
        div.appendChild(probe);
        document.body.appendChild(div);
        var result = probe.getBoundingClientRect().top - div.getBoundingClientRect().top;
        document.body.removeChild(div);
        return result;
    }

    function renderTextAnnotation(page, annotation) {
        var node = document.createElement("div");
        node.className = "annotation annotation-text";
        node.dataset.id = annotation.id;
        node.dataset.page = String(annotation.page);
        node.textContent = annotation.text;
        node.style.left = annotation.xPct + "%";
        node.style.top = annotation.yPct + "%";
        node.style.width = annotation.wPct + "%";
        node.style.minHeight = annotation.hPct + "%";
        node.style.fontSize = annotation.fontSize + "px";
        node.style.color = colorToCss(annotation.color);
        attachAnnotationControls(node, annotation);
        page.appendChild(node);
        return node;
    }

    function renderShapeAnnotation(page, annotation) {
        var node = document.createElement("div");
        node.className = "annotation annotation-" + annotation.type;
        node.dataset.id = annotation.id;
        node.dataset.page = String(annotation.page);
        node.style.left = annotation.xPct + "%";
        node.style.top = annotation.yPct + "%";
        node.style.width = annotation.wPct + "%";
        node.style.height = annotation.hPct + "%";
        if (annotation.type === "highlight") {
            node.style.background = colorToCss(annotation.color, annotation.color.a * HIGHLIGHT_ALPHA);
        } else {
            node.style.borderColor = colorToCss(annotation.color);
            node.style.borderWidth = BOX_LINE_WIDTH + "px";
        }
        attachAnnotationControls(node, annotation);
        page.appendChild(node);
        return node;
    }

    function renderInkAnnotation(page, annotation) {
        var node = document.createElement("div");
        node.className = "annotation annotation-ink";
        node.dataset.id = annotation.id;
        node.dataset.page = String(annotation.page);
        node.style.left = annotation.xPct + "%";
        node.style.top = annotation.yPct + "%";
        node.style.width = annotation.wPct + "%";
        node.style.height = annotation.hPct + "%";

        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 " + annotation.boxW + " " + annotation.boxH);
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pointsToPath(annotation.points));
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", colorToCss(annotation.color));
        path.setAttribute("stroke-width", String(annotation.strokeWidth));
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        svg.appendChild(path);
        node.appendChild(svg);
        attachAnnotationControls(node, annotation);
        page.appendChild(node);
        return node;
    }

    function renderAnnotation(page, annotation) {
        if (annotation.type === "text") return renderTextAnnotation(page, annotation);
        if (annotation.type === "ink") return renderInkAnnotation(page, annotation);
        return renderShapeAnnotation(page, annotation);
    }

    function annotationById(pageNumber, id) {
        var list = state.annotations[String(pageNumber)] || [];
        return list.find(function (item) { return item.id === id; });
    }

    function attachAnnotationControls(node, annotation) {
        var del = document.createElement("button");
        del.className = "delete-button";
        del.type = "button";
        del.textContent = "x";
        del.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            state.justDeleted = true;
            removeAnnotation(annotation.page, annotation.id);
            node.remove();
            setTimeout(function () { state.justDeleted = false; }, 100);
        });
        node.appendChild(del);

        node.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (!node.classList.contains("selected")) {
                deselectAll();
                node.classList.add("selected");
                return;
            }
            if (annotation.type === "text") {
                editTextAnnotation(annotation.page, annotation.id);
            }
        });

        makeDraggable(node, annotation);
    }

    function makeDraggable(node, annotation) {
        var drag = null;

        node.addEventListener("pointerdown", function (event) {
            if (!node.classList.contains("selected")) return;
            if (event.target.closest(".delete-button")) return;
            if (annotation.type === "text" && event.detail > 1) return;
            event.preventDefault();
            event.stopPropagation();
            var page = pageElement(annotation.page);
            var pageWidth = parseFloat(page.style.width);
            var pageHeight = parseFloat(page.style.height);
            drag = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                startLeft: parseFloat(node.style.left),
                startTop: parseFloat(node.style.top),
                pageWidth: pageWidth,
                pageHeight: pageHeight,
                moved: false
            };
            node.setPointerCapture(event.pointerId);
        });

        node.addEventListener("pointermove", function (event) {
            if (!drag || drag.pointerId !== event.pointerId) return;
            event.preventDefault();
            var page = pageElement(annotation.page);
            var rect = page.getBoundingClientRect();
            var scale = rect.width / drag.pageWidth;
            var dxPct = ((event.clientX - drag.startX) / scale) / drag.pageWidth * 100;
            var dyPct = ((event.clientY - drag.startY) / scale) / drag.pageHeight * 100;
            var wPct = parseFloat(node.style.width) || 0;
            var hPct = parseFloat(node.style.height) || 0;
            var left = clamp(drag.startLeft + dxPct, 0, Math.max(0, 100 - wPct));
            var top = clamp(drag.startTop + dyPct, 0, Math.max(0, 100 - hPct));
            node.style.left = left + "%";
            node.style.top = top + "%";
            drag.moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4;
        });

        node.addEventListener("pointerup", function (event) {
            if (!drag || drag.pointerId !== event.pointerId) return;
            var stored = annotationById(annotation.page, annotation.id);
            if (stored && drag.moved) {
                stored.xPct = parseFloat(node.style.left);
                stored.yPct = parseFloat(node.style.top);
            }
            node.releasePointerCapture(event.pointerId);
            drag = null;
        });
    }

    function createTextEditor(page, x, y, existing) {
        commitActiveText();
        var pageWidth = parseFloat(page.style.width);
        var pageHeight = parseFloat(page.style.height);
        var fontSize = existing ? existing.fontSize : state.fontSize;
        var color = existing ? existing.color : Object.assign({}, state.color, { a: state.opacity });
        var value = existing ? existing.text : "";
        var id = existing ? existing.id : uniqueId();

        if (existing) {
            removeAnnotation(existing.page, existing.id);
            var oldNode = page.querySelector('[data-id="' + existing.id + '"]');
            if (oldNode) oldNode.remove();
        }

        var editor = document.createElement("textarea");
        editor.className = "text-editor";
        editor.value = value;
        editor.style.left = clamp(x, 0, pageWidth - 20) / pageWidth * 100 + "%";
        editor.style.top = clamp(y, 0, pageHeight - 20) / pageHeight * 100 + "%";
        editor.style.fontSize = fontSize + "px";
        editor.style.color = colorToCss(color);

        function resize() {
            var box = measureTextBox(editor.value, fontSize);
            editor.style.width = box.width + "px";
            editor.style.height = box.height + "px";
        }

        editor.addEventListener("input", resize);
        editor.addEventListener("pointerdown", function (event) {
            event.stopPropagation();
        });
        editor.addEventListener("blur", function () {
            commitTextEditor(editor, page, id, fontSize, color);
        });
        editor.addEventListener("keydown", function (event) {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                editor.blur();
            }
        });

        page.appendChild(editor);
        state.activeTextArea = editor;
        resize();
        editor.focus();
        setTimeout(function () {
            editor.focus();
            editor.setSelectionRange(editor.value.length, editor.value.length);
        }, 20);
    }

    function commitActiveText() {
        if (state.activeTextArea) {
            state.activeTextArea.blur();
        }
    }

    function commitTextEditor(editor, page, id, fontSize, color) {
        if (!editor.parentNode) return;
        state.lastTextCommitAt = Date.now();
        var value = editor.value;
        state.activeTextArea = null;
        if (!value || !value.trim()) {
            editor.remove();
            return;
        }

        var pageWidth = parseFloat(page.style.width);
        var pageHeight = parseFloat(page.style.height);
        var leftPct = parseFloat(editor.style.left);
        var topPct = parseFloat(editor.style.top);
        var widthPct = editor.offsetWidth / pageWidth * 100;
        var heightPct = editor.offsetHeight / pageHeight * 100;
        var annotation = {
            id: id,
            type: "text",
            page: parseInt(page.dataset.page, 10),
            xPct: leftPct,
            yPct: topPct,
            wPct: widthPct,
            hPct: heightPct,
            text: value,
            fontSize: fontSize,
            color: color
        };
        saveAnnotation(annotation);
        editor.remove();
        renderAnnotation(page, annotation);
    }

    function editTextAnnotation(pageNumber, id) {
        var annotation = annotationById(pageNumber, id);
        if (!annotation) return;
        var page = pageElement(pageNumber);
        var pageWidth = parseFloat(page.style.width);
        var pageHeight = parseFloat(page.style.height);
        createTextEditor(page, annotation.xPct / 100 * pageWidth, annotation.yPct / 100 * pageHeight, annotation);
    }

    function startShape(event, page, type) {
        var point = getPagePoint(event, page);
        var preview = document.createElement("div");
        preview.className = "annotation annotation-" + type + " selected";
        preview.style.left = point.x / parseFloat(page.style.width) * 100 + "%";
        preview.style.top = point.y / parseFloat(page.style.height) * 100 + "%";
        preview.style.width = "0%";
        preview.style.height = "0%";
        if (type === "highlight") {
            preview.style.background = colorToCss(state.color, state.opacity * HIGHLIGHT_ALPHA);
        } else {
            preview.style.borderColor = colorToCss(state.color, state.opacity);
            preview.style.borderWidth = BOX_LINE_WIDTH + "px";
        }
        page.appendChild(preview);
        page.setPointerCapture(event.pointerId);
        state.tempShape = {
            pointerId: event.pointerId,
            page: page,
            type: type,
            start: point,
            preview: preview
        };
    }

    function updateShape(event) {
        var temp = state.tempShape;
        if (!temp || temp.pointerId !== event.pointerId) return;
        var point = getPagePoint(event, temp.page);
        var pageWidth = parseFloat(temp.page.style.width);
        var pageHeight = parseFloat(temp.page.style.height);
        var left = Math.min(temp.start.x, point.x);
        var top = Math.min(temp.start.y, point.y);
        var width = Math.abs(point.x - temp.start.x);
        var height = Math.abs(point.y - temp.start.y);
        temp.preview.style.left = left / pageWidth * 100 + "%";
        temp.preview.style.top = top / pageHeight * 100 + "%";
        temp.preview.style.width = width / pageWidth * 100 + "%";
        temp.preview.style.height = height / pageHeight * 100 + "%";
    }

    function finishShape(event) {
        var temp = state.tempShape;
        if (!temp || temp.pointerId !== event.pointerId) return;
        updateShape(event);
        var pageWidth = parseFloat(temp.page.style.width);
        var pageHeight = parseFloat(temp.page.style.height);
        var wPct = parseFloat(temp.preview.style.width);
        var hPct = parseFloat(temp.preview.style.height);
        temp.preview.remove();
        temp.page.releasePointerCapture(event.pointerId);
        state.tempShape = null;
        if (wPct < 1 || hPct < 1) return;
        var annotation = {
            id: uniqueId(),
            type: temp.type,
            page: parseInt(temp.page.dataset.page, 10),
            xPct: parseFloat(temp.preview.style.left),
            yPct: parseFloat(temp.preview.style.top),
            wPct: wPct,
            hPct: hPct,
            color: Object.assign({}, state.color, { a: state.opacity }),
            pageWidth: pageWidth,
            pageHeight: pageHeight
        };
        saveAnnotation(annotation);
        renderAnnotation(temp.page, annotation);
    }

    function startInk(event, page) {
        var point = getPagePoint(event, page);
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("annotation", "annotation-ink", "selected");
        svg.style.left = "0";
        svg.style.top = "0";
        svg.style.width = "100%";
        svg.style.height = "100%";
        svg.setAttribute("viewBox", "0 0 " + parseFloat(page.style.width) + " " + parseFloat(page.style.height));
        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", colorToCss(state.color, state.opacity));
        path.setAttribute("stroke-width", String(INK_LINE_WIDTH));
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        svg.appendChild(path);
        page.appendChild(svg);
        page.setPointerCapture(event.pointerId);
        state.tempInk = {
            pointerId: event.pointerId,
            page: page,
            svg: svg,
            path: path,
            points: [point]
        };
    }

    function updateInk(event) {
        var temp = state.tempInk;
        if (!temp || temp.pointerId !== event.pointerId) return;
        temp.points.push(getPagePoint(event, temp.page));
        temp.path.setAttribute("d", pointsToPath(temp.points));
    }

    function finishInk(event) {
        var temp = state.tempInk;
        if (!temp || temp.pointerId !== event.pointerId) return;
        updateInk(event);
        temp.svg.remove();
        temp.page.releasePointerCapture(event.pointerId);
        state.tempInk = null;
        if (temp.points.length < 2) return;
        var bounds = pointBounds(temp.points);
        if (bounds.width < 3 && bounds.height < 3) return;
        var padded = padBounds(bounds, INK_LINE_WIDTH * 2, parseFloat(temp.page.style.width), parseFloat(temp.page.style.height));
        var relativePoints = temp.points.map(function (point) {
            return { x: point.x - padded.x, y: point.y - padded.y };
        });
        var annotation = {
            id: uniqueId(),
            type: "ink",
            page: parseInt(temp.page.dataset.page, 10),
            xPct: padded.x / parseFloat(temp.page.style.width) * 100,
            yPct: padded.y / parseFloat(temp.page.style.height) * 100,
            wPct: padded.width / parseFloat(temp.page.style.width) * 100,
            hPct: padded.height / parseFloat(temp.page.style.height) * 100,
            boxW: padded.width,
            boxH: padded.height,
            points: relativePoints,
            strokeWidth: INK_LINE_WIDTH,
            color: Object.assign({}, state.color, { a: state.opacity })
        };
        saveAnnotation(annotation);
        renderAnnotation(temp.page, annotation);
    }

    function pointsToPath(points) {
        if (!points || points.length === 0) return "";
        var d = "M " + points[0].x + " " + points[0].y;
        for (var i = 1; i < points.length; i++) {
            d += " L " + points[i].x + " " + points[i].y;
        }
        return d;
    }

    function pointBounds(points) {
        var xs = points.map(function (point) { return point.x; });
        var ys = points.map(function (point) { return point.y; });
        var minX = Math.min.apply(null, xs);
        var maxX = Math.max.apply(null, xs);
        var minY = Math.min.apply(null, ys);
        var maxY = Math.max.apply(null, ys);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    function padBounds(bounds, pad, maxWidth, maxHeight) {
        var x = clamp(bounds.x - pad, 0, maxWidth);
        var y = clamp(bounds.y - pad, 0, maxHeight);
        var right = clamp(bounds.x + bounds.width + pad, 0, maxWidth);
        var bottom = clamp(bounds.y + bounds.height + pad, 0, maxHeight);
        return { x: x, y: y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
    }

    async function openPdfFile(file) {
        if (!file) return;
        showToast("正在打开 / Opening...");
        state.fileName = file.name || "document.pdf";
        try {
            var buffer = await file.arrayBuffer();
            state.originalFileBuffer = buffer.slice(0);
            state.pdfDoc = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
            state.totalPages = state.pdfDoc.numPages;
            state.annotations = {};
            state.pageInfoMap = {};
            el.emptyState.style.display = "none";
            await initView();
            el.saveBtn.disabled = false;
            showToast("已打开 / Opened");
        } catch (err) {
            showError("解析失败 / Could not open PDF", err);
        }
    }

    async function initView() {
        el.sizingContainer.classList.remove("visible");
        el.contentLayer.innerHTML = "";
        el.scrollWindow.scrollTop = 0;
        el.scrollWindow.scrollLeft = 0;
        if (state.pageObserver) {
            state.pageObserver.disconnect();
            state.pageObserver = null;
        }

        var firstPage = await state.pdfDoc.getPage(1);
        var firstViewport = firstPage.getViewport({ scale: 1 });
        var initialScale = (window.innerWidth - 20) / firstViewport.width;
        var maxWidth = 0;
        var totalHeight = 88;

        for (var i = 1; i <= state.totalPages; i++) {
            var page = await state.pdfDoc.getPage(i);
            var originalViewport = page.getViewport({ scale: 1 });
            var baseViewport = page.getViewport({ scale: initialScale });
            var cssWidth = Math.floor(baseViewport.width);
            var cssHeight = Math.floor(baseViewport.height);
            var renderScale = initialScale * BASE_DPR;
            var testViewport = page.getViewport({ scale: renderScale });
            var maxDim = 4096;
            if (testViewport.width > maxDim || testViewport.height > maxDim) {
                renderScale *= Math.min(maxDim / testViewport.width, maxDim / testViewport.height);
            }
            var renderViewport = page.getViewport({ scale: renderScale });
            var pageNode = document.createElement("section");
            pageNode.className = "page-container";
            pageNode.id = "page-" + i;
            pageNode.dataset.page = String(i);
            pageNode.style.width = cssWidth + "px";
            pageNode.style.height = cssHeight + "px";
            pageNode.addEventListener("pointerdown", onPagePointerDown);
            pageNode.addEventListener("pointermove", onPagePointerMove);
            pageNode.addEventListener("pointerup", onPagePointerUp);
            pageNode.addEventListener("pointercancel", onPagePointerUp);

            var canvas = document.createElement("canvas");
            canvas.width = Math.floor(renderViewport.width);
            canvas.height = Math.floor(renderViewport.height);
            await page.render({ canvasContext: canvas.getContext("2d"), viewport: renderViewport }).promise;
            pageNode.appendChild(canvas);
            el.contentLayer.appendChild(pageNode);

            state.pageInfoMap[i] = {
                cssW: cssWidth,
                cssH: cssHeight,
                pdfW: originalViewport.width,
                pdfH: originalViewport.height,
                scale: initialScale
            };
            maxWidth = Math.max(maxWidth, cssWidth);
            totalHeight += cssHeight + 16;
        }

        state.baseWidth = maxWidth;
        state.baseHeight = totalHeight;
        state.scale = 1;
        el.contentLayer.style.width = state.baseWidth + "px";
        el.contentLayer.style.height = state.baseHeight + "px";
        updateZoomLayout();
        setupPageObserver();
        requestAnimationFrame(function () {
            el.sizingContainer.classList.add("visible");
        });
    }

    function onPagePointerDown(event) {
        if (event.target.closest(".annotation") || event.target.closest(".text-editor")) return;
        if (Date.now() - state.lastTextCommitAt < 180) return;
        var page = event.currentTarget;
        deselectAll();
        if (state.mode === "text") {
            var point = getPagePoint(event, page);
            createTextEditor(page, point.x - PAD, point.y - state.fontSize * LINE_HEIGHT / 2);
            return;
        }
        event.preventDefault();
        if (state.mode === "highlight" || state.mode === "box") {
            startShape(event, page, state.mode);
        } else if (state.mode === "ink") {
            startInk(event, page);
        }
    }

    function onPagePointerMove(event) {
        if (state.tempShape) {
            event.preventDefault();
            updateShape(event);
        } else if (state.tempInk) {
            event.preventDefault();
            updateInk(event);
        }
    }

    function onPagePointerUp(event) {
        if (state.tempShape) {
            event.preventDefault();
            finishShape(event);
        } else if (state.tempInk) {
            event.preventDefault();
            finishInk(event);
        }
    }

    function setupPageObserver() {
        state.pageObserver = new IntersectionObserver(function (entries) {
            var best = null;
            var maxRatio = 0;
            entries.forEach(function (entry) {
                if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
                    maxRatio = entry.intersectionRatio;
                    best = entry.target.dataset.page;
                }
            });
            if (best) {
                el.pageIndicator.textContent = best + " / " + state.totalPages;
            }
        }, { threshold: [0.1, 0.3, 0.5, 0.7], root: el.scrollWindow });
        document.querySelectorAll(".page-container").forEach(function (page) {
            state.pageObserver.observe(page);
        });
    }

    function updateZoomLayout() {
        el.contentLayer.style.transform = "scale(" + state.scale + ")";
        el.sizingContainer.style.width = (state.baseWidth * state.scale) + "px";
        el.sizingContainer.style.height = (state.baseHeight * state.scale) + "px";
        el.zoomSlider.value = state.scale.toFixed(1);
        el.zoomValue.textContent = state.scale.toFixed(1);
        updateScrollThumb();
    }

    function applyZoom(nextScale) {
        nextScale = clamp(nextScale, 0.5, 4);
        var oldScale = state.scale;
        var rect = el.scrollWindow.getBoundingClientRect();
        var centerX = rect.width / 2;
        var centerY = rect.height / 2;
        var oldWidth = state.baseWidth * oldScale;
        var oldLeftOffset = oldWidth < rect.width ? (rect.width - oldWidth) / 2 : 0;
        var anchorX = (el.scrollWindow.scrollLeft + centerX - oldLeftOffset) / oldScale;
        var anchorY = (el.scrollWindow.scrollTop + centerY) / oldScale;
        state.scale = nextScale;
        updateZoomLayout();
        var newWidth = state.baseWidth * nextScale;
        var newLeftOffset = newWidth < rect.width ? (rect.width - newWidth) / 2 : 0;
        el.scrollWindow.scrollLeft = Math.max(0, anchorX * nextScale + newLeftOffset - centerX);
        el.scrollWindow.scrollTop = Math.max(0, anchorY * nextScale - centerY);
    }

    var pinch = { active: false, startDist: 0, startScale: 1 };
    el.scrollWindow.addEventListener("touchstart", function (event) {
        if (event.touches.length === 2) {
            event.preventDefault();
            pinch.active = true;
            pinch.startDist = Math.hypot(
                event.touches[1].clientX - event.touches[0].clientX,
                event.touches[1].clientY - event.touches[0].clientY
            );
            pinch.startScale = state.scale;
        }
    }, { passive: false });

    el.scrollWindow.addEventListener("touchmove", function (event) {
        if (!pinch.active || event.touches.length !== 2) return;
        event.preventDefault();
        var dist = Math.hypot(
            event.touches[1].clientX - event.touches[0].clientX,
            event.touches[1].clientY - event.touches[0].clientY
        );
        if (dist > 0 && pinch.startDist > 0) {
            applyZoom(pinch.startScale * dist / pinch.startDist);
        }
    }, { passive: false });

    el.scrollWindow.addEventListener("touchend", function (event) {
        if (event.touches.length < 2) {
            pinch.active = false;
        }
    });

    var scrollTimer = null;
    var thumbDrag = null;

    function updateScrollThumb() {
        var scrollHeight = el.scrollWindow.scrollHeight;
        var clientHeight = el.scrollWindow.clientHeight;
        if (scrollHeight <= clientHeight) {
            el.scrollThumb.classList.remove("active");
            return;
        }
        el.scrollThumb.classList.add("active");
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function () {
            if (!thumbDrag) el.scrollThumb.classList.remove("active");
        }, 1500);
        var trackHeight = el.scrollTrack.clientHeight;
        var thumbHeight = Math.max(40, clientHeight / scrollHeight * trackHeight);
        var maxTravel = trackHeight - thumbHeight;
        el.scrollThumb.style.height = thumbHeight + "px";
        el.scrollThumb.style.transform = "translateY(" + (el.scrollWindow.scrollTop / (scrollHeight - clientHeight) * maxTravel) + "px)";
    }

    el.scrollThumb.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        event.stopPropagation();
        thumbDrag = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startScroll: el.scrollWindow.scrollTop
        };
        el.scrollThumb.setPointerCapture(event.pointerId);
        el.scrollThumb.classList.add("active");
    });

    el.scrollThumb.addEventListener("pointermove", function (event) {
        if (!thumbDrag || thumbDrag.pointerId !== event.pointerId) return;
        event.preventDefault();
        var trackHeight = el.scrollTrack.clientHeight;
        var thumbHeight = parseFloat(el.scrollThumb.style.height) || 40;
        var maxTravel = trackHeight - thumbHeight;
        if (maxTravel <= 0) return;
        var dy = event.clientY - thumbDrag.startY;
        el.scrollWindow.scrollTop = thumbDrag.startScroll + dy / maxTravel * (el.scrollWindow.scrollHeight - el.scrollWindow.clientHeight);
    });

    el.scrollThumb.addEventListener("pointerup", function (event) {
        if (!thumbDrag || thumbDrag.pointerId !== event.pointerId) return;
        el.scrollThumb.releasePointerCapture(event.pointerId);
        thumbDrag = null;
        setTimeout(function () { el.scrollThumb.classList.remove("active"); }, 900);
    });

    function toggleToolbar(force) {
        state.isToolbarVisible = typeof force === "boolean" ? force : !state.isToolbarVisible;
        el.toolbar.classList.toggle("hidden", !state.isToolbarVisible);
        if (window.Android && window.Android.toggleStatusBar) {
            window.Android.toggleStatusBar(state.isToolbarVisible);
        }
    }

    el.scrollWindow.addEventListener("click", function (event) {
        if (state.justDeleted) return;
        if (event.target.closest(".annotation") || event.target.closest(".text-editor")) return;
        if (state.mode !== "text" && event.target.closest(".page-container")) return;
        if (state.activeTextArea) return;
        if (Date.now() - state.lastTextCommitAt < 180) return;
        toggleToolbar();
    });

    function buildColorUI() {
        el.colorGrid.innerHTML = "";
        colorChoices.forEach(function (hex) {
            var cell = document.createElement("button");
            cell.type = "button";
            cell.className = "color-cell";
            cell.style.background = hex;
            cell.dataset.hex = hex;
            cell.addEventListener("click", function () {
                state.color = hexToColor(hex);
                updateColorUI();
                closeColorModal();
            });
            el.colorGrid.appendChild(cell);
        });
        el.presetRow.innerHTML = "";
        presetChoices.forEach(function (hex) {
            var dot = document.createElement("button");
            dot.type = "button";
            dot.className = "preset-dot";
            dot.style.background = hex;
            dot.addEventListener("click", function () {
                state.color = hexToColor(hex);
                updateColorUI();
                closeColorModal();
            });
            el.presetRow.appendChild(dot);
        });
    }

    function updateColorUI() {
        state.color.a = state.opacity;
        el.colorBtn.style.background = colorToCss(state.color);
        el.opacityValue.textContent = Math.round(state.opacity * 100) + "%";
        document.querySelectorAll(".color-cell").forEach(function (cell) {
            var chosen = hexToColor(cell.dataset.hex);
            cell.classList.toggle("active", chosen.r === state.color.r && chosen.g === state.color.g && chosen.b === state.color.b);
        });
    }

    function closeColorModal() {
        el.colorModal.classList.remove("active");
    }

    function localTimestamp() {
        var now = new Date();
        var pad = function (n) { return String(n).padStart(2, "0"); };
        return now.getFullYear() +
            pad(now.getMonth() + 1) +
            pad(now.getDate()) + "-" +
            pad(now.getHours()) +
            pad(now.getMinutes()) +
            pad(now.getSeconds());
    }

    function outputFileName() {
        var base = state.fileName.replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]+/g, "-") || "document";
        return base + "-PDF-Pro-annotated-" + localTimestamp() + ".pdf";
    }

    async function savePDF() {
        commitActiveText();
        if (!state.originalFileBuffer) {
            showToast("请先打开 PDF / Open a PDF first");
            return;
        }
        if (!hasAnnotations()) {
            showToast("没有批注可保存 / No annotations to save");
            return;
        }
        el.saveBtn.disabled = true;
        el.saveBtn.textContent = "生成中 / Saving...";
        try {
            var out = await PDFDocument.load(state.originalFileBuffer.slice(0));
            var pages = out.getPages();
            for (var key in state.annotations) {
                var pageIndex = parseInt(key, 10) - 1;
                if (pageIndex < 0 || pageIndex >= pages.length) continue;
                var pdfPage = pages[pageIndex];
                var info = state.pageInfoMap[parseInt(key, 10)];
                if (!info) continue;
                var list = state.annotations[key] || [];
                for (var i = 0; i < list.length; i++) {
                    await drawAnnotation(out, pdfPage, info, list[i]);
                }
            }
            var fileName = outputFileName();
            var base64Pdf = await out.saveAsBase64();
            if (window.Android && window.Android.saveBase64Pdf) {
                window.Android.saveBase64Pdf(base64Pdf, fileName);
                showToast("已交给系统保存 / Saving to Downloads");
            } else {
                var link = document.createElement("a");
                link.href = "data:application/pdf;base64," + base64Pdf;
                link.download = fileName;
                link.click();
            }
        } catch (err) {
            showError("保存失败 / Save failed", err);
        } finally {
            el.saveBtn.disabled = false;
            el.saveBtn.textContent = "保存 / Save";
        }
    }

    async function drawAnnotation(pdfDocOut, page, info, annotation) {
        var x = annotation.xPct / 100 * info.pdfW;
        var yTop = annotation.yPct / 100 * info.pdfH;
        var width = annotation.wPct / 100 * info.pdfW;
        var height = annotation.hPct / 100 * info.pdfH;
        var y = info.pdfH - yTop - height;
        if (annotation.type === "highlight") {
            page.drawRectangle({
                x: x,
                y: y,
                width: width,
                height: height,
                color: colorToPdf(annotation.color),
                opacity: annotation.color.a * HIGHLIGHT_ALPHA,
                borderOpacity: 0
            });
            return;
        }
        if (annotation.type === "box") {
            page.drawRectangle({
                x: x,
                y: y,
                width: width,
                height: height,
                borderColor: colorToPdf(annotation.color),
                borderWidth: BOX_LINE_WIDTH,
                borderOpacity: annotation.color.a,
                opacity: 0
            });
            return;
        }
        var pngBytes = annotation.type === "ink" ? captureInk(annotation) : captureText(annotation);
        if (!pngBytes || pngBytes.length === 0) return;
        var png = await pdfDocOut.embedPng(pngBytes);
        page.drawImage(png, { x: x, y: y, width: width, height: height });
    }

    function captureText(annotation) {
        var cssWidth = annotation.wPct / 100 * state.pageInfoMap[annotation.page].cssW;
        var cssHeight = annotation.hPct / 100 * state.pageInfoMap[annotation.page].cssH;
        var canvas = document.createElement("canvas");
        canvas.width = Math.ceil(cssWidth * TEXT_DPR);
        canvas.height = Math.ceil(cssHeight * TEXT_DPR);
        if (canvas.width <= 0 || canvas.height <= 0 || canvas.width > 16384 || canvas.height > 16384) {
            return new Uint8Array(0);
        }
        var ctx = canvas.getContext("2d");
        var fontSize = annotation.fontSize * TEXT_DPR;
        var edge = PAD * TEXT_DPR;
        var cssLineHeight = measureTextBox("Mg中", annotation.fontSize).lineHeight;
        var canvasLineHeight = cssLineHeight * TEXT_DPR;
        var baseline = baselineOffset(annotation.fontSize) * TEXT_DPR;
        ctx.font = "700 " + fontSize + "px " + FONT_FAMILY;
        ctx.fillStyle = colorToCss(annotation.color);
        ctx.textBaseline = "alphabetic";
        annotation.text.split("\n").forEach(function (line, index) {
            if (!line) return;
            var domWidth = measureLine(line, annotation.fontSize).width;
            var canvasWidth = ctx.measureText(line).width;
            var scaleX = canvasWidth > 0 && domWidth > 0 ? (domWidth * TEXT_DPR) / canvasWidth : 1;
            ctx.save();
            ctx.translate(edge, edge + index * canvasLineHeight + baseline);
            ctx.scale(scaleX, scaleX);
            ctx.fillText(line, 0, 0);
            ctx.restore();
        });
        return dataUrlToBytes(canvas.toDataURL("image/png"));
    }

    function captureInk(annotation) {
        var canvas = document.createElement("canvas");
        canvas.width = Math.ceil(annotation.boxW * TEXT_DPR);
        canvas.height = Math.ceil(annotation.boxH * TEXT_DPR);
        if (canvas.width <= 0 || canvas.height <= 0 || canvas.width > 16384 || canvas.height > 16384) {
            return new Uint8Array(0);
        }
        var ctx = canvas.getContext("2d");
        ctx.scale(TEXT_DPR, TEXT_DPR);
        ctx.lineWidth = annotation.strokeWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = colorToCss(annotation.color);
        ctx.beginPath();
        annotation.points.forEach(function (point, index) {
            if (index === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
        return dataUrlToBytes(canvas.toDataURL("image/png"));
    }

    function dataUrlToBytes(dataUrl) {
        var binary = atob(dataUrl.split(",")[1]);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    window.onNativeSaveResult = function (ok, message) {
        showToast(ok ? "保存成功 / Saved to Downloads" : "保存失败 / Save failed: " + (message || ""));
    };

    window.handleBackPress = function () {
        if (el.colorModal.classList.contains("active")) {
            closeColorModal();
            return true;
        }
        if (state.activeTextArea) {
            commitActiveText();
            return true;
        }
        if (document.querySelector(".annotation.selected")) {
            deselectAll();
            return true;
        }
        if (!state.isToolbarVisible) {
            toggleToolbar(true);
            return true;
        }
        return false;
    };

    function bindEvents() {
        el.openBtn.addEventListener("click", function () { el.fileInput.click(); });
        el.emptyState.addEventListener("click", function () { el.fileInput.click(); });
        el.fileInput.addEventListener("change", function (event) {
            openPdfFile(event.target.files[0]);
            event.target.value = "";
        });
        el.saveBtn.addEventListener("click", savePDF);
        el.modeButtons.forEach(function (btn) {
            btn.addEventListener("click", function () {
                setMode(btn.getAttribute("data-mode"));
            });
        });
        el.sizeSlider.addEventListener("input", function () {
            state.fontSize = parseInt(el.sizeSlider.value, 10);
            el.sizeValue.textContent = String(state.fontSize);
        });
        el.opacitySlider.addEventListener("input", function () {
            state.opacity = parseFloat(el.opacitySlider.value);
            updateColorUI();
        });
        el.zoomSlider.addEventListener("input", function () {
            applyZoom(parseFloat(el.zoomSlider.value));
        });
        el.colorBtn.addEventListener("click", function () {
            el.colorModal.classList.add("active");
        });
        el.colorModal.addEventListener("click", function (event) {
            if (event.target === el.colorModal) closeColorModal();
        });
        el.colorModal.addEventListener("touchmove", function (event) {
            event.preventDefault();
        }, { passive: false });
        el.closeColorBtn.addEventListener("click", closeColorModal);
        el.scrollWindow.addEventListener("scroll", updateScrollThumb);
        window.addEventListener("resize", updateScrollThumb);
    }

    buildColorUI();
    bindEvents();
    updateColorUI();
})();
