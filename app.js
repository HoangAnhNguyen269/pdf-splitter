/* PDF Splitter Pro (stable)
 * - Mode A: select pages -> prompt file name -> show output list
 * - Mode B: add boxes from/to -> show list
 * - Split: pdf-lib
 * - Thumbnails: pdf.js (v3 UMD) => window.pdfjsLib
 */

const $ = (id) => document.getElementById(id);

// Top
const pdfFileEl = $("pdfFile");
const btnLoad = $("btnLoad");
const btnSplit = $("btnSplit");
const infoEl = $("info");
const statusEl = $("status");
const errorEl = $("error");
const downloadsEl = $("downloads");
const makeZipEl = $("makeZip");

// Tabs
const tabPick = $("tabPick");
const tabRange = $("tabRange");
const modePick = $("modePick");
const modeRange = $("modeRange");

// Mode A UI
const pageGrid = $("pageGrid");
const pickCounter = $("pickCounter");
const btnPrev = $("btnPrev");
const btnNext = $("btnNext");
const pageWindowEl = $("pageWindow");
const pageSizeEl = $("pageSize");
const btnSelectAllVisible = $("btnSelectAllVisible");
const btnClearVisible = $("btnClearVisible");
const btnClearAll = $("btnClearAll");
const btnCreateFileFromSelection = $("btnCreateFileFromSelection");
const pickBoxesEl = $("pickBoxes");
const jumpToEl = $("jumpTo");
const btnJump = $("btnJump");

// Mode B UI
const btnAddRangeBox = $("btnAddRangeBox");
const btnExampleRange = $("btnExampleRange");
const rangeBoxesEl = $("rangeBoxes");

// State
let fileName = "document.pdf";
let pdfU8 = null;          // Uint8Array
let totalPages = 0;
let pdfLibDoc = null;      // PDFLib.PDFDocument
let pdfJsDoc = null;       // pdfjs document

// Mode A state
const selectedPages = new Set(); // 1-based
let windowStart = 1;
let windowSize = 120;

// Output specs
// Mode A outputs: {id, name, pagesExpr}  (pagesExpr e.g. "1,2,5-8")
// Mode B outputs: {id, name, from, to}
let outputsA = [];
let outputsB = [];

// ---------- helpers ----------
function setStatus(msg){ statusEl.textContent = msg || ""; }
function setError(msg){ errorEl.textContent = msg || ""; }
function resetDownloads(){ downloadsEl.style.display = "none"; downloadsEl.innerHTML = ""; }
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function uniqueId(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }
function stripExt(name){ return name.replace(/\.[^/.]+$/, ""); }
function sanitizeFileName(name){
  return (name || "")
    .replace(/[\/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}
function bytesToObjectUrl(bytes, mime="application/pdf"){
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}
function compressPages(pages){
  if (!pages || pages.length === 0) return "";
  const arr = [...new Set(pages)].sort((a,b)=>a-b);
  const parts = [];
  let i=0;
  while (i < arr.length){
    let start = arr[i], end = start;
    while (i+1 < arr.length && arr[i+1] === end+1){ i++; end = arr[i]; }
    parts.push(start===end ? `${start}` : `${start}-${end}`);
    i++;
  }
  return parts.join(",");
}
function parsePagesExpr(expr, maxPages){
  const s = (expr || "").trim();
  if (!s) return [];
  const items = s.split(",").map(x=>x.trim()).filter(Boolean);
  const pages = [];
  for (const it of items){
    const m = it.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m){
      const a = Number(m[1]), b = Number(m[2]);
      if (a<1 || b<1 || a>b) throw new Error(`Sai đoạn: "${it}"`);
      if (b>maxPages) throw new Error(`Đoạn "${it}" vượt quá ${maxPages} trang`);
      for (let p=a; p<=b; p++) pages.push(p);
    } else {
      const n = Number(it);
      if (!Number.isInteger(n)) throw new Error(`Sai trang: "${it}"`);
      if (n<1 || n>maxPages) throw new Error(`Trang "${it}" vượt 1..${maxPages}`);
      pages.push(n);
    }
  }
  return [...new Set(pages)].sort((a,b)=>a-b);
}

// ---------- tabs ----------
tabPick.addEventListener("click", () => switchMode("A"));
tabRange.addEventListener("click", () => switchMode("B"));
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

// ---------- pdf load ----------
if (window.pdfjsLib){
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
}

pdfFileEl.addEventListener("change", async () => {
  setError(""); setStatus(""); resetDownloads();

  const f = pdfFileEl.files?.[0];
  if (!f){
    infoEl.textContent = "Chưa có file";
    btnLoad.disabled = true;
    btnSplit.disabled = true;
    return;
  }

  fileName = f.name || "document.pdf";
  const ab = await f.arrayBuffer();
  pdfU8 = new Uint8Array(ab);

  // reset state
  totalPages = 0;
  pdfLibDoc = null;
  pdfJsDoc = null;

  selectedPages.clear();
  windowStart = 1;

  outputsA = [];
  outputsB = [];

  pageGrid.innerHTML = "";
  pickBoxesEl.innerHTML = "";
  rangeBoxesEl.innerHTML = "";

  updateSelectedUI();
  renderOutputsA();
  renderOutputsB();

  infoEl.textContent = `Đã chọn: ${fileName}`;
  btnLoad.disabled = false;
  btnSplit.disabled = true;
});

btnLoad.addEventListener("click", async () => {
  setError(""); setStatus("Đang đọc PDF..."); resetDownloads();
  try{
    if (!pdfU8) throw new Error("Chưa chọn PDF.");

    pdfLibDoc = await PDFLib.PDFDocument.load(pdfU8);
    totalPages = pdfLibDoc.getPageCount();

    if (!window.pdfjsLib) throw new Error("PDF.js không load được (pdfjsLib undefined).");
    pdfJsDoc = await window.pdfjsLib.getDocument({ data: pdfU8 }).promise;

    infoEl.textContent = `${fileName} — ${totalPages} trang`;
    btnSplit.disabled = false;

    windowSize = clamp(Number(pageSizeEl.value || 120), 20, 400);
    pageSizeEl.value = String(windowSize);

    await renderWindow();
    setStatus("Sẵn sàng.");
  }catch(e){
    setError(e?.message || String(e));
    setStatus("");
  }
});

// ---------- Mode A paging ----------
btnPrev.addEventListener("click", async () => {
  if (!totalPages) return;
  windowStart = Math.max(1, windowStart - windowSize);
  await renderWindow();
});
btnNext.addEventListener("click", async () => {
  if (!totalPages) return;
  windowStart = Math.min(totalPages, windowStart + windowSize);
  await renderWindow();
});
pageSizeEl.addEventListener("change", async () => {
  if (!totalPages) return;
  windowSize = clamp(Number(pageSizeEl.value || 120), 20, 400);
  pageSizeEl.value = String(windowSize);
  windowStart = clamp(windowStart, 1, totalPages);
  await renderWindow();
});
btnJump.addEventListener("click", async () => {
  if (!totalPages) return;
  const p = Number(jumpToEl.value || 1);
  if (!Number.isFinite(p) || p<1 || p>totalPages){
    setError(`Jump sai. Nhập 1..${totalPages}`);
    return;
  }
  setError("");
  windowStart = p;
  await renderWindow();
});

btnSelectAllVisible.addEventListener("click", () => {
  const end = Math.min(totalPages, windowStart + windowSize - 1);
  for (let p=windowStart; p<=end; p++) selectedPages.add(p);
  syncVisibleCheckboxes();
  updateSelectedUI();
});
btnClearVisible.addEventListener("click", () => {
  const end = Math.min(totalPages, windowStart + windowSize - 1);
  for (let p=windowStart; p<=end; p++) selectedPages.delete(p);
  syncVisibleCheckboxes();
  updateSelectedUI();
});
btnClearAll.addEventListener("click", () => {
  selectedPages.clear();
  syncVisibleCheckboxes();
  updateSelectedUI();
});

function updateSelectedUI(){
  pickCounter.textContent = `Selected: ${selectedPages.size}`;
  btnCreateFileFromSelection.disabled = selectedPages.size === 0;
}

async function renderWindow(){
  if (!pdfJsDoc || !totalPages){
    pageGrid.innerHTML = "";
    pageWindowEl.textContent = "-";
    return;
  }
  const end = Math.min(totalPages, windowStart + windowSize - 1);
  pageWindowEl.textContent = `${windowStart}–${end}`;
  pageGrid.innerHTML = "";
  setStatus(`Đang render ${windowStart}–${end}...`);

  for (let p=windowStart; p<=end; p++){
    const card = document.createElement("div");
    card.className = "pageCard";

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    const canvas = document.createElement("canvas");
    thumb.appendChild(canvas);

    const meta = document.createElement("div");
    meta.className = "pageMeta";

    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "checkbox";
    cb.checked = selectedPages.has(p);
    cb.addEventListener("change", () => {
      if (cb.checked) selectedPages.add(p);
      else selectedPages.delete(p);
      updateSelectedUI();
    });

    const txt = document.createElement("small");
    txt.textContent = `Trang ${p}`;

    label.appendChild(cb);
    label.appendChild(txt);

    const quick = document.createElement("small");
    quick.textContent = selectedPages.has(p) ? "✓" : "";

    meta.appendChild(label);
    meta.appendChild(quick);

    card.appendChild(thumb);
    card.appendChild(meta);
    pageGrid.appendChild(card);

    renderThumbnail(p, canvas).catch(()=>{});
    if ((p - windowStart) % 12 === 0) await new Promise(r=>setTimeout(r,0));
  }
  setStatus("Sẵn sàng.");
}

async function renderThumbnail(pageNumber, canvas){
  const page = await pdfJsDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 0.18 });
  const ctx = canvas.getContext("2d", { alpha: false });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
}

function syncVisibleCheckboxes(){
  const cards = pageGrid.querySelectorAll(".pageCard");
  let p = windowStart;
  for (const card of cards){
    const cb = card.querySelector("input[type=checkbox]");
    const quick = card.querySelector(".pageMeta small:last-child");
    const checked = selectedPages.has(p);
    if (cb) cb.checked = checked;
    if (quick) quick.textContent = checked ? "✓" : "";
    p++;
  }
}

// ---------- Mode A: create file from selection ----------
btnCreateFileFromSelection.addEventListener("click", () => {
  if (selectedPages.size === 0) return;

  const pages = [...selectedPages].sort((a,b)=>a-b);
  const defaultName = `Part_${pages[0]}_${pages[pages.length-1]}`;
  const name = sanitizeFileName(window.prompt("Tên file (không cần .pdf):", defaultName) || "");
  if (!name) return;

  outputsA.push({
    id: uniqueId(),
    name,
    pagesExpr: compressPages(pages),
  });

  selectedPages.clear();
  syncVisibleCheckboxes();
  updateSelectedUI();
  renderOutputsA();
});

function renderOutputsA(){
  pickBoxesEl.innerHTML = "";
  if (outputsA.length === 0){
    pickBoxesEl.innerHTML = `<div class="muted">Chưa có file nào. Chọn trang → “+ Tạo file từ selection”.</div>`;
    return;
  }

  for (const item of outputsA){
    const box = document.createElement("div");
    box.className = "box";

    const head = document.createElement("div");
    head.className = "boxHead";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = item.name;
    nameInput.placeholder = "Tên file";
    nameInput.addEventListener("input", () => item.name = sanitizeFileName(nameInput.value));

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = `pages: ${item.pagesExpr}`;

    const del = document.createElement("button");
    del.className = "btn-bad";
    del.textContent = "Xóa";
    del.addEventListener("click", () => {
      outputsA = outputsA.filter(x => x.id !== item.id);
      renderOutputsA();
    });

    head.appendChild(nameInput);
    head.appendChild(pill);
    head.appendChild(del);

    const body = document.createElement("div");
    body.className = "boxBody";

    const pagesInput = document.createElement("input");
    pagesInput.type = "text";
    pagesInput.style.width = "520px";
    pagesInput.value = item.pagesExpr;
    pagesInput.addEventListener("change", () => {
      // validate now
      const pages = parsePagesExpr(pagesInput.value, totalPages || 999999);
      item.pagesExpr = compressPages(pages);
      pagesInput.value = item.pagesExpr;
      pill.textContent = `pages: ${item.pagesExpr}`;
    });

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = `Sửa pages dạng 1,2,5-8`;

    body.appendChild(pagesInput);
    body.appendChild(hint);

    box.appendChild(head);
    box.appendChild(body);
    pickBoxesEl.appendChild(box);
  }
}

// ---------- Mode B ----------
btnAddRangeBox.addEventListener("click", () => {
  outputsB.push({ id: uniqueId(), name: `Part_${outputsB.length+1}`, from: 1, to: 1 });
  renderOutputsB();
});

btnExampleRange.addEventListener("click", () => {
  if (!totalPages){
    setError("Hãy bấm “Đọc PDF” trước để biết số trang.");
    return;
  }
  setError("");

  const from = 167;
  const to = Math.min(1818, totalPages); // ✅ clamp theo số trang thật
  outputsB.push({ id: uniqueId(), name: `Part_${from}_${to}`, from, to });
  renderOutputsB();
});

function renderOutputsB(){
  rangeBoxesEl.innerHTML = "";
  if (outputsB.length === 0){
    rangeBoxesEl.innerHTML = `<div class="muted">Bấm “+ Add box” để tạo from/to.</div>`;
    return;
  }

  for (const item of outputsB){
    const box = document.createElement("div");
    box.className = "box";

    const head = document.createElement("div");
    head.className = "boxHead";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = item.name;
    nameInput.placeholder = "Tên file";
    nameInput.addEventListener("input", () => item.name = sanitizeFileName(nameInput.value));

    const del = document.createElement("button");
    del.className = "btn-bad";
    del.textContent = "Xóa";
    del.addEventListener("click", () => {
      outputsB = outputsB.filter(x => x.id !== item.id);
      renderOutputsB();
    });

    head.appendChild(nameInput);
    head.appendChild(del);

    const body = document.createElement("div");
    body.className = "boxBody";

    const fromInput = document.createElement("input");
    fromInput.type = "number";
    fromInput.min = "1";
    fromInput.value = String(item.from);
    fromInput.addEventListener("input", () => item.from = Number(fromInput.value || 1));

    const toInput = document.createElement("input");
    toInput.type = "number";
    toInput.min = "1";
    toInput.value = String(item.to);
    toInput.addEventListener("input", () => item.to = Number(toInput.value || 1));

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "1-based, inclusive";

    body.append("From", fromInput, "To", toInput, hint);

    box.appendChild(head);
    box.appendChild(body);

    rangeBoxesEl.appendChild(box);
  }
}

// ---------- split ----------
btnSplit.addEventListener("click", async () => {
  setError(""); resetDownloads();

  try{
    if (!pdfU8) throw new Error("Chưa chọn PDF.");
    if (!pdfLibDoc){
      setStatus("Đang đọc PDF...");
      pdfLibDoc = await PDFLib.PDFDocument.load(pdfU8);
      totalPages = pdfLibDoc.getPageCount();
    }

    // Build specs from A + B
    const specs = [];

    // A
    for (const a of outputsA){
      const name = sanitizeFileName(a.name) || "output";
      const pages = parsePagesExpr(a.pagesExpr, totalPages);
      if (pages.length === 0) continue;
      specs.push({ name, pages });
    }

    // B
    for (const b of outputsB){
      const name = sanitizeFileName(b.name) || "output";
      const from = Number(b.from), to = Number(b.to);
      if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error(`Range sai ở "${name}".`);
      if (from < 1 || to < 1) throw new Error(`Range sai ở "${name}": trang phải >= 1.`);
      if (from > to) throw new Error(`Range sai ở "${name}": from > to.`);
      if (to > totalPages) throw new Error(`Range vượt quá số trang (${totalPages}) ở "${name}".`);
      const pages = [];
      for (let p=from; p<=to; p++) pages.push(p);
      specs.push({ name, pages });
    }

    if (specs.length === 0) throw new Error("Chưa có file nào để tách (Mode A hoặc Mode B).");

    btnSplit.disabled = true;
    btnLoad.disabled = true;

    const outputs = [];
    for (let i=0; i<specs.length; i++){
      const s = specs[i];
      setStatus(`(${i+1}/${specs.length}) Tạo: ${s.name}.pdf`);
      const bytes = await buildPdfFromPages(pdfLibDoc, s.pages);
      outputs.push({ file: `${s.name}.pdf`, bytes });
      await new Promise(r=>setTimeout(r,0));
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

async function buildPdfFromPages(srcDoc, pages1Based){
  const out = await PDFLib.PDFDocument.create();
  const indices = [...new Set(pages1Based)].sort((a,b)=>a-b).map(p => p-1);
  const copied = await out.copyPages(srcDoc, indices);
  copied.forEach(pg => out.addPage(pg));
  return await out.save();
}

async function renderDownloads(outputs){
  downloadsEl.style.display = "block";
  downloadsEl.innerHTML = `<h3 style="margin:0 0 6px 0;">Kết quả</h3><div class="muted">Tải từng file hoặc ZIP.</div>`;

  for (const o of outputs){
    const a = document.createElement("a");
    a.href = bytesToObjectUrl(o.bytes);
    a.download = o.file;
    a.textContent = o.file;
    downloadsEl.appendChild(a);
  }

  if (makeZipEl.checked){
    setStatus("Đang tạo ZIP...");
    const zip = new JSZip();
    const folder = sanitizeFileName(stripExt(fileName)) || "pdf_split";
    const f = zip.folder(folder);
    outputs.forEach(o => f.file(o.file, o.bytes));
    const blob = await zip.generateAsync({ type:"blob" });
    const zipName = `${folder}_split.zip`;

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = zipName;
    a.textContent = `Tải ZIP: ${zipName}`;
    downloadsEl.appendChild(document.createElement("div"));
    downloadsEl.appendChild(a);
    setStatus("Hoàn tất.");
  }
}

// ---------- init empty ----------
renderOutputsA();
renderOutputsB();
updateSelectedUI();
switchMode("A");
