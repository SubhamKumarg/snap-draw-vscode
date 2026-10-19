const vscode = require('vscode');

function activate(context) {
  let currentPanel = undefined;

  async function popOutAndPin() {
    try {
      await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
      await vscode.commands.executeCommand('workbench.action.enableCompactAuxiliaryWindow');
      await vscode.commands.executeCommand('workbench.action.enableWindowAlwaysOnTop');
    } catch (e) { }
  }

  const disposable = vscode.commands.registerCommand('snapdraw.open', async () => {
    if (currentPanel) {
      currentPanel.reveal();
      return;
    }

    currentPanel = vscode.window.createWebviewPanel(
      'snapDrawCanvas',
      'SnapDraw',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    currentPanel.webview.html = getWebviewContent();

    setTimeout(() => { popOutAndPin(); }, 150);

    currentPanel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.command === 'floatWindow') {
          await popOutAndPin();
        } else if (message.command === 'togglePin') {
          await vscode.commands.executeCommand('workbench.action.toggleWindowAlwaysOnTop');
        } else if (message.command === 'notify') {
          vscode.window.setStatusBarMessage(`$(check) ${message.text}`, 2500);
        }
      },
      undefined,
      context.subscriptions
    );

    currentPanel.onDidDispose(() => {
      currentPanel = undefined;
    }, null, context.subscriptions);
  });

  context.subscriptions.push(disposable);
}

function getWebviewContent() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: #090a0f;
    --panel: rgba(18, 20, 26, 0.85);
    --border: rgba(255, 255, 255, 0.08);
    --accent: #6366f1;
    --text: #e2e8f0;
  }
  * { box-sizing: border-box; user-select: none; }
  body, html {
    margin: 0; padding: 0; width: 100%; height: 100%;
    background: var(--bg);
    background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
    background-size: 16px 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--text);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Minimal Floating Island */
  .floating-island {
    position: absolute; top: 12px; left: 12px; z-index: 1000;
    display: flex; align-items: center; gap: 3px;
    padding: 3px 6px; border-radius: 8px;
    background: var(--panel); backdrop-filter: blur(14px);
    border: 1px solid var(--border);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .icon-btn {
    background: transparent; border: none; color: #94a3b8;
    width: 26px; height: 26px; border-radius: 6px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.12s ease; position: relative;
  }
  .icon-btn:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
  .icon-btn.active { background: var(--accent); color: #fff; }
  .icon-btn svg { width: 14px; height: 14px; stroke-width: 2; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; }

  .divider { width: 1px; height: 14px; background: var(--border); margin: 0 2px; }

  /* Auto-Hiding Drawer Panel */
  .drawer {
    display: flex; align-items: center; gap: 4px;
    max-width: 0; overflow: hidden; opacity: 0;
    transition: max-width 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
    white-space: nowrap;
  }
  .floating-island:hover .drawer, .drawer:hover {
    max-width: 420px; opacity: 1;
  }

  /* Color Swatches & Slider */
  .swatch {
    width: 13px; height: 13px; border-radius: 50%; cursor: pointer;
    border: 2px solid transparent; transition: transform 0.12s;
  }
  .swatch.active { transform: scale(1.25); border-color: #fff; }
  input[type="range"] { width: 40px; accent-color: var(--accent); cursor: pointer; }

  /* Stage & Canvas */
  .stage {
    position: relative; flex: 1; width: 100%; height: 100%;
    overflow: hidden;
  }
  #viewport {
    position: absolute; top: 0; left: 0;
    transform-origin: 0 0;
  }
  #empty-state {
    position: absolute; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center; color: #64748b; font-size: 12px; pointer-events: none;
    padding: 16px; z-index: 5;
  }
  #empty-state kbd {
    background: rgba(255,255,255,0.06); padding: 2px 5px;
    border-radius: 4px; color: #cbd5e1; border: 1px solid var(--border);
  }
  canvas { position: absolute; top: 0; left: 0; cursor: crosshair; }
  #bg-canvas { pointer-events: none; }

  /* Inline Text Input */
  #text-input {
    position: absolute; display: none; z-index: 30;
    background: rgba(12, 14, 20, 0.88);
    border: 1px dashed var(--accent); border-radius: 4px;
    color: #ff4757; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-weight: 600; padding: 2px 6px; outline: none; min-width: 60px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.4);
  }
</style>
</head>
<body>

  <!-- Minimalist Floating Island with Auto-Hiding Drawer -->
  <div class="floating-island">
    <!-- Always visible minimal tools -->
    <button class="icon-btn" id="uploadBtn" title="Upload Image">
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    </button>
    <input type="file" id="fileInput" accept="image/*" style="display:none" />

    <button class="icon-btn active" data-tool="pen" title="Draw (Pen)">
      <svg viewBox="0 0 24 24"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
    </button>

    <button class="icon-btn" data-tool="eraser" title="Eraser">
      <svg viewBox="0 0 24 24"><path d="M20 20H7L3 16c-1-1-1-2.5 0-3.5l9-9c1-1 2.5-1 3.5 0l5 5c1 1 1 2.5 0 3.5L13 21"/><path d="M6 11l6 6"/></svg>
    </button>

    <div class="divider"></div>
    <span style="font-size: 11px; color: #64748b; padding: 0 2px;">•••</span>

    <!-- Auto-hiding drawer options -->
    <div class="drawer">
      <div class="divider"></div>
      <button class="icon-btn" data-tool="arrow" title="Draw Arrow">
        <svg viewBox="0 0 24 24"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="5 5 19 5 19 19"/></svg>
      </button>
      <button class="icon-btn" data-tool="rect" title="Draw Box">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
      </button>
      <button class="icon-btn" data-tool="text" title="Add Text">
        <svg viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
      </button>
      <button class="icon-btn" data-tool="pan" title="Pan Canvas">
        <svg viewBox="0 0 24 24"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>
      </button>
      <div class="divider"></div>

      <div class="swatch active" data-color="#ff4757" style="background:#ff4757"></div>
      <div class="swatch" data-color="#2ed573" style="background:#2ed573"></div>
      <div class="swatch" data-color="#1e90ff" style="background:#1e90ff"></div>
      <div class="swatch" data-color="#ffa502" style="background:#ffa502"></div>
      <input type="range" id="sizeSlider" min="2" max="12" value="3" title="Size" />
      <div class="divider"></div>

      <button class="icon-btn" id="zoomResetBtn" title="Fit to screen" style="font-size:10px; font-weight:600;">100%</button>
      <button class="icon-btn" id="undoBtn" title="Undo (Ctrl+Z)">
        <svg viewBox="0 0 24 24"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
      </button>
      <button class="icon-btn" id="clearBtn" title="Clear">
        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
      <button class="icon-btn" id="copyBtn" title="Copy Image">
        <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      <button class="icon-btn" id="floatBtn" title="Float Window">
        <svg viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
      </button>
      <button class="icon-btn" id="pinBtn" title="Always on Top">
        <svg viewBox="0 0 24 24"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.7V6h1V4H8v2h1v4.7a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
      </button>
    </div>
  </div>

  <!-- Stage -->
  <div class="stage" id="stage">
    <div id="empty-state">
      <p style="font-size:14px; color:#e2e8f0; margin:0 0 6px 0;">Paste Image (<kbd>Ctrl</kbd>+<kbd>V</kbd>) or Drag & Drop</p>
      <p style="margin:0; color:#64748b;">Hover top-left corner to reveal drawing tools</p>
    </div>
    <div id="viewport">
      <canvas id="bg-canvas"></canvas>
      <canvas id="draw-canvas"></canvas>
      <input type="text" id="text-input" placeholder="Type & hit Enter..." />
    </div>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  const stage = document.getElementById('stage');
  const viewport = document.getElementById('viewport');
  const bgCanvas = document.getElementById('bg-canvas');
  const drawCanvas = document.getElementById('draw-canvas');
  const bgCtx = bgCanvas.getContext('2d');
  const ctx = drawCanvas.getContext('2d');
  const emptyState = document.getElementById('empty-state');
  const textInput = document.getElementById('text-input');
  const zoomResetBtn = document.getElementById('zoomResetBtn');
  const pinBtn = document.getElementById('pinBtn');

  let currentTool = 'pen';
  let strokeColor = '#ff4757';
  let strokeWidth = 3;
  let isDrawing = false;
  let startX = 0, startY = 0;
  let loadedImage = null;
  let history = [];
  let snapshot = null;

  let zoom = 1, panX = 0, panY = 0;
  let isPanning = false, panStartX = 0, panStartY = 0, spacePressed = false, userHasManualZoom = false;
  let textPos = { x: 0, y: 0 }, isTextActive = false;

  function initBoardSize(w, h) {
    bgCanvas.width = drawCanvas.width = w;
    bgCanvas.height = drawCanvas.height = h;
    viewport.style.width = w + 'px';
    viewport.style.height = h + 'px';
  }
  initBoardSize(800, 520);

  function updateViewportTransform() {
    viewport.style.transform = \`translate(\${panX}px, \${panY}px) scale(\${zoom})\`;
    zoomResetBtn.textContent = Math.round(zoom * 100) + '%';
    drawCanvas.style.cursor = (spacePressed || currentTool === 'pan')
      ? (isPanning ? 'grabbing' : 'grab')
      : (currentTool === 'text' ? 'text' : 'crosshair');
  }

  function fitToWindow() {
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const cw = drawCanvas.width, ch = drawCanvas.height;
    if (!sw || !sh || !cw || !ch) return;
    zoom = Math.min((sw - 24) / cw, (sh - 24) / ch, 1.5);
    panX = (sw - cw * zoom) / 2;
    panY = (sh - ch * zoom) / 2;
    userHasManualZoom = false;
    updateViewportTransform();
  }

  new ResizeObserver(() => { if (!userHasManualZoom) fitToWindow(); }).observe(stage);
  zoomResetBtn.onclick = fitToWindow;

  function getCanvasCoords(e) {
    const r = stage.getBoundingClientRect();
    return { x: (e.clientX - r.left - panX) / zoom, y: (e.clientY - r.top - panY) / zoom };
  }

  function loadImageFromFile(blob) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        loadedImage = img;
        emptyState.style.display = 'none';
        initBoardSize(img.width, img.height);
        bgCtx.clearRect(0, 0, img.width, img.height);
        bgCtx.drawImage(img, 0, 0);
        history = [];
        saveState();
        fitToWindow();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(blob);
  }

  window.addEventListener('paste', (e) => {
    if (document.activeElement === textInput) return;
    for (const item of (e.clipboardData?.items || [])) {
      if (item.type.startsWith('image/')) { loadImageFromFile(item.getAsFile()); break; }
    }
  });

  document.getElementById('uploadBtn').onclick = () => document.getElementById('fileInput').click();
  document.getElementById('fileInput').onchange = (e) => { if (e.target.files[0]) loadImageFromFile(e.target.files[0]); };
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) loadImageFromFile(e.dataTransfer.files[0]); });

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (isTextActive) commitText();
    userHasManualZoom = true;
    const r = stage.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const cx = (mx - panX) / zoom, cy = (my - panY) / zoom;
    const newZoom = Math.min(Math.max(zoom * (e.deltaY < 0 ? 1.12 : 0.89), 0.1), 10);
    panX = mx - cx * newZoom; panY = my - cy * newZoom; zoom = newZoom;
    updateViewportTransform();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (document.activeElement === textInput) return;
    if (e.code === 'Space' && !spacePressed) { spacePressed = true; updateViewportTransform(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spacePressed = false; isPanning = false; updateViewportTransform(); }
  });

  function openTextInput(x, y) {
    if (isTextActive) commitText();
    isTextActive = true; textPos = { x, y };
    const fontSize = Math.max(14, strokeWidth * 6);
    textInput.style.left = x + 'px';
    textInput.style.top = (y - fontSize * 0.6) + 'px';
    textInput.style.fontSize = fontSize + 'px';
    textInput.style.color = strokeColor;
    textInput.value = ''; textInput.style.display = 'block';
    setTimeout(() => textInput.focus(), 10);
  }

  function commitText() {
    if (!isTextActive) return;
    const val = textInput.value.trim();
    if (val) {
      const fontSize = Math.max(14, strokeWidth * 6);
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = \`600 \${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif\`;
      ctx.fillStyle = strokeColor; ctx.textBaseline = 'top';
      ctx.fillText(val, textPos.x + 4, textPos.y - fontSize * 0.45);
      ctx.restore(); saveState();
    }
    textInput.value = ''; textInput.style.display = 'none'; isTextActive = false;
  }

  textInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commitText(); }
    else if (e.key === 'Escape') { textInput.value = ''; textInput.style.display = 'none'; isTextActive = false; }
  });
  textInput.addEventListener('blur', () => commitText());

  function saveState() {
    if (history.length > 25) history.shift();
    history.push(ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
  }

  function drawArrow(x1, y1, x2, y2) {
    const len = 10 + strokeWidth * 2, angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.lineTo(x2 - len * Math.cos(angle - Math.PI / 6), y2 - len * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2); ctx.lineTo(x2 - len * Math.cos(angle + Math.PI / 6), y2 - len * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  drawCanvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || spacePressed || currentTool === 'pan') {
      e.preventDefault(); isPanning = true; userHasManualZoom = true;
      panStartX = e.clientX - panX; panStartY = e.clientY - panY;
      updateViewportTransform(); return;
    }
    const pt = getCanvasCoords(e);
    if (currentTool === 'text') { openTextInput(pt.x, pt.y); return; }
    if (isTextActive) commitText();

    isDrawing = true; startX = pt.x; startY = pt.y;
    snapshot = ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = currentTool === 'eraser' ? strokeWidth * 6 : strokeWidth;
    ctx.strokeStyle = strokeColor;
    ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.beginPath(); ctx.moveTo(startX, startY);
  });

  window.addEventListener('mousemove', (e) => {
    if (isPanning) { panX = e.clientX - panStartX; panY = e.clientY - panStartY; updateViewportTransform(); return; }
    if (!isDrawing) return;
    const pt = getCanvasCoords(e);
    if (currentTool === 'pen' || currentTool === 'eraser') { ctx.lineTo(pt.x, pt.y); ctx.stroke(); }
    else if (currentTool === 'rect') { ctx.putImageData(snapshot, 0, 0); ctx.strokeRect(startX, startY, pt.x - startX, pt.y - startY); }
    else if (currentTool === 'arrow') { ctx.putImageData(snapshot, 0, 0); drawArrow(startX, startY, pt.x, pt.y); }
  });

  window.addEventListener('mouseup', () => {
    if (isPanning) { isPanning = false; updateViewportTransform(); }
    if (isDrawing) { isDrawing = false; ctx.globalCompositeOperation = 'source-over'; saveState(); }
  });

  document.querySelectorAll('[data-tool]').forEach(btn => {
    btn.onclick = () => {
      if (isTextActive) commitText();
      document.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); currentTool = btn.dataset.tool;
      updateViewportTransform();
    };
  });

  document.querySelectorAll('.swatch').forEach(sw => {
    sw.onclick = () => {
      document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active'); strokeColor = sw.dataset.color;
      textInput.style.color = strokeColor;
    };
  });

  document.getElementById('sizeSlider').oninput = (e) => {
    strokeWidth = Number(e.target.value);
    if (isTextActive) textInput.style.fontSize = Math.max(14, strokeWidth * 6) + 'px';
  };

  function undo() {
    if (isTextActive) commitText();
    if (history.length > 1) { history.pop(); ctx.putImageData(history[history.length - 1], 0, 0); }
    else { ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height); history = []; }
  }

  document.getElementById('undoBtn').onclick = undo;
  document.getElementById('clearBtn').onclick = () => { ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height); saveState(); };

  document.getElementById('copyBtn').onclick = () => {
    if (isTextActive) commitText();
    const out = document.createElement('canvas');
    out.width = bgCanvas.width; out.height = bgCanvas.height;
    const outCtx = out.getContext('2d');
    outCtx.drawImage(bgCanvas, 0, 0); outCtx.drawImage(drawCanvas, 0, 0);
    out.toBlob(async (blob) => {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      vscode.postMessage({ command: 'notify', text: 'Annotated image copied!' });
    });
  };

  document.getElementById('floatBtn').onclick = () => vscode.postMessage({ command: 'floatWindow' });
  pinBtn.onclick = () => { pinBtn.classList.toggle('active'); vscode.postMessage({ command: 'togglePin' }); };
</script>
</body>
</html>`;
}

function deactivate() { }
module.exports = { activate, deactivate };