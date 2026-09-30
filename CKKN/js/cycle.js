/* ══════════════════════════════════════════════════════
   cycle.js  –  Toàn bộ logic Tab "Chu Kỳ Kinh Nguyệt"
   Phụ thuộc: utils.js (phải load trước)
══════════════════════════════════════════════════════ */

/* ── Hằng số dữ liệu ── */
const C_SYMPTOMS = [
  'Đau bụng', 'Đau đầu', 'Mệt mỏi', 'Buồn nôn', 'Chướng bụng',
  'Đau lưng',  'Đau ngực', 'Chóng mặt', 'Tiêu chảy', 'Mụn trứng cá'
];
const C_PAINS = ['Không đau', 'Nhẹ 🟢', 'Vừa 🟡', 'Nặng 🔴', 'Rất nặng 💀'];
const C_MOODS = ['😊 Vui vẻ', '😐 Bình thường', '😢 Buồn', '😠 Cáu kỉnh', '😴 Mệt', '😰 Lo âu', '💪 Năng động'];

/* ── State ── */
let cycles           = JSON.parse(localStorage.getItem(CYCLE_KEY) || '[]');
let cEditId           = null;
let cSelectedSymptoms = new Set();
let cSelectedPain     = '';
let cSelectedMood     = new Set(); // multi-select
let cExpandedHistory  = new Set();
let cHistoryPage      = 0;
const C_HISTORY_PAGE_SIZE = 5;

/* ══════════════════════════════════════
   KHỞI TẠO CHIPS
══════════════════════════════════════ */
function initCycleChips() {
  buildChips('c-symptoms', C_SYMPTOMS, 'pink', v => {
    cSelectedSymptoms.has(v) ? cSelectedSymptoms.delete(v) : cSelectedSymptoms.add(v);
    syncMultiChip('c-symptoms', cSelectedSymptoms);
  });

  buildChips('c-pain', C_PAINS, 'purple', v => {
    cSelectedPain = v;
    syncSingleChip('c-pain', v);
  });

  buildChips('c-mood', C_MOODS, 'pink', v => {
    cSelectedMood.has(v) ? cSelectedMood.delete(v) : cSelectedMood.add(v);
    syncMultiChip('c-mood', cSelectedMood);
  });
}

/* ══════════════════════════════════════
   CRUD – LƯU
══════════════════════════════════════ */
function saveCycle() {
  const start = document.getElementById('c-start').value;
  const end   = document.getElementById('c-end').value;
  const note  = document.getElementById('c-note').value.trim();

  if (!start) { toast('⚠️ Vui lòng chọn ngày bắt đầu!'); return; }
  if (end && end < start) { toast('⚠️ Ngày kết thúc phải sau ngày bắt đầu!'); return; }

  const obj = {
    id:        cEditId || uid(),
    start,
    end,
    symptoms:  [...cSelectedSymptoms],
    pain:      cSelectedPain,
    mood:      [...cSelectedMood],
    note,
    createdAt: cEditId
      ? (cycles.find(c => c.id === cEditId)?.createdAt || Date.now())
      : Date.now()
  };

  if (cEditId) {
    cycles[cycles.findIndex(c => c.id === cEditId)] = obj;
    toast('✅ Đã cập nhật chu kỳ!');
  } else {
    cycles.push(obj);
    toast('✅ Đã thêm chu kỳ mới!');
  }

  _saveCycles();
  saveHealthRecord('cycle', obj);
  resetCycleForm();
  if (typeof closeCycleModal === 'function') closeCycleModal();
  cHistoryPage = 0;
  renderCycles();
  updateCycleStats();
  updateCyclePredict();
  if (typeof updateRelationSafety === 'function') updateRelationSafety();
}

/* ══════════════════════════════════════
   CRUD – ĐẶT LẠI FORM
══════════════════════════════════════ */
function resetCycleForm() {
  cEditId = null;
  ['c-start', 'c-end', 'c-note'].forEach(id => (document.getElementById(id).value = ''));
  document.getElementById('c-form-title').textContent = 'Thêm Chu Kỳ Mới';

  cSelectedSymptoms.clear();
  cSelectedPain = '';
  cSelectedMood.clear();

  ['c-symptoms', 'c-pain', 'c-mood'].forEach(id =>
    document.querySelectorAll(`#${id} .chip`).forEach(c => c.classList.remove('active'))
  );
}

/* ══════════════════════════════════════
   CRUD – SỬA
══════════════════════════════════════ */
function editCycle(id) {
  const c = cycles.find(x => x.id === id);
  if (!c) return;

  cEditId = id;
  document.getElementById('c-start').value = c.start;
  document.getElementById('c-end').value   = c.end || '';
  document.getElementById('c-note').value  = c.note || '';
  document.getElementById('c-form-title').textContent = 'Chỉnh Sửa Chu Kỳ';

  cSelectedSymptoms = new Set(c.symptoms || []);
  syncMultiChip('c-symptoms', cSelectedSymptoms);

  cSelectedPain = c.pain || '';
  syncSingleChip('c-pain', cSelectedPain);

  cSelectedMood = new Set(Array.isArray(c.mood) ? c.mood : (c.mood ? [c.mood] : []));
  syncMultiChip('c-mood', cSelectedMood);

  switchTab('cycle');
  if (typeof openCycleModal === 'function') openCycleModal(true);
}

/* ══════════════════════════════════════
   RENDER DANH SÁCH
══════════════════════════════════════ */
function renderCycles() {
  const qEl = document.getElementById('c-search');
  const el   = document.getElementById('c-list');
  const paginationEl = document.getElementById('c-history-pagination');
  if (!el) return;
  const q = qEl ? qEl.value : '';

  let list = [...cycles];

  if (q) {
    list = list.filter(c => historyRecordMatchesQuery(c, 'start', q, [
      c.end,
      c.note,
      c.pain,
      ...(Array.isArray(c.mood) ? c.mood : (c.mood ? [c.mood] : [])),
      ...(c.symptoms || [])
    ]));
  }

  list = list
    .sort((a, b) => new Date(b.start) - new Date(a.start));
  const totalPages = Math.max(1, Math.ceil(list.length / C_HISTORY_PAGE_SIZE));
  cHistoryPage = Math.min(cHistoryPage, totalPages - 1);

  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="ei">🌺</div><p>Không có chu kỳ nào</p></div>`;
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  const pageStart = cHistoryPage * C_HISTORY_PAGE_SIZE;
  const pageList = list.slice(pageStart, pageStart + C_HISTORY_PAGE_SIZE);

  el.innerHTML = `<div class="history-groups">${groupHistoryByMonth(pageList, 'start').map(([monthKey, monthRecords]) => `
    <section class="history-month-group">
      <div class="history-month-heading">
        <h3>${historyMonthLabel(monthKey)}</h3>
        <span>${monthRecords.length} bản ghi</span>
      </div>
      <div class="history-month-items">
        ${monthRecords.map(c => {
          const dur = c.end ? dayDiff(c.start, c.end) + 1 : '?';
          const expanded = cExpandedHistory.has(c.id);
          const moods = Array.isArray(c.mood) ? c.mood : (c.mood ? [c.mood] : []);
          const symptoms = c.symptoms || [];
          const badges = [
            ...symptoms.map(s => `<span class="badge badge-pink">${s}</span>`),
            c.pain ? `<span class="badge badge-purple">${c.pain}</span>` : '',
            ...moods.map(m => `<span class="badge badge-blue">${m}</span>`)
          ].filter(Boolean).join('');
          const subtitle = [
            symptoms.length ? `${symptoms.length} triệu chứng` : 'Chưa ghi triệu chứng',
            c.pain || ''
          ].filter(Boolean).join(' · ');

          return `
            <article class="history-item cycle-history-item${expanded ? ' is-open' : ''}">
              <button class="history-item-toggle" type="button"
                      onclick="toggleHistoryItem('cycle','${c.id}')"
                      aria-expanded="${expanded}">
                <span class="item-icon">🩸</span>
                <span class="history-item-main">
                  <span class="history-item-title">
                    ${fmtDate(c.start)}${c.end ? ' → ' + fmtDate(c.end) : ''}
                    <span class="badge badge-green">${dur} ngày</span>
                  </span>
                  <span class="history-item-subtitle">${subtitle}</span>
                </span>
                <span class="history-chevron" aria-hidden="true">⌄</span>
              </button>
              <div class="history-item-details">
                <div class="item-meta">${badges || '<span class="history-muted">Chưa có thông tin chi tiết</span>'}</div>
                ${c.note ? `<div class="item-note">💬 ${c.note}</div>` : ''}
                <div class="history-item-actions">
                  <button class="icon-btn edit" onclick="editCycle('${c.id}')" title="Sửa">✏️</button>
                  <button class="icon-btn del" onclick="askDelete('cycle','${c.id}')" title="Xóa">🗑️</button>
                </div>
              </div>
            </article>`;
        }).join('')}
      </div>
    </section>`).join('')}</div>`;

  if (paginationEl) {
    paginationEl.innerHTML = totalPages > 1 ? `
      <button class="history-page-btn" type="button" onclick="changeCycleHistoryPage(-1)" ${cHistoryPage === 0 ? 'disabled' : ''}>← Mới hơn</button>
      <span>Trang ${cHistoryPage + 1} / ${totalPages}</span>
      <button class="history-page-btn" type="button" onclick="changeCycleHistoryPage(1)" ${cHistoryPage >= totalPages - 1 ? 'disabled' : ''}>Cũ hơn →</button>
    ` : `<span>Đang hiển thị ${list.length} bản ghi gần nhất</span>`;
  }
}

function handleCycleHistorySearch() {
  cHistoryPage = 0;
  renderCycles();
}

function changeCycleHistoryPage(direction) {
  cHistoryPage = Math.max(0, cHistoryPage + direction);
  renderCycles();
}

/* ══════════════════════════════════════
   THỐNG KÊ
══════════════════════════════════════ */
function updateCycleStats() {
  document.getElementById('c-total').textContent = cycles.length;

  if (cycles.length < 2) {
    document.getElementById('c-avg-cycle').textContent = '–';
  } else {
    const sorted = [...cycles].sort((a, b) => new Date(a.start) - new Date(b.start));
    const diffs  = sorted.slice(1).map((c, i) => dayDiff(sorted[i].start, c.start));
    document.getElementById('c-avg-cycle').textContent = Math.round(avg(diffs));
  }

  const withEnd = cycles.filter(c => c.end);
  document.getElementById('c-avg-dur').textContent = withEnd.length
    ? Math.round(avg(withEnd.map(c => dayDiff(c.start, c.end) + 1)))
    : '–';
}

/* ══════════════════════════════════════
   DỰ ĐOÁN CHU KỲ TIẾP THEO
══════════════════════════════════════ */
function updateCyclePredict() {
  const band = document.getElementById('c-predict');
  if (cycles.length < 2) { band.style.display = 'none'; return; }

  const sorted = [...cycles].sort((a, b) => new Date(a.start) - new Date(b.start));
  const diffs  = sorted.slice(1).map((c, i) => dayDiff(sorted[i].start, c.start));
  const avgCy  = Math.round(avg(diffs));
  const last   = sorted[sorted.length - 1];
  const next   = addDays(last.start, avgCy);

  band.style.display = 'flex';
  document.getElementById('c-predict-text').textContent =
    `Khoảng ${fmtDate(next)} (chu kỳ trung bình ${avgCy} ngày)`;
}

/* ══════════════════════════════════════
   INTERNAL – LƯU VÀO LOCALSTORAGE
══════════════════════════════════════ */
function _saveCycles() {
  localStorage.setItem(CYCLE_KEY, JSON.stringify(cycles));
}

/* ── Xóa một chu kỳ theo id (gọi từ app.js sau khi xác nhận) ── */
function deleteCycleById(id) {
  cycles = cycles.filter(c => c.id !== id);
  cExpandedHistory.delete(id);
  _saveCycles();
  deleteHealthRecord('cycle', id);
  renderCycles();
  updateCycleStats();
  updateCyclePredict();
  if (typeof updateRelationSafety === 'function') updateRelationSafety();
}
