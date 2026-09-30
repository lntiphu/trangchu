/* ══════════════════════════════════════════════════════
   app.js  –  Điều phối chính: khởi tạo, tab, modal xóa
   Phụ thuộc: utils.js, cycle.js, relation.js
══════════════════════════════════════════════════════ */

/* ── Trạng thái modal xóa ── */
let deleteTarget = null; // { type: 'cycle' | 'relation', id: string }

/* ══════════════════════════════════════
   KHỞI TẠO ỨNG DỤNG
══════════════════════════════════════ */
async function init() {
  // Xây chip cho tab Chu Kỳ
  initCycleChips();
  // Xây chip cho tab Quan Hệ
  initRelationChips();

  // Tải dữ liệu Supabase trước khi vẽ danh sách lần đầu.
  await initHealthDatabase();

  // Render danh sách + thống kê ban đầu
  renderCycles(); // Chu kỳ - Timeline only
  updateCycleStats();
  updateCyclePredict();

  renderRelations();
  updateRelationStats();
  updateRelationSafety();
}

/* ── Mở/đóng chi tiết một bản ghi trong lịch sử ── */
function toggleHistoryItem(type, id) {
  const expandedSet = type === 'cycle' ? cExpandedHistory : rExpandedHistory;
  expandedSet.has(id) ? expandedSet.delete(id) : expandedSet.add(id);

  if (type === 'cycle') renderCycles();
  else renderRelations();
}

/* ══════════════════════════════════════
   CHUYỂN TAB
══════════════════════════════════════ */
function switchTab(tab) {
  const tabs = ['cycle', 'relation'];

  // Cập nhật nút tab
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    const isTarget = btn.dataset.tab ? btn.dataset.tab === tab : (tabs[i] === tab);
    btn.classList.toggle('active', isTarget);
  });

  // Cập nhật nội dung tab
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.classList.toggle('active', t === tab);
  });
}

/* ══════════════════════════════════════
   MODAL XÁC NHẬN XÓA
══════════════════════════════════════ */

/** Mở modal xóa – gọi từ nút xóa trong từng item */
function askDelete(type, id) {
  deleteTarget = { type, id };
  document.getElementById('del-modal').classList.add('open');
}

/** Xác nhận xóa – gọi từ nút "Xóa" trong modal */
function confirmDelete() {
  if (!deleteTarget) return;

  if (deleteTarget.type === 'cycle') {
    deleteCycleById(deleteTarget.id);
  } else {
    deleteRelationById(deleteTarget.id);
  }

  toast('🗑️ Đã xóa!');
  closeModal();
}

/** Đóng modal (hủy xóa) */
function closeModal() {
  document.getElementById('del-modal').classList.remove('open');
  deleteTarget = null;
}

/* ══════════════════════════════════════
   MODAL THÊM MỚI (CHOOSER, CYCLE, RELATION)
══════════════════════════════════════ */
function openAddPickerModal() {
  const modal = document.getElementById('modal-add-picker');
  if (modal) modal.classList.add('open');
}

function closeAddPickerModal() {
  const modal = document.getElementById('modal-add-picker');
  if (modal) modal.classList.remove('open');
}

function selectAddOption(type) {
  closeAddPickerModal();
  if (type === 'cycle') {
    switchTab('cycle');
    resetCycleForm();
    openCycleModal(false);
  } else if (type === 'relation') {
    switchTab('relation');
    resetRelationForm();
    openRelationModal(false);
  }
}

function openCycleModal(isEdit = false) {
  const modal = document.getElementById('modal-cycle');
  if (modal) {
    modal.classList.add('open');
    if (!isEdit) {
      const startEl = document.getElementById('c-start');
      if (startEl && !startEl.value) {
        const today = new Date().toISOString().split('T')[0];
        startEl.value = today;
      }
    }
  }
}

function closeCycleModal() {
  const modal = document.getElementById('modal-cycle');
  if (modal) modal.classList.remove('open');
}

function openRelationModal(isEdit = false) {
  const modal = document.getElementById('modal-relation');
  if (modal) {
    modal.classList.add('open');
    if (!isEdit) {
      const dateEl = document.getElementById('r-date');
      if (dateEl && !dateEl.value) {
        const today = new Date().toISOString().split('T')[0];
        dateEl.value = today;
      }
    }
  }
}

function closeRelationModal() {
  const modal = document.getElementById('modal-relation');
  if (modal) modal.classList.remove('open');
}

window.openAddPickerModal = openAddPickerModal;
window.closeAddPickerModal = closeAddPickerModal;
window.selectAddOption = selectAddOption;
window.openCycleModal = openCycleModal;
window.closeCycleModal = closeCycleModal;
window.openRelationModal = openRelationModal;
window.closeRelationModal = closeRelationModal;

/* ══════════════════════════════════════
   KHỞI CHẠY KHI DOM SẴN SÀNG
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', init);
