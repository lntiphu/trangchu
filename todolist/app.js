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
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
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

function getRelativeDateTime(dayOffset, hours, minutes) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
      state.tasks = JSON.parse(raw);
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
        dueDate: item.due_date || item.dueDate || '',
        image: item.image || null,
        completed: Boolean(item.completed),
        completedAt: item.completed_at || item.completedAt || null,
        createdAt: item.created_at || item.createdAt || new Date().toISOString()
      }));

      state.tasks = cloudTasks;

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
      due_date: t.dueDate || null,
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
  const searchInput = document.getElementById('search-input');
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

  state.tasks.unshift(newTask);
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
  const due = new Date(dueDateIso);
  const diffHours = (due - now) / (1000 * 60 * 60);

  const todayKey = getDateKey(now);
  const dueKey = getDateKey(due);
  
  // Tomorrow Date Key
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = getDateKey(tomorrow);

  const pad = (n) => String(n).padStart(2, '0');
  const timeStr = `${pad(due.getHours())}:${pad(due.getMinutes())}`;
  const dateStr = `${pad(due.getDate())}/${pad(due.getMonth() + 1)}/${due.getFullYear()}`;
  const shortDateStr = `${pad(due.getDate())}/${pad(due.getMonth() + 1)}`;

  // 1. Quá hạn
  if (due < now) {
    return {
      isUrgent: true,
      cardClass: 'task-urgent-card',
      badgeClass: 'time-pill',
      badgeText: `Quá hạn (${shortDateStr} • ${timeStr})`,
      badgeIcon: 'alert-triangle',
      actionColor: 'text-rose-700 hover:text-rose-900 dark:text-rose-300'
    };
  } 
  
  // 2. Hôm nay (chỉ khi trùng ngày hôm nay)
  if (todayKey === dueKey) {
    return {
      isUrgent: true,
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
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  const groups = {
    urgent: { 
      label: 'Gần tới hạn & Quá hạn', 
      icon: 'flame',
      badge: 'bg-rose-500 text-white shadow-md shadow-rose-500/25', 
      nodeColor: 'bg-rose-500 ring-4 ring-rose-500/25',
      tasks: [] 
    },
    normal: { 
      label: 'Kế hoạch sắp tới (Bình thường)', 
      icon: 'calendar-check-2',
      badge: 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25', 
      nodeColor: 'bg-emerald-500 ring-4 ring-emerald-500/25',
      tasks: [] 
    },
    noDate: { 
      label: 'Chưa đặt ngày hạn', 
      icon: 'inbox',
      badge: 'bg-slate-500 text-white shadow-sm', 
      nodeColor: 'bg-slate-400 ring-4 ring-slate-400/20',
      tasks: [] 
    }
  };

  activeTasks.forEach(task => {
    if (!task.dueDate) {
      groups.noDate.tasks.push(task);
      return;
    }
    const urgency = getTaskUrgency(task.dueDate);
    if (urgency.isUrgent) {
      groups.urgent.tasks.push(task);
    } else {
      groups.normal.tasks.push(task);
    }
  });

  let html = '';
  const order = ['urgent', 'normal', 'noDate'];

  order.forEach(key => {
    const g = groups[key];
    if (g.tasks.length === 0) return;

    html += `
      <div class="timeline-group">
        <!-- Modern Section Header Banner -->
        <div class="timeline-section-header ${key === 'urgent' ? 'timeline-header-urgent' : key === 'normal' ? 'timeline-header-normal' : 'timeline-header-nodate'}">
          <div class="flex items-center gap-2 font-extrabold text-xs">
            <i data-lucide="${g.icon}" class="w-4 h-4"></i>
            <span>${g.label}</span>
          </div>
          <span class="text-[11px] font-extrabold px-2 py-0.5 rounded-full ${key === 'urgent' ? 'bg-rose-500 text-white' : key === 'normal' ? 'bg-emerald-500 text-white' : 'bg-slate-400 text-white'}">
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

                      <!-- Ghi chú thêm -->
                      ${task.description ? `
                        <div class="mt-1.5 text-xs font-medium opacity-80 line-clamp-2 leading-relaxed flex items-start gap-1">
                          <i data-lucide="file-text" class="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-70"></i>
                          <span>${escapeHtml(task.description)}</span>
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
  
  const completed = state.tasks.filter(t => t.completed);
  completed.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

  if (completed.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
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

          <div class="history-card-content">
            <div class="history-card-title-row">
              <h3 class="history-card-title">${escapeHtml(task.title)}</h3>
              <span class="history-status">Đã xong</span>
            </div>
            ${task.description ? `<p class="history-card-description">${escapeHtml(task.description)}</p>` : ''}
            <button onclick="openEditHistoryModal('${task.id}')" class="history-time-btn" title="Sửa thời gian hoàn thành">
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
  if (dueInput) dueInput.value = getRelativeDateTime(0, 18, 0);
  
  const titleEl = document.getElementById('modal-title');
  const subEl = document.getElementById('modal-subtitle');
  if (titleEl) titleEl.textContent = 'Thêm công việc mới';
  if (subEl) subEl.textContent = 'Lên lịch và ghi chú việc cần làm';

  showModal('task-modal');
  lucide.createIcons();
  setTimeout(() => document.getElementById('modal-task-title').focus(), 150);
}

function openEditTaskModal(id) {
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
    if (dueInput) dueInput.value = '';
  } else {
    if (noDueToggle) noDueToggle.checked = false;
    if (dueContainer) dueContainer.classList.remove('opacity-40', 'pointer-events-none');
    if (dueInput) dueInput.value = task.dueDate;
  }

  const titleEl = document.getElementById('modal-title');
  const subEl = document.getElementById('modal-subtitle');
  if (titleEl) titleEl.textContent = 'Chỉnh sửa công việc';
  if (subEl) subEl.textContent = 'Cập nhật nội dung và thời hạn hoàn thành';

  showModal('task-modal');
  lucide.createIcons();
  document.getElementById('modal-task-title').focus();
}

function closeTaskModal() {
  hideModal('task-modal');
}

// Edit History Time Modal Logic
function openEditHistoryModal(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  document.getElementById('history-task-id').value = task.id;
  document.getElementById('history-task-title').textContent = task.title;
  
  let dtValue = '';
  if (task.completedAt) {
    const d = new Date(task.completedAt);
    const pad = (n) => String(n).padStart(2, '0');
    dtValue = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } else {
    dtValue = getRelativeDateTime(0, new Date().getHours(), new Date().getMinutes());
  }

  document.getElementById('history-task-completed-at').value = dtValue;
  showModal('history-modal');
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
  if (dueInput) dueInput.value = getRelativeDateTime(dayOffset, hour, minute);
}

function clearModalDate() {
  document.getElementById('modal-task-due').value = '';
}

function triggerReminderPopup(task, isOverdue = false) {
  document.getElementById('reminder-task-title').textContent = task.title;
  document.getElementById('reminder-badge').textContent = isOverdue ? '⚠️ Quá hạn' : '⏰ Sắp đến hạn';
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
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.add('modal-active');
  }, 10);
}

function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('modal-active');
  setTimeout(() => modal.classList.add('hidden'), 200);
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
      headerHistoryBtn.classList.add('active', 'text-emerald-600', 'dark:text-emerald-400');
      headerHistoryBtn.classList.remove('text-slate-400');
    }
    if (bottomNavTasks) {
      bottomNavTasks.classList.remove('active', 'text-brand-600', 'dark:text-brand-400');
      bottomNavTasks.classList.add('text-slate-400');
    }
  } else {
    if (viewTasks) viewTasks.classList.remove('hidden');
    if (viewHistory) viewHistory.classList.add('hidden');
    if (headerHistoryBtn) {
      headerHistoryBtn.classList.remove('active', 'text-emerald-600', 'dark:text-emerald-400');
      headerHistoryBtn.classList.add('text-slate-400');
    }
    if (bottomNavTasks) {
      bottomNavTasks.classList.add('active', 'text-brand-600', 'dark:text-brand-400');
      bottomNavTasks.classList.remove('text-slate-400');
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderCurrentView();
  lucide.createIcons();
}

// Date Helpers
function getDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatFullDateTime(isoStr) {
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
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

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  lucide.createIcons();
}

// Background Reminder & Real-time Live Clock
function startReminderService() {
  function updateClock() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(now.getDate());
    const month = pad(now.getMonth() + 1);
    const year = now.getFullYear();
    const weekday = now.toLocaleDateString('vi-VN', { weekday: 'short' });
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const el = document.getElementById('live-clock-display');
    if (el) {
      el.textContent = `📅 ${weekday}, ${day}/${month}/${year} • ⏰ ${timeStr}`;
    }

    const dateEl = document.getElementById('live-date-text');
    if (dateEl) {
      const weekdaysFull = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
      dateEl.textContent = `${weekdaysFull[now.getDay()]}, ${day}/${month}/${year}`;
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

  // Header Add Button (+)
  const headerAddBtn = document.getElementById('header-add-btn');
  if (headerAddBtn) headerAddBtn.addEventListener('click', openAddTaskModal);

  // Header History Button (Lịch sử đã xong)
  const headerHistoryBtn = document.getElementById('header-history-btn');
  if (headerHistoryBtn) {
    headerHistoryBtn.addEventListener('click', () => {
      if (state.activeTab === 'history') {
        switchTab('tasks');
      } else {
        switchTab('history');
      }
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
    const due = isNoDue ? '' : (document.getElementById('modal-task-due') ? document.getElementById('modal-task-due').value : '');

    if (!title.trim()) return;

    if (id) {
      const task = state.tasks.find(t => t.id === id);
      if (task) {
        task.title = title.trim();
        task.description = desc.trim();
        task.dueDate = due;
        task.image = image;
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
        if (dueInput) dueInput.value = '';
      } else {
        if (dueContainer) dueContainer.classList.remove('opacity-40', 'pointer-events-none');
        if (dueInput && !dueInput.value) dueInput.value = getRelativeDateTime(0, 18, 0);
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

  document.getElementById('clear-history-btn').addEventListener('click', promptClearAllHistory);

  // Search Toggle for mobile
  const searchToggleBtn = document.getElementById('search-toggle-btn');
  const searchBar = document.getElementById('mobile-search-bar');
  const searchInput = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search-btn');

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

  // Theme
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

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
