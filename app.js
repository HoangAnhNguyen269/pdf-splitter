const $ = (id) => document.getElementById(id);

// Tabs / Modes
const tabPick = $("tabPick");
const tabRange = $("tabRange");
const modePick = $("modePick");
const modeRange = $("modeRange");

// Top controls
const pdfFile = $("pdfFile");
const btnLoad = $("btnLoad");
const btnSplit = $("btnSplit");
const info = $("info");
const status = $("status");
const error = $("error");
const makeZip = $("makeZip");
const downloads = $("downloads");

// Mode A controls
const pageGrid = $("pageGrid");
const pickCounter = $("pickCounter");
const windowLabel = $("windowLabel");
const btnPrev = $("btnPrev");
const btnNext = $("btnNext");
const btnSelectVisible = $("btnSelectVisible");
const btnClearVisible = $("btnClearVisible");
const btnClearAll = $("btnClearAll");
const btnCreateFileFromSelection = $("btnCreateFileFromSelection");
const pickBoxes = $("pickBoxes");

// Mode B controls
const btnAddRangeBox = $("btnAddRangeBox");
const btnExampleRange = $("btnExampleRange");
const rangeBoxes = $("rangeBoxes");

// Viewer modal
const viewerOverlay = $("viewerOverlay");
const viewerBody = $("viewerBody");
const viewerCanvas = $("viewerCanvas");
const viewerClose = $("viewerClose");
const viewerPrev = $("viewerPrev");
const viewerNext = $("viewerNext");
const viewerCheck = $("viewerCheck");
const viewerPageLabel = $("viewerPageLabel");
const viewerJump = $("viewerJump");
const viewerGo = $("viewerGo");

pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

// State
let pdfBytes = null;      // Uint8Array
let pdfLibDoc = null;     // pdf-lib doc
let pdfJsDoc = null;      // pdf.js doc
let totalPages = 0;

let selected = new Set(); // selected pages (1-based)
let start = 1;
let pageSize = 60;

let outputsA = []; // { id, name, pages: number[] }
let outputsB = []; // { id, name, from, to }

let viewerPage = 1;

// ---------- Utils ----------
function setStatus(msg){ status.textContent = msg || ""; }
function setError(msg){ error.textContent = msg || ""; }
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }
function sanitizeName(name){
  return (name || "")
      .replace(/[\/\\?%*:|"<>]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120);
}
function blobUrl(bytes, mime="application/pdf"){
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

// ---------- Tabs fix ----------
function switchMode(mode){
  if (mode === "A"){
    tabPick.classList.add("active");
    tabRange.classList.remove("active");
    modePick.style.display = "";
    modeRange.style.display = "none";
  } else {
    tabRange.classList.add("active");
    tabPick.classList.remove("active");
    modeRange.style.display = "";
    modePick.style.display = "none";
  }
}
tabPick.addEventListener("click", () => switchMode("A"));
tabRange.addEventListener("click", () => switchMode("B"));
switchMode("A");

// ---------- File load ----------
pdfFile.addEventListener("change", async () => {
  setError(""); setStatus("");
  downloads.style.display = "none";
  downloads.innerHTML = "";

  const f = pdfFile.files?.[0];
  if (!f){
    info.textContent = "Chưa có file";
    btnLoad.disabled = true;
    btnSplit.disabled = true;
    return;
  }

  pdfBytes = new Uint8Array(await f.arrayBuffer());
  pdfLibDoc = null;
  pdfJsDoc = null;
  totalPages = 0;

  selected.clear();
  outputsA = [];
  outputsB = [];
  pickBoxes.innerHTML = "";
  rangeBoxes.innerHTML = "";
  pageGrid.innerHTML = "";
  pickCounter.textContent = "Selected: 0";
  btnCreateFileFromSelection.disabled = true;

  info.textContent = f.name;
  btnLoad.disabled = false;
  btnSplit.disabled = true;
});

btnLoad.addEventListener("click", async () => {
  try{
    setError("");
    setStatus("Đang đọc PDF...");
    if (!pdfBytes) throw new Error("Chưa chọn PDF.");

    pdfLibDoc = await PDFLib.PDFDocument.load(pdfBytes);
    totalPages = pdfLibDoc.getPageCount();

    pdfJsDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;

    btnSplit.disabled = false;
    setStatus(`Sẵn sàng. Tổng ${totalPages} trang.`);
    start = 1;
    await renderGrid();
    renderOutputsA();
    renderOutputsB();
  }catch(e){
    setError(e?.message || String(e));
    setStatus("");
  }
});

// ---------- Mode A grid ----------
btnPrev.addEventListener("click", async () => {
  if (!totalPages) return;
  start = Math.max(1, start - pageSize);
  await renderGrid();
});
btnNext.addEventListener("click", async () => {
  if (!totalPages) return;
  start = Math.min(totalPages, start + pageSize);
  await renderGrid();
});

btnSelectVisible.addEventListener("click", () => {
  const end = Math.min(totalPages, start + pageSize - 1);
  for (let p=start; p<=end; p++) selected.add(p);
  syncGridCheckboxes();
  updateSelectedUI();
});
btnClearVisible.addEventListener("click", () => {
  const end = Math.min(totalPages, start + pageSize - 1);
  for (let p=start; p<=end; p++) selected.delete(p);
  syncGridCheckboxes();
  updateSelectedUI();
});
btnClearAll.addEventListener("click", () => {
  selected.clear();
  syncGridCheckboxes();
  updateSelectedUI();
});

function updateSelectedUI(){
  pickCounter.textContent = `Selected: ${selected.size}`;
  btnCreateFileFromSelection.disabled = selected.size === 0;
}

async function renderGrid(){
  if (!pdfJsDoc || !totalPages) return;

  const end = Math.min(totalPages, start + pageSize - 1);
  windowLabel.textContent = `${start}–${end}`;

  pageGrid.innerHTML = "";
  setStatus(`Render ${start}–${end}...`);

  for (let p=start; p<=end; p++){
    const card = document.createElement("div");
    card.className = "pageCard";
    card.innerHTML = `
      <div class="thumb"><canvas></canvas></div>
      <div class="pageMeta">
        <label class="muted" style="display:flex;gap:8px;align-items:center;">
          <input class="pgcb" type="checkbox" ${selected.has(p) ? "checked":""}/>
          Trang ${p}
        </label>
        <span class="muted">${selected.has(p) ? "✓" : ""}</span>
      </div>
    `;

    // Checkbox handler
    const cb = card.querySelector(".pgcb");
    cb.addEventListener("change", () => {
      if (cb.checked) selected.add(p);
      else selected.delete(p);
      card.querySelector(".pageMeta span").textContent = cb.checked ? "✓" : "";
      updateSelectedUI();
    });

    // Click card opens viewer (ignore checkbox click)
    card.addEventListener("click", (ev) => {
      if (ev.target?.tagName === "INPUT") return;
      openViewer(p);
    });

    pageGrid.appendChild(card);
    renderThumb(p, card.querySelector("canvas")).catch(()=>{});

    if ((p-start) % 10 === 0) await new Promise(r => setTimeout(r, 0));
  }

  setStatus(`Sẵn sàng. Tổng ${totalPages} trang.`);
}

async function renderThumb(p, canvas){
  const page = await pdfJsDoc.getPage(p);
  const vp = page.getViewport({ scale: 0.18 });
  const ctx = canvas.getContext("2d", { alpha:false });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
}

function syncGridCheckboxes(){
  // sync visible checkboxes only
  const cards = pageGrid.querySelectorAll(".pageCard");
  let p = start;
  for (const card of cards){
    const cb = card.querySelector(".pgcb");
    const mark = card.querySelector(".pageMeta span");
    const ok = selected.has(p);
    cb.checked = ok;
    mark.textContent = ok ? "✓" : "";
    p++;
  }
}

// ---------- Mode A: create output ----------
btnCreateFileFromSelection.addEventListener("click", () => {
  if (selected.size === 0) return;
  const pages = [...selected].sort((a,b)=>a-b);
  const def = `Part_${pages[0]}_${pages[pages.length-1]}`;
  const name = sanitizeName(prompt("Tên file (không cần .pdf)", def) || "");
  if (!name) return;

  outputsA.push({ id: uid(), name, pages });
  selected.clear();
  updateSelectedUI();
  syncGridCheckboxes();
  renderOutputsA();
});

function renderOutputsA(){
  pickBoxes.innerHTML = "";
  if (outputsA.length === 0){
    pickBoxes.innerHTML = `<div class="muted">Chưa có file nào. Chọn trang → “+ Tạo file từ selection”.</div>`;
    return;
  }
  for (const o of outputsA){
    const box = document.createElement("div");
    box.className = "box";
    box.innerHTML = `
      <div class="boxHead">
        <input type="text" value="${o.name}" />
        <div class="muted">${o.pages.length} trang</div>
        <div class="spacer"></div>
        <button class="btn-bad">Xóa</button>
      </div>
      <div class="boxBody">
        <div class="muted">Pages:</div>
        <div class="muted" style="word-break:break-word;">${o.pages.join(", ")}</div>
      </div>
    `;
    const nameInput = box.querySelector("input");
    nameInput.addEventListener("input", () => o.name = sanitizeName(nameInput.value));
    box.querySelector("button").addEventListener("click", () => {
      outputsA = outputsA.filter(x => x.id !== o.id);
      renderOutputsA();
    });
    pickBoxes.appendChild(box);
  }
}

// ---------- Mode B: range boxes ----------
btnAddRangeBox.addEventListener("click", () => {
  outputsB.push({ id: uid(), name: `Part_${outputsB.length+1}`, from: 1, to: 1 });
  renderOutputsB();
});

btnExampleRange.addEventListener("click", () => {
  if (!totalPages){
    setError("Bấm “Đọc PDF” trước.");
    return;
  }
  setError("");
  const from = 167;
  const to = Math.min(1818, totalPages); // clamp
  outputsB.push({ id: uid(), name: `Part_${from}_${to}`, from, to });
  renderOutputsB();
});

function renderOutputsB(){
  rangeBoxes.innerHTML = "";
  if (outputsB.length === 0){
    rangeBoxes.innerHTML = `<div class="muted" style="margin-top:10px;">Chưa có box. Bấm “+ Thêm box”.</div>`;
    return;
  }

  for (const o of outputsB){
    const box = document.createElement("div");
    box.className = "box";
    box.innerHTML = `
      <div class="boxHead">
        <input type="text" value="${o.name}" placeholder="Tên file"/>
        <div class="spacer"></div>
        <button class="btn-bad">Xóa</button>
      </div>
      <div class="boxBody">
        <div class="muted">From</div>
        <input class="from" type="number" min="1" value="${o.from}" style="width:110px"/>
        <div class="muted">To</div>
        <input class="to" type="number" min="1" value="${o.to}" style="width:110px"/>
        <div class="muted">(1-based, inclusive)</div>
      </div>
    `;

    const nameInput = box.querySelector("input[type=text]");
    const fromInput = box.querySelector(".from");
    const toInput = box.querySelector(".to");

    nameInput.addEventListener("input", () => o.name = sanitizeName(nameInput.value));
    fromInput.addEventListener("input", () => o.from = Number(fromInput.value || 1));
    toInput.addEventListener("input", () => o.to = Number(toInput.value || 1));

    box.querySelector("button").addEventListener("click", () => {
      outputsB = outputsB.filter(x => x.id !== o.id);
      renderOutputsB();
    });

    rangeBoxes.appendChild(box);
  }
}

// ---------- Split ----------
btnSplit.addEventListener("click", async () => {
  try{
    setError("");
    downloads.style.display = "none";
    downloads.innerHTML = "";

    if (!pdfLibDoc || !totalPages) throw new Error("Chưa đọc PDF.");

    const jobs = [];

    // A jobs
    for (const o of outputsA){
      if (!o.name) continue;
      if (!o.pages?.length) continue;
      jobs.push({ name: o.name, pages: o.pages });
    }

    // B jobs
    for (const o of outputsB){
      const name = sanitizeName(o.name) || "output";
      const from = Number(o.from), to = Number(o.to);
      if (from < 1 || to < 1) throw new Error(`Range sai ở "${name}": trang phải >= 1`);
      if (from > to) throw new Error(`Range sai ở "${name}": from > to`);
      if (to > totalPages) throw new Error(`Range vượt quá số trang (${totalPages}) ở "${name}"`);
      const pages = [];
      for (let p=from; p<=to; p++) pages.push(p);
      jobs.push({ name, pages });
    }

    if (jobs.length === 0) throw new Error("Chưa có file nào để tách (Mode A hoặc Mode B).");

    btnSplit.disabled = true;
    btnLoad.disabled = true;

    setStatus(`Đang tách ${jobs.length} file...`);

    const outputs = [];
    for (let i=0; i<jobs.length; i++){
      const j = jobs[i];
      setStatus(`(${i+1}/${jobs.length}) Tạo ${j.name}.pdf ...`);
      const bytes = await buildPdf(j.pages);
      outputs.push({ file: `${j.name}.pdf`, bytes });
      await new Promise(r => setTimeout(r, 0));
    }

    setStatus("Hoàn tất.");
    await renderDownloads(outputs);

  }catch(e){
    setError(e?.message || String(e));
    setStatus("");
  }finally{
    btnSplit.disabled = false;
    btnLoad.disabled = false;
  }
});

async function buildPdf(pages1Based){
  const out = await PDFLib.PDFDocument.create();
  const indices = [...new Set(pages1Based)].sort((a,b)=>a-b).map(p => p-1);
  const copied = await out.copyPages(pdfLibDoc, indices);
  copied.forEach(pg => out.addPage(pg));
  return await out.save();
}

async function renderDownloads(files){
  downloads.style.display = "block";
  downloads.innerHTML = `<div style="font-weight:700;">Kết quả</div>`;

  // individual
  for (const f of files){
    const a = document.createElement("a");
    a.className = "dl";
    a.href = blobUrl(f.bytes);
    a.download = f.file;
    a.textContent = f.file;
    downloads.appendChild(a);
  }

  // zip
  if (makeZip.checked){
    setStatus("Đang tạo ZIP...");
    const zip = new JSZip();
    const folder = "pdf_split";
    const zf = zip.folder(folder);
    for (const f of files) zf.file(f.file, f.bytes);
    const blob = await zip.generateAsync({ type:"blob" });

    const a = document.createElement("a");
    a.className = "dl";
    a.href = URL.createObjectURL(blob);
    a.download = `${folder}.zip`;
    a.textContent = `Tải ZIP: ${folder}.zip`;
    downloads.appendChild(document.createElement("div"));
    downloads.appendChild(a);

    setStatus("Hoàn tất.");
  }
}

// ---------- Viewer (fit in screen) ----------
function openViewer(p){
  if (!pdfJsDoc || !totalPages) return;
  viewerPage = clamp(p, 1, totalPages);
  viewerOverlay.style.display = "block";
  viewerJump.value = "";
  renderViewer(viewerPage).catch(()=>{});
}

function closeViewer(){
  viewerOverlay.style.display = "none";
}

viewerClose.addEventListener("click", closeViewer);
viewerOverlay.addEventListener("click", (e) => {
  if (e.target === viewerOverlay) closeViewer();
});

viewerPrev.addEventListener("click", () => renderViewer(viewerPage - 1));
viewerNext.addEventListener("click", () => renderViewer(viewerPage + 1));

viewerGo.addEventListener("click", () => {
  const p = Number(viewerJump.value || 0);
  if (p >= 1 && p <= totalPages) renderViewer(p);
});

viewerCheck.addEventListener("change", () => {
  if (viewerCheck.checked) selected.add(viewerPage);
  else selected.delete(viewerPage);
  updateSelectedUI();
  syncGridCheckboxes();
});

window.addEventListener("keydown", (e) => {
  if (viewerOverlay.style.display !== "block") return;
  if (e.key === "Escape") closeViewer();
  if (e.key === "ArrowLeft") renderViewer(viewerPage - 1);
  if (e.key === "ArrowRight") renderViewer(viewerPage + 1);
});

// Fit-to-screen render (no oversized)
async function renderViewer(p){
  viewerPage = clamp(p, 1, totalPages);
  viewerPageLabel.textContent = `Trang ${viewerPage}/${totalPages}`;
  viewerCheck.checked = selected.has(viewerPage);

  const page = await pdfJsDoc.getPage(viewerPage);

  // base viewport at scale 1
  const baseVp = page.getViewport({ scale: 1 });

  // available size inside viewerBody
  const pad = 20;
  const maxW = Math.max(200, viewerBody.clientWidth - pad);
  const maxH = Math.max(200, viewerBody.clientHeight - pad);

  // scale to FIT (never larger than fit)
  const fitScale = Math.min(maxW / baseVp.width, maxH / baseVp.height);

  // render at devicePixelRatio for sharpness
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const renderScale = fitScale * dpr;

  const vp = page.getViewport({ scale: renderScale });

  // canvas actual pixels
  viewerCanvas.width = Math.floor(vp.width);
  viewerCanvas.height = Math.floor(vp.height);

  // canvas display size (CSS pixels) = fitScale * base size
  viewerCanvas.style.width = Math.floor(baseVp.width * fitScale) + "px";
  viewerCanvas.style.height = Math.floor(baseVp.height * fitScale) + "px";

  const ctx = viewerCanvas.getContext("2d", { alpha:false });
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
}