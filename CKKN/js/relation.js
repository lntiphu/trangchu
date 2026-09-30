/* ══════════════════════════════════════════════════════
   relation.js  –  Toàn bộ logic Tab "Quan Hệ"
   Phụ thuộc: utils.js (phải load trước)
══════════════════════════════════════════════════════ */

/* ── Hằng số dữ liệu ── */
const R_PROT     = ['✅ Có', '❌ Không'];
const R_METHODS  = ['Bao cao su', 'Thuốc tránh thai', 'Vòng tránh thai', 'Tính ngày an toàn', 'Xuất ngoài'];
const R_FEELINGS = ['💖 Tuyệt vời', '😊 Bình thường', '😐 Chấp nhận được', '😰 Lo lắng', '💔 Không tốt'];

/* ── State ── */
let relations        = JSON.parse(localStorage.getItem(RELATION_KEY) || '[]');
let rEditId          = null;
let rSelectedProt    = '';
let rSelectedMethod  = new Set();
let rSelectedFeeling = '';
let rExpandedHistory = new Set();

/* ══════════════════════════════════════
   ƯỚC TÍNH NGÀY ÍT NGUY CƠ HƠN THEO LỊCH
   Đây là phương pháp lịch có vùng đệm bảo thủ, không phải biện pháp
   tránh thai tuyệt đối. Cần khuyến nghị dùng bao cao su/biện pháp phù hợp.
══════════════════════════════════════ */
function _localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function _cycleSafetyProfile() {
  if (!Array.isArray(cycles) || cycles.length < 2) return null;

  const sorted = cycles
    .filter(c => c && c.start)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  const intervals = sorted.slice(1)
    .map((cycle, index) => dayDiff(sorted[index].start, cycle.start))
    .filter(value => Number.isFinite(value) && value >= 15 && value <= 60);

  if (!intervals.length) return null;

  const durations = sorted
    .filter(c => c.start && c.end && c.end >= c.start)
    .map(c => dayDiff(c.start, c.end) + 1)
    .filter(value => value >= 2 && value <= 10);

  const averageCycle = Math.max(20, Math.min(45, Math.round(avg(intervals))));
  const shortest = Math.min(...intervals);
  const longest = Math.max(...intervals);

  return {
    lastStart: sorted[sorted.length - 1].start,
    averageCycle,
    shortest,
    longest,
    periodLength: durations.length ? Math.max(3, Math.min(8, Math.round(avg(durations)))) : 5
  };
}

function _formatSafetyRange(start, end) {
  return start === end ? fmtDate(start) : `${fmtDate(start)} – ${fmtDate(end)}`;
}

function _collectSafetyRanges(profile, todayKey, horizon = 42) {
  const firstOffset = Math.max(0, dayDiff(profile.lastStart, todayKey));
  const cycleOffset = Math.floor(firstOffset / profile.averageCycle);
  const anchor = addDays(profile.lastStart, cycleOffset * profile.averageCycle);
  const fertileStart = Math.max(1, profile.shortest - 19);
  const fertileEnd = Math.min(profile.averageCycle, profile.longest - 10);
  const days = [];

  for (let offset = 0; offset < horizon; offset += 1) {
    const date = addDays(todayKey, offset);
    const elapsed = Math.max(0, dayDiff(anchor, date));
    const cycleDay = (elapsed % profile.averageCycle) + 1;
    const type = cycleDay <= profile.periodLength
      ? 'period'
      : cycleDay >= fertileStart && cycleDay <= fertileEnd
        ? 'fertile'
        : 'lower-risk';
    days.push({ date, type, cycleDay });
  }

  const rangesFor = type => days.reduce((ranges, day) => {
    const previous = ranges[ranges.length - 1];
    if (day.type === type && previous && addDays(previous.end, 1) === day.date) {
      previous.end = day.date;
    } else if (day.type === type) {
      ranges.push({ start: day.date, end: day.date });
    }
    return ranges;
  }, []);

  return {
    lowerRisk: rangesFor('lower-risk'),
    fertile: rangesFor('fertile'),
    period: rangesFor('period'),
    fertileStart,
    fertileEnd,
    todayCycleDay: days[0]?.cycleDay || 1,
    nextPeriod: addDays(anchor, profile.averageCycle)
  };
}

function updateRelationSafety() {
  const content = document.getElementById('r-safety-content');
  if (!content) return;

  const profile = _cycleSafetyProfile();
  if (!profile) {
    content.innerHTML = `
      <div class="relation-safety-empty">
        <strong>Chưa đủ dữ liệu để ước tính</strong>
        <span>Hãy lưu ít nhất 2 ngày bắt đầu chu kỳ kinh để so sánh độ dài chu kỳ.</span>
      </div>`;
    return;
  }

  const todayKey = _localDateKey();
  const ranges = _collectSafetyRanges(profile, todayKey);
  const lowerRiskText = ranges.lowerRisk.length
    ? ranges.lowerRisk.slice(0, 3).map(range => _formatSafetyRange(range.start, range.end)).join(' · ')
    : 'Không có khoảng phù hợp trong 6 tuần tới';
  const fertileText = ranges.fertile.length
    ? ranges.fertile.slice(0, 3).map(range => _formatSafetyRange(range.start, range.end)).join(' · ')
    : 'Chưa xác định';

  content.innerHTML = `
    <div class="relation-safety-summary">
      <span>Hôm nay là ngày <strong>${ranges.todayCycleDay}</strong> của chu kỳ ước tính <strong>${profile.averageCycle} ngày</strong></span>
      <span>Kỳ tiếp theo dự kiến khoảng <strong>${fmtDate(ranges.nextPeriod)}</strong></span>
    </div>
    <div class="relation-safety-ranges">
      <div class="relation-safety-range lower-risk">
        <span class="relation-safety-label">🟢 Ít nguy cơ hơn theo lịch</span>
        <strong>${lowerRiskText}</strong>
      </div>
      <div class="relation-safety-range fertile">
        <span class="relation-safety-label">🟠 Nên thận trọng hơn</span>
        <strong>${fertileText}</strong>
      </div>
    </div>
    <p class="relation-safety-note">
      Vùng thận trọng được nới rộng theo chu kỳ ngắn nhất/dài nhất đã lưu
      (ngày ${ranges.fertileStart}–${ranges.fertileEnd} của chu kỳ). “Ít nguy cơ hơn” không có nghĩa là an toàn tuyệt đối;
      chu kỳ có thể thay đổi và tinh trùng có thể sống nhiều ngày. Nếu chưa muốn có thai, hãy dùng bao cao su hoặc biện pháp tránh thai phù hợp.
    </p>`;
}

/* ══════════════════════════════════════
   KHỞI TẠO CHIPS
══════════════════════════════════════ */
function initRelationChips() {
  buildChips('r-protection', R_PROT, 'blue', v => {
    rSelectedProt = v;
    syncSingleChip('r-protection', v);
  });

  buildChips('r-method', R_METHODS, 'rose', v => {
    rSelectedMethod.has(v) ? rSelectedMethod.delete(v) : rSelectedMethod.add(v);
    syncMultiChip('r-method', rSelectedMethod);
  });

  buildChips('r-feeling', R_FEELINGS, 'purple', v => {
    rSelectedFeeling = v;
    syncSingleChip('r-feeling', v);
  });
}

/* ══════════════════════════════════════
   CRUD – LƯU
══════════════════════════════════════ */
function saveRelation() {
  const date = document.getElementById('r-date').value;
  const time = document.getElementById('r-time').value;
  const note = document.getElementById('r-note').value.trim();

  if (!date) { toast('⚠️ Vui lòng chọn ngày!'); return; }

  const obj = {
    id:         rEditId || uid(),
    date,
    time,
    protection: rSelectedProt,
    methods:    [...rSelectedMethod],
    feeling:    rSelectedFeeling,
    note,
    createdAt:  rEditId
      ? (relations.find(r => r.id === rEditId)?.createdAt || Date.now())
      : Date.now()
  };

  if (rEditId) {
    relations[relations.findIndex(r => r.id === rEditId)] = obj;
    toast('✅ Đã cập nhật!');
  } else {
    relations.push(obj);
    toast('✅ Đã thêm mới!');
  }

   _saveRelations();
   saveHealthRecord('relation', obj);
   resetRelationForm();
   if (typeof closeRelationModal === 'function') closeRelationModal();
   renderRelations();
   updateRelationStats();
}

/* ══════════════════════════════════════
   CRUD – ĐẶT LẠI FORM
══════════════════════════════════════ */
function resetRelationForm() {
  rEditId = null;
  ['r-date', 'r-time', 'r-note'].forEach(id => (document.getElementById(id).value = ''));
  document.getElementById('r-form-title').textContent = 'Thêm Lần Quan Hệ';

  rSelectedProt = '';
  rSelectedMethod.clear();
  rSelectedFeeling = '';

  ['r-protection', 'r-method', 'r-feeling'].forEach(id =>
    document.querySelectorAll(`#${id} .chip`).forEach(c => c.classList.remove('active'))
  );
}

/* ══════════════════════════════════════
   CRUD – SỬA
══════════════════════════════════════ */
function editRelation(id) {
  const r = relations.find(x => x.id === id);
  if (!r) return;

  rEditId = id;
  document.getElementById('r-date').value = r.date;
  document.getElementById('r-time').value = r.time || '';
  document.getElementById('r-note').value = r.note || '';
  document.getElementById('r-form-title').textContent = 'Chỉnh Sửa';

  rSelectedProt = r.protection || '';
  syncSingleChip('r-protection', rSelectedProt);

  rSelectedMethod = new Set(r.methods || []);
  syncMultiChip('r-method', rSelectedMethod);

  rSelectedFeeling = r.feeling || '';
  syncSingleChip('r-feeling', rSelectedFeeling);

  switchTab('relation');
  if (typeof openRelationModal === 'function') openRelationModal(true);
}

/* ══════════════════════════════════════
   RENDER DANH SÁCH
══════════════════════════════════════ */
function renderRelations() {
  const qEl = document.getElementById('r-search');
  const el   = document.getElementById('r-list');
  if (!el) return;
  const q = qEl ? qEl.value : '';
  const month = updateHistoryMonthFilter('r-month-filter', relations, 'date');

  let list = [...relations];

  if (q) {
    list = list.filter(r => historyRecordMatchesQuery(r, 'date', q, [
      r.time,
      r.note,
      r.protection,
      r.feeling,
      ...(r.methods || [])
    ]));
  }

  if (month !== 'all') {
    list = list.filter(r => historyMonthKey(r.date) === month);
  }

  // Chỉ hiển thị 5 lần quan hệ gần nhất để lịch sử không bị quá dài.
  list = list
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  list.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="ei">💞</div><p>Chưa có dữ liệu quan hệ</p></div>`;
    return;
  }

  el.innerHTML = `<div class="history-groups">${groupHistoryByMonth(list, 'date').map(([monthKey, monthRecords]) => `
    <section class="history-month-group">
      <div class="history-month-heading relation-history-heading">
        <h3>${historyMonthLabel(monthKey)}</h3>
        <span>${monthRecords.length} bản ghi</span>
      </div>
      <div class="history-month-items">
        ${monthRecords.map(r => {
          const expanded = rExpandedHistory.has(r.id);
          const protBadge = r.protection
            ? `<span class="badge ${r.protection.includes('✅') ? 'badge-green' : 'badge-rose'}">${r.protection}</span>`
            : '';
          const methodBadges = (r.methods || [])
            .map(m => `<span class="badge badge-blue">${m}</span>`)
            .join('');
          const feelBadge = r.feeling
            ? `<span class="badge badge-purple">${r.feeling}</span>`
            : '';
          const badges = `${protBadge}${methodBadges}${feelBadge}`;
          const subtitle = [
            r.protection ? r.protection.replace('✅ ', '').replace('❌ ', '') : 'Chưa ghi bảo vệ',
            (r.methods || [])[0] || ''
          ].filter(Boolean).join(' · ');

          return `
            <article class="history-item rose-history-item${expanded ? ' is-open' : ''}">
              <button class="history-item-toggle" type="button"
                      onclick="toggleHistoryItem('relation','${r.id}')"
                      aria-expanded="${expanded}">
                <span class="item-icon rose">💞</span>
                <span class="history-item-main">
                  <span class="history-item-title">${fmtDate(r.date)}${r.time ? ' lúc ' + r.time : ''}</span>
                  <span class="history-item-subtitle">${subtitle}</span>
                </span>
                <span class="history-chevron" aria-hidden="true">⌄</span>
              </button>
              <div class="history-item-details">
                <div class="item-meta">${badges || '<span class="history-muted">Chưa có thông tin chi tiết</span>'}</div>
                ${r.note ? `<div class="item-note">💬 ${r.note}</div>` : ''}
                <div class="history-item-actions">
                  <button class="icon-btn edit" onclick="editRelation('${r.id}')" title="Sửa">✏️</button>
                  <button class="icon-btn del" onclick="askDelete('relation','${r.id}')" title="Xóa">🗑️</button>
                </div>
              </div>
            </article>`;
        }).join('')}
      </div>
    </section>`).join('')}</div>`;
}

/* ══════════════════════════════════════
   THỐNG KÊ
══════════════════════════════════════ */
function updateRelationStats() {
  document.getElementById('r-total').textContent = relations.length;

  const now = new Date();
  const thisMonth = relations.filter(r => {
    const d = new Date(r.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  document.getElementById('r-this-month').textContent = thisMonth;

  if (!relations.length) {
    document.getElementById('r-last').textContent = '–';
    return;
  }

  const sorted = [...relations].sort((a, b) => new Date(b.date) - new Date(a.date));
  const diff   = dayDiff(sorted[0].date, now.toISOString().split('T')[0]);

  document.getElementById('r-last').textContent =
    diff === 0 ? 'Hôm nay' : diff === 1 ? 'Hôm qua' : `${diff} ngày`;
}

/* ══════════════════════════════════════
   INTERNAL – LƯU VÀO LOCALSTORAGE
══════════════════════════════════════ */
function _saveRelations() {
  localStorage.setItem(RELATION_KEY, JSON.stringify(relations));
}

/* ── Xóa một bản ghi theo id (gọi từ app.js sau khi xác nhận) ── */
function deleteRelationById(id) {
  relations = relations.filter(r => r.id !== id);
  rExpandedHistory.delete(id);
  _saveRelations();
  deleteHealthRecord('relation', id);
  renderRelations();
  updateRelationStats();
}
