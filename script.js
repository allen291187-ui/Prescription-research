'use strict';
let cases = [];
const searchFields = ["案例編號","年度","季度","類型","科別","主搜尋藥物","商品名","問題分類","問題內容","案例摘要","關鍵字","原始全文","資料來源","搜尋別名"];

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
  vals.forEach(v => {
    const opt=document.createElement('option');
    opt.value=v; opt.textContent=v;
    el.appendChild(opt);
  });
}

function normalize(s){ return String(s||'').toLowerCase().trim(); }
function matchCase(c, keyword) {
  if(!keyword) return true;
  const hay = searchFields.map(f=>c[f]).join(' ').toLowerCase();
  return keyword.split(/\s+/).every(k => hay.includes(k));
}
function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function highlight(text, keyword) {
  let out = esc(String(text || ''));
  const terms = keyword.split(/\s+/).filter(Boolean).slice(0,8);
  for(const t of terms) {
    out = out.replace(new RegExp(escapeRegExp(esc(t)), 'gi'), m => `<mark>${m}</mark>`);
  }
  return out;
}
function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
function tagBlock(c, keyword) {
  const tags = String(c.關鍵字 || '').split('、').map(x => x.trim()).filter(Boolean);
  if(!tags.length) return '';
  return `<div class="section">
    <div class="section-title">關鍵字</div>
    <div class="section-body"><div class="tags">${tags.map(t => `<span class="tag">${highlight(t, keyword)}</span>`).join('')}</div></div>
  </div>`;
}
function rxTable(rows, mode) {
  if(!rows || !rows.length) return '';
  return `<div class="table-scroll"><table>
    <thead><tr><th>藥名</th><th>劑量</th><th>頻次</th><th>天數</th><th>總量</th></tr></thead>
    <tbody>
      ${rows.map(r => `<tr class="${r.異動 ? (mode==='before' ? 'changed-before' : 'changed-after') : ''}">
        <td>${esc(r.藥名)}</td>
        <td>${esc(r.劑量)}</td>
        <td>${esc(r.頻次)}</td>
        <td>${esc(r.天數)}</td>
        <td>${esc(r.總量)}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}
function diffBlock(c) {
  if(!c.異動重點 || !c.異動重點.length) return '';
  return `<div class="section">
    <div class="section-title">異動重點</div>
    <div class="section-body">
      <div class="diff">
        ${c.異動重點.map(x => `<div class="diff-item">
          <div class="diff-before">修正前：${esc(x.修正前)}</div>
          <div class="diff-arrow">↓</div>
          <div class="diff-after">修正後：${esc(x.修正後)}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}
function rxBlock(c) {
  if(c.類型 !== '錯誤醫囑') return '';
  const hasBefore = c.修正前處方 && c.修正前處方.length;
  const hasAfter = c.修正後處方 && c.修正後處方.length;
  if(!hasBefore && !hasAfter) return '';
  return `${diffBlock(c)}
  <div class="section">
    <div class="section-title">處方異動比較</div>
    <div class="section-body">
      <div class="rx-note">${esc(c.處方表格備註 || '')}</div>
      <div class="rx-wrap">
        <div class="rx-box">
          <div class="rx-title before">修正前處方</div>
          ${rxTable(c.修正前處方, 'before')}
        </div>
        <div class="rx-box">
          <div class="rx-title after">修正後處方</div>
          ${rxTable(c.修正後處方, 'after')}
        </div>
      </div>
    </div>
  </div>`;
}
function render() {
  const keyword = normalize(q.value);
  let filtered = cases.filter(c =>
    matchCase(c, keyword) &&
    (!type.value || c.類型 === type.value) &&
    (!year.value || c.年度 === year.value) &&
    (!category.value || c.問題分類 === category.value)
  );
  count.textContent = `找到 ${filtered.length} / ${cases.length} 筆`;
  const err = filtered.filter(c=>c.類型==="錯誤醫囑").length;
  const qup = filtered.filter(c=>c.類型==="疑義處方").length;
  const cats = uniq(filtered.map(c=>c.問題分類)).length;
  stats.innerHTML = `
    <div class="stat"><b>${filtered.length}</b>搜尋結果</div>
    <div class="stat"><b>${err}</b>錯誤醫囑</div>
    <div class="stat"><b>${qup}</b>疑義處方</div>
    <div class="stat"><b>${cats}</b>問題分類</div>`;

  if(!filtered.length) {
    results.innerHTML = '<div class="empty">查無資料。可以換藥名、商品名或關鍵字試試，資料庫還小，不要太兇。</div>';
    return;
  }
  results.innerHTML = filtered.map(c => `
    <article class="card">
      <div class="meta">
        <span class="badge">${esc(c.案例編號)}</span>
        <span class="badge ${c.類型==='錯誤醫囑'?'err':'q'}">${esc(c.類型)}</span>
        <span class="badge">${esc(c.問題分類)}</span>
      </div>
      <h3>${highlight(c.主搜尋藥物, keyword)} <span style="color:#667085;font-weight:500">(${highlight(c.商品名, keyword)})</span></h3>
      <div class="row"><span class="label">科別</span>${esc(c.科別)}　<span class="label">年度季別</span>${esc(c.年度)}${esc(c.季度)}</div>
      <div class="summary">${highlight(c.案例摘要, keyword)}</div>
      <div class="card-actions"><button class="openbtn" onclick="openCase('${esc(c.案例編號)}')">查看案例</button></div>
    </article>
  `).join('');
}
function openCase(caseId) {
  const c = cases.find(x => x.案例編號 === caseId);
  if(!c) return;
  const keyword = normalize(q.value);
  modalTitle.innerHTML = `
    <div class="meta">
      <span class="badge">${esc(c.案例編號)}</span>
      <span class="badge ${c.類型==='錯誤醫囑'?'err':'q'}">${esc(c.類型)}</span>
      <span class="badge">${esc(c.問題分類)}</span>
    </div>
    <h2 id="modalHeading">${highlight(c.主搜尋藥物, keyword)} <span class="drug">(${highlight(c.商品名, keyword)})</span></h2>
    <div class="row"><span class="label">科別</span>${esc(c.科別)}　<span class="label">年度季別</span>${esc(c.年度)}${esc(c.季度)}</div>
  `;
  modalBody.innerHTML = `
    <div class="section">
      <div class="section-title">案例摘要</div>
      <div class="section-body">${highlight(c.案例摘要, keyword)}</div>
    </div>
    <div class="section">
      <div class="section-title">問題內容</div>
      <div class="section-body">${highlight(c.問題內容, keyword)}</div>
    </div>
    ${rxBlock(c)}
    <div class="section">
      <div class="section-title">原始全文</div>
      <div class="section-body"><div class="prebox">${highlight(c.原始全文, keyword)}</div></div>
    </div>
    ${tagBlock(c, keyword)}
    <div class="section">
      <div class="section-title">資料來源</div>
      <div class="section-body">${esc(c.資料來源)}</div>
    </div>
  `;
  modalBackdrop.classList.add('show');
  document.body.classList.add('modal-open');
}
function closeModal() {
  modalBackdrop.classList.remove('show');
  document.body.classList.remove('modal-open');
}
function backdropClose(e) {
  if(e.target === modalBackdrop) closeModal();
}
document.addEventListener('keydown', e => {
  if(e.key === 'Escape') closeModal();
});
function resetFilters() { q.value=''; type.value=''; year.value=''; category.value=''; render(); }
function downloadJSON() {
  const blob = new Blob([JSON.stringify(cases, null, 2)], {type:"application/json;charset=utf-8"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "data.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
function toCSV(data) {
  const fields = ["案例編號","年度","季度","類型","科別","主搜尋藥物","商品名","問題分類","問題內容","案例摘要","關鍵字","原始全文","資料來源","處方表格備註","異動重點","修正前處方","修正後處方"];
  const rows = [fields.join(',')];
  for (const c of data) rows.push(fields.map(f => `"${String(typeof c[f] === 'object' ? JSON.stringify(c[f]) : (c[f]??'')).replaceAll('"','""')}"`).join(','));
  return rows.join('\n');
}
async function copyCSV() {
  await navigator.clipboard.writeText(toCSV(cases));
  alert('已複製 CSV，可直接貼到 Excel。');
}
[q,type,year,category].forEach(el => el.addEventListener('input', render));

async function init() {
  try {
    const response = await fetch('data.json', {cache: 'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    cases = await response.json();
    fillSelect(type, uniq(cases.map(x=>x.類型)));
    fillSelect(year, uniq(cases.map(x=>x.年度)));
    fillSelect(category, uniq(cases.map(x=>x.問題分類)));
    render();
  } catch (error) {
    console.error(error);
    count.textContent = '資料載入失敗';
    results.innerHTML = '<div class="empty">無法載入 data.json。請確認檔案已與 index.html 放在同一層，並透過 GitHub Pages 開啟網站。</div>';
  }
}
init();
