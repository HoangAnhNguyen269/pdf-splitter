/* PDF Splitter Pro - FIXED
 * - Fix: pdfjsLib undefined by pinning pdf.js v3 UMD
 * - Fix: load PDF with Uint8Array
 * - Fix: tabs clickable because app won't crash on load
 */

const $ = (id) => document.getElementById(id);

const pdfFileEl = $("pdfFile");
const btnLoad = $("btnLoad");
const btnSplit = $("btnSplit");
const infoEl = $("info");
const statusEl = $("status");
const errorEl = $("error");
const downloadsEl = $("downloads");
const makeZipEl = $("makeZip");

// Tabs & modes
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
const btnCreateBoxFromSelection = $("btnCreateBoxFromSelection");
const pickBoxesEl = $("pickBoxes");
const jumpToEl = $("jumpTo");
const btnJump = $("btnJump");

// Mode B UI
const btnAddRangeBox = $("btnAddRangeBox");
const btnExampleRange = $("btnExampleRange");
const rangeBoxesEl = $("rangeBoxes");

// Data
let fileName = "document.pdf";
let pdfBytes = null;          // ArrayBuffer
let pdfU8 = null;             // Uint8Array
let pdfLibDoc = null;
let totalPages = 0;

// pdf.js
let pdfJsDoc = null;

// Selection state (Mode A)
const selectedPages = new Set(); // 1-based
let windowStart = 1;
let windowSize = 120;

// Output boxes
let pickBoxes = [];
let rangeBoxes = [];

function setStatus(msg){ statusEl.textContent = msg || ""; }
function setError(msg){ errorEl.textContent = msg || ""; }
function resetDownloads(){
  downloadsEl.style.display = "none";
  downloadsEl.innerHTML = "";
}
function sanitizeFileName(name){
  return (name || "")
    .replace(/[\/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}
function stripExt(name){ return name.replace(/\.[^/.]+$/, ""); }
function bytesToObjectUrl(bytes, mime="application/pdf"){
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}
function uniqueId(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

// ✅ Set worker for pdf.js v3
if (!window.pdfjsLib) {
  // If this ever happens, show readable error
  console.error("pdfjsLib is not available. Check CDN script tag.");
} else {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
}

// Tabs
tabPick.addEventListener("click", () => switchMode("pick"));
tabRange.addEventListener("click", () => switchMode("range"));

function switchMode(mode){
  if (mode === "pick"){
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

pdfFileEl.addEventListener("change", async () => {
  setError("");
  setStatus("");
  resetDownloads();

  const f = pdfFileEl.files?.[0];
  if (!f){
    infoEl.textContent = "Chưa có file";
    btnLoad.disabled = true;
    btnSplit.disabled = true;
    return;
  }

  fileName = f.name || "document.pdf";
  pdfBytes = await f.arrayBuffer();
  pdfU8 = new Uint8Array(pdfBytes);

  // reset state
  pdfLibDoc = null;
  pdfJsDoc = null;
  totalPages = 0;
  selectedPages.clear();
  pickBoxes = [];
  rangeBoxes = [];
  pickBoxesEl.innerHTML = "";
  rangeBoxesEl.innerHTML = "";
  pageGrid.innerHTML = "";
  windowStart = 1;

  infoEl.textContent = `Đã chọn: ${fileName}`;
  btnLoad.disabled = false;
  btnSplit.disabled = true;
  updatePickCounter();
  btnCreateBoxFromSelection.disabled = true;

  renderPickBoxes();
  renderRangeBoxes();
});

btnLoad.addEventListener("click", async () => {
  setError("");
  setStatus("Đang đọc PDF...");
  resetDownloads();

  try{
    if (!pdfU8) throw new Error("Chưa chọn PDF.");

    // Load pdf-lib
    pdfLibDoc = await PDFLib.PDFDocument.load(pdfU8);
    totalPages = pdfLibDoc.getPageCount();

    // Load pdf.js
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

// Pagination / window
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
  windowSize = clamp(Number(pageSizeEl.value || 120), 20, 400);
  pageSizeEl.value = String(windowSize);
  windowStart = Math.max(1, Math.min(windowStart, totalPages));
  await renderWindow();
});

// Jump
btnJump.addEventListener("click", async () => {
  if (!totalPages) return;
  const p = Number(jumpToEl.value || 1);
  if (!Number.isFinite(p) || p < 1 || p > totalPages) {
    setError(`Jump sai. Nhập 1..${totalPages}`);
    return;
  }
  setError("");
  windowStart = p;
  await renderWindow();
});

btnSelectAllVisible.addEventListener("click", () => {
  const end = Math.min(totalPages, windowStart + windowSize - 1);
  for (let p = windowStart; p <= end; p++) selectedPages.add(p);
  syncVisibleCheckboxes();
  updatePickCounter();
});
btnClearVisible.addEventListener("click", () => {
  const end = Math.min(totalPages, windowStart + windowSize - 1);
  for (let p = windowStart; p <= end; p++) selectedPages.delete(p);
  syncVisibleCheckboxes();
  updatePickCounter();
});
btnClearAll.addEventListener("click", () => {
  selectedPages.clear();
  syncVisibleCheckboxes();
  updatePickCounter();
});

function updatePickCounter(){
  pickCounter.textContent = `Selected: ${selectedPages.size}`;
  btnCreateBoxFromSelection.disabled = (selectedPages.size === 0);
}

// Render visible page window (Mode A)
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

  for (let p = windowStart; p <= end; p++){
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
      updatePickCounter();
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

    // thumbnail render (safe)
    renderThumbnail(p, canvas).catch(() => { /* ignore */ });

    if ((p - windowStart) % 12 === 0) await new Promise(r => setTimeout(r, 0));
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

// Create box from selection (Mode A)
btnCreateBoxFromSelection.addEventListener("click", () => {
  if (selectedPages.size === 0) return;

  const id = uniqueId();
  const pages = new Set([...selectedPages].sort((a,b)=>a-b));
  const minP = Math.min(...pages);
  const maxP = Math.max(...pages);

  pickBoxes.push({ id, name: `Part_${minP}_${maxP}`, pages });
  selectedPages.clear();
  syncVisibleCheckboxes();
  updatePickCounter();

  renderPickBoxes();
});

function renderPickBoxes(){
  pickBoxesEl.innerHTML = "";
  if (pickBoxes.length === 0){
    pickBoxesEl.innerHTML = `<div class="muted">Chưa có box nào. Chọn trang → “Tạo file từ selection”.</div>`;
    return;
  }

  for (const box of pickBoxes){
    const el = document.createElement("div");
    el.className = "box";

    const head = document.createElement("div");
    head.className = "boxHead";

    const nameInput = document.createElement("input");
    nameInput.value = box.name;
    nameInput.placeholder = "Tên file";
    nameInput.addEventListener("input", () => box.name = sanitizeFileName(nameInput.value));

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = `${box.pages.size} trang`;

    const btnRemove = document.createElement("button");
    btnRemove.className = "btn-bad";
    btnRemove.textContent = "Xóa box";
    btnRemove.addEventListener("click", () => {
      pickBoxes = pickBoxes.filter(b => b.id !== box.id);
      renderPickBoxes();
    });

    head.appendChild(nameInput);
    head.appendChild(pill);
    head.appendChild(btnRemove);

    const body = document.createElement("div");
    body.className = "boxBody";

    const pagesText = document.createElement("input");
    pagesText.type = "text";
    pagesText.style.width = "520px";
    pagesText.value = compressPages([...box.pages]);
    pagesText.title = "Sửa dạng: 1,2,5-8";
    pagesText.addEventListener("change", () => {
      const parsed = parsePagesExpression(pagesText.value, totalPages);
      box.pages = new Set(parsed);
      pill.textContent = `${box.pages.size} trang`;
      pagesText.value = compressPages([...box.pages]);
    });

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = `Trang: sửa được dạng 1,2,5-8`;

    body.appendChild(pagesText);
    body.appendChild(hint);

    el.appendChild(head);
    el.appendChild(body);
    pickBoxesEl.appendChild(el);
  }
}

// Mode B: range boxes
btnAddRangeBox.addEventListener("click", () => addRangeBox());
btnExampleRange.addEventListener("click", () => {
  rangeBoxes = [];
  rangeBoxesEl.innerHTML = "";
  addRangeBox({ name: "Part_167_1818", from: 167, to: 1818 });
  addRangeBox({ name: "P1_167_400", from: 167, to: 400 });
  addRangeBox({ name: "P2_401_900", from: 401, to: 900 });
  addRangeBox({ name: "P3_901_1818", from: 901, to: 1818 });
});

function addRangeBox(init={}){
  const id = uniqueId();
  rangeBoxes.push({
    id,
    name: sanitizeFileName(init.name || `Part_${rangeBoxes.length+1}`) || `Part_${rangeBoxes.length+1}`,
    from: Number(init.from || 1),
    to: Number(init.to || 1),
  });
  renderRangeBoxes();
}

function renderRangeBoxes(){
  rangeBoxesEl.innerHTML = "";
  if (rangeBoxes.length === 0){
    rangeBoxesEl.innerHTML = `<div class="muted">Bấm “+ Add box” để tạo from/to.</div>`;
    return;
  }

  for (const box of rangeBoxes){
    const el = document.createElement("div");
    el.className = "box";

    const head = document.createElement("div");
    head.className = "boxHead";

    const nameInput = document.createElement("input");
    nameInput.value = box.name;
    nameInput.placeholder = "Tên file";
    nameInput.addEventListener("input", () => box.name = sanitizeFileName(nameInput.value));

    const btnRemove = document.createElement("button");
    btnRemove.className = "btn-bad";
    btnRemove.textContent = "Xóa box";
    btnRemove.addEventListener("click", () => {
      rangeBoxes = rangeBoxes.filter(b => b.id !== box.id);
      renderRangeBoxes();
    });

    head.appendChild(nameInput);
    head.appendChild(btnRemove);

    const body = document.createElement("div");
    body.className = "boxBody";

    const fromInput = document.createElement("input");
    fromInput.type = "number";
    fromInput.min = "1";
    fromInput.value = String(box.from);
    fromInput.addEventListener("input", () => box.from = Number(fromInput.value || 1));

    const toInput = document.createElement("input");
    toInput.type = "number";
    toInput.min = "1";
    toInput.value = String(box.to);
    toInput.addEventListener("input", () => box.to = Number(toInput.value || 1));

    body.appendChild(labelText("From"));
    body.appendChild(fromInput);
    body.appendChild(labelText("To"));
    body.appendChild(toInput);

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = `1-based, inclusive.`;

    body.appendChild(hint);

    el.appendChild(head);
    el.appendChild(body);
    rangeBoxesEl.appendChild(el);
  }
}
function labelText(t){
  const s = document.createElement("span");
  s.className = "muted";
  s.textContent = t;
  return s;
}

// Split
btnSplit.addEventListener("click", async () => {
  setError("");
  setStatus("");
  resetDownloads();

  try{
    if (!pdfU8) throw new Error("Chưa chọn PDF.");
    if (!pdfLibDoc){
      setStatus("Đang đọc PDF...");
      pdfLibDoc = await PDFLib.PDFDocument.load(pdfU8);
      totalPages = pdfLibDoc.getPageCount();
    }

    const specs = [];

    for (const b of pickBoxes){
      const name = sanitizeFileName(b.name) || "output";
      const pages = [...b.pages].sort((a,b)=>a-b);
      if (pages.length === 0) continue;
      validatePages(pages, totalPages);
      specs.push({ name, pages });
    }

    for (const b of rangeBoxes){
      const name = sanitizeFileName(b.name) || "output";
      const from = Number(b.from), to = Number(b.to);
      if (from < 1 || to < 1) throw new Error(`Range invalid ở "${name}" (trang phải >= 1).`);
      if (from > to) throw new Error(`Range invalid ở "${name}" (from > to).`);
      if (to > totalPages) throw new Error(`Range vượt quá số trang (${totalPages}) ở "${name}".`);
      const pages = [];
      for (let p=from; p<=to; p++) pages.push(p);
      specs.push({ name, pages });
    }

    if (specs.length === 0){
      throw new Error("Chưa có box nào để tách. (Mode A: tạo box từ selection; Mode B: add box range)");
    }

    btnSplit.disabled = true;
    btnLoad.disabled = true;

    const outputs = [];
    for (let i=0; i<specs.length; i++){
      const s = specs[i];
      setStatus(`(${i+1}/${specs.length}) Tạo: ${s.name}.pdf`);
      const bytes = await buildPdfFromPageList(pdfLibDoc, s.pages);
      outputs.push({ file: `${s.name}.pdf`, bytes });
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

async function buildPdfFromPageList(srcDoc, pages1Based){
  const out = await PDFLib.PDFDocument.create();
  const indices = [...new Set(pages1Based)].sort((a,b)=>a-b).map(p => p-1);
  const copied = await out.copyPages(srcDoc, indices);
  copied.forEach(pg => out.addPage(pg));
  return await out.save();
}
function validatePages(pages, max){
  for (const p of pages){
    if (!Number.isInteger(p)) throw new Error(`Trang không hợp lệ: ${p}`);
    if (p < 1 || p > max) throw new Error(`Trang ${p} vượt phạm vi 1..${max}`);
  }
}

// Downloads + ZIP
async function renderDownloads(outputs){
  downloadsEl.style.display = "block";
  downloadsEl.innerHTML = `<h3 style="margin:0 0 6px 0;">Kết quả</h3><div class="muted">Tải từng file hoặc tải ZIP.</div>`;

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

// Helpers: compress pages to expression "1,2,5-8"
function compressPages(pages){
  if (!pages || pages.length === 0) return "";
  const arr = [...new Set(pages)].sort((a,b)=>a-b);
  const parts = [];
  let i=0;
  while (i < arr.length){
    let start = arr[i], end = start;
    while (i+1 < arr.length && arr[i+1] === end + 1){ i++; end = arr[i]; }
    parts.push(start === end ? `${start}` : `${start}-${end}`);
    i++;
  }
  return parts.join(",");
}
function parsePagesExpression(expr, maxPages){
  const s = (expr || "").trim();
  if (!s) return [];
  const items = s.split(",").map(x => x.trim()).filter(Boolean);
  const pages = [];
  for (const it of items){
    const m = it.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m){
      const a = Number(m[1]), b = Number(m[2]);
      if (a < 1 || b < 1 || a > b) throw new Error(`Sai đoạn: "${it}"`);
      if (b > maxPages) throw new Error(`Đoạn "${it}" vượt quá ${maxPages} trang`);
      for (let p=a; p<=b; p++) pages.push(p);
    } else {
      const n = Number(it);
      if (!Number.isInteger(n)) throw new Error(`Sai trang: "${it}"`);
      if (n < 1 || n > maxPages) throw new Error(`Trang "${it}" vượt 1..${maxPages}`);
      pages.push(n);
    }
  }
  return [...new Set(pages)].sort((a,b)=>a-b);
}

// Initial empty
renderPickBoxes();
renderRangeBoxes();
function renderPickBoxes(){
  pickBoxesEl.innerHTML = `<div class="muted">Chưa có box nào. Chọn trang → “Tạo file từ selection”.</div>`;
}
function renderRangeBoxes(){
  rangeBoxesEl.innerHTML = `<div class="muted">Bấm “+ Add box” để tạo from/to.</div>`;
}
function updatePickCounter(){
  pickCounter.textContent = `Selected: ${selectedPages.size}`;
  btnCreateBoxFromSelection.disabled = (selectedPages.size === 0);
}
