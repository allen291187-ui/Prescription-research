'use strict';

const SHEET_ID = '1UVMKbjxuDUr4b6hPjztMBlApq60wZoeuchMEgaEePLY';
const SHEET_NAME = '工作表1';
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&_=${Date.now()}`;

let cases = [];
const searchFields = ['學名', '商品名', '問題分類', '關鍵字'];

const q = document.getElementById('q');
const type = document.getElementById('type');
const year = document.getElementById('year');
const category = document.getElementById('category');
const results = document.getElementById('results');
const count = document.getElementById('count');
const stats = document.getElementById('stats');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');

function uniq(arr) { return [...new Set(arr.filter(Boolean))].sort(); }
function fillSelect(el, vals) {
  el.querySelectorAll('option:not(:first-child)').forEach(opt => opt.remove());
  vals.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    el.appendChild(opt);
  });
}
function normalize(s) { return String(s || '').toLowerCase().trim(); }
function matchCase(c, keyword) {
  if (!keyword) return true;
  const hay = searchFields.map(f => c[f] || '').join(' ').toLowerCase();
  return keyword.split(/\s+/).filter(Boolean).every(k => hay.includes(k));
}
function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function highlight(text, keyword) {
  let out = esc(String(text || ''));
  const terms = keyword.split(/\s+/).filter(Boolean).slice(0, 8);
  for (const t of terms) {
    out = out.replace(new RegExp(escapeRegExp(esc(t)), 'gi'), m => `<mark>${m}</mark>`);
  }
  return out;
}
function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}


function splitImageLinks(value) {
  return String(value || '')
    .split(/[\n\r;；]+/)
    .map(x => x.trim())
    .filter(Boolean);
}

function getDriveFileId(url) {
  const raw = String(url || '').trim();
  const match =
    raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    raw.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
    raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : '';
}

function imageCandidates(url) {
  const raw = String(url || '').trim();
  if (!raw) return [];
  const id = getDriveFileId(raw);
  if (!id) return [raw];

  // Multiple public Google Drive image endpoints are provided because
  // availability can differ between browsers and deployments.
  return [
    `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w1600`,
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`,
    `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`
  ];
}

function imageItems(c) {
  return splitImageLinks(c.圖片).map(raw => ({
    original: raw,
    candidates: imageCandidates(raw)
  })).filter(item => item.candidates.length);
}

function tryNextImage(img) {
  let candidates = [];
  try {
    candidates = JSON.parse(decodeURIComponent(img.dataset.candidates || '[]'));
  } catch (_) {}
  const nextIndex = Number(img.dataset.index || 0) + 1;
  if (nextIndex < candidates.length) {
    img.dataset.index = String(nextIndex);
    img.src = candidates[nextIndex];
    return;
  }
  img.closest('.case-image-item')?.classList.add('image-failed');
}

function imageBlock(c) {
  const items = imageItems(c);

  if (!items.length) {
    return `<div class="section">
      <div class="section-title">案例圖片</div>
      <div class="section-body">
        <div class="image-empty">尚未上傳案例圖片</div>
      </div>
    </div>`;
  }

  const gallery = items.map((item, idx) => {
    const candidates = encodeURIComponent(JSON.stringify(item.candidates));
    const first = item.candidates[0];
    return `<div class="case-image-item">
      <button class="case-image-button" type="button"
              onclick="event.stopPropagation(); openImageViewer(this.querySelector('img').src)"
              aria-label="放大案例圖片 ${idx + 1}">
        <img src="${esc(first)}"
             data-candidates="${candidates}"
             data-index="0"
             alt="案例圖片 ${idx + 1}"
             loading="lazy"
             referrerpolicy="no-referrer"
             onerror="tryNextImage(this)" />
      </button>
      <a class="image-open-link" href="${esc(item.original)}" target="_blank" rel="noopener">在 Google Drive 開啟圖片</a>
    </div>`;
  }).join('');

  return `<div class="section"><div class="section-title">案例圖片</div><div class="section-body"><div class="case-gallery">${gallery}</div></div></div>`;
}

function openImageViewer(url) {
  document.getElementById('imageViewerImg').src = url;
  document.getElementById('imageViewer').classList.add('show');
  document.body.classList.add('modal-open');
}

function closeImageViewer(event) {
  if (event) event.stopPropagation();
  document.getElementById('imageViewer').classList.remove('show');
  document.getElementById('imageViewerImg').src = '';
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else {
      if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Safely parses the Python-like array/dictionary strings produced by the current Sheet import.
function parseStructured(value) {
  const src = String(value || '').trim();
  if (!src || src === '[]') return [];
  let i = 0;
  function ws() { while (/\s/.test(src[i] || '')) i++; }
  function str() {
    const quote = src[i++]; let out = '';
    while (i < src.length) {
      const ch = src[i++];
      if (ch === '\\') {
        const next = src[i++];
        out += ({n:'\n', r:'\r', t:'\t'}[next] ?? next);
      } else if (ch === quote) return out;
      else out += ch;
    }
    throw new Error('未結束的字串');
  }
  function atom() {
    const start = i;
    while (i < src.length && !/[\s,\]}:]/.test(src[i])) i++;
    const token = src.slice(start, i);
    if (token === 'True' || token === 'true') return true;
    if (token === 'False' || token === 'false') return false;
    if (token === 'None' || token === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
    return token;
  }
  function val() {
    ws();
    if (src[i] === '[') {
      i++; const arr = []; ws();
      while (i < src.length && src[i] !== ']') {
        arr.push(val()); ws();
        if (src[i] === ',') { i++; ws(); } else break;
      }
      if (src[i] === ']') i++;
      return arr;
    }
    if (src[i] === '{') {
      i++; const obj = {}; ws();
      while (i < src.length && src[i] !== '}') {
        const key = val(); ws();
        if (src[i] === ':') i++;
        obj[String(key)] = val(); ws();
        if (src[i] === ',') { i++; ws(); } else break;
      }
      if (src[i] === '}') i++;
      return obj;
    }
    if (src[i] === '"' || src[i] === "'") return str();
    return atom();
  }
  try { return val(); } catch (e) { console.warn('結構欄位解析失敗：', src, e); return []; }
}

function rowsToCases(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(x => String(x).trim());
  return rows.slice(1).filter(row => row.some(Boolean)).map(row => {
    const c = {};
    headers.forEach((h, idx) => { c[h] = row[idx] ?? ''; });
    return c;
  }).filter(c => normalize(c.是否顯示) === '顯示');
}

function caseSort(a, b) {
  return String(b.案例編號 || '').localeCompare(String(a.案例編號 || ''), 'zh-Hant', {numeric: true});
}

function tagBlock(c, keyword) {
  const tags = String(c.關鍵字 || '').split(/[、;,；]/).map(x => x.trim()).filter(Boolean);
  if (!tags.length) return '';
  return `<div class="section"><div class="section-title">關鍵字</div><div class="section-body"><div class="tags">${tags.map(t => `<span class="tag">${highlight(t, keyword)}</span>`).join('')}</div></div></div>`;
}
function rxTable(rows, mode) {
  if (!rows || !rows.length) return '';
  return `<div class="table-scroll"><table><thead><tr><th>藥名</th><th>劑量</th><th>頻次</th><th>天數</th><th>總量</th></tr></thead><tbody>${rows.map(r => `<tr class="${r.異動 ? (mode === 'before' ? 'changed-before' : 'changed-after') : ''}"><td>${esc(r.藥名)}</td><td>${esc(r.劑量)}</td><td>${esc(r.頻次)}</td><td>${esc(r.天數)}</td><td>${esc(r.總量)}</td></tr>`).join('')}</tbody></table></div>`;
}
function diffBlock(c) {
  if (!c.異動重點 || !c.異動重點.length) return '';
  return `<div class="section"><div class="section-title">異動重點</div><div class="section-body"><div class="diff">${c.異動重點.map(x => `<div class="diff-item"><div class="diff-before">修正前：${esc(x.修正前)}</div><div class="diff-arrow">↓</div><div class="diff-after">修正後：${esc(x.修正後)}</div></div>`).join('')}</div></div></div>`;
}
function rxBlock(c) {
  if (c.類型 !== '錯誤醫囑') return '';
  const hasBefore = c.修正前處方 && c.修正前處方.length;
  const hasAfter = c.修正後處方 && c.修正後處方.length;
  if (!hasBefore && !hasAfter) return '';
  return `${diffBlock(c)}<div class="section"><div class="section-title">處方異動比較</div><div class="section-body"><div class="rx-wrap"><div class="rx-box"><div class="rx-title before">修正前處方</div>${rxTable(c.修正前處方, 'before')}</div><div class="rx-box"><div class="rx-title after">修正後處方</div>${rxTable(c.修正後處方, 'after')}</div></div></div></div>`;
}

function render() {
  const keyword = normalize(q.value);
  const filtered = cases.filter(c => matchCase(c, keyword) && (!type.value || c.類型 === type.value) && (!year.value || c.年度 === year.value) && (!category.value || c.問題分類 === category.value));
  count.textContent = `找到 ${filtered.length} / ${cases.length} 筆`;
  const err = filtered.filter(c => c.類型 === '錯誤醫囑').length;
  const qup = filtered.filter(c => c.類型 === '疑義處方').length;
  stats.innerHTML = `<div class="stat"><b>${filtered.length}</b>搜尋結果</div><div class="stat"><b>${err}</b>錯誤醫囑</div><div class="stat"><b>${qup}</b>疑義處方</div><div class="stat"><b>${uniq(filtered.map(c => c.問題分類)).length}</b>問題分類</div>`;
  if (!filtered.length) {
    results.innerHTML = '<div class="empty">查無資料，請改用學名、商品名、問題分類或關鍵字搜尋。</div>';
    return;
  }
  results.innerHTML = filtered.map(c => `<article class="card"><div class="meta"><span class="badge">${esc(c.案例編號)}</span><span class="badge ${c.類型 === '錯誤醫囑' ? 'err' : 'q'}">${esc(c.類型)}</span><span class="badge">${esc(c.問題分類)}</span></div><h3>${highlight(c.學名, keyword)}${c.商品名 ? ` <span style="color:#667085;font-weight:500">(${highlight(c.商品名, keyword)})</span>` : ''}</h3><div class="row"><span class="label">科別</span>${esc(c.科別)}　<span class="label">年度季別</span>${esc(c.年度)}${esc(c.季度)}</div><div class="summary">${esc(c.案例摘要)}</div><div class="card-actions"><button class="openbtn" onclick="openCase('${esc(c.案例編號)}')">查看案例</button></div></article>`).join('');
}
function openCase(caseId) {
  const c = cases.find(x => x.案例編號 === caseId);
  if (!c) return;
  const keyword = normalize(q.value);
  modalTitle.innerHTML = `<div class="meta"><span class="badge">${esc(c.案例編號)}</span><span class="badge ${c.類型 === '錯誤醫囑' ? 'err' : 'q'}">${esc(c.類型)}</span><span class="badge">${esc(c.問題分類)}</span></div><h2 id="modalHeading">${highlight(c.學名, keyword)}${c.商品名 ? ` <span class="drug">(${highlight(c.商品名, keyword)})</span>` : ''}</h2><div class="row"><span class="label">科別</span>${esc(c.科別)}　<span class="label">年度季別</span>${esc(c.年度)}${esc(c.季度)}</div>`;
  modalBody.innerHTML = `${imageBlock(c)}<div class="section"><div class="section-title">案例摘要</div><div class="section-body">${esc(c.案例摘要)}</div></div><div class="section"><div class="section-title">問題內容</div><div class="section-body">${esc(c.問題內容)}</div></div><div class="section"><div class="section-title">原始全文</div><div class="section-body"><div class="prebox">${esc(c.原始全文)}</div></div></div>${tagBlock(c, keyword)}<div class="section"><div class="section-title">資料來源</div><div class="section-body">${esc(c.資料來源)}</div></div>`;
  modalBackdrop.classList.add('show');
  document.body.classList.add('modal-open');
}
function closeModal() { modalBackdrop.classList.remove('show'); document.body.classList.remove('modal-open'); }
function backdropClose(e) { if (e.target === modalBackdrop) closeModal(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (document.getElementById('imageViewer').classList.contains('show')) closeImageViewer(); else closeModal(); } });
function resetFilters() { q.value = ''; type.value = ''; year.value = ''; category.value = ''; render(); }
[q, type, year, category].forEach(el => el.addEventListener('input', render));

async function init() {
  try {
    count.textContent = '正在從 Google Sheet 載入資料…';
    const response = await fetch(`${SHEET_CSV_URL}&_=${Date.now()}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    cases = rowsToCases(parseCSV(await response.text())).sort(caseSort);
    if (!cases.length) throw new Error('找不到可顯示資料');
    fillSelect(type, uniq(cases.map(x => x.類型)));
    fillSelect(year, uniq(cases.map(x => x.年度)).sort((a, b) => Number(b) - Number(a)));
    fillSelect(category, uniq(cases.map(x => x.問題分類)));
    render();
  } catch (error) {
    console.error(error);
    count.textContent = 'Google Sheet 資料載入失敗';
    results.innerHTML = '<div class="empty">請確認 Google Sheet 已設定為「知道連結的任何人皆可檢視」，且工作表名稱仍為「工作表1」。</div>';
  }
}
init();
