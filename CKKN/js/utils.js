/* ══════════════════════════════════════════════════════
   utils.js  –  Các hàm tiện ích dùng chung toàn app
   Không phụ thuộc vào module nào khác.
══════════════════════════════════════════════════════ */

/* ── Storage Keys ── */
const CYCLE_KEY    = 'ckkn_cycles';
const RELATION_KEY = 'ckkn_relations';

/* ── Tạo ID ngẫu nhiên duy nhất ── */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ── Tính số ngày chênh lệch giữa 2 chuỗi YYYY-MM-DD ── */
function dayDiff(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86_400_000);
}

/* ── Cộng thêm d ngày vào date string, trả về string ── */
function addDays(dateStr, d) {
  const dt = new Date(dateStr);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().split('T')[0];
}

/* ── Format YYYY-MM-DD → DD/MM/YYYY ── */
function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/* ── Tính trung bình mảng số ── */
function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/* ── Helpers cho lịch sử nhóm theo tháng ── */
function historyMonthKey(date) {
  return String(date || '').slice(0, 7);
}

function historyMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-');
  return year && month ? `Tháng ${Number(month)} / ${year}` : 'Không xác định ngày';
}

function updateHistoryMonthFilter(selectId, records, dateField) {
  const select = document.getElementById(selectId);
  if (!select) return 'all';

  const current = select.value || 'all';
  const months = [...new Set(
    records.map(record => historyMonthKey(record[dateField])).filter(Boolean)
  )].sort((a, b) => b.localeCompare(a));

  select.innerHTML = '<option value="all">Tất cả tháng</option>' + months
    .map(month => `<option value="${month}">${historyMonthLabel(month)}</option>`)
    .join('');

  select.value = months.includes(current) ? current : 'all';
  return select.value;
}

function groupHistoryByMonth(records, dateField) {
  const groups = new Map();
  records.forEach(record => {
    const month = historyMonthKey(record[dateField]) || 'unknown';
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(record);
  });
  return [...groups.entries()];
}

function normalizeHistoryText(value) {
  return String(value || '')
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

function historyRecordMatchesQuery(record, dateField, query, extraValues = []) {
  const normalizedQuery = normalizeHistoryText(query);
  if (!normalizedQuery) return true;

  const date = String(record[dateField] || '');
  const [year, month, day] = date.split('-');
  const monthNumber = month ? Number(month) : '';
  const dayNumber = day ? Number(day) : '';
  const dateSearchValues = [
    date,
    `${day}/${month}/${year}`,
    `${dayNumber}/${monthNumber}/${year}`,
    `${month}/${year}`,
    `${monthNumber}/${year}`,
    `${month}-${year}`,
    `${monthNumber}-${year}`,
    `${month} ${year}`,
    `${monthNumber} ${year}`,
    `tháng ${monthNumber} ${year}`
  ];

  return normalizeHistoryText([...dateSearchValues, ...extraValues].join(' '))
    .includes(normalizedQuery);
}

/* ── Toast thông báo ── */
let _toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ══════════════════════════════════════
   Chip helpers  (dùng chung cho cả 2 module)
══════════════════════════════════════ */

/**
 * Sinh chip vào container.
 * @param {string}   containerId  - id phần tử cha
 * @param {string[]} items        - danh sách nhãn
 * @param {string}   color        - class màu (pink | blue | rose | purple | green)
 * @param {Function} onClick      - callback(value)
 */
function buildChips(containerId, items, color, onClick) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // Không nhúng callback bằng onclick dạng chuỗi. Callback được truyền từ
  // cycle.js/relation.js và cần giữ lexical scope của module, nếu không các
  // biến như cSelectedSymptoms/cSelectedMood sẽ bị mất trong event handler.
  el.innerHTML = items
    .map(item => {
      const safeValue = String(item)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<span class="chip ${color}" data-val="${safeValue}" role="button" tabindex="0"></span>`;
    })
    .join('');

  el.querySelectorAll('.chip').forEach(chip => {
    const activate = () => onClick(chip.dataset.val);
    chip.textContent = chip.dataset.val;
    chip.addEventListener('click', activate);
    chip.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
  });
}

/* Đánh dấu 1 chip được chọn (single-select) */
function syncSingleChip(containerId, val) {
  document.querySelectorAll(`#${containerId} .chip`).forEach(c =>
    c.classList.toggle('active', c.dataset.val === val)
  );
}

/* Đánh dấu nhiều chip được chọn (multi-select) */
function syncMultiChip(containerId, setObj) {
  document.querySelectorAll(`#${containerId} .chip`).forEach(c =>
    c.classList.toggle('active', setObj.has(c.dataset.val))
  );
}

function goBackToHome() {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ action: 'showWelcomeHubPage' }, '*');
    }
  } catch (e) {}

  try {
    if (window.parent && window.parent !== window && typeof window.parent.showWelcomeHubPage === 'function') {
      window.parent.showWelcomeHubPage();
      return;
    }
  } catch (e) {}

  window.location.href = '../index.html';
}
window.goBackToHome = goBackToHome;
