/* PDF Splitter - frontend only
 * - pdf-lib: read + copy pages
 * - jszip: optional zip download
 */

const $ = (id) => document.getElementById(id);

const pdfFileEl = $("pdfFile");
const btnAnalyze = $("btnAnalyze");
const btnSplit = $("btnSplit");
const btnExample = $("btnExample");
const pdfInfo = $("pdfInfo");
const rangesEl = $("ranges");
const makeZipEl = $("makeZip");
const statusEl = $("status");
const errorEl = $("error");
const downloadsEl = $("downloads");

let sourcePdfBytes = null;
let sourcePdfDoc = null;
let totalPages = 0;
let originalFileName = "document.pdf";

pdfFileEl.addEventListener("change", async () => {
  resetUI();
  const file = pdfFileEl.files?.[0];
  if (!file) return;

  originalFileName = file.name || "document.pdf";
  sourcePdfBytes = await file.arrayBuffer();

  btnAnalyze.disabled = false;
  btnSplit.disabled = false;
  pdfInfo.textContent = `Đã chọn: ${originalFileName} (chưa đọc số trang)`;
});

btnAnalyze.addEventListener("click", async () => {
  try {
    await ensurePdfLoaded();
    pdfInfo.innerHTML = `✅ <span class="ok">${originalFileName}</span> — ${totalPages} trang`;
  } catch (e) {
    showError(e);
  }
});

btnExample.addEventListener("click", () => {
  rangesEl.value = `Part_167_1818|167-1818
Chap1|1-50
Chap2|51-120
Intro_Mixed|1-2,10-12`;
});

btnSplit.addEventListener("click", async () => {
  errorEl.textContent = "";
  downloadsEl.style.display = "none";
  downloadsEl.innerHTML = "";

  try {
    await ensurePdfLoaded();

    const specs = parseSpecs(rangesEl.value, totalPages);
    if (specs.length === 0) throw new Error("Bạn chưa nhập đoạn tách nào.");

    setStatus(`Đang tách ${specs.length} file...`);
    btnSplit.disabled = true;
    btnAnalyze.disabled = true;

    const outputs = [];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      setStatus(`(${i + 1}/${specs.length}) Đang tạo: ${spec.outName}.pdf`);
      const pdfBytes = await buildPdfFromRanges(sourcePdfDoc, spec.ranges);
      outputs.push({ name: `${spec.outName}.pdf`, bytes: pdfBytes });
    }

    setStatus(`Hoàn tất: ${outputs.length} file.`);
    renderDownloads(outputs, makeZipEl.checked);

  } catch (e) {
    showError(e);
  } finally {
    btnSplit.disabled = false;
    btnAnalyze.disabled = false;
  }
});

async function ensurePdfLoaded() {
  if (!sourcePdfBytes) throw new Error("Chưa chọn PDF.");
  if (!sourcePdfDoc) {
    sourcePdfDoc = await PDFLib.PDFDocument.load(sourcePdfBytes);
    totalPages = sourcePdfDoc.getPageCount();
  }
}

function resetUI() {
  sourcePdfBytes = null;
  sourcePdfDoc = null;
  totalPages = 0;
  pdfInfo.textContent = "";
  errorEl.textContent = "";
  downloadsEl.style.display = "none";
  downloadsEl.innerHTML = "";
  setStatus("");
  btnAnalyze.disabled = true;
  btnSplit.disabled = true;
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function showError(e) {
  errorEl.textContent = (e && e.message) ? e.message : String(e);
  setStatus("");
}

/**
 * Parse input lines format:
 *   Name|167-1818
 *   Name|1-2,10-12
 */
function parseSpecs(text, maxPages) {
  const lines = text
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith("#"));

  const specs = [];

  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length !== 2) {
      throw new Error(`Sai format dòng: "${line}"\nĐúng: TenFile|from-to hoặc TenFile|from-to,from-to`);
    }

    const outName = sanitizeFileName(parts[0].trim());
    if (!outName) throw new Error(`Tên file rỗng ở dòng: "${line}"`);

    const rangesPart = parts[1].trim();
    const ranges = rangesPart.split(",").map(r => r.trim()).filter(Boolean);
    if (ranges.length === 0) throw new Error(`Không có range ở dòng: "${line}"`);

    const parsedRanges = ranges.map(r => parseRange(r, maxPages));
    specs.push({ outName, ranges: parsedRanges });
  }

  return specs;
}

/**
 * Parse "167-1818" or "5-5" into {from, to} with validation (1-based inclusive)
 */
function parseRange(r, maxPages) {
  const m = r.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) throw new Error(`Range sai: "${r}" (đúng dạng: from-to, ví dụ 167-1818)`);

  const from = Number(m[1]);
  const to = Number(m[2]);

  if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error(`Range không hợp lệ: "${r}"`);
  if (from < 1 || to < 1) throw new Error(`Trang phải >= 1: "${r}"`);
  if (from > to) throw new Error(`from phải <= to: "${r}"`);
  if (to > maxPages) throw new Error(`Range vượt quá số trang (${maxPages}): "${r}"`);

  return { from, to };
}

/**
 * Build a new PDF by copying page ranges from source doc.
 */
async function buildPdfFromRanges(srcDoc, ranges) {
  const outDoc = await PDFLib.PDFDocument.create();

  for (const { from, to } of ranges) {
    const indices = [];
    for (let p = from; p <= to; p++) indices.push(p - 1); // pdf-lib uses 0-based
    const copied = await outDoc.copyPages(srcDoc, indices);
    copied.forEach(page => outDoc.addPage(page));
  }

  return await outDoc.save();
}

/**
 * Render downloads: either individual links and/or a ZIP
 */
async function renderDownloads(outputs, makeZip) {
  downloadsEl.style.display = "block";
  downloadsEl.innerHTML = `<h3>Kết quả</h3>`;

  // Individual links
  const list = document.createElement("div");
  list.className = "muted";
  list.innerHTML = `<div>Nhấn để tải từng file:</div>`;
  const ul = document.createElement("ul");
  outputs.forEach(o => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = bytesToObjectUrl(o.bytes);
    a.download = o.name;
    a.textContent = o.name;
    a.style.textDecoration = "none";
    li.appendChild(a);
    ul.appendChild(li);
  });
  list.appendChild(ul);
  downloadsEl.appendChild(list);

  // ZIP
  if (makeZip) {
    setStatus("Đang tạo ZIP...");
    const zip = new JSZip();
    const folderName = sanitizeFileName(stripExt(originalFileName)) || "pdf_split";
    const folder = zip.folder(folderName);

    for (const o of outputs) {
      folder.file(o.name, o.bytes);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const zipName = `${folderName}_split.zip`;

    const a = document.createElement("a");
    a.href = URL.createObjectURL(zipBlob);
    a.download = zipName;
    a.textContent = `Tải tất cả (ZIP): ${zipName}`;
    a.style.display = "inline-block";
    a.style.marginTop = "10px";
    a.style.padding = "10px 12px";
    a.style.border = "1px solid #ccc";
    a.style.borderRadius = "10px";
    a.style.textDecoration = "none";

    downloadsEl.appendChild(a);
    setStatus("Hoàn tất.");
  }
}

function bytesToObjectUrl(bytes) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

function stripExt(name) {
  return name.replace(/\.[^/.]+$/, "");
}

function sanitizeFileName(name) {
  // remove illegal filename characters across OS
  return name
    .replace(/[\/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}
