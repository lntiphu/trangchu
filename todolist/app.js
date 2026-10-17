// ==================== SUPABASE CONFIGURATION ====================
const SUPABASE_URL = 'https://ghdydszifdaiphcjguri.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZHlkc3ppZmRhaXBoY2pndXJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjAzOTgsImV4cCI6MjEwMDE5NjM5OH0.ZTpS0cdmmCO4eH41nXFGQpnAELgD5iMwOEpl_mG7S1c';

const STORAGE_KEY = 'phu_todos_mobile_v4';
const THEME_KEY = 'phu_theme_preference';

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

let supabaseClient = null;
let currentUserId = null;
if (typeof supabase !== 'undefined' && supabase.createClient) {
  try {
    supabaseClient = window.__QLCT_SUPABASE_CLIENT || supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.__QLCT_SUPABASE_CLIENT = supabaseClient;
  } catch (e) {
    console.warn('Supabase initialization failed:', e);
  }
}

async function initTodoAuth() {
  if (!supabaseClient) return;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUserId = session?.user?.id || null;

    supabaseClient.auth.onAuthStateChange((event, nextSession) => {
      const nextUserId = nextSession?.user?.id || null;
      if (nextUserId === currentUserId) return;
      currentUserId = nextUserId;
      if (currentUserId) syncWithSupabase(false);
    });
  } catch (error) {
    console.warn('TodoList auth initialization failed:', error);
  }
}

const VN_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 (Hà Nội)

function toVietnamShiftedDate(input = Date.now()) {
  const ms = input instanceof Date ? input.getTime() : (typeof input === 'number' ? input : new Date(input).getTime());
  return new Date(ms + VN_TIMEZONE_OFFSET_MS);
}

function getRelativeDateTime(dayOffset, hours, minutes) {
  const shiftedNow = toVietnamShiftedDate();
  const targetMs = Date.UTC(
    shiftedNow.getUTCFullYear(),
    shiftedNow.getUTCMonth(),
    shiftedNow.getUTCDate() + dayOffset,
    hours,
    minutes,
    0,
    0
  ) - VN_TIMEZONE_OFFSET_MS;
  return formatLocalDateTimeValue(new Date(targetMs));
}

// datetime-local biểu diễn giờ địa phương (UTC+7 Hà Nội), còn Supabase timestamptz
// cần một thời điểm có múi giờ. Luôn đổi qua lại ở biên LocalStorage/Supabase để giờ
// người dùng chọn không bị lệch sau khi đóng và mở lại ứng dụng.
function formatLocalDateTimeValue(date) {
  const shifted = toVietnamShiftedDate(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

function localDateTimeToIso(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return value;

  const [, year, month, day, hour, minute] = match;
  const vnDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+07:00`);
  return Number.isNaN(vnDate.getTime()) ? value : vnDate.toISOString();
}

function cloudDateTimeToLocal(value) {
  if (!value) return '';

  const raw = String(value);
  // Hỗ trợ dữ liệu cũ nếu cột trả về chuỗi không có timezone.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    return raw.slice(0, 16);
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : formatLocalDateTimeValue(date);
}

function normalizeTaskDateTime(task) {
  if (!task || !task.dueDate) return task;
  return { ...task, dueDate: cloudDateTimeToLocal(task.dueDate) };
}

// ==========================================================================
// ĐỊNH DẠNG NGÀY HIỂN THỊ DD/MM/YYYY CHO MODAL CÔNG VIỆC
// ==========================================================================
function formatISODateToDisplay(isoStr) {
  if (!isoStr) return '';
  const parts = String(isoStr).trim().split('-');
  if (parts.length === 3) {
    return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
  }
  return isoStr;
}

function parseDisplayDateToISO(displayStr) {
  if (!displayStr) return '';
  const cleanStr = String(displayStr).trim();
  if (!cleanStr) return '';

  // Trường hợp đã là YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleanStr)) {
    const [y, m, d] = cleanStr.split('-').map(Number);
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Trường hợp DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY hoặc D/M/YY
  const parts = cleanStr.split(/[\/\-\.\s]+/);
  if (parts.length === 3) {
    let d = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10);
    let y = parseInt(parts[2], 10);

    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
      if (y < 100) {
        y += (y < 70 ? 2000 : 1900);
      }
      if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }

  // Trường hợp gõ liền 8 chữ số: DDMMYYYY (vd 02112026)
  const digitsOnly = cleanStr.replace(/\D/g, '');
  if (digitsOnly.length === 8) {
    const d = parseInt(digitsOnly.slice(0, 2), 10);
    const m = parseInt(digitsOnly.slice(2, 4), 10);
    const y = parseInt(digitsOnly.slice(4, 8), 10);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return '';
}

function setupDateInputDisplay(displayInputId, nativeInputId, triggerWrapId) {
  const displayInput = document.getElementById(displayInputId);
  const nativeInput = document.getElementById(nativeInputId);
  const triggerWrap = triggerWrapId ? document.getElementById(triggerWrapId) : null;

  if (!displayInput || !nativeInput) return;

  nativeInput.addEventListener('change', () => {
    if (nativeInput.value) {
      displayInput.value = formatISODateToDisplay(nativeInput.value);
    }
  });

  const openNativePicker = () => {
    if (typeof nativeInput.showPicker === 'function') {
      try {
        nativeInput.showPicker();
        return;
      } catch (err) {}
    }
    nativeInput.focus();
  };

  if (triggerWrap) {
    triggerWrap.addEventListener('click', (e) => {
      if (e.target !== nativeInput) {
        openNativePicker();
      }
    });
  }

  displayInput.addEventListener('input', (e) => {
    if (e.inputType && e.inputType.startsWith('delete')) {
      const iso = parseDisplayDateToISO(displayInput.value);
      if (iso) nativeInput.value = iso;
      return;
    }

    let v = e.target.value.replace(/[^\d]/g, '');
    if (v.length > 8) v = v.slice(0, 8);

    let formatted = '';
    if (v.length > 0) {
      formatted = v.slice(0, 2);
      if (v.length > 2) {
        formatted += '/' + v.slice(2, 4);
        if (v.length > 4) {
          formatted += '/' + v.slice(4, 8);
        }
      }
    }
    e.target.value = formatted;

    if (formatted.length === 10) {
      const iso = parseDisplayDateToISO(formatted);
      if (iso) nativeInput.value = iso;
    }
  });

  displayInput.addEventListener('blur', () => {
    const raw = displayInput.value.trim();
    if (!raw) {
      nativeInput.value = '';
      return;
    }
    const iso = parseDisplayDateToISO(raw);
    if (iso) {
      nativeInput.value = iso;
      displayInput.value = formatISODateToDisplay(iso);
    } else if (nativeInput.value) {
      displayInput.value = formatISODateToDisplay(nativeInput.value);
    }
  });
}

function setModalDueValue(value) {
  const hiddenInput = document.getElementById('modal-task-due');
  const dateInput = document.getElementById('modal-task-due-date');
  const displayInput = document.getElementById('modal-task-due-date-display');
  const timeInput = document.getElementById('modal-task-due-time');
  const normalized = value ? cloudDateTimeToLocal(value) : '';

  if (hiddenInput) hiddenInput.value = normalized;
  const isoDate = normalized.slice(0, 10);
  if (dateInput) dateInput.value = isoDate;
  if (displayInput) displayInput.value = formatISODateToDisplay(isoDate);
  if (timeInput) timeInput.value = normalized.slice(11, 16);
}

function getModalDueValue() {
  const dateInput = document.getElementById('modal-task-due-date');
  const displayInput = document.getElementById('modal-task-due-date-display');
  const timeInput = document.getElementById('modal-task-due-time');

  let date = '';
  if (displayInput && displayInput.value.trim()) {
    const parsed = parseDisplayDateToISO(displayInput.value.trim());
    if (parsed) {
      date = parsed;
      if (dateInput) dateInput.value = parsed;
    }
  }
  if (!date && dateInput?.value) {
    date = dateInput.value;
  }

  const time = timeInput?.value.trim() || '';

  if (!date || !time) return '';
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    if (timeInput) {
      timeInput.setCustomValidity('Vui lòng nhập giờ theo định dạng 24h, ví dụ 22:30.');
      timeInput.reportValidity();
    }
    return '';
  }

  if (timeInput) timeInput.setCustomValidity('');
  const value = `${date}T${time}`;
  const hiddenInput = document.getElementById('modal-task-due');
  if (hiddenInput) hiddenInput.value = value;
  return value;
}

function setModalCompletedAtValue(value) {
  const dateInput = document.getElementById('modal-task-completed-date');
  const displayInput = document.getElementById('modal-task-completed-date-display');
  const timeInput = document.getElementById('modal-task-completed-time');
  if (!value) {
    if (dateInput) dateInput.value = '';
    if (displayInput) displayInput.value = '';
    if (timeInput) timeInput.value = '';
    return;
  }
  const shifted = toVietnamShiftedDate(value);
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  if (dateInput) dateInput.value = isoDate;
  if (displayInput) displayInput.value = formatISODateToDisplay(isoDate);
  if (timeInput) timeInput.value = `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

function getModalCompletedAtValue() {
  const dateInput = document.getElementById('modal-task-completed-date');
  const displayInput = document.getElementById('modal-task-completed-date-display');
  const timeInput = document.getElementById('modal-task-completed-time');

  let date = '';
  if (displayInput && displayInput.value.trim()) {
    const parsed = parseDisplayDateToISO(displayInput.value.trim());
    if (parsed) {
      date = parsed;
      if (dateInput) dateInput.value = parsed;
    }
  }
  if (!date && dateInput?.value) {
    date = dateInput.value;
  }

  const time = timeInput?.value.trim() || '12:00';
  if (!date) return '';
  return new Date(`${date}T${time}:00+07:00`).toISOString();
}

// Sắp xếp danh sách công việc:
// 1. Kế hoạch có thời gian luôn được ưu tiên lên TRÊN kế hoạch không có thời gian.
// 2. Với các kế hoạch có thời gian, ưu tiên kế hoạch sắp hết hạn lên TRÊN ĐẦU (tăng dần theo thời hạn).
// 3. Với các kế hoạch chưa đặt thời hạn, sắp xếp theo thời điểm tạo mới nhất.
function sortTasksArray(tasks) {
  if (!Array.isArray(tasks)) return [];
  return [...tasks].sort((a, b) => {
    // Việc đã hoàn thành luôn ở sau việc chưa hoàn thành
    if (a.completed && !b.completed) return 1;
    if (!a.completed && b.completed) return -1;

    const hasDueA = Boolean(a.dueDate);
    const hasDueB = Boolean(b.dueDate);

    // Kế hoạch có thời hạn được ưu tiên hơn kế hoạch không có thời hạn
    if (hasDueA && !hasDueB) return -1;
    if (!hasDueA && hasDueB) return 1;

    // Cả 2 đều không có thời hạn: sắp xếp theo thời điểm tạo mới nhất lên trước
    if (!hasDueA && !hasDueB) {
      const createdA = new Date(a.createdAt || 0).getTime();
      const createdB = new Date(b.createdAt || 0).getTime();
      return createdB - createdA;
    }

    // Cả 2 đều có thời hạn: Sắp xếp việc sắp hết hạn lên trên đầu (thời gian gần nhất)
    const timeA = new Date(a.dueDate).getTime();
    const timeB = new Date(b.dueDate).getTime();

    if (isNaN(timeA)) return 1;
    if (isNaN(timeB)) return -1;

    if (timeA !== timeB) return timeA - timeB;

    const createdA = new Date(a.createdAt || 0).getTime();
    const createdB = new Date(b.createdAt || 0).getTime();
    return createdB - createdA;
  });
}

// App State
const state = {
  tasks: [],
  activeTab: 'tasks', // 'tasks' (Timeline) | 'history'
  searchQuery: '',
  filterCategory: 'all', // 'all' | 'urgent' | 'normal' | 'nodate'
  soundEnabled: false, // Tắt hoàn toàn âm thanh
  notifiedTaskIds: new Set(),
  pendingDeleteAction: null,
  isCloudSynced: false,
  isSyncing: false
};

// Storage & Supabase Sync
async function loadData() {
  // 1. Tải nhanh từ LocalStorage trước để UI hiển thị ngay lập tức (không nạp dữ liệu mẫu)
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsedTasks = JSON.parse(raw);
      state.tasks = Array.isArray(parsedTasks) ? sortTasksArray(parsedTasks.map(normalizeTaskDateTime)) : [];
    } else {
      state.tasks = [];
    }
  } catch (e) {
    state.tasks = [];
  }

  // 2. Tải Theme
  // TodoList dùng chung giao diện sáng kem–olive của ứng dụng chính.
  document.documentElement.classList.remove('dark');

  await initTodoAuth();

  renderCurrentView();
  updateBadges();

  // 3. Đồng bộ với Supabase Cloud
  await syncWithSupabase(false);
}

// Hàm đồng bộ hai chiều với Supabase
async function syncWithSupabase(showManualToast = false) {
  if (!supabaseClient || !currentUserId || state.isSyncing) {
    if (!currentUserId) updateSyncBadge('local');
    return;
  }

  const localTasksBeforeSync = [...state.tasks];
  state.isSyncing = true;
  updateSyncBadge('syncing');

  try {
    const { data, error } = await supabaseClient
      .from('todos')
      .select('*')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase query notice:', error.message);
      updateSyncBadge('local');
      if (showManualToast) {
        showToast('Supabase: Bảng `todos` chưa tạo hoặc kết nối offline. Đang lưu trên máy.');
      }
      state.isSyncing = false;
      return;
    }

    if (data && Array.isArray(data)) {
      // Lần đầu chuyển sang Supabase chung: giữ các việc cục bộ và tải chúng lên.
      if (data.length === 0 && localTasksBeforeSync.length > 0) {
        await pushLocalTasksToCloud(localTasksBeforeSync);
        state.isCloudSynced = true;
        updateSyncBadge('cloud');
        return;
      }

      // Dữ liệu từ Supabase Cloud là nguồn chuẩn
      const cloudTasks = data.map(item => ({
        id: String(item.id),
        title: item.title || '',
        description: item.description || '',
        dueDate: cloudDateTimeToLocal(item.due_date || item.dueDate || ''),
        image: item.image || null,
        completed: Boolean(item.completed),
        completedAt: item.completed_at || item.completedAt || null,
        createdAt: item.created_at || item.createdAt || new Date().toISOString()
      }));

      state.tasks = sortTasksArray(cloudTasks);

      // Cập nhật LocalStorage với dữ liệu thật từ Cloud
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
      renderCurrentView();
      updateBadges();

      state.isCloudSynced = true;
      updateSyncBadge('cloud');
      if (showManualToast) showToast('Đồng bộ Cloud Supabase thành công! ☁️');
    }
  } catch (err) {
    console.warn('Supabase sync error:', err);
    updateSyncBadge('local');
  } finally {
    state.isSyncing = false;
  }
}

// Đẩy dữ liệu lên Cloud Supabase
async function pushLocalTasksToCloud(tasksToPush = state.tasks) {
  if (!supabaseClient || !currentUserId || tasksToPush.length === 0) return;
  try {
    const rows = tasksToPush.map(t => ({
      id: t.id,
      user_id: currentUserId,
      title: t.title,
      description: t.description || '',
      due_date: localDateTimeToIso(t.dueDate),
      image: t.image || null,
      completed: Boolean(t.completed),
      completed_at: t.completedAt || null,
      created_at: t.createdAt || new Date().toISOString()
    }));

    const { error } = await supabaseClient
      .from('todos')
      .upsert(rows, { onConflict: 'user_id,id' });
    if (error) {
      console.error('Lỗi khi lưu Supabase:', error);
      updateSyncBadge('local');
    } else {
      updateSyncBadge('cloud');
    }
  } catch (e) {
    console.warn('Cannot push to Supabase:', e);
    updateSyncBadge('local');
  }
}

// Lưu dữ liệu vào cả LocalStorage và Supabase Cloud
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  } catch (e) {
    console.error('LocalStorage error:', e);
  }
  updateBadges();

  // Async sync to Supabase Cloud
  if (supabaseClient && currentUserId) {
    pushLocalTasksToCloud();
  }
}

// Cập nhật huy hiệu trạng thái Supabase trên Header
function updateSyncBadge(status) {
  const badge = document.getElementById('supabase-sync-badge');
  const text = document.getElementById('supabase-sync-text');
  if (!badge || !text) return;

  if (status === 'syncing') {
    text.textContent = 'Đang đồng bộ...';
    badge.className = 'inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-400 border border-amber-300 dark:border-amber-800 cursor-pointer';
  } else if (status === 'cloud') {
    text.textContent = 'Cloud';
    badge.className = 'inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 cursor-pointer';
  } else {
    text.textContent = 'Offline';
    badge.className = 'inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700 cursor-pointer';
  }
}

function updateBadges() {
  const activeTasks = state.tasks.filter(t => !t.completed);
  const completedCount = state.tasks.filter(t => t.completed).length;

  let urgentCount = 0;
  let normalCount = 0;
  let nodateCount = 0;

  activeTasks.forEach(task => {
    if (!task.dueDate) {
      nodateCount++;
    } else {
      const urgency = getTaskUrgency(task.dueDate);
      if (urgency.isUrgent) urgentCount++;
      else normalCount++;
    }
  });

  const headerBadge = document.getElementById('header-badge-history');
  const historyCountText = document.getElementById('history-count-text');

  if (headerBadge) headerBadge.textContent = completedCount;
  if (historyCountText) historyCountText.textContent = completedCount;

  // Overview 3-card metrics
  const statActive = document.getElementById('stat-tasks-active');
  const statUrgent = document.getElementById('stat-tasks-urgent');
  const statDone = document.getElementById('stat-tasks-done');

  if (statActive) statActive.textContent = activeTasks.length;
  if (statUrgent) statUrgent.textContent = urgentCount;
  if (statDone) statDone.textContent = completedCount;

  // Category pill badges
  const pillAll = document.getElementById('pill-count-all');
  const pillUrgent = document.getElementById('pill-count-urgent');
  const pillNormal = document.getElementById('pill-count-normal');
  const pillNodate = document.getElementById('pill-count-nodate');

  if (pillAll) pillAll.textContent = activeTasks.length;
  if (pillUrgent) pillUrgent.textContent = urgentCount;
  if (pillNormal) pillNormal.textContent = normalCount;
  if (pillNodate) pillNodate.textContent = nodateCount;
}

function setFilterCategory(cat) {
  state.filterCategory = cat;
  
  // Highlight active pill
  document.querySelectorAll('.task-filter-pill').forEach(pill => {
    if (pill.getAttribute('data-filter') === cat) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });

  if (state.activeTab !== 'tasks') {
    switchTab('tasks');
  } else {
    renderTimelineTasks();
  }
}

function toggleSearchBar() {
  const searchBar = document.getElementById('mobile-search-bar');
  const searchInput = document.getElementById('todo-search-input');
  if (!searchBar) return;
  searchBar.classList.toggle('hidden');
  if (!searchBar.classList.contains('hidden') && searchInput) {
    searchInput.focus();
  }
}

// Mobile Toast Notification
function showToast(message, actionBtn = null) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-bubble flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-slate-900/95 text-white dark:bg-white/95 dark:text-slate-900 shadow-2xl backdrop-blur-xl text-xs font-bold max-w-sm w-full border border-white/10 dark:border-slate-800';

  let actionHtml = '';
  if (actionBtn) {
    actionHtml = `<button class="toast-action underline text-brand-300 dark:text-brand-600 font-extrabold ml-1">${actionBtn.text}</button>`;
  }

  toast.innerHTML = `
    <div class="flex items-center gap-2 flex-1 min-w-0">
      <i data-lucide="sparkles" class="w-4 h-4 text-brand-400 dark:text-brand-600 shrink-0"></i>
      <span class="truncate">${escapeHtml(message)}</span>
      ${actionHtml}
    </div>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  if (actionBtn) {
    const btn = toast.querySelector('.toast-action');
    if (btn) {
      btn.addEventListener('click', () => {
        actionBtn.onClick();
        removeToast(toast);
      });
    }
  }

  setTimeout(() => removeToast(toast), 3000);
}

function removeToast(toast) {
  if (!toast || toast.classList.contains('hiding')) return;
  toast.classList.add('hiding');
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 200);
}

// Compress Image using Canvas to optimize Cloud Supabase upload & LocalStorage (< 80KB)
function compressImage(file, callback, maxWidth = 800, maxHeight = 800, quality = 0.72) {
  const reader = new FileReader();
  reader.onerror = function() {
    showToast('Lỗi đọc tệp ảnh');
  };
  reader.onload = function(e) {
    const img = new Image();
    img.onerror = function() {
      showToast('Tệp không phải là ảnh hợp lệ');
    };
    img.onload = function() {
      let width = img.width;
      let height = img.height;

      // Giữ tỉ lệ khung hình (Aspect ratio) chuẩn và thu nhỏ nếu kích thước quá lớn
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      // Vẽ nền trắng để tránh ảnh PNG trong suốt bị đen khi chuyển sang JPEG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Thử nén bằng định dạng WebP hoặc JPEG chất lượng tối ưu
      let compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      
      // Nếu dung lượng vẫn còn lớn hơn 150KB, nén thêm một bước nữa để tải lên Supabase siêu nhanh
      if (compressedDataUrl.length > 200000) {
        compressedDataUrl = canvas.toDataURL('image/jpeg', 0.55);
      }

      const sizeKb = Math.round((compressedDataUrl.length * 3 / 4) / 1024);
      console.log(`[Image Compressor] Đã nén ảnh thành công: ${width}x${height}px ~ ${sizeKb} KB`);
      callback(compressedDataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Lightbox image viewer
function openImageViewer(src) {
  if (!src) return;
  const viewerModal = document.getElementById('image-viewer-modal');
  const viewerImg = document.getElementById('image-viewer-img');
  if (viewerModal && viewerImg) {
    viewerImg.src = src;
    showModal('image-viewer-modal');
    lucide.createIcons();
  }
}

function closeImageViewer() {
  hideModal('image-viewer-modal');
}

// Task CRUD
function addTask(title, dueDate = '', description = '', image = null) {
  const newTask = {
    id: 'm_' + Date.now(),
    title: title.trim(),
    description: description.trim(),
    dueDate: dueDate || '',
    image: image || null,
    completed: false,
    completedAt: null,
    createdAt: new Date().toISOString()
  };

  state.tasks = sortTasksArray([newTask, ...state.tasks]);
  saveData();
  renderCurrentView();
  showToast('Đã thêm công việc vào Timeline');
}

function toggleCompleteTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  if (!task.completed) {
    triggerConfetti();

    const item = document.querySelector(`[data-task-id="${id}"]`);
    if (item) {
      const checkbox = item.querySelector('.custom-checkbox');
      const titleSpan = item.querySelector('.task-title');
      if (checkbox) checkbox.classList.add('checked');
      if (titleSpan) titleSpan.classList.add('line-through', 'opacity-60');
      item.classList.add('task-completing');
    }

    setTimeout(() => {
      task.completed = true;
      task.completedAt = new Date().toISOString();
      saveData();
      renderCurrentView();
      showToast(`Đã hoàn thành: "${task.title}"`, {
        text: 'Xem Lịch sử',
        onClick: () => switchTab('history')
      });
    }, 380);
  } else {
    task.completed = false;
    task.completedAt = null;
    state.tasks = sortTasksArray(state.tasks);
    saveData();
    renderCurrentView();
    showToast(`Đã khôi phục việc`);
  }
}

function restoreTaskFromHistory(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.completed = false;
  task.completedAt = null;
  state.tasks = sortTasksArray(state.tasks);
  saveData();
  renderCurrentView();
  showToast(`Đã chuyển lại sang Timeline việc cần làm`, {
    text: 'Xem ngay',
    onClick: () => switchTab('tasks')
  });
}

function promptDeleteTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  state.pendingDeleteAction = async () => {
    state.tasks = state.tasks.filter(t => t.id !== id);
    saveData();
    renderCurrentView();
    showToast('Đã xóa công việc');

    // Cloud Delete
    if (supabaseClient && currentUserId) {
      try {
        await supabaseClient
          .from('todos')
          .delete()
          .eq('user_id', currentUserId)
          .eq('id', id);
      } catch (e) {
        console.warn('Supabase delete item error:', e);
      }
    }
  };

  openConfirmModal('Xóa việc này?', `Bạn có chắc muốn xóa "${task.title}"?`);
}

function promptClearAllHistory() {
  const completedCount = state.tasks.filter(t => t.completed).length;
  if (completedCount === 0) {
    showToast('Lịch sử đang trống');
    return;
  }

  state.pendingDeleteAction = async () => {
    const completedIds = state.tasks.filter(t => t.completed).map(t => t.id);
    state.tasks = state.tasks.filter(t => !t.completed);
    saveData();
    renderCurrentView();
    showToast(`Đã xóa sạch lịch sử`);

    // Cloud Delete All Completed
    if (supabaseClient && currentUserId && completedIds.length > 0) {
      try {
        await supabaseClient
          .from('todos')
          .delete()
          .eq('user_id', currentUserId)
          .in('id', completedIds);
      } catch (e) {
        console.warn('Supabase clear history error:', e);
      }
    }
  };

  openConfirmModal('Xóa tất cả lịch sử?', `Hành động này sẽ xóa ${completedCount} việc đã làm.`);
}

function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 40,
      spread: 55,
      origin: { y: 0.8 },
      colors: ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#a855f7']
    });
  }
}

// Full Colored Card helper (Red = Due soon/overdue, Green = Normal)
function getTaskUrgency(dueDateIso) {
  if (!dueDateIso) {
    return {
      isUrgent: false,
      cardClass: 'task-nodate-card',
      badgeClass: 'time-pill',
      badgeText: 'Chưa đặt hạn',
      badgeIcon: 'calendar-off',
      actionColor: 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
    };
  }

  const now = new Date();
  const due = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(dueDateIso)) ? `${dueDateIso}:00+07:00` : dueDateIso);
  const diffHours = (due - now) / (1000 * 60 * 60);

  const todayKey = getDateKey(now);
  const dueKey = getDateKey(due);
  
  // Tomorrow Date Key in UTC+7
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = getDateKey(tomorrow);

  const shiftedDue = toVietnamShiftedDate(due);
  const pad = (n) => String(n).padStart(2, '0');
  const timeStr = `${pad(shiftedDue.getUTCHours())}:${pad(shiftedDue.getUTCMinutes())}`;
  const dateStr = `${pad(shiftedDue.getUTCDate())}/${pad(shiftedDue.getUTCMonth() + 1)}/${shiftedDue.getUTCFullYear()}`;
  const shortDateStr = `${pad(shiftedDue.getUTCDate())}/${pad(shiftedDue.getUTCMonth() + 1)}`;

  // 1. Quá hạn -> Trễ hẹn (Giữ nguyên công việc, hiển thị rõ badge Trễ hẹn)
  if (due < now) {
    return {
      isUrgent: true,
      isOverdue: true,
      cardClass: 'task-urgent-card task-overdue-card',
      badgeClass: 'time-pill time-pill-overdue',
      badgeText: `Trễ hẹn (${shortDateStr} • ${timeStr})`,
      badgeIcon: 'alert-triangle',
      actionColor: 'text-rose-700 hover:text-rose-900 dark:text-rose-300'
    };
  } 
  
  // 2. Hôm nay (chỉ khi trùng ngày hôm nay)
  if (todayKey === dueKey) {
    return {
      isUrgent: true,
      isOverdue: false,
      cardClass: 'task-urgent-card',
      badgeClass: 'time-pill',
      badgeText: `Hôm nay lúc ${timeStr}`,
      badgeIcon: 'alarm-clock',
      actionColor: 'text-rose-700 hover:text-rose-900 dark:text-rose-300'
    };
  }

  // 3. Ngày mai
  if (tomorrowKey === dueKey) {
    return {
      isUrgent: false,
      cardClass: 'task-normal-card',
      badgeClass: 'time-pill',
      badgeText: `Ngày mai ${shortDateStr} • ${timeStr}`,
      badgeIcon: 'calendar',
      actionColor: 'text-emerald-700 hover:text-emerald-900 dark:text-emerald-300'
    };
  }

  // 4. Các ngày khác (Bình thường)
  return {
    isUrgent: false,
    cardClass: 'task-normal-card',
    badgeClass: 'time-pill',
    badgeText: `${shortDateStr} • ${timeStr}`,
    badgeIcon: 'calendar',
    actionColor: 'text-emerald-700 hover:text-emerald-900 dark:text-emerald-300'
  };
}

// Render Views
function renderCurrentView() {
  if (state.activeTab === 'tasks') {
    renderTimelineTasks();
  } else if (state.activeTab === 'history') {
    renderHistory();
  }
}

// 1. VIỆC CẦN LÀM: Hiển thị Dòng Thời Gian (Timeline) Hiện Đại & Tinh Tế
function renderTimelineTasks() {
  const container = document.getElementById('timeline-container');
  const emptyState = document.getElementById('tasks-empty-state');
  if (!container) return;
  
  let activeTasks = state.tasks.filter(t => !t.completed);

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    activeTasks = activeTasks.filter(t => t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q)));
  }

  if (state.filterCategory && state.filterCategory !== 'all') {
    activeTasks = activeTasks.filter(t => {
      if (!t.dueDate) return state.filterCategory === 'nodate';
      const urgency = getTaskUrgency(t.dueDate);
      if (state.filterCategory === 'urgent') return urgency.isUrgent;
      if (state.filterCategory === 'normal') return !urgency.isUrgent;
      return true;
    });
  }

  if (activeTasks.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  const groups = {
    overdue: { 
      label: 'Trễ hẹn', 
      icon: 'alert-triangle',
      badge: 'bg-rose-600 text-white shadow-md shadow-rose-600/30', 
      nodeColor: 'bg-rose-600 ring-4 ring-rose-600/25',
      tasks: [] 
    },
    today: { 
      label: 'Hôm nay & Gần tới hạn', 
      icon: 'flame',
      badge: 'bg-amber-500 text-white shadow-md shadow-amber-500/25', 
      nodeColor: 'bg-amber-500 ring-4 ring-amber-500/25',
      tasks: [] 
    },
    normal: { 
      label: 'Kế hoạch sắp tới', 
      icon: 'calendar-check-2',
      badge: 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25', 
      nodeColor: 'bg-emerald-500 ring-4 ring-emerald-500/25',
      tasks: [] 
    },
    noDate: { 
      label: 'Chưa đặt ngày hạn', 
      icon: 'calendar-off',
      badge: 'bg-amber-500 text-white shadow-sm', 
      nodeColor: 'bg-amber-400 ring-4 ring-amber-400/20',
      tasks: [] 
    }
  };

  activeTasks.forEach(task => {
    if (!task.dueDate) {
      groups.noDate.tasks.push(task);
      return;
    }
    const urgency = getTaskUrgency(task.dueDate);
    if (urgency.isOverdue) {
      groups.overdue.tasks.push(task);
    } else if (urgency.isUrgent) {
      groups.today.tasks.push(task);
    } else {
      groups.normal.tasks.push(task);
    }
  });

  // Ưu tiên sắp xếp theo thời hạn: việc nào sắp hết hạn (gần nhất) sẽ xếp lên trên đầu
  const sortByDueAsc = (a, b) => {
    const timeA = new Date(a.dueDate).getTime();
    const timeB = new Date(b.dueDate).getTime();
    if (isNaN(timeA)) return 1;
    if (isNaN(timeB)) return -1;
    if (timeA !== timeB) return timeA - timeB;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  };

  groups.overdue.tasks.sort(sortByDueAsc);
  groups.today.tasks.sort(sortByDueAsc);
  groups.normal.tasks.sort(sortByDueAsc);
  groups.noDate.tasks.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  let html = '';
  const order = ['overdue', 'today', 'normal', 'noDate'];

  order.forEach(key => {
    const g = groups[key];
    if (g.tasks.length === 0) return;

    html += `
      <div class="timeline-group">
        <!-- Modern Section Header Banner -->
        <div class="timeline-section-header ${key === 'overdue' ? 'timeline-header-overdue' : key === 'today' ? 'timeline-header-urgent' : key === 'normal' ? 'timeline-header-normal' : 'timeline-header-nodate'}">
          <div class="timeline-header-title-wrap">
            <div class="timeline-header-icon-box">
              <i data-lucide="${g.icon}"></i>
            </div>
            <span class="timeline-header-title">${g.label}</span>
          </div>
          <span class="timeline-header-badge">
            ${g.tasks.length}
          </span>
        </div>

        <!-- Group Task Items -->
        <div class="space-y-3 mb-5">
          ${g.tasks.map(task => {
            const urgency = getTaskUrgency(task.dueDate);
            return `
              <div class="task-item ${urgency.cardClass} flex flex-col gap-2.5 p-3.5 sm:p-4" data-task-id="${task.id}">
                <div class="flex items-start gap-3 w-full">
                  
                  <!-- Checkbox Hoàn thành -->
                  <button onclick="event.stopPropagation(); toggleCompleteTask('${task.id}')" class="custom-checkbox mt-1 shrink-0" title="Đánh dấu hoàn thành">
                    <i data-lucide="check" class="check-icon"></i>
                  </button>

                  <!-- Left Side: Image Thumbnail (Nếu có hình ảnh) -->
                  ${task.image ? `
                    <div class="relative shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden shadow-xs border border-black/10 dark:border-white/10 group cursor-pointer" onclick="event.stopPropagation(); openImageViewer('${task.image}')" title="Chạm để xem ảnh phóng to">
                      <img src="${task.image}" alt="Hình ảnh" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200">
                      <div class="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <span class="p-1 rounded-lg bg-black/60 text-white">
                          <i data-lucide="maximize-2" class="w-3.5 h-3.5"></i>
                        </span>
                      </div>
                      <div class="absolute bottom-1 right-1 bg-black/60 backdrop-blur-xs text-[9px] font-bold text-white px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                        <i data-lucide="image" class="w-2.5 h-2.5"></i>
                        <span>Ảnh</span>
                      </div>
                    </div>
                  ` : `
                    <div class="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white/40 dark:bg-white/5 border border-black/5 dark:border-white/10 flex items-center justify-center text-slate-400 dark:text-slate-500 cursor-pointer" onclick="openEditTaskModal('${task.id}')" title="Thêm hình ảnh cho việc này">
                      <i data-lucide="image-plus" class="w-5 h-5 stroke-[1.8]"></i>
                    </div>
                  `}

                  <!-- Right Side: Tiêu đề công việc, Thời gian, Ghi chú -->
                  <div class="flex-1 min-w-0 flex flex-col justify-between self-stretch cursor-pointer" onclick="openEditTaskModal('${task.id}')">
                    <div>
                      <!-- Tiêu đề -->
                      <span class="task-title text-[15px] font-extrabold block leading-tight text-slate-900 dark:text-white">
                        ${escapeHtml(task.title)}
                      </span>

                      <!-- Thời gian hạn chót -->
                      <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span class="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.8 rounded-lg ${urgency.badgeClass}">
                          <i data-lucide="${urgency.badgeIcon}" class="w-3 h-3"></i>
                          <span>${urgency.badgeText}</span>
                        </span>
                      </div>

                      <!-- Ghi chú thêm (giữ nguyên chính xác từng dòng, dấu xuống hàng và khoảng trắng) -->
                      ${task.description ? `
                        <div class="task-desc-wrap mt-2 text-xs font-medium leading-relaxed flex items-start gap-1.5 opacity-90">
                          <i data-lucide="file-text" class="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-70"></i>
                          <div class="task-desc-text flex-1 whitespace-pre-wrap break-words select-text">${formatDescriptionText(task.description)}</div>
                        </div>
                      ` : ''}
                    </div>

                    <!-- Action buttons góc dưới bên phải -->
                    <div class="flex items-center justify-end gap-1.5 mt-2 pt-1 border-t border-black/5 dark:border-white/5">
                      <button onclick="event.stopPropagation(); openEditTaskModal('${task.id}')" class="px-2.5 py-1 rounded-xl text-[11px] font-bold ${urgency.actionColor} bg-white/50 dark:bg-black/30 hover:bg-white/90 active:scale-95 transition-all flex items-center gap-1" title="Sửa chi tiết">
                        <i data-lucide="edit-3" class="w-3 h-3"></i>
                        <span>Sửa</span>
                      </button>
                      <button onclick="event.stopPropagation(); promptDeleteTask('${task.id}')" class="p-1.5 rounded-xl opacity-60 hover:opacity-100 hover:text-rose-600 bg-white/50 dark:bg-black/30 hover:bg-white/90 active:scale-95 transition-all" title="Xóa">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  lucide.createIcons();
}

// 2. History View
function renderHistory() {
  const container = document.getElementById('history-list');
  const emptyState = document.getElementById('history-empty-state');
  if (!container) return;
  
  let completed = state.tasks.filter(t => t.completed);

  // Lọc theo từ khóa tìm kiếm trong danh sách hoàn thành
  if (state.searchQuery && state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    completed = completed.filter(t => 
      (t.title && t.title.toLowerCase().includes(q)) || 
      (t.description && t.description.toLowerCase().includes(q))
    );
  }

  completed.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

  if (completed.length === 0) {
    container.innerHTML = '';
    if (emptyState) {
      emptyState.classList.remove('hidden');
      const emptyTitle = emptyState.querySelector('p.text-xs');
      const emptySub = emptyState.querySelector('p.text-\\[11px\\]');
      if (state.searchQuery && state.searchQuery.trim()) {
        if (emptyTitle) emptyTitle.textContent = 'Không tìm thấy việc hoàn thành phù hợp';
        if (emptySub) emptySub.textContent = `Không có kết quả nào khớp với "${escapeHtml(state.searchQuery)}"`;
      } else {
        if (emptyTitle) emptyTitle.textContent = 'Lịch sử hiện đang trống';
        if (emptySub) emptySub.textContent = 'Các công việc sau khi hoàn thành sẽ tự động lưu lại tại đây.';
      }
    }
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');
  container.innerHTML = completed.map(task => {
    const doneTime = task.completedAt ? formatFullDateTime(task.completedAt) : 'Đã xong';

    return `
      <article class="history-card" data-task-id="${task.id}">
        <div class="history-card-main">
          <div class="history-check" aria-hidden="true">
            <i data-lucide="check"></i>
          </div>

          ${task.image ? `
            <button class="history-thumbnail" onclick="openImageViewer('${task.image}')" title="Xem ảnh đính kèm" aria-label="Xem ảnh đính kèm">
              <img src="${task.image}" alt="Ảnh đính kèm của ${escapeHtml(task.title)}">
              <span class="history-thumbnail-overlay"><i data-lucide="expand"></i></span>
            </button>
          ` : `
            <div class="history-thumbnail history-thumbnail-empty" aria-hidden="true">
              <i data-lucide="check-circle-2"></i>
            </div>
          `}

          <div class="history-card-content cursor-pointer" onclick="openEditTaskModal('${task.id}')" title="Chạm để chỉnh sửa toàn bộ thông tin">
            <div class="history-card-title-row">
              <h3 class="history-card-title">${escapeHtml(task.title)}</h3>
              <span class="history-status">Đã xong</span>
            </div>
            ${task.description ? `<div class="history-card-description whitespace-pre-wrap break-words select-text">${formatDescriptionText(task.description)}</div>` : ''}
            <button type="button" onclick="event.stopPropagation(); openEditTaskModal('${task.id}')" class="history-time-btn" title="Chỉnh sửa toàn bộ thông tin">
              <i data-lucide="clock-3"></i>
              <span>${doneTime}</span>
              <i data-lucide="pencil"></i>
            </button>
          </div>
        </div>

        <div class="history-card-actions">
          <button onclick="restoreTaskFromHistory('${task.id}')" class="history-restore-btn">
            <i data-lucide="rotate-ccw"></i>
            <span>Khôi phục</span>
          </button>
          <button onclick="promptDeleteTask('${task.id}')" class="history-delete-btn" title="Xóa công việc này" aria-label="Xóa công việc này">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </article>
    `;
  }).join('');

  lucide.createIcons();
}

// Mobile Bottom Sheet Modal Logic
function openAddTaskModal() {
  document.getElementById('modal-task-id').value = '';
  document.getElementById('modal-task-title').value = '';
  document.getElementById('modal-task-desc').value = '';
  
  // Reset Image inputs & previews
  const imgDataInput = document.getElementById('modal-task-image-data');
  const imgFileInput = document.getElementById('modal-task-image-input');
  const imgPreviewContainer = document.getElementById('modal-image-preview-container');
  const imgPreview = document.getElementById('modal-image-preview');
  const imgUploadBtn = document.getElementById('modal-upload-image-btn');

  if (imgDataInput) imgDataInput.value = '';
  if (imgFileInput) imgFileInput.value = '';
  if (imgPreview) imgPreview.src = '';
  if (imgPreviewContainer) imgPreviewContainer.classList.add('hidden');
  if (imgUploadBtn) imgUploadBtn.classList.remove('hidden');

  const noDueToggle = document.getElementById('modal-no-due-toggle');
  const dueContainer = document.getElementById('modal-due-container');
  const dueInput = document.getElementById('modal-task-due');

  if (noDueToggle) noDueToggle.checked = false;
  if (dueContainer) dueContainer.classList.remove('opacity-40', 'pointer-events-none');
  setModalDueValue(getRelativeDateTime(0, 18, 0));

  // Reset Completed At container
  const completedAtContainer = document.getElementById('modal-completed-at-container');
  if (completedAtContainer) completedAtContainer.classList.add('hidden');
  setModalCompletedAtValue('');
  
  const titleEl = document.getElementById('modal-title');
  const subEl = document.getElementById('modal-subtitle');
  if (titleEl) titleEl.textContent = 'Thêm công việc mới';
  if (subEl) subEl.textContent = 'Lên lịch và ghi chú việc cần làm';

  showModal('task-modal');
  lucide.createIcons();
  focusTaskTitleOnDesktop();
}

function focusTaskTitleOnDesktop() {
  // Auto-focusing opens the iOS keyboard while the bottom sheet is animating,
  // which can shrink the standalone PWA viewport and clip the form.
  if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
    setTimeout(() => document.getElementById('modal-task-title')?.focus(), 150);
  }
}

function openEditTaskModal(id) {
  // Nếu người dùng đang bôi đen chọn văn bản (ví dụ copy số điện thoại, địa chỉ ghi chú) thì không mở modal
  if (window.getSelection && window.getSelection().toString().trim().length > 0) {
    return;
  }

  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  document.getElementById('modal-task-id').value = task.id;
  document.getElementById('modal-task-title').value = task.title;
  document.getElementById('modal-task-desc').value = task.description || '';
  
  // Populate Image
  const imgDataInput = document.getElementById('modal-task-image-data');
  const imgFileInput = document.getElementById('modal-task-image-input');
  const imgPreviewContainer = document.getElementById('modal-image-preview-container');
  const imgPreview = document.getElementById('modal-image-preview');
  const imgUploadBtn = document.getElementById('modal-upload-image-btn');

  if (imgFileInput) imgFileInput.value = '';
  if (task.image) {
    if (imgDataInput) imgDataInput.value = task.image;
    if (imgPreview) imgPreview.src = task.image;
    if (imgPreviewContainer) imgPreviewContainer.classList.remove('hidden');
    if (imgUploadBtn) imgUploadBtn.classList.add('hidden');
  } else {
    if (imgDataInput) imgDataInput.value = '';
    if (imgPreview) imgPreview.src = '';
    if (imgPreviewContainer) imgPreviewContainer.classList.add('hidden');
    if (imgUploadBtn) imgUploadBtn.classList.remove('hidden');
  }

  const noDueToggle = document.getElementById('modal-no-due-toggle');
  const dueContainer = document.getElementById('modal-due-container');
  const dueInput = document.getElementById('modal-task-due');

  if (!task.dueDate) {
    if (noDueToggle) noDueToggle.checked = true;
    if (dueContainer) dueContainer.classList.add('opacity-40', 'pointer-events-none');
    setModalDueValue('');
  } else {
    if (noDueToggle) noDueToggle.checked = false;
    if (dueContainer) dueContainer.classList.remove('opacity-40', 'pointer-events-none');
    setModalDueValue(task.dueDate);
  }

  // Populate Completed At if task is completed
  const completedAtContainer = document.getElementById('modal-completed-at-container');
  if (completedAtContainer) {
    if (task.completed) {
      completedAtContainer.classList.remove('hidden');
      setModalCompletedAtValue(task.completedAt || new Date().toISOString());
    } else {
      completedAtContainer.classList.add('hidden');
      setModalCompletedAtValue('');
    }
  }

  const titleEl = document.getElementById('modal-title');
  const subEl = document.getElementById('modal-subtitle');
  if (titleEl) {
    titleEl.textContent = task.completed ? 'Chỉnh sửa việc đã xong' : 'Chỉnh sửa công việc';
  }
  if (subEl) {
    subEl.textContent = task.completed 
      ? 'Chỉnh sửa toàn bộ thông tin, nội dung & thời gian hoàn thành' 
      : 'Cập nhật nội dung và thời hạn hoàn thành';
  }

  showModal('task-modal');
  lucide.createIcons();
  focusTaskTitleOnDesktop();
}

function closeTaskModal() {
  hideModal('task-modal');
}

// Edit History Time Modal Logic - chuyển tiếp sang modal chỉnh sửa toàn diện
function openEditHistoryModal(id) {
  openEditTaskModal(id);
}

function closeHistoryModal() {
  hideModal('history-modal');
}

// Date Presets for Edit Modal
function setQuickModalDate(dayOffset, hour, minute) {
  const dueInput = document.getElementById('modal-task-due');
  const noDueToggle = document.getElementById('modal-no-due-toggle');
  const dueContainer = document.getElementById('modal-due-container');

  if (noDueToggle) noDueToggle.checked = false;
  if (dueContainer) dueContainer.classList.remove('opacity-40', 'pointer-events-none');
  setModalDueValue(getRelativeDateTime(dayOffset, hour, minute));
}

function clearModalDate() {
  setModalDueValue('');
}

function triggerReminderPopup(task, isOverdue = false) {
  document.getElementById('reminder-task-title').textContent = task.title;
  document.getElementById('reminder-badge').textContent = isOverdue ? '⚠️ Trễ hẹn' : '⏰ Sắp đến hạn';
  document.getElementById('reminder-due-text').textContent = task.dueDate ? formatFullDateTime(task.dueDate) : '';

  document.getElementById('reminder-done-btn').onclick = () => {
    hideModal('reminder-modal');
    toggleCompleteTask(task.id);
  };

  showModal('reminder-modal');
}

function openConfirmModal(title, message) {
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-message').textContent = message;
  showModal('confirm-modal');
}

function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  // A previous close animation may still be waiting to add `hidden`.
  // Cancel it before reopening so it cannot hide the newly opened modal.
  if (modal._hideTimeout) {
    clearTimeout(modal._hideTimeout);
    modal._hideTimeout = null;
  }
  const featureHost = document.getElementById('todo-feature-host');
  if (featureHost && featureHost.contains(modal)) {
    document.getElementById('todo-modal')?.classList.add('todo-child-modal-open');
  }
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.add('modal-active');
  }, 10);
}

function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('modal-active');
  if (modal._hideTimeout) clearTimeout(modal._hideTimeout);
  modal._hideTimeout = setTimeout(() => {
    modal.classList.add('hidden');
    modal._hideTimeout = null;
    const featureHost = document.getElementById('todo-feature-host');
    const hasOpenChildModal = featureHost && Array.from(featureHost.children)
      .some(child => child.classList.contains('modal-active'));
    if (!hasOpenChildModal) {
      document.getElementById('todo-modal')?.classList.remove('todo-child-modal-open');
    }
  }, 200);
}

// Switch Tabs (Chuyển đổi giữa Timeline Việc và Lịch Sử Đã Xong)
function switchTab(tabName) {
  state.activeTab = tabName;
  const viewTasks = document.getElementById('view-tasks');
  const viewHistory = document.getElementById('view-history');
  const headerHistoryBtn = document.getElementById('header-history-btn');
  const bottomNavTasks = document.getElementById('bottom-nav-tasks');

  if (tabName === 'history') {
    if (viewTasks) viewTasks.classList.add('hidden');
    if (viewHistory) viewHistory.classList.remove('hidden');
    if (headerHistoryBtn) {
      headerHistoryBtn.classList.add('active');
    }
    if (bottomNavTasks) {
      bottomNavTasks.classList.remove('active');
    }
  } else {
    if (viewTasks) viewTasks.classList.remove('hidden');
    if (viewHistory) viewHistory.classList.add('hidden');
    if (headerHistoryBtn) {
      headerHistoryBtn.classList.remove('active');
    }
    if (bottomNavTasks) {
      bottomNavTasks.classList.add('active');
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderCurrentView();
  lucide.createIcons();
}

// Date Helpers (UTC+7 Hà Nội)
function getDateKey(d) {
  const shifted = toVietnamShiftedDate(d);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function formatFullDateTime(isoStr) {
  const d = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(isoStr)) ? `${isoStr}:00+07:00` : isoStr);
  const shifted = toVietnamShiftedDate(d);
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}, ${String(shifted.getUTCDate()).padStart(2, '0')}/${String(shifted.getUTCMonth() + 1).padStart(2, '0')}/${shifted.getUTCFullYear()}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[m]));
}

function formatDescriptionText(str) {
  if (!str) return '';
  let text = String(str);
  // Nếu dữ liệu bị encode ký tự xuống dòng dạng chuỗi literal ("\n"), đưa về ký tự newline chuẩn
  if (text.includes('\\n') && !text.includes('\n')) {
    text = text.replace(/\\r\\n|\\n|\\r/g, '\n');
  }
  return escapeHtml(text);
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  lucide.createIcons();
}

// Background Reminder & Real-time Live Clock
function startReminderService() {
  function updateClock() {
    const shifted = toVietnamShiftedDate();
    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(shifted.getUTCDate());
    const month = pad(shifted.getUTCMonth() + 1);
    const year = shifted.getUTCFullYear();
    const weekdaysShort = ['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7'];
    const weekday = weekdaysShort[shifted.getUTCDay()];
    const timeStr = `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;

    const el = document.getElementById('live-clock-display');
    if (el) {
      el.textContent = `📅 ${weekday}, ${day}/${month}/${year} • ⏰ ${timeStr}`;
    }

    const dateEl = document.getElementById('live-date-text');
    if (dateEl) {
      const weekdaysFull = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
      dateEl.textContent = `${weekdaysFull[shifted.getUTCDay()]}, ${day}/${month}/${year}`;
    }
  }
  updateClock();
  setInterval(updateClock, 1000); // Live update every second!

  function checkReminders() {
    const now = new Date();
    state.tasks.forEach(t => {
      if (!t.completed && t.dueDate && !state.notifiedTaskIds.has(t.id)) {
        const due = new Date(t.dueDate);
        const diffMin = (due - now) / (1000 * 60);
        if (diffMin <= 15 && diffMin >= -120) {
          state.notifiedTaskIds.add(t.id);
          triggerReminderPopup(t, diffMin < 0);
        }
      }
    });
  }
  setInterval(checkReminders, 25000);
}

// Initial Events
document.addEventListener('DOMContentLoaded', () => {
  loadData();

  // Thiết lập trường chọn ngày dd/mm/yyyy
  setupDateInputDisplay('modal-task-due-date-display', 'modal-task-due-date', 'modal-task-due-picker-trigger');
  setupDateInputDisplay('modal-task-completed-date-display', 'modal-task-completed-date', 'modal-task-completed-picker-trigger');

  // Header Add Button (+)
  const headerAddBtn = document.getElementById('header-add-btn');
  if (headerAddBtn) headerAddBtn.addEventListener('click', openAddTaskModal);

  // Header History Button (Lịch sử đã xong)
  const headerHistoryBtn = document.getElementById('header-history-btn');
  if (headerHistoryBtn) {
    headerHistoryBtn.addEventListener('click', () => {
      switchTab('history');
    });
  }

  // Tasks Tab Button
  const bottomNavTasks = document.getElementById('bottom-nav-tasks');
  if (bottomNavTasks) {
    bottomNavTasks.addEventListener('click', () => {
      switchTab('tasks');
    });
  }

  // Quick Add (Nếu có)
  const quickAddForm = document.getElementById('quick-add-form');
  if (quickAddForm) {
    quickAddForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('quick-title-input');
      const due = document.getElementById('quick-due-input');
      if (!title || !title.value.trim()) return;

      addTask(title.value, due ? due.value : '');
      title.value = '';
      title.blur();
    });
  }

  // Edit Task & Due Time form
  document.getElementById('task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('modal-task-id').value;
    const title = document.getElementById('modal-task-title').value;
    const desc = document.getElementById('modal-task-desc').value;
    const image = document.getElementById('modal-task-image-data').value || null;
    
    const noDueToggle = document.getElementById('modal-no-due-toggle');
    const isNoDue = noDueToggle && noDueToggle.checked;
    const due = isNoDue ? '' : getModalDueValue();

    if (!title.trim()) return;
    if (!isNoDue && !due) return;

    if (id) {
      const task = state.tasks.find(t => t.id === id);
      if (task) {
        task.title = title.trim();
        task.description = desc.trim();
        task.dueDate = due;
        task.image = image;
        if (task.completed) {
          const completedAtVal = getModalCompletedAtValue();
          if (completedAtVal) task.completedAt = completedAtVal;
        }
        state.tasks = sortTasksArray(state.tasks);
        saveData();
        renderCurrentView();
        showToast('Đã cập nhật lại công việc');
      }
    } else {
      addTask(title, due, desc, image);
    }
    closeTaskModal();
  });

  // Image Upload Button & Input Handler
  const uploadImgBtn = document.getElementById('modal-upload-image-btn');
  const imgFileInput = document.getElementById('modal-task-image-input');
  const imgDataInput = document.getElementById('modal-task-image-data');
  const imgPreviewContainer = document.getElementById('modal-image-preview-container');
  const imgPreview = document.getElementById('modal-image-preview');
  const removeImgBtn = document.getElementById('modal-remove-image-btn');

  if (uploadImgBtn && imgFileInput) {
    uploadImgBtn.addEventListener('click', () => {
      imgFileInput.value = ''; // Cho phép chọn lại cùng 1 file nếu muốn
      imgFileInput.click();
    });

    imgFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast('Vui lòng chọn tệp hình ảnh!');
        return;
      }

      uploadImgBtn.innerHTML = `
        <span class="w-3.5 h-3.5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin"></span>
        <span>Đang xử lý & nén ảnh...</span>
      `;
      uploadImgBtn.disabled = true;

      // Nén ảnh tự động trước khi lưu
      compressImage(file, (base64) => {
        imgDataInput.value = base64;
        imgPreview.src = base64;
        imgPreviewContainer.classList.remove('hidden');
        uploadImgBtn.classList.add('hidden');
        uploadImgBtn.disabled = false;
        uploadImgBtn.innerHTML = `
          <i data-lucide="image-plus" class="w-4 h-4 text-brand-500"></i>
          <span>Chọn hoặc chụp hình ảnh</span>
        `;
        showToast('Đã đính kèm hình ảnh 📸');
        lucide.createIcons();
      });
    });
  }

  if (removeImgBtn) {
    removeImgBtn.addEventListener('click', () => {
      if (imgDataInput) imgDataInput.value = '';
      if (imgFileInput) imgFileInput.value = '';
      if (imgPreview) imgPreview.src = '';
      if (imgPreviewContainer) imgPreviewContainer.classList.add('hidden');
      if (uploadImgBtn) uploadImgBtn.classList.remove('hidden');
      showToast('Đã gỡ hình ảnh');
    });
  }

  // Lightbox Close Handler
  const closeImgViewerBtn = document.getElementById('close-image-viewer-btn');
  if (closeImgViewerBtn) {
    closeImgViewerBtn.addEventListener('click', closeImageViewer);
  }

  // Toggle Không thời hạn
  const noDueToggle = document.getElementById('modal-no-due-toggle');
  if (noDueToggle) {
    noDueToggle.addEventListener('change', (e) => {
      const dueContainer = document.getElementById('modal-due-container');
      const dueInput = document.getElementById('modal-task-due');
      if (e.target.checked) {
        if (dueContainer) dueContainer.classList.add('opacity-40', 'pointer-events-none');
        setModalDueValue('');
      } else {
        if (dueContainer) dueContainer.classList.remove('opacity-40', 'pointer-events-none');
        if (dueInput && !dueInput.value) setModalDueValue(getRelativeDateTime(0, 18, 0));
      }
    });
  }

  // Edit History Completed Time form
  document.getElementById('history-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('history-task-id').value;
    const completedAtValue = document.getElementById('history-task-completed-at').value;

    const task = state.tasks.find(t => t.id === id);
    if (task) {
      task.completedAt = new Date(completedAtValue).toISOString();
      saveData();
      renderCurrentView();
      showToast('Đã cập nhật lại mốc giờ hoàn thành');
    }
    closeHistoryModal();
  });

  document.getElementById('close-modal-btn').addEventListener('click', closeTaskModal);
  document.getElementById('cancel-modal-btn').addEventListener('click', closeTaskModal);
  
  document.getElementById('close-history-modal-btn').addEventListener('click', closeHistoryModal);
  document.getElementById('cancel-history-modal-btn').addEventListener('click', closeHistoryModal);

  document.getElementById('reminder-dismiss-btn').addEventListener('click', () => hideModal('reminder-modal'));

  // Confirm delete
  document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
    state.pendingDeleteAction = null;
    hideModal('confirm-modal');
  });
  document.getElementById('confirm-accept-btn').addEventListener('click', () => {
    if (state.pendingDeleteAction) {
      state.pendingDeleteAction();
      state.pendingDeleteAction = null;
    }
    hideModal('confirm-modal');
  });

  const clearHistoryBtn = document.getElementById('clear-history-btn');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', promptClearAllHistory);
  }

  // Search Toggle for mobile
  const searchToggleBtn = document.getElementById('search-toggle-btn');
  const searchBar = document.getElementById('mobile-search-bar');
  const searchInput = document.getElementById('todo-search-input');
  const clearSearchBtn = document.getElementById('todo-clear-search-btn');

  searchToggleBtn.addEventListener('click', () => {
    searchBar.classList.toggle('hidden');
    if (!searchBar.classList.contains('hidden')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      searchInput.focus();
    } else {
      searchInput.value = '';
      state.searchQuery = '';
      clearSearchBtn.classList.add('hidden');
      renderCurrentView();
    }
  });

  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    clearSearchBtn.classList.toggle('hidden', !state.searchQuery);
    renderCurrentView();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    clearSearchBtn.classList.add('hidden');
    renderCurrentView();
  });

  // Theme (màn hình tích hợp không còn nút đổi theme riêng)
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  // Close modals on overlay backdrop click
  ['task-modal', 'history-modal', 'reminder-modal', 'confirm-modal', 'image-viewer-modal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', (e) => {
        if (e.target === el) hideModal(id);
      });
    }
  });

  renderCurrentView();
  startReminderService();
  lucide.createIcons();
});

// Expose globals for onclicks
window.toggleCompleteTask = toggleCompleteTask;
window.openAddTaskModal = openAddTaskModal;
window.openEditTaskModal = openEditTaskModal;
window.openEditHistoryModal = openEditHistoryModal;
window.setQuickModalDate = setQuickModalDate;
window.clearModalDate = clearModalDate;
window.promptDeleteTask = promptDeleteTask;
window.restoreTaskFromHistory = restoreTaskFromHistory;
window.switchTab = switchTab;
window.openImageViewer = openImageViewer;
window.closeImageViewer = closeImageViewer;
window.syncWithSupabase = syncWithSupabase;
window.setFilterCategory = setFilterCategory;
window.toggleSearchBar = toggleSearchBar;
