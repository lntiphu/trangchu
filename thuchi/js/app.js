/**
 * Money - Quản Lý Chi Tiêu Mobile Web App
 * Core Application Logic
 */

// STATE SYSTEM
const state = {
    expenses: [],
    savers: [],
    currentUserId: null,
    currentTab: 'dashboard',
    searchQuery: '',
    supabaseUrl: 'https://ghdydszifdaiphcjguri.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZHlkc3ppZmRhaXBoY2pndXJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjAzOTgsImV4cCI6MjEwMDE5NjM5OH0.ZTpS0cdmmCO4eH41nXFGQpnAELgD5iMwOEpl_mG7S1c'
};
let supabaseClient = null;
let supabaseSubscription = null;
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();
let dashboardCalendarYear = new Date().getFullYear();
let dashboardCalendarMonth = new Date().getMonth();
let analysisYear = new Date().getFullYear();
let analysisMonth = new Date().getMonth();
let currentAdjustingSaverId = null;
let currentAdjustingField = null;

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

// Sắp xếp chi tiêu: Ngày mới nhất lên đầu, nếu cùng ngày thì ID lớn nhất (mới nhất) lên đầu
function sortExpenses() {
    state.expenses.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.id.localeCompare(a.id);
    });
}

// Cấu hình Emoji & Màu sắc cho từng Phân loại (Florenté Lifestyle Palette)
const CATEGORY_STYLES = {
    "Ăn uống": { emoji: "🍔", bg: "rgba(220, 139, 120, 0.14)", color: "#dc8b78" },
    "Mua sắm": { emoji: "🛒", bg: "rgba(214, 149, 138, 0.14)", color: "#d6958a" },
    "Di chuyển": { emoji: "🚗", bg: "rgba(52, 66, 55, 0.14)", color: "#344237" },
    "Giải trí": { emoji: "🍿", bg: "rgba(200, 155, 103, 0.14)", color: "#c89b67" },
    "Sinh hoạt": { emoji: "💡", bg: "rgba(106, 123, 104, 0.14)", color: "#6a7b68" },
    "Chi phí hàng tháng": { emoji: "📌", bg: "rgba(79, 94, 82, 0.14)", color: "#4f5e52" },
    "Y tế & Sức khỏe": { emoji: "🏥", bg: "rgba(74, 144, 186, 0.14)", color: "#4a90ba" },
    "Quà tặng & Hiếu hỷ": { emoji: "🎁", bg: "rgba(180, 100, 160, 0.14)", color: "#b464a0" },
    "Viễn thông": { emoji: "📱", bg: "rgba(32, 178, 170, 0.14)", color: "#20b2aa" },
    "Sửa chữa & Bảo trì": { emoji: "🔧", bg: "rgba(210, 120, 50, 0.14)", color: "#d27832" },
    "Cá nhân": { emoji: "👤", bg: "rgba(100, 80, 200, 0.14)", color: "#6450c8" },
    "Khác": { emoji: "📝", bg: "rgba(131, 140, 132, 0.14)", color: "#838c84" }
};

// TỰ ĐỘNG CO CHỮ SỐ TIỀN THEO ĐỘ DÀI (kiểu Apple Pay / iOS)
// Đảm bảo số hiển thị vừa ô dù dài đến 100.000.000
function scaleAmountFont(inputEl) {
    if (!inputEl) return;
    const len = (inputEl.value || '').length;
    let size;
    if (len <= 6)       size = '4.35rem';  // 0 - 999.999
    else if (len <= 9)  size = '3.75rem';  // 1.000.000 - 99.999.999
    else                size = '3.05rem';  // 100.000.000 (11 ký tự với dấu chấm)
    inputEl.style.fontSize = size;
    // Giữ đơn vị VNĐ cân đối với cỡ số đang hiển thị.
    const container = inputEl.closest('.amount-input-container');
    if (container) {
        const suffix = container.querySelector('.currency-suffix');
        if (suffix) {
            const suffixSize = Math.max(1.05, parseFloat(size) * 0.34);
            suffix.style.fontSize = suffixSize + 'rem';
        }
    }
}

// KHỞI CHẠY ỨNG DỤNG
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initUI();
    registerEventListeners();
    switchTab('dashboard'); // Mặc định hiển thị tab dashboard
    updateUI();
});

// LOAD DỮ LIỆU TỪ LOCALSTORAGE
function loadData() {
    const savedExpenses = localStorage.getItem('money_expenses') || localStorage.getItem('ispend_expenses');
    if (savedExpenses) {
        try {
            state.expenses = JSON.parse(savedExpenses);
            sortExpenses();
        } catch (e) {
            console.error("Lỗi parse dữ liệu chi tiêu:", e);
            state.expenses = [];
        }
    } else {
        // Tạo một số dữ liệu mẫu ban đầu để giao diện đẹp ngay lập tức
        state.expenses = getSampleData();
        sortExpenses();
        saveData();
    }

    // Nạp dữ liệu Saver (Tiết kiệm)
    loadSaverData();

    // Tự động kết nối Supabase
    initSupabase();
}

// LƯU DỮ LIỆU XUỐNG LOCALSTORAGE
function saveData() {
    const storageKey = state.currentUserId
        ? `money_expenses_${state.currentUserId}`
        : 'money_expenses';
    localStorage.setItem(storageKey, JSON.stringify(state.expenses));
}

function loadExpenseDataForCurrentUser() {
    if (!state.currentUserId) {
        state.expenses = [];
        updateUI();
        return;
    }

    const savedExpenses = localStorage.getItem(`money_expenses_${state.currentUserId}`);
    if (!savedExpenses) {
        state.expenses = [];
        updateUI();
        return;
    }

    try {
        state.expenses = JSON.parse(savedExpenses);
        sortExpenses();
    } catch (e) {
        console.error("Lỗi parse dữ liệu chi tiêu của tài khoản:", e);
        state.expenses = [];
    }

    // Hiển thị dữ liệu đã lưu trên máy ngay, không chờ Supabase phản hồi.
    updateUI();
}

function loadSaverData() {
    const currentUserId = state.currentUserId;
    const userStorageKey = currentUserId ? `money_savers_${currentUserId}` : 'money_savers';
    const legacyOwnerId = localStorage.getItem('money_savers_owner_id');
    const savedSavers = localStorage.getItem(userStorageKey) || (
        currentUserId && (!legacyOwnerId || legacyOwnerId === currentUserId)
            ? localStorage.getItem('money_savers')
            : null
    );
    if (savedSavers) {
        try {
            state.savers = JSON.parse(savedSavers);
        } catch (e) {
            console.error("Lỗi parse dữ liệu tiết kiệm:", e);
            state.savers = [];
        }
    } else {
        state.savers = getSampleSaverData();
        saveSaverData();
    }
}

function saveSaverData() {
    const storageKey = state.currentUserId ? `money_savers_${state.currentUserId}` : 'money_savers';
    localStorage.setItem(storageKey, JSON.stringify(state.savers));
    if (state.currentUserId) {
        localStorage.setItem('money_savers_owner_id', state.currentUserId);
    }
}

function getSampleSaverData() {
    return [
        {
            id: 'saver-1',
            title: 'Quỹ khẩn cấp',
            momo: 3500000,
            bank: 12000000,
            target: 30000000,
            debt: 0
        },
        {
            id: 'saver-2',
            title: 'Mua iPhone mới',
            momo: 1200000,
            bank: 5000000,
            target: 25000000,
            debt: 2000000
        },
        {
            id: 'saver-3',
            title: 'Du lịch Đà Lạt',
            momo: 800000,
            bank: 3200000,
            target: 8000000,
            debt: 0
        }
    ];
}

// DỮ LIỆU MẪU BAN ĐẦU
function getSampleData() {
    return [];
}

// ĐỊNH DẠNG NGÀY & TIỀN TỆ
function formatCurrency(amount) {
    return `${new Intl.NumberFormat('vi-VN').format(amount)} VNĐ`;
}

function formatSummaryCurrency(amount) {
    const value = Number(amount) || 0;
    if (value < 1000) {
        return `${new Intl.NumberFormat('vi-VN').format(value)}đ`;
    }

    return `${new Intl.NumberFormat('vi-VN').format(Math.round(value / 1000))}k`;
}

function getTodayDateString() {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000; // offset in milliseconds
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
    return localISOTime;
}

function getDateOffsetString(offsetDays) {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const date = new Date(Date.now() - tzoffset + (offsetDays * 24 * 60 * 60 * 1000));
    return date.toISOString().slice(0, 10);
}

function getVietnameseDayOfWeek(dateStr) {
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const date = new Date(dateStr);
    return days[date.getDay()];
}

function formatDateStringVietnamese(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    
    // So sánh xem có phải hôm nay / hôm qua không
    const today = getTodayDateString();
    const yesterday = getDateOffsetString(-1);
    
    if (dateStr === today) {
        return 'Hôm nay';
    } else if (dateStr === yesterday) {
        return 'Hôm qua';
    } else {
        const dayOfWeek = getVietnameseDayOfWeek(dateStr);
        return `${dayOfWeek}, ${day}/${month}/${year}`;
    }
}

// Định dạng Giờ & Ngày chi tiết: Vd 10:12 AM 22/07/26
function formatDateTimeVietnamese(exp) {
    if (!exp) return '';
    let d;
    if (exp.created_at) {
        d = new Date(exp.created_at);
    } else if (exp.id && exp.id.startsWith('exp-')) {
        const parts = exp.id.split('-');
        const ts = parseInt(parts[1], 10);
        if (!isNaN(ts)) {
            d = new Date(ts);
        }
    }
    
    if (!d || isNaN(d.getTime())) {
        if (exp.date) {
            const parts = exp.date.split('-');
            if (parts.length === 3) {
                return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
            }
        }
        return exp.date || '';
    }

    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = hours.toString().padStart(2, '0');

    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear().toString().slice(-2);

    return `${hoursStr}:${minutes} ${ampm} ${day}/${month}/${year}`;
}

// KHỞI TẠO CÁC PHẦN TỬ UI BAN ĐẦU
function initUI() {
    // Cập nhật ngày tháng trên header
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const now = new Date();
    const currentDay = days[now.getDay()];
    const currentDateVal = now.getDate();
    const currentMonthVal = now.getMonth() + 1;
    const currentYearVal = now.getFullYear();
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
        dateEl.innerText = `${currentDay}, ngày ${currentDateVal} tháng ${currentMonthVal} năm ${currentYearVal}`;
    }
    updateWelcomeDate();

    // Đặt ngày mặc định cho form nhập là ngày hôm nay
    document.getElementById('expense-date').value = getTodayDateString();

    // Khởi tạo Lucide Icons
    createLucideIcons();
    renderDashboardCalendar();
}

// ĐĂNG KÝ SỰ KIỆN TƯƠNG TÁC (EVENT LISTENERS)
function registerEventListeners() {
    // Sự kiện thanh điều hướng dưới (Tabs Switch)
    const navItems = document.querySelectorAll('.app-nav .nav-item[data-tab]');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });


    // Mở / Đóng Modal Thêm Chi Tiêu
    document.getElementById('btn-open-add-modal').addEventListener('click', openAddModal);
    document.getElementById('btn-close-modal').addEventListener('click', closeAddModal);
    document.getElementById('btn-cancel-add').addEventListener('click', closeAddModal);
    document.getElementById('add-expense-modal').addEventListener('click', (e) => {
        if (e.target.id === 'add-expense-modal') closeAddModal();
    });

    // Mở / Đóng mô-đun Sức khỏe cá nhân (CKKN)
    const btnOpenCkkn = document.getElementById('btn-open-ckkn-modal');
    if (btnOpenCkkn) {
        btnOpenCkkn.addEventListener('click', openCkknModal);
    }
    const btnCloseCkkn = document.getElementById('btn-close-ckkn-modal');
    if (btnCloseCkkn) {
        btnCloseCkkn.addEventListener('click', closeCkknModal);
    }
    const ckknModal = document.getElementById('ckkn-modal');
    if (ckknModal) {
        ckknModal.addEventListener('click', event => {
            if (event.target.id === 'ckkn-modal') closeCkknModal();
        });
    }

    // Mở / Đóng trang Danh sách công việc (TodoList)
    const btnOpenTodo = document.getElementById('btn-open-todo-modal');
    if (btnOpenTodo) {
        btnOpenTodo.addEventListener('click', openTodoModal);
    }
    const btnCloseTodo = document.getElementById('btn-close-todo-modal');
    if (btnCloseTodo) {
        btnCloseTodo.addEventListener('click', closeTodoModal);
    }
    const todoModal = document.getElementById('todo-modal');
    if (todoModal) {
        todoModal.addEventListener('click', event => {
            if (event.target.id === 'todo-modal') closeTodoModal();
        });
    }

    // Mở / Đóng Modal 5 Options Hub
    const hubModal = document.getElementById('options-hub-modal');
    if (hubModal) {
        hubModal.addEventListener('click', event => {
            if (event.target.id === 'options-hub-modal') hideOptionsModal();
        });
    }
    const btnOpenHubHeader = document.getElementById('btn-open-hub-header');
    if (btnOpenHubHeader) {
        btnOpenHubHeader.addEventListener('click', showOptionsModal);
    }
    const btnOpenHubNav = document.getElementById('btn-open-hub-nav');
    if (btnOpenHubNav) {
        btnOpenHubNav.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            goBackToHome();
        });
    }
    const btnCloseHub = document.getElementById('btn-close-options-hub');
    if (btnCloseHub) {
        btnCloseHub.addEventListener('click', hideOptionsModal);
    }
    const btnNavAnalysis = document.getElementById('btn-open-analysis-nav');
    if (btnNavAnalysis) {
        btnNavAnalysis.addEventListener('click', openSpendingAnalysisPage);
    }

    // Định dạng & tự động co chữ theo độ dài số tiền nhập (kiểu Apple Pay)
    const amountInput = document.getElementById('expense-amount');
    amountInput.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        // Giới hạn tối đa 100.000.000 (100 triệu)
        if (val && parseInt(val, 10) > 100000000) {
            val = '100000000';
        }
        if (val) {
            e.target.value = parseInt(val, 10).toLocaleString('vi-VN');
        } else {
            e.target.value = '';
        }
        scaleAmountFont(e.target);
    });
    // Scale lần đầu khi modal mở
    scaleAmountFont(amountInput);

    // Submit form thêm mới
    document.getElementById('add-expense-form').addEventListener('submit', handleAddExpenseSubmit);

    // Mở / Đóng chi tiết chi tiêu
    document.getElementById('btn-close-detail').addEventListener('click', closeDetailModal);
    document.getElementById('detail-expense-modal').addEventListener('click', (e) => {
        if (e.target.id === 'detail-expense-modal') closeDetailModal();
    });

    // Định dạng & tự động co chữ cho ô số tiền chỉnh sửa
    const detailAmountInput = document.getElementById('detail-amount-input');
    if (detailAmountInput) {
        detailAmountInput.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            // Giới hạn tối đa 100.000.000 (100 triệu)
            if (val && parseInt(val, 10) > 100000000) {
                val = '100000000';
            }
            if (val) {
                e.target.value = parseInt(val, 10).toLocaleString('vi-VN');
            } else {
                e.target.value = '';
            }
            scaleAmountFont(e.target);
        });
    }

    // Tìm kiếm lịch sử
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderHistoryList();
    });

    // Mở / Đóng Modal Lịch Chi Tiêu
    const btnCloseCalendar = document.getElementById('btn-close-calendar');
    if (btnCloseCalendar) {
        btnCloseCalendar.addEventListener('click', closeCalendarModal);
    }
    const calendarModal = document.getElementById('calendar-expense-modal');
    if (calendarModal) {
        calendarModal.addEventListener('click', (e) => {
            if (e.target.id === 'calendar-expense-modal') closeCalendarModal();
        });
    }

    // Điều hướng Tháng Lịch (Trước / Sau)
    const btnPrevMonth = document.getElementById('btn-prev-month');
    if (btnPrevMonth) {
        btnPrevMonth.addEventListener('click', () => {
            calendarMonth--;
            if (calendarMonth < 0) {
                calendarMonth = 11;
                calendarYear--;
            }
            renderCalendar();
        });
    }
    const btnNextMonth = document.getElementById('btn-next-month');
    if (btnNextMonth) {
        btnNextMonth.addEventListener('click', () => {
            calendarMonth++;
            if (calendarMonth > 11) {
                calendarMonth = 0;
                calendarYear++;
            }
            renderCalendar();
        });
    }

    // Nút quay lại lịch từ view chi tiết ngày
    const btnBack = document.getElementById('btn-back-to-calendar');
    if (btnBack) {
        btnBack.addEventListener('click', () => {
            document.getElementById('calendar-day-detail').style.display = 'none';
            document.getElementById('calendar-grid-view').style.display = 'block';
            // Vẽ lại theo tháng đang được chọn thay vì dùng dữ liệu mặc định trong HTML.
            renderCalendar();
        });
    }

    // Mở / Đóng trang phân tích dữ liệu chi tiêu
    const btnOpenAnalysis = document.getElementById('btn-open-spending-analysis');
    if (btnOpenAnalysis) {
        btnOpenAnalysis.addEventListener('click', openSpendingAnalysisPage);
    }
    const btnCloseAnalysis = document.getElementById('btn-close-spending-analysis');
    if (btnCloseAnalysis) {
        btnCloseAnalysis.addEventListener('click', closeSpendingAnalysisPage);
    }
    const btnAnalysisPrevMonth = document.getElementById('btn-analysis-prev-month');
    if (btnAnalysisPrevMonth) {
        btnAnalysisPrevMonth.addEventListener('click', () => {
            analysisMonth--;
            if (analysisMonth < 0) {
                analysisMonth = 11;
                analysisYear--;
            }
            renderDashboardCharts();
        });
    }
    const btnAnalysisNextMonth = document.getElementById('btn-analysis-next-month');
    if (btnAnalysisNextMonth) {
        btnAnalysisNextMonth.addEventListener('click', () => {
            analysisMonth++;
            if (analysisMonth > 11) {
                analysisMonth = 0;
                analysisYear++;
            }
            renderDashboardCharts();
        });
    }

    const btnDashboardPrevMonth = document.getElementById('btn-dashboard-prev-month');
    if (btnDashboardPrevMonth) {
        btnDashboardPrevMonth.addEventListener('click', () => {
            dashboardCalendarMonth--;
            if (dashboardCalendarMonth < 0) {
                dashboardCalendarMonth = 11;
                dashboardCalendarYear--;
            }
            renderDashboardCalendar();
        });
    }
    const btnDashboardNextMonth = document.getElementById('btn-dashboard-next-month');
    if (btnDashboardNextMonth) {
        btnDashboardNextMonth.addEventListener('click', () => {
            dashboardCalendarMonth++;
            if (dashboardCalendarMonth > 11) {
                dashboardCalendarMonth = 0;
                dashboardCalendarYear++;
            }
            renderDashboardCalendar();
        });
    }

    // ==========================================
    // SỰ KIỆN CHO MÔ-ĐUN SAVER (TIẾT KIỆM)
    // ==========================================
    const btnOpenSaver = document.getElementById('btn-open-saver-modal');
    if (btnOpenSaver) {
        btnOpenSaver.addEventListener('click', openSaverModal);
    }
    const btnCloseSaver = document.getElementById('btn-close-saver');
    if (btnCloseSaver) {
        btnCloseSaver.addEventListener('click', closeSaverModal);
    }
    const saverModal = document.getElementById('saver-page-modal');
    if (saverModal) {
        saverModal.addEventListener('click', (e) => {
            if (e.target.id === 'saver-page-modal') closeSaverModal();
        });
    }

    // Modal Thêm / Sửa Saver
    const addSaverModal = document.getElementById('add-saver-modal');
    if (addSaverModal) {
        addSaverModal.addEventListener('click', (e) => {
            if (e.target.id === 'add-saver-modal') closeAddSaverModal();
        });
    }
    const addSaverForm = document.getElementById('add-saver-form');
    if (addSaverForm) {
        addSaverForm.addEventListener('submit', handleAddSaverSubmit);
    }

    // Modal Điều chỉnh số tiền nhanh
    const adjustAmountModal = document.getElementById('adjust-saver-amount-modal');
    if (adjustAmountModal) {
        adjustAmountModal.addEventListener('click', (e) => {
            if (e.target.id === 'adjust-saver-amount-modal') closeAdjustAmountModal();
        });
    }

    // Tự động format tiền tệ cho các ô nhập của Saver
    ['saver-input-momo', 'saver-input-bank', 'saver-input-target', 'saver-input-debt', 'adjust-custom-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', (e) => {
                let val = e.target.value.replace(/\D/g, '');
                if (val) {
                    e.target.value = parseInt(val, 10).toLocaleString('vi-VN');
                } else {
                    e.target.value = '';
                }
            });
        }
    });

}

// XỬ LÝ CHUYỂN TAB
function switchTab(tabId) {
    state.currentTab = tabId;
    
    // Cập nhật trạng thái Active trên Navigation
    const navItems = document.querySelectorAll('.app-nav .nav-item[data-tab]');
    navItems.forEach(item => {
        const isTarget = item.getAttribute('data-tab') === tabId;
        item.classList.toggle('active', isTarget);
    });

    // Cập nhật hiển thị Panel
    const panels = document.querySelectorAll('.app-main .tab-panel');
    panels.forEach(panel => {
        const isTarget = panel.getAttribute('id') === `tab-${tabId}`;
        panel.classList.toggle('active', isTarget);
    });

    // Đảm bảo cuộn về đầu trang 100% trên container app-main
    const appMain = document.querySelector('.app-main');
    if (appMain) {
        appMain.scrollTop = 0;
    }
    window.scrollTo(0, 0);

    // Cập nhật lại UI cụ thể khi chuyển tab (ví dụ: Biểu đồ)
    if (tabId === 'dashboard') {
        renderDashboardCharts();
    } else if (tabId === 'history') {
        renderHistoryList();
    }
}



// CÁC HÀM MỞ/ĐÓNG MODAL
function openAddModal() {
    // Đặt lại ngày mặc định là hôm nay
    document.getElementById('expense-date').value = getTodayDateString();
    document.getElementById('add-expense-modal').classList.add('active');
}

function closeAddModal() {
    document.getElementById('add-expense-modal').classList.remove('active');
    document.getElementById('add-expense-form').reset();
}

function openCkknModal() {
    const modal = document.getElementById('ckkn-modal');
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    createLucideIcons();
}

function closeCkknModal(returnToHub = true) {
    const modal = document.getElementById('ckkn-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    if (returnToHub && typeof showOptionsModal === 'function') {
        showOptionsModal();
    }
}

function openTodoModal() {
    const page = document.getElementById('todo-modal');
    if (!page) return;
    window.QLCTFeatureIntegration?.mount('todo');
    page.classList.add('active');
    page.setAttribute('aria-hidden', 'false');
    createLucideIcons();
}

function closeTodoModal(returnToHub = true) {
    const page = document.getElementById('todo-modal');
    if (!page) return;
    page.classList.remove('active');
    page.setAttribute('aria-hidden', 'true');
    if (returnToHub && typeof showOptionsModal === 'function') {
        showOptionsModal();
    }
}

function openDetailModal(expenseId) {
    const exp = state.expenses.find(item => item.id === expenseId);
    if (!exp) return;

    const detailAmountEl = document.getElementById('detail-amount-input');
    detailAmountEl.value = exp.amount.toLocaleString('vi-VN');
    scaleAmountFont(detailAmountEl); // Tự động co chữ ngay khi mở
    document.getElementById('detail-title-input').value = exp.title;
    document.getElementById('detail-category-select').value = exp.category || 'Khác';
    document.getElementById('detail-date').innerText = formatDateTimeVietnamese(exp);

    // Nút Xóa
    const deleteBtn = document.getElementById('btn-delete-expense');
    deleteBtn.onclick = () => {
        if (confirm(`Bạn có chắc chắn muốn xóa chi tiêu "${exp.title}" không?`)) {
            deleteExpense(exp.id);
            closeDetailModal();
        }
    };

    // Nút Lưu thay đổi
    const saveBtn = document.getElementById('btn-save-edit-expense');
    saveBtn.onclick = () => saveEditedExpense(exp.id);

    document.getElementById('detail-expense-modal').classList.add('active');
}

function saveEditedExpense(id) {
    if (!state.currentUserId) {
        showLoginScreen();
        return;
    }

    const exp = state.expenses.find(item => item.id === id);
    if (!exp) return;

    const amountRaw = document.getElementById('detail-amount-input').value.replace(/\D/g, '');
    const amount = parseInt(amountRaw, 10);
    if (isNaN(amount) || amount <= 0) {
        alert('Vui lòng nhập số tiền chi tiêu hợp lệ lớn hơn 0!');
        return;
    }

    const title = document.getElementById('detail-title-input').value.trim();
    if (!title) {
        alert('Vui lòng nhập nội dung chi tiêu!');
        return;
    }

    const category = document.getElementById('detail-category-select').value;

    exp.amount = amount;
    exp.title = title;
    exp.category = category;

    sortExpenses();
    saveData();
    updateUI();

    // Đồng bộ lên Supabase nếu có
    if (supabaseClient && state.currentUserId) {
        supabaseClient
            .from('expenses')
            .update({
                amount: exp.amount,
                title: exp.title,
                category: exp.category
            })
            .eq('id', id)
            .eq('user_id', state.currentUserId)
            .then(({ error }) => {
                if (error) {
                    console.error("Lỗi khi cập nhật giao dịch lên Supabase:", error);
                } else {
                    console.log("Đã cập nhật giao dịch lên Supabase thành công.");
                }
            });
    }

    closeDetailModal();
}

function closeDetailModal() {
    document.getElementById('detail-expense-modal').classList.remove('active');
}

function openSpendingAnalysisPage() {
    const pageEl = document.getElementById('spending-analysis-page');
    if (pageEl) {
        pageEl.classList.add('active');
        pageEl.setAttribute('aria-hidden', 'false');
    }
    renderDashboardCharts();
    createLucideIcons();
}

function closeSpendingAnalysisPage() {
    closeCategoryExpensesPopup();
    const pageEl = document.getElementById('spending-analysis-page');
    if (pageEl) {
        pageEl.classList.remove('active');
        pageEl.setAttribute('aria-hidden', 'true');
    }
}

function renderDashboardCalendar() {
    const grid = document.getElementById('dashboard-calendar-days-grid');
    if (!grid) return;

    const yearLabel = document.getElementById('dashboard-calendar-year-label');
    const monthLabel = document.getElementById('dashboard-calendar-month-title');
    const monthTotalEl = document.getElementById('dashboard-calendar-month-total');
    if (yearLabel) yearLabel.innerText = String(dashboardCalendarYear);
    if (monthLabel) monthLabel.innerText = `Tháng ${dashboardCalendarMonth + 1}`;

    const daysInMonth = new Date(dashboardCalendarYear, dashboardCalendarMonth + 1, 0).getDate();
    const firstDay = new Date(dashboardCalendarYear, dashboardCalendarMonth, 1).getDay();
    const firstDayOffset = firstDay === 0 ? 6 : firstDay - 1;
    const dayTotals = {};
    let monthTotal = 0;

    state.expenses.forEach(exp => {
        if (!exp || !exp.date) return;
        const dateStr = String(exp.date).split('T')[0];
        const parts = dateStr.split('-').map(Number);
        if (parts.length !== 3) return;
        if (parts[0] === dashboardCalendarYear && parts[1] - 1 === dashboardCalendarMonth) {
            dayTotals[parts[2]] = (dayTotals[parts[2]] || 0) + (Number(exp.amount) || 0);
            monthTotal += Number(exp.amount) || 0;
        }
    });

    if (monthTotalEl) monthTotalEl.innerText = formatCurrency(monthTotal);
    grid.innerHTML = '';

    for (let i = 0; i < firstDayOffset; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day-cell empty';
        grid.appendChild(emptyCell);
    }

    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const amount = dayTotals[day] || 0;
        const dayOfWeek = new Date(dashboardCalendarYear, dashboardCalendarMonth, day).getDay();
        const isToday = today.getFullYear() === dashboardCalendarYear
            && today.getMonth() === dashboardCalendarMonth
            && today.getDate() === day;
        const cell = document.createElement('div');
        cell.className = `calendar-day-cell${isToday ? ' today' : ''}${amount > 0 ? ' has-expense' : ''}${dayOfWeek === 0 ? ' sunday' : ''}`;

        const monthStr = String(dashboardCalendarMonth + 1).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');
        const dateStr = `${dashboardCalendarYear}-${monthStr}-${dayStr}`;
        cell.onclick = () => {
            calendarYear = dashboardCalendarYear;
            calendarMonth = dashboardCalendarMonth;
            const calendarModal = document.getElementById('calendar-expense-modal');
            if (calendarModal) calendarModal.classList.add('active');
            showDayExpensesDetail(dateStr);
        };
        cell.innerHTML = `
            <span class="calendar-day-number">${day}</span>
            <span class="calendar-day-amount">${amount > 0 ? '-' + formatShortAmount(amount) : ''}</span>
        `;
        grid.appendChild(cell);
    }
    createLucideIcons();
}

// CÁC HÀM XỬ LÝ MODAL LỊCH CHI TIÊU HÀNG NGÀY
function openCalendarModal(e) {
    if (e && e.preventDefault) e.preventDefault();

    // Reset về view lưới lịch (nếu đang ở view chi tiết ngày)
    const gridView = document.getElementById('calendar-grid-view');
    const detailView = document.getElementById('calendar-day-detail');
    if (gridView) gridView.style.display = 'block';
    if (detailView) detailView.style.display = 'none';

    const modalEl = document.getElementById('calendar-expense-modal');
    if (modalEl) {
        modalEl.classList.add('active');
    }

    const today = new Date();
    calendarYear = today.getFullYear();
    calendarMonth = today.getMonth();

    try {
        renderCalendar();
    } catch (err) {
        console.error("Lỗi khi vẽ lịch:", err);
    }
}

function closeCalendarModal() {
    const modalEl = document.getElementById('calendar-expense-modal');
    if (modalEl) modalEl.classList.remove('active');

    // Reset về view lưới sau khi đóng
    setTimeout(() => {
        const gridView = document.getElementById('calendar-grid-view');
        const detailView = document.getElementById('calendar-day-detail');
        if (gridView) gridView.style.display = 'block';
        if (detailView) detailView.style.display = 'none';
    }, 350); // Đợi animation đóng xong
}


// Gắn toàn cục để chạy an toàn với onclick inline
window.openCalendarModal = openCalendarModal;
window.closeCalendarModal = closeCalendarModal;

function formatShortAmount(amount) {
    if (!amount || amount <= 0) return '';
    if (amount >= 1000000) {
        return (amount / 1000000).toFixed(1).replace('.0', '') + 'M';
    } else if (amount >= 1000) {
        return (amount / 1000).toFixed(0) + 'k';
    }
    return amount.toString();
}

function showDayExpensesDetail(dayStr) {
    // Lọc chi tiêu của ngày được chọn
    const dayExpenses = state.expenses.filter(exp => {
        if (!exp || !exp.date) return false;
        let dStr = exp.date;
        if (typeof dStr === 'string' && dStr.includes('T')) dStr = dStr.split('T')[0];
        return dStr === dayStr;
    });

    // Cập nhật tiêu đề ngày (dạng DD/MM/YY)
    const parts = dayStr.split('-');
    const displayDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}` : dayStr;
    const dayDetailTitle = document.getElementById('cal-day-detail-title');
    if (dayDetailTitle) dayDetailTitle.innerText = displayDate;

    // Tính tổng ngày
    const dayTotal = dayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const dayTotalEl = document.getElementById('cal-day-detail-total');
    if (dayTotalEl) dayTotalEl.innerText = formatCurrency(dayTotal);

    // Render danh sách chi tiêu
    const listEl = document.getElementById('cal-day-expense-list');
    if (listEl) {
        if (dayExpenses.length === 0) {
            listEl.innerHTML = `
                <div style="text-align: center; padding: 30px 0; color: var(--text-secondary); font-size: 0.88rem;">
                    <div style="font-size: 2rem; margin-bottom: 8px;">📭</div>
                    <p>Không có chi tiêu nào trong ngày này</p>
                </div>`;
        } else {
            listEl.innerHTML = dayExpenses.map(exp => {
                const style = CATEGORY_STYLES[exp.category] || CATEGORY_STYLES['Khác'];
                const amountStr = formatCurrency(exp.amount || 0);
                const timeStr = formatDateTimeVietnamese(exp);
                return `
                <div style="
                    display: flex; align-items: center; gap: 12px;
                    background: rgba(255,255,255,0.04);
                    border-radius: 14px; padding: 12px 14px;
                    border: 1px solid rgba(255,255,255,0.07);
                ">
                    <div style="
                        width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
                        background: ${style.bg}; display: flex; align-items: center; justify-content: center;
                        font-size: 1.3rem; font-family: 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif;
                    ">${style.emoji}</div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${exp.title || 'Không có tên'}</div>
                        <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 2px;">${exp.category || 'Khác'} · ${timeStr}</div>
                    </div>
                    <div style="font-size: 0.95rem; font-weight: 800; color: ${style.color}; white-space: nowrap; flex-shrink: 0;">-${amountStr}</div>
                </div>`;
            }).join('');
        }
    }

    // Chuyển sang view chi tiết (ẩn lưới lịch)
    const gridView = document.getElementById('calendar-grid-view');
    const detailView = document.getElementById('calendar-day-detail');
    if (gridView) gridView.style.display = 'none';
    if (detailView) detailView.style.display = 'block';
    createLucideIcons();
}


function renderCalendar() {
    // Cập nhật tiêu đề tháng + năm (layout mới)
    const monthTitleEl = document.getElementById('calendar-month-title');
    const yearLabelEl = document.getElementById('calendar-year-label');
    if (monthTitleEl) monthTitleEl.innerText = `Tháng ${calendarMonth + 1}`;
    if (yearLabelEl) yearLabelEl.innerText = `${calendarYear}`;

    const daysGridContainer = document.getElementById('calendar-days-grid');
    if (!daysGridContainer) return;
    daysGridContainer.innerHTML = '';

    // Số ngày trong tháng
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    // Thứ của ngày đầu tiên trong tháng (0 = Chủ nhật, 1 = Thứ hai...)
    let firstDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay();
    // Đổi sang định dạng T2 = 0, T3 = 1, ..., CN = 6
    let firstDayOffset = (firstDayOfWeek === 0) ? 6 : firstDayOfWeek - 1;

    // Tính tổng chi tiêu từng ngày trong tháng
    const dayTotals = {};
    let monthTotal = 0;

    state.expenses.forEach(exp => {
        if (!exp || !exp.date) return;
        let dateStr = exp.date;
        if (typeof dateStr === 'string' && dateStr.includes('T')) {
            dateStr = dateStr.split('T')[0];
        }
        const parts = String(dateStr).split('-');
        if (parts.length >= 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const d = parseInt(parts[2], 10);
            if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                if (y === calendarYear && (m - 1) === calendarMonth) {
                    dayTotals[d] = (dayTotals[d] || 0) + (exp.amount || 0);
                    monthTotal += (exp.amount || 0);
                }
            }
        }
    });

    // Cập nhật tổng chi tháng
    const monthTotalEl = document.getElementById('calendar-month-total');
    if (monthTotalEl) {
        monthTotalEl.innerText = formatCurrency(monthTotal);
    }

    // Ngày hôm nay để highlight
    const todayObj = new Date();
    const isCurrentYear = todayObj.getFullYear() === calendarYear;
    const isCurrentMonth = todayObj.getMonth() === calendarMonth;
    const todayDate = todayObj.getDate();

    // 1. Các ô trống padding đầu tháng
    for (let i = 0; i < firstDayOffset; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day-cell empty';
        daysGridContainer.appendChild(emptyCell);
    }

    // 2. Các ô đại diện cho từng ngày (1..daysInMonth)
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        let classNames = 'calendar-day-cell';

        // Xác định thứ trong tuần của ngày này (0=CN, 6=T7)
        const dayOfWeek = new Date(calendarYear, calendarMonth, day).getDay();
        if (dayOfWeek === 0) classNames += ' sunday'; // Chủ Nhật - màu đỏ

        const isToday = isCurrentYear && isCurrentMonth && day === todayDate;
        if (isToday) classNames += ' today';

        const amount = dayTotals[day] || 0;
        if (amount > 0) classNames += ' has-expense';

        cell.className = classNames;
        cell.style.cursor = 'pointer';

        const mStr = String(calendarMonth + 1).padStart(2, '0');
        const dStr = String(day).padStart(2, '0');
        const dayStr = `${calendarYear}-${mStr}-${dStr}`;

        cell.onclick = () => showDayExpensesDetail(dayStr);

        const shortAmtStr = formatShortAmount(amount);

        cell.innerHTML = `
            <span class="calendar-day-number">${day}</span>
            <span class="calendar-day-amount">${shortAmtStr ? '-' + shortAmtStr : ''}</span>
        `;

        daysGridContainer.appendChild(cell);
    }

    createLucideIcons();
}

// THÊM CHI TIÊU MỚI (SUBMIT FORM)
function handleAddExpenseSubmit(e) {
    e.preventDefault();

    if (!state.currentUserId) {
        showLoginScreen();
        return;
    }

    // Lấy số tiền
    const amountRaw = document.getElementById('expense-amount').value.replace(/\D/g, '');
    const amount = parseInt(amountRaw, 10);
    
    if (isNaN(amount) || amount <= 0) {
        alert('Vui lòng nhập số tiền chi tiêu hợp lệ lớn hơn 0!');
        return;
    }

    // Lấy tên/nội dung
    const title = document.getElementById('expense-title').value.trim();
    
    // Lấy phân loại
    const category = document.getElementById('expense-category').value;
    
    // Lấy ngày
    const date = document.getElementById('expense-date').value;

    // Tạo đối tượng chi tiêu mới (sử dụng ID chứa timestamp để sắp xếp)
    const newExpense = {
        id: 'exp-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        user_id: state.currentUserId,
        amount: amount,
        title: title,
        category: category,
        date: date
    };

    // Lưu vào state và LocalStorage
    state.expenses.unshift(newExpense); // Đưa lên hàng đầu tiên
    sortExpenses();
    saveData();

    // Tự động đồng bộ lên Supabase trong nền (nếu đã cấu hình)
    if (supabaseClient && state.currentUserId) {
        supabaseClient
            .from('expenses')
            .insert([{
                id: newExpense.id,
                user_id: state.currentUserId,
                date: newExpense.date,
                title: newExpense.title,
                amount: newExpense.amount,
                category: newExpense.category
            }])
            .then(({ error }) => {
                if (error) {
                    console.error("Lỗi khi thêm giao dịch lên Supabase:", error);
                } else {
                    console.log("Đã thêm giao dịch lên Supabase thành công.");
                }
            });
    }

    // Đóng modal và reset
    closeAddModal();

    // Cập nhật lại giao diện và thông báo thành công
    updateUI();
    
    // Hiệu ứng Toast đơn giản hoặc chỉ cần chuyển về Dashboard
    switchTab('dashboard');
}

// XÓA KHOẢN CHI TIÊU
function deleteExpense(id) {
    if (!state.currentUserId) {
        showLoginScreen();
        return;
    }

    const expenseToDelete = state.expenses.find(item => item.id === id);
    
    // Xóa cục bộ trên thiết bị trước
    state.expenses = state.expenses.filter(item => item.id !== id);
    saveData();
    updateUI();

    // Nếu đã kết nối Supabase, tự động xóa dòng tương ứng
    if (supabaseClient && state.currentUserId) {
        supabaseClient
            .from('expenses')
            .delete()
            .eq('id', id)
            .eq('user_id', state.currentUserId)
            .then(({ error }) => {
                if (error) {
                    console.error("Lỗi khi xóa giao dịch trên Supabase:", error);
                } else {
                    console.log("Đã xóa giao dịch thành công trên Supabase.");
                }
            });
    }
}

// CẬP NHẬT GIAO DIỆN CHÍNH
function updateUI() {
    calculateAndRenderSummaries();
    renderDashboardCalendar();


    
    if (state.currentTab === 'dashboard') {
        renderDashboardCharts();
    } else if (state.currentTab === 'history') {
        renderHistoryList();
    }
}

// TÍNH TOÁN VÀ HIỂN THỊ CÁC THẺ TỔNG KẾT
function calculateAndRenderSummaries() {
    const today = getTodayDateString();
    
    // Xác định phạm vi Tuần này (Thứ Hai -> Chủ Nhật)
    const todayObj = new Date();
    const dayOfWeek = todayObj.getDay(); // 0: Chủ nhật, 1: T2, 6: T7
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Tính ngày chênh lệch để tìm T2
    
    const startOfWeek = new Date(todayObj);
    startOfWeek.setDate(todayObj.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Xác định Tháng này
    const currentYear = todayObj.getFullYear();
    const currentMonth = todayObj.getMonth(); // 0 -> 11

    let totalToday = 0;
    let totalWeek = 0;
    let totalMonth = 0;

    state.expenses.forEach(exp => {
        const expDate = new Date(exp.date);
        
        // So sánh Ngày hôm nay
        if (exp.date === today) {
            totalToday += exp.amount;
        }

        // So sánh Tuần này
        if (expDate >= startOfWeek && expDate <= endOfWeek) {
            totalWeek += exp.amount;
        }

        // So sánh Tháng này
        if (expDate.getFullYear() === currentYear && expDate.getMonth() === currentMonth) {
            totalMonth += exp.amount;
        }
    });

    // Cập nhật giá trị hiển thị trên thẻ
    const summaryValues = [
        ['sum-today', totalToday],
        ['sum-week', totalWeek],
        ['sum-month', totalMonth]
    ];

    summaryValues.forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (!element) return;
        element.innerText = formatSummaryCurrency(value);
        element.title = formatCurrency(value);
    });

}

// TẠO PHẦN TỬ LIÊN KẾT GIAO DỊCH TRONG DOM
function createTransactionDOMItem(exp) {
    const itemEl = document.createElement('div');
    itemEl.className = 'transaction-item';
    itemEl.onclick = () => openDetailModal(exp.id);
    
    const style = CATEGORY_STYLES[exp.category] || CATEGORY_STYLES["Khác"];
    
    itemEl.innerHTML = `
        <div class="item-left">
            <div class="item-icon-wrapper font-emoji" style="background-color: ${style.bg}; color: ${style.color}; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; width: 40px; height: 40px; border-radius: 12px;">
                ${style.emoji}
            </div>
            <div class="item-details">
                <div class="item-title">${exp.title}</div>
                <div class="item-meta">
                    <span style="color: ${style.color}; font-weight: 600;">${exp.category || 'Khác'}</span> · <span>${formatDateTimeVietnamese(exp)}</span>
                </div>
            </div>
        </div>
        <div class="item-right">
            <div class="item-amount" style="color: ${style.color} !important; font-weight: 800;">-${formatCurrency(exp.amount)}</div>
        </div>
    `;
    return itemEl;
}

// VẼ TRANG PHÂN TÍCH CHI TIÊU
function renderDashboardCharts() {
    const periodLabel = document.getElementById('analysis-period-label');
    if (periodLabel) periodLabel.innerText = `Tháng ${analysisMonth + 1}, ${analysisYear}`;

    const monthExpenses = state.expenses.filter(exp => {
        const dateStr = String(exp.date || '').split('T')[0];
        const parts = dateStr.split('-').map(Number);
        return parts.length === 3 && parts[0] === analysisYear && parts[1] - 1 === analysisMonth;
    });

    const categoryTotals = {};
    const dayTotals = {};
    let totalSum = 0;

    monthExpenses.forEach(exp => {
        const amount = Number(exp.amount) || 0;
        const category = exp.category || 'Khác';
        const day = Number(String(exp.date || '').split('T')[0].split('-')[2]);
        categoryTotals[category] = (categoryTotals[category] || 0) + amount;
        if (day) dayTotals[day] = (dayTotals[day] || 0) + amount;
        totalSum += amount;
    });

    const sortedCategories = Object.keys(categoryTotals)
        .sort((a, b) => categoryTotals[b] - categoryTotals[a]);
    const labels = sortedCategories;
    const data = sortedCategories.map(category => categoryTotals[category]);
    const colors = sortedCategories.map(category => (CATEGORY_STYLES[category] || CATEGORY_STYLES['Khác']).color);
    const breakdownList = sortedCategories.map(category => {
        const style = CATEGORY_STYLES[category] || CATEGORY_STYLES['Khác'];
        return {
            category,
            amount: categoryTotals[category],
            pct: totalSum > 0 ? ((categoryTotals[category] / totalSum) * 100).toFixed(1) : '0.0',
            emoji: style.emoji,
            color: style.color
        };
    });

    const topDays = Object.entries(dayTotals)
        .map(([day, amount]) => ({ day: Number(day), amount }))
        .sort((a, b) => b.amount - a.amount);
    const topDay = topDays[0];
    const spendingDayCount = Object.keys(dayTotals).length;
    const dailyAverage = spendingDayCount > 0 ? totalSum / spendingDayCount : 0;

    setAnalysisText('analysis-total-amount', formatCurrency(totalSum));
    setAnalysisText('analysis-daily-average', formatCurrency(dailyAverage));
    setAnalysisText('analysis-top-day', topDay ? `${String(topDay.day).padStart(2, '0')}/${String(analysisMonth + 1).padStart(2, '0')}` : '--');
    setAnalysisText('analysis-top-day-amount', topDay ? formatCurrency(topDay.amount) : 'Chưa có dữ liệu');
    setAnalysisText('analysis-transaction-count', String(monthExpenses.length));

    initCategoryDoughnutChart('analysisCategoryChart', labels, data, colors);
    renderAnalysisCategoryBreakdown(breakdownList, monthExpenses);
    renderAnalysisDailyInsights(topDays);
    renderAnalysisInsights({ breakdownList, topDay, totalSum, spendingDayCount, dailyAverage });
    renderAnalysisTopExpenses(monthExpenses);
    renderAnalysisComparisons();
    createLucideIcons();
}

function getExpenseDateParts(expense) {
    const dateStr = String(expense && expense.date || '').split('T')[0];
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return { year: parts[0], month: parts[1] - 1, day: parts[2] };
}

function getMonthlyTotals() {
    const totals = {};
    state.expenses.forEach(expense => {
        const date = getExpenseDateParts(expense);
        if (!date) return;
        const key = `${date.year}-${date.month}`;
        totals[key] = (totals[key] || 0) + (Number(expense.amount) || 0);
    });
    return totals;
}

function getYearlyTotals() {
    const totals = {};
    state.expenses.forEach(expense => {
        const date = getExpenseDateParts(expense);
        if (!date) return;
        totals[date.year] = (totals[date.year] || 0) + (Number(expense.amount) || 0);
    });
    return totals;
}

function formatComparisonChange(current, previous) {
    if (!previous && !current) return { value: '--', detail: 'Chưa có dữ liệu' };
    if (!previous) return { value: 'Mới phát sinh', detail: `Kỳ này ${formatCurrency(current)}` };
    const percent = ((current - previous) / previous) * 100;
    const sign = percent > 0 ? '+' : '';
    return {
        value: `${sign}${percent.toFixed(1)}%`,
        detail: `${current >= previous ? 'Tăng' : 'Giảm'} ${formatCurrency(Math.abs(current - previous))}`
    };
}

function renderAnalysisComparisonBars(containerId, items, activeKey, emptyText) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!items.length) {
        container.innerHTML = `<div class="analysis-empty-state">${emptyText}</div>`;
        return;
    }

    const maxAmount = Math.max(...items.map(item => item.amount), 1);
    container.innerHTML = items.map(item => `
        <div class="analysis-comparison-row${String(item.key) === String(activeKey) ? ' active' : ''}">
            <span class="analysis-comparison-label">${item.label}</span>
            <div class="analysis-comparison-track" title="${formatCurrency(item.amount)}">
                <div class="analysis-comparison-fill" style="width: ${item.amount > 0 ? Math.max(4, (item.amount / maxAmount) * 100) : 0}%;"></div>
            </div>
            <strong class="analysis-comparison-value">${formatShortAmount(item.amount) || '0'}</strong>
        </div>
    `).join('');
}

function renderAnalysisComparisons() {
    const monthlyTotals = getMonthlyTotals();
    const monthItems = Array.from({ length: 12 }, (_, month) => ({
        key: `${analysisYear}-${month}`,
        label: `T${month + 1}`,
        amount: monthlyTotals[`${analysisYear}-${month}`] || 0
    }));
    const selectedMonthKey = `${analysisYear}-${analysisMonth}`;
    const previousMonthDate = new Date(analysisYear, analysisMonth - 1, 1);
    const previousMonthKey = `${previousMonthDate.getFullYear()}-${previousMonthDate.getMonth()}`;
    const selectedMonthTotal = monthlyTotals[selectedMonthKey] || 0;
    const previousMonthTotal = monthlyTotals[previousMonthKey] || 0;
    const monthChange = formatComparisonChange(selectedMonthTotal, previousMonthTotal);

    setAnalysisText('analysis-month-comparison-year', String(analysisYear));
    setAnalysisText('analysis-selected-month-total', formatCurrency(selectedMonthTotal));
    setAnalysisText('analysis-month-change', monthChange.value);
    setAnalysisText('analysis-month-change-detail', monthChange.detail);
    renderAnalysisComparisonBars('analysis-month-comparison', monthItems, selectedMonthKey, 'Chưa có dữ liệu theo tháng.');

    const yearlyTotals = getYearlyTotals();
    const years = new Set(Object.keys(yearlyTotals).map(Number));
    years.add(analysisYear);
    const yearItems = Array.from(years).sort((a, b) => a - b).map(year => ({
        key: year,
        label: String(year),
        amount: yearlyTotals[year] || 0
    }));
    const selectedYearTotal = yearlyTotals[analysisYear] || 0;
    const previousYearTotal = yearlyTotals[analysisYear - 1] || 0;
    const yearChange = formatComparisonChange(selectedYearTotal, previousYearTotal);

    setAnalysisText('analysis-selected-year-total', formatCurrency(selectedYearTotal));
    setAnalysisText('analysis-year-change', yearChange.value);
    setAnalysisText('analysis-year-change-detail', yearChange.detail);
    renderAnalysisComparisonBars('analysis-year-comparison', yearItems, analysisYear, 'Chưa có dữ liệu theo năm.');
}

function setAnalysisText(id, value) {
    const element = document.getElementById(id);
    if (element) element.innerText = value;
}

function renderAnalysisCategoryBreakdown(items, monthExpenses) {
    const container = document.getElementById('analysis-category-breakdown-legend');
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = '<div class="analysis-empty-state">Tháng này chưa có chi tiêu để phân tích.</div>';
        return;
    }

    container.innerHTML = '';

    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'analysis-category-row';
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.innerHTML = `
            <span class="analysis-category-emoji">${item.emoji}</span>
            <span class="analysis-category-name">${item.category}</span>
            <span class="analysis-category-amount">${formatCurrency(item.amount)}</span>
            <strong style="color: ${item.color};">${item.pct}%</strong>
        `;
        row.addEventListener('click', () => showCategoryExpenses(item.category, monthExpenses));
        row.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                showCategoryExpenses(item.category, monthExpenses);
            }
        });

        container.appendChild(row);
    });
}

function renderAnalysisDailyInsights(topDays) {
    const container = document.getElementById('analysis-daily-insights');
    if (!container) return;

    if (topDays.length === 0) {
        container.innerHTML = '<div class="analysis-empty-state">Chưa có ngày nào phát sinh chi tiêu.</div>';
        return;
    }

    const maxAmount = topDays[0].amount || 1;
    container.innerHTML = topDays.slice(0, 5).map(item => `
        <div class="analysis-daily-row">
            <span class="analysis-daily-label">Ngày ${String(item.day).padStart(2, '0')}/${String(analysisMonth + 1).padStart(2, '0')}</span>
            <div class="analysis-daily-track"><div class="analysis-daily-fill" style="width: ${Math.max(8, (item.amount / maxAmount) * 100)}%;"></div></div>
            <strong class="analysis-daily-value">${formatShortAmount(item.amount)}</strong>
        </div>
    `).join('');
}

function renderAnalysisInsights({ breakdownList, topDay, totalSum, spendingDayCount, dailyAverage }) {
    const container = document.getElementById('analysis-insights-list');
    if (!container) return;

    if (totalSum <= 0) {
        container.innerHTML = '<div class="analysis-insight-item">Chưa đủ dữ liệu để tạo nhận xét cho tháng này.</div>';
        return;
    }

    const insights = [
        `${spendingDayCount} ngày có phát sinh chi tiêu, trung bình ${formatCurrency(dailyAverage)} mỗi ngày có giao dịch.`,
        `${breakdownList[0].category} là nhóm chi lớn nhất, chiếm ${breakdownList[0].pct}% tổng chi tháng này.`,
        topDay ? `Ngày ${String(topDay.day).padStart(2, '0')}/${String(analysisMonth + 1).padStart(2, '0')} là ngày chi nhiều nhất với ${formatCurrency(topDay.amount)}.` : ''
    ].filter(Boolean);

    container.innerHTML = insights.map(item => `<div class="analysis-insight-item">${item}</div>`).join('');
}

function renderAnalysisTopExpenses(monthExpenses) {
    const container = document.getElementById('analysis-top-expenses');
    if (!container) return;

    const topExpenses = [...monthExpenses]
        .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
        .slice(0, 5);

    if (topExpenses.length === 0) {
        container.innerHTML = '<div class="analysis-empty-state">Chưa có khoản chi nổi bật.</div>';
        return;
    }

    container.innerHTML = topExpenses.map(exp => {
        const style = CATEGORY_STYLES[exp.category] || CATEGORY_STYLES['Khác'];
        const day = String(String(exp.date || '').split('T')[0].split('-')[2] || '').padStart(2, '0');
        return `
            <div class="analysis-expense-row">
                <div class="analysis-expense-icon" style="background: ${style.bg};">${style.emoji}</div>
                <div class="analysis-expense-info">
                    <div class="analysis-expense-title">${exp.title || 'Không có tên'}</div>
                    <div class="analysis-expense-meta">${exp.category || 'Khác'} · ${day}/${String(analysisMonth + 1).padStart(2, '0')}</div>
                </div>
                <strong class="analysis-expense-amount">-${formatCurrency(Number(exp.amount) || 0)}</strong>
            </div>
        `;
    }).join('');
}

// HIỂN THỊ CHI TIÊU THEO THỂ LOẠI (POPUP)
function showCategoryExpenses(categoryName, monthExpenses) {
    const catExpenses = (monthExpenses || state.expenses)
        .filter(e => (e.category || 'Khác') === categoryName)
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.id || '').localeCompare(String(a.id || '')));
    const style = CATEGORY_STYLES[categoryName] || CATEGORY_STYLES['Khác'];
    const total = catExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    let overlay = document.getElementById('category-popup-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'category-popup-overlay';
        overlay.className = 'analysis-category-popup-overlay';
        const analysisPage = document.getElementById('spending-analysis-page');
        (analysisPage || document.body).appendChild(overlay);
    }

    overlay.innerHTML = `
        <div class="analysis-category-popup" role="dialog" aria-modal="true" aria-label="Chi tiết ${categoryName}" style="--category-color: ${style.color};">
            <div class="analysis-popup-header">
                <div class="analysis-popup-category">
                    <div class="analysis-popup-emoji" style="background: ${style.bg};">${style.emoji}</div>
                    <div>
                        <span class="analysis-overline">CHI TIẾT DANH MỤC</span>
                        <h3>${categoryName}</h3>
                    </div>
                </div>
                <button class="analysis-popup-close" type="button" data-close-category-popup aria-label="Đóng danh sách chi tiêu"><i data-lucide="x"></i></button>
            </div>
            <div class="analysis-popup-total">
                <span>Tổng trong tháng</span>
                <strong>${formatCurrency(total)}</strong>
            </div>
            <div class="analysis-popup-list">
                ${catExpenses.length === 0
                    ? '<div class="analysis-empty-state">Không có khoản chi nào.</div>'
                    : catExpenses.map(exp => `
                        <div class="analysis-popup-expense" data-expense-id="${exp.id}">
                            <div>
                                <strong>${exp.title || 'Không có tên'}</strong>
                                <span>${formatDateTimeVietnamese(exp)}</span>
                            </div>
                            <b>-${formatCurrency(Number(exp.amount) || 0)}</b>
                        </div>
                    `).join('')}
            </div>
        </div>
    `;

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    const closeButton = overlay.querySelector('[data-close-category-popup]');
    if (closeButton) closeButton.addEventListener('click', closeCategoryExpensesPopup);
    overlay.querySelectorAll('.analysis-popup-expense[data-expense-id]').forEach(expenseRow => {
        expenseRow.addEventListener('click', () => {
            const expenseId = expenseRow.getAttribute('data-expense-id');
            closeCategoryExpensesPopup();
            openDetailModal(expenseId);
        });
    });
    overlay.onclick = event => {
        if (event.target === overlay) {
            closeCategoryExpensesPopup();
        }
    };
    createLucideIcons();
}

function closeCategoryExpensesPopup() {
    const overlay = document.getElementById('category-popup-overlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
}

// HIỂN THỊ DANH SÁCH LỊCH SỬ (HISTORY TAB)
function renderHistoryList() {

    const historyListContainer = document.getElementById('history-spendings-list');
    historyListContainer.innerHTML = '';

    // Lọc dữ liệu theo Từ khóa tìm kiếm
    let filtered = state.expenses;

    if (state.searchQuery.trim() !== '') {
        const query = state.searchQuery.toLowerCase().trim();
        filtered = filtered.filter(exp => 
            exp.title.toLowerCase().includes(query) || 
            exp.amount.toString().includes(query)
        );
    }

    if (filtered.length === 0) {
        historyListContainer.innerHTML = `
            <div class="empty-state">
                <i data-lucide="search-code"></i>
                <p>Không tìm thấy khoản chi tiêu nào phù hợp.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    // Nhóm giao dịch theo ngày chi tiêu
    const groups = {};
    filtered.forEach(exp => {
        if (!groups[exp.date]) {
            groups[exp.date] = [];
        }
        groups[exp.date].push(exp);
    });

    // Sắp xếp ngày mới nhất lên trên
    const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    sortedDates.forEach(dateStr => {
        // Vẽ header ngày
        const headerEl = document.createElement('div');
        headerEl.className = 'transaction-group-date';
        headerEl.innerText = formatDateStringVietnamese(dateStr);
        historyListContainer.appendChild(headerEl);

        // Vẽ các giao dịch trong ngày
        groups[dateStr].forEach(exp => {
            const itemEl = createTransactionDOMItem(exp);
            historyListContainer.appendChild(itemEl);
        });
    });

    createLucideIcons();
}



// XUẤT DỮ LIỆU SANG JSON
function exportData() {
    const dataStr = JSON.stringify({
        expenses: state.expenses,
        budget: state.budget,
        version: "1.0"
    }, null, 2);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '_');
    const filename = `ispend_backup_${dateStr}.json`;

    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// NHẬP DỮ LIỆU TỪ FILE JSON
function importData(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported && Array.isArray(imported.expenses)) {
                // Hợp nhất hoặc ghi đè (ở đây chúng ta ghi đè)
                state.expenses = imported.expenses;
                if (imported.budget && typeof imported.budget === 'number') {
                    state.budget = imported.budget;
                }
                saveData();
                updateUI();
                alert('Nhập dữ liệu thành công! Đã khôi phục ' + state.expenses.length + ' khoản chi tiêu.');
                switchTab('dashboard');
            } else {
                alert('Tệp sao lưu không hợp lệ. Vui lòng thử lại!');
            }
        } catch (err) {
            console.error("Lỗi đọc file backup:", err);
            alert('Có lỗi xảy ra khi đọc tệp backup. Hãy chắc chắn đó là tệp .json hợp lệ!');
        }
    };
    reader.readAsText(file);
}

// XÓA TOÀN BỘ DỮ LIỆU
function clearAllData() {
    if (confirm('CẢNH BÁO: Hành động này sẽ xóa vĩnh viễn TOÀN BỘ lịch sử chi tiêu của bạn trên thiết bị này. Bạn có chắc chắn muốn tiếp tục không?')) {
        state.expenses = [];
        saveData();
        updateUI();
        alert('Đã xóa sạch dữ liệu.');
        switchTab('dashboard');
    }
}

// Bản đồ ánh xạ từ mã Icon Lucide sang Emoji tương ứng để chạy offline
const LUCIDE_EMOJI_FALLBACKS = {
    "layout-dashboard": "📊",
    "receipt": "📝",
    "plus": "➕",
    "pie-chart": "📈",
    "calendar": "📅",
    "trending-up": "📈",
    "credit-card": "💳",
    "database": "💾",
    "search": "🔍",
    "tag": "🏷️",
    "file-text": "📄",
    "check": "✅",
    "x": "❌",
    "trash-2": "🗑️",
    "camera": "📷",
    "image": "🖼️",
    "inbox": "📥",
    "layout-grid": "⊞",
    "piggy-bank": "🐷",
    "landmark": "🏦",
    "target": "🎯",
    "alert-circle": "⚠️",
    "sigma": "∑",
    "bookmark": "🔖",
    "sparkles": "✨",
    "edit-3": "✏️",
    "minus": "➖",
    "wallet": "👛"
};

// Hàm bổ trợ gọi Lucide Icons an toàn
function createLucideIcons() {
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    } else {
        console.warn("Lucide Icons is not loaded. Using emoji fallback.");
        const icons = document.querySelectorAll('i[data-lucide]');
        icons.forEach(icon => {
            const iconName = icon.getAttribute('data-lucide');
            const fallbackEmoji = LUCIDE_EMOJI_FALLBACKS[iconName];
            if (fallbackEmoji) {
                icon.innerHTML = fallbackEmoji;
                icon.style.fontStyle = 'normal';
                icon.style.fontSize = '1.25rem';
                icon.style.display = 'inline-flex';
                icon.style.alignItems = 'center';
                icon.style.justifyContent = 'center';
            }
        });
    }
}

// ==========================================================================
// TRANG CHÍNH: XIN CHÀO & CHỌN TÍNH NĂNG (WELCOME HUB PAGE)
// ==========================================================================

function showWelcomeHubPage() {
    const welcomeEl = document.getElementById('welcome-hub-page');
    if (welcomeEl) {
        welcomeEl.classList.add('active');
        welcomeEl.setAttribute('aria-hidden', 'false');
    }
    updateWelcomeDate();

    // Đóng tất cả các modal/trang chức năng khác nếu đang mở
    const modalsToClose = [
        'saver-page-modal',
        'ckkn-modal',
        'todo-modal',
        'notes-modal',
        'spending-analysis-page'
    ];
    modalsToClose.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('active');
            el.setAttribute('aria-hidden', 'true');
        }
    });

    createLucideIcons();
}

function hideWelcomeHubPage() {
    const welcomeEl = document.getElementById('welcome-hub-page');
    if (welcomeEl) {
        welcomeEl.classList.remove('active');
        welcomeEl.setAttribute('aria-hidden', 'true');
    }
}

function navigateToFeature(featureName) {
    hideWelcomeHubPage();

    if (featureName === 'thuchi') {
        switchTab('dashboard');
    } else if (featureName === 'tietkiem') {
        openSaverModal();
    } else if (featureName === 'suckhoe') {
        openCkknModal();
    } else if (featureName === 'congviec') {
        openTodoModal();
    } else if (featureName === 'ghichu') {
        if (typeof window.openNotesModal === 'function') {
            window.openNotesModal();
        }
    }
}

function updateWelcomeDate() {
    const dateEl = document.getElementById('welcome-current-date');
    if (!dateEl) return;
    const now = new Date();
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = days[now.getDay()];
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    dateEl.textContent = `${dayName}, ${day} Tháng ${month}, ${year}`;
}

window.showWelcomeHubPage = showWelcomeHubPage;
window.hideWelcomeHubPage = hideWelcomeHubPage;
window.navigateToFeature = navigateToFeature;
window.showOptionsModal = showWelcomeHubPage;
window.hideOptionsModal = hideWelcomeHubPage;
window.selectHubFeature = navigateToFeature;

// ==========================================================================
// SUPABASE AUTHENTICATION & SYNCHRONIZATION HELPERS
// ==========================================================================

function showLoginScreen() {
    const loginOverlay = document.getElementById('login-screen');
    if (loginOverlay) {
        loginOverlay.classList.remove('fade-out');
        loginOverlay.style.display = 'flex';
    }
}

function hideLoginScreen() {
    const loginOverlay = document.getElementById('login-screen');
    if (loginOverlay) {
        loginOverlay.classList.add('fade-out');
        setTimeout(() => {
            loginOverlay.style.display = 'none';
        }, 350);
    }
}

function showLogoutButton() {
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) btnLogout.style.display = 'inline-flex';
}

function hideLogoutButton() {
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) btnLogout.style.display = 'none';
}

function showLoginError(msg) {
    const errorEl = document.getElementById('login-error-msg');
    if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    }
}

function setCurrentSupabaseUser(user) {
    const nextUserId = user && user.id ? user.id : null;
    if (state.currentUserId === nextUserId) return;

    state.currentUserId = nextUserId;
    if (nextUserId) {
        loadExpenseDataForCurrentUser();
        loadSaverData();
        if (window.NotesModule && typeof window.NotesModule.setCurrentUser === 'function') {
            window.NotesModule.setCurrentUser(nextUserId);
        }
    } else {
        state.expenses = [];
        state.savers = [];
        updateUI();
        renderSaverTable();
        if (window.NotesModule && typeof window.NotesModule.setCurrentUser === 'function') {
            window.NotesModule.setCurrentUser(null);
        }
    }
}

// Kiểm tra phiên đăng nhập Supabase Auth
async function checkAuthSession() {
    if (!supabaseClient) return;
    
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.user) {
            setCurrentSupabaseUser(session.user);
            hideLoginScreen();
            showLogoutButton();
            setupRealtimeSubscription();
            fetchExpensesFromSupabase();
            fetchSaversFromSupabase();
            showOptionsModal();
        } else {
            setCurrentSupabaseUser(null);
            showLoginScreen();
            hideLogoutButton();
        }
    } catch (e) {
        console.warn("Lỗi kiểm tra Auth session:", e);
        showLoginScreen();
    }
}

// Đăng ký nhận sự thay đổi dữ liệu thời gian thực (Real-time listener)
function setupRealtimeSubscription() {
    if (!supabaseClient) return;
    if (supabaseSubscription) {
        try { supabaseSubscription.unsubscribe(); } catch(e){}
    }
    
    if (!state.currentUserId) return;

    supabaseSubscription = supabaseClient
        .channel(`money-data-realtime-${state.currentUserId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'expenses',
            filter: `user_id=eq.${state.currentUserId}`
        }, payload => {
            handleRealtimeDbChange(payload);
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'savers',
            filter: `user_id=eq.${state.currentUserId}`
        }, payload => {
            handleRealtimeSaverChange(payload);
        })
        .subscribe();
}

// Xử lý Sự kiện Submit Form Đăng nhập Meta/Supabase Auth
async function handleLogin(e) {
    if (e) e.preventDefault();
    
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const errorMsgEl = document.getElementById('login-error-msg');
    const submitBtn = document.getElementById('btn-login-submit');
    const btnText = document.getElementById('btn-login-text');

    const email = (emailInput ? emailInput.value : '').trim();
    const password = (passwordInput ? passwordInput.value : '').trim();

    if (!email || !password) {
        showLoginError("Vui lòng nhập đầy đủ email và mật khẩu.");
        return;
    }

    if (!supabaseClient) {
        initSupabase();
    }
    if (!supabaseClient) {
        showLoginError("Không thể kết nối dịch vụ xác thực Supabase.");
        return;
    }

    if (errorMsgEl) errorMsgEl.style.display = 'none';
    if (submitBtn) submitBtn.disabled = true;
    if (btnText) btnText.textContent = "Logging in...";

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            console.warn("Đăng nhập Supabase thất bại:", error.message);
            let friendlyError = "Email hoặc mật khẩu không chính xác.";
            if (error.message.includes("Invalid login credentials")) {
                friendlyError = "Email hoặc mật khẩu không chính xác.";
            } else if (error.message.includes("Email not confirmed")) {
                friendlyError = "Tài khoản email chưa được xác nhận trên Supabase.";
            } else {
                friendlyError = error.message;
            }
            showLoginError(friendlyError);
        } else if (data && data.session) {
            // Đăng nhập thành công
            setCurrentSupabaseUser(data.session.user);
            if (errorMsgEl) errorMsgEl.style.display = 'none';
            hideLoginScreen();
            showLogoutButton();
            setupRealtimeSubscription();
            fetchExpensesFromSupabase();
            fetchSaversFromSupabase();
            showOptionsModal();
        }
    } catch (err) {
        console.error("Lỗi đăng nhập:", err);
        showLoginError("Lỗi kết nối máy chủ. Vui lòng thử lại.");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (btnText) btnText.textContent = "Log in";
    }
}

// Đăng xuất khỏi hệ thống
async function handleLogout() {
    if (confirm("Bạn có chắc chắn muốn đăng xuất khỏi ứng dụng?")) {
        if (supabaseClient) {
            try {
                await supabaseClient.auth.signOut();
            } catch (e) {
                console.warn("Lỗi đăng xuất:", e);
            }
        }
        setCurrentSupabaseUser(null);
        showLoginScreen();
        hideLogoutButton();
    }
}

// Khởi tạo Supabase Client và Đăng ký Real-time listener & Auth
function initSupabase() {
    if (typeof supabase === 'undefined') {
        console.warn("Supabase SDK chưa nạp.");
        return;
    }
    
    if (!state.supabaseUrl || !state.supabaseKey) return;
    
    try {
        supabaseClient = supabase.createClient(state.supabaseUrl, state.supabaseKey, {
            auth: { persistSession: true, autoRefreshToken: true },
            realtime: { timeout: 5000 }
        });
        
        // Đăng ký Event Listeners cho Login Form và Logout Button
        const loginForm = document.getElementById('login-form');
        if (loginForm && !loginForm.dataset.authBound) {
            loginForm.addEventListener('submit', handleLogin);
            loginForm.dataset.authBound = 'true';
        }
        
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout && !btnLogout.dataset.authBound) {
            btnLogout.addEventListener('click', handleLogout);
            btnLogout.dataset.authBound = 'true';
        }
        
        // Lắng nghe sự thay đổi trạng thái xác thực từ Supabase Auth
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (session && session.user) {
                setCurrentSupabaseUser(session.user);
                hideLoginScreen();
                showLogoutButton();
                setupRealtimeSubscription();
                fetchSaversFromSupabase();
            } else if (event === 'SIGNED_OUT') {
                setCurrentSupabaseUser(null);
                showLoginScreen();
                hideLogoutButton();
            }
        });
        
        // Kiểm tra phiên làm việc ban đầu
        checkAuthSession();
            
    } catch (err) {
        console.warn("Lỗi khởi tạo Supabase:", err);
    }
}

// Chỉ lấy các cột dùng cho giao diện. Tránh tải nhầm các cột lớn (ví dụ ảnh/base64)
// nếu bảng Supabase được mở rộng thêm trong tương lai.
const EXPENSE_SELECT_FIELDS = 'id,user_id,date,title,amount,category,created_at';

// Lấy danh sách chi tiêu từ Supabase với Timeout 3.5s cực kỳ an toàn
async function fetchExpensesFromSupabase() {
    if (!supabaseClient || !state.currentUserId) return;

    // Timeout 3.5s bằng AbortController để ngăn iOS bị đơ/treo mạng
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
        const { data, error } = await supabaseClient
            .from('expenses')
            .select(EXPENSE_SELECT_FIELDS)
            .eq('user_id', state.currentUserId)
            .abortSignal(controller.signal);
            
        clearTimeout(timeoutId);
            
        if (error) throw error;
        
        if (data && Array.isArray(data)) {
            // Hợp nhất dữ liệu Cloud và Local (không xóa mất khoản vừa tạo)
            mergeLocalAndRemoteExpenses(data);
        }
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            console.warn("⚡ Fetch Supabase quá 3.5s - Tự động ưu tiên dữ liệu bộ nhớ máy.");
        } else {
            console.warn("Lỗi fetch Supabase:", err.message || err);
        }
    }
}

// Hợp nhất dữ liệu cloud và local
function mergeLocalAndRemoteExpenses(remoteData) {
    const remoteMap = new Map();
    remoteData.forEach(item => {
        if (item && item.id) remoteMap.set(item.id, item);
    });

    // Keep only unsynced records owned by the current account.
    state.expenses.forEach(localItem => {
        if (localItem && localItem.id && localItem.user_id === state.currentUserId && !remoteMap.has(localItem.id)) {
            remoteMap.set(localItem.id, localItem);
        }
    });

    state.expenses = Array.from(remoteMap.values());
    sortExpenses();
    saveData();
    updateUI();
}

// Xử lý sự kiện Real-time từ DB
function handleRealtimeDbChange(payload) {
    console.log("Phát hiện thay đổi DB Real-time:", payload);
    const eventType = payload.eventType;
    const newRecord = payload.new;
    const oldRecord = payload.old;

    const changedRecord = eventType === 'DELETE' ? oldRecord : newRecord;
    if (!changedRecord || changedRecord.user_id !== state.currentUserId) return;
    
    if (eventType === 'INSERT') {
        if (!state.expenses.some(e => e.id === newRecord.id)) {
            state.expenses.unshift(newRecord);
            sortExpenses();
        }
    } else if (eventType === 'DELETE') {
        state.expenses = state.expenses.filter(e => e.id !== oldRecord.id);
    } else if (eventType === 'UPDATE') {
        const idx = state.expenses.findIndex(e => e.id === newRecord.id);
        if (idx !== -1) {
            state.expenses[idx] = newRecord;
            sortExpenses();
        }
    }
    
    saveData();
    updateUI();
}

function normalizeSaverRecord(item) {
    return {
        id: String(item.id),
        title: item.title || 'Mục tiết kiệm',
        momo: Number(item.momo) || 0,
        bank: Number(item.bank) || 0,
        target: Number(item.target) || 0,
        debt: Number(item.debt) || 0
    };
}

function getSaverSupabasePayload(item) {
    return {
        id: String(item.id),
        user_id: state.currentUserId,
        title: item.title || 'Mục tiết kiệm',
        momo: Number(item.momo) || 0,
        bank: Number(item.bank) || 0,
        target: Number(item.target) || 0,
        debt: Number(item.debt) || 0
    };
}

function syncSaverItemToSupabase(item) {
    if (!supabaseClient || !state.currentUserId || !item) return Promise.resolve();

    return supabaseClient
        .from('savers')
        .upsert([getSaverSupabasePayload(item)], { onConflict: 'user_id,id' })
        .then(({ error }) => {
            if (error) {
                console.warn('Lỗi lưu mục Saver lên Supabase:', error.message || error);
            }
        });
}

function deleteSaverFromSupabase(id) {
    if (!supabaseClient || !state.currentUserId) return Promise.resolve();

    return supabaseClient
        .from('savers')
        .delete()
        .eq('id', id)
        .eq('user_id', state.currentUserId)
        .then(({ error }) => {
            if (error) {
                console.warn('Lỗi xóa mục Saver trên Supabase:', error.message || error);
            }
        });
}

async function syncAllSaversToSupabase() {
    if (!supabaseClient || !state.currentUserId || state.savers.length === 0) return;
    await Promise.all(state.savers.map(item => syncSaverItemToSupabase(item)));
}

async function fetchSaversFromSupabase() {
    if (!supabaseClient || !state.currentUserId) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
        const { data, error } = await supabaseClient
            .from('savers')
            .select('*')
            .eq('user_id', state.currentUserId)
            .order('created_at', { ascending: true })
            .abortSignal(controller.signal);

        clearTimeout(timeoutId);
        if (error) throw error;

        if (Array.isArray(data) && data.length > 0) {
            state.savers = data.map(normalizeSaverRecord);
            saveSaverData();
            renderSaverTable();
        } else {
            // Lan dau dang nhap: dua du lieu local hien co len cloud.
            await syncAllSaversToSupabase();
        }
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            console.warn('Fetch Saver Supabase qua 3.5s - uu tien du lieu local.');
        } else {
            console.warn('Lỗi fetch Saver Supabase:', err.message || err);
        }
    }
}

function handleRealtimeSaverChange(payload) {
    const eventType = payload.eventType;
    const newRecord = payload.new;
    const oldRecord = payload.old;

    if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord) {
        if (newRecord.user_id !== state.currentUserId) return;

        const normalized = normalizeSaverRecord(newRecord);
        const index = state.savers.findIndex(item => item.id === normalized.id);
        if (index === -1) {
            state.savers.push(normalized);
        } else {
            state.savers[index] = normalized;
        }
    } else if (eventType === 'DELETE' && oldRecord) {
        state.savers = state.savers.filter(item => item.id !== String(oldRecord.id));
    } else {
        return;
    }

    saveSaverData();
    renderSaverTable();
}

// ==========================================================================
// MÔ-ĐUN QUẢN LÝ TIẾT KIỆM (SAVER)
// ==========================================================================

const FIELD_LABELS = {
    momo: 'MoMo',
    bank: 'Ngân hàng',
    target: 'Mục tiêu tiền',
    debt: 'Tiền thiếu nợ'
};

function openSaverModal(e) {
    if (e && e.preventDefault) e.preventDefault();
    const modalEl = document.getElementById('saver-page-modal');
    if (modalEl) {
        modalEl.classList.add('active');
        modalEl.setAttribute('aria-hidden', 'false');
    }
    renderSaverTable();
}

function closeSaverModal(returnToHub = true) {
    const modalEl = document.getElementById('saver-page-modal');
    if (modalEl) {
        modalEl.classList.remove('active');
        modalEl.setAttribute('aria-hidden', 'true');
    }
    if (returnToHub && typeof showOptionsModal === 'function') {
        showOptionsModal();
    }
}

function renderSaverTable() {
    const tableBody = document.getElementById('saver-table-body');
    if (!tableBody) return;

    let totalMomo = 0;
    let totalBank = 0;
    let totalTarget = 0;
    let totalDebt = 0;

    state.savers.forEach(item => {
        totalMomo += (item.momo || 0);
        totalBank += (item.bank || 0);
        totalTarget += (item.target || 0);
        totalDebt += (item.debt || 0);
    });

    // Cập nhật các thẻ tổng quan
    const sumMomoEl = document.getElementById('saver-sum-momo');
    if (sumMomoEl) sumMomoEl.innerText = formatCurrency(totalMomo);

    const sumBankEl = document.getElementById('saver-sum-bank');
    if (sumBankEl) sumBankEl.innerText = formatCurrency(totalBank);

    const sumTargetEl = document.getElementById('saver-sum-target');
    if (sumTargetEl) sumTargetEl.innerText = formatCurrency(totalTarget);

    const sumDebtEl = document.getElementById('saver-sum-debt');
    if (sumDebtEl) sumDebtEl.innerText = formatCurrency(totalDebt);

    // Render danh sách các hàng mục tiết kiệm
    tableBody.innerHTML = '';

    if (state.savers.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 28px 10px; color: var(--text-secondary);">
                    <div style="font-size: 1.8rem; margin-bottom: 6px;">🐷</div>
                    <p style="font-size: 0.84rem;">Chưa có mục tiết kiệm nào. Hãy bấm <b>Thêm mục</b> để tạo mới!</p>
                </td>
            </tr>
        `;
        createLucideIcons();
        return;
    }

    state.savers.forEach(item => {
        const itemSaved = (item.momo || 0) + (item.bank || 0);
        const itemTarget = item.target || 0;
        const itemPct = itemTarget > 0 ? Math.min(((itemSaved / itemTarget) * 100), 100).toFixed(1) : 0;
        const pctColor = itemPct >= 100 ? '#2e7d32' : (itemPct >= 50 ? '#b87910' : 'var(--accent-coral)');

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="saver-card-heading">
                    <div class="saver-title-cell">
                        <i data-lucide="bookmark"></i>
                        <span>${escapeHtml(item.title || 'Mục tiết kiệm')}</span>
                    </div>
                    <div class="saver-actions-cell">
                        <button type="button" class="btn-saver-action" onclick="openEditSaverModal('${item.id}')" title="Chỉnh sửa">
                            <i data-lucide="edit-3"></i>
                        </button>
                        <button type="button" class="btn-saver-action btn-delete" onclick="deleteSaverItem('${item.id}')" title="Xóa">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </div>
                <div class="saver-row-progress">
                    <div class="saver-row-progress-track">
                        <div class="saver-row-progress-bar" style="width: ${itemPct}%; background: ${pctColor};"></div>
                    </div>
                    <span class="saver-row-progress-label" style="color: ${pctColor};">${itemPct}%</span>
                </div>
            </td>
            <td style="text-align: right;">
                <button type="button" class="money-cell-btn momo-cell" onclick="openAdjustAmountModal('${item.id}', 'momo')" title="Chạm để tăng/giảm tiền MoMo">
                    ${formatCurrency(item.momo || 0)}
                </button>
            </td>
            <td style="text-align: right;">
                <button type="button" class="money-cell-btn bank-cell" onclick="openAdjustAmountModal('${item.id}', 'bank')" title="Chạm để tăng/giảm tiền Ngân hàng">
                    ${formatCurrency(item.bank || 0)}
                </button>
            </td>
            <td style="text-align: right;">
                <button type="button" class="money-cell-btn target-cell" onclick="openAdjustAmountModal('${item.id}', 'target')" title="Chạm để tăng/giảm mục tiêu">
                    ${formatCurrency(item.target || 0)}
                </button>
            </td>
            <td style="text-align: right;">
                <button type="button" class="money-cell-btn debt-cell" onclick="openAdjustAmountModal('${item.id}', 'debt')" title="Chạm để tăng/giảm tiền thiếu nợ">
                    ${formatCurrency(item.debt || 0)}
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    createLucideIcons();
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function openAddSaverModal() {
    const idInput = document.getElementById('saver-item-id');
    if (idInput) idInput.value = '';

    const titleHeader = document.getElementById('add-saver-modal-title');
    if (titleHeader) titleHeader.innerText = 'Thêm mục tiết kiệm';

    const form = document.getElementById('add-saver-form');
    if (form) form.reset();

    const modalEl = document.getElementById('add-saver-modal');
    if (modalEl) modalEl.classList.add('active');
}

function openEditSaverModal(id) {
    const item = state.savers.find(s => s.id === id);
    if (!item) return;

    const idInput = document.getElementById('saver-item-id');
    if (idInput) idInput.value = item.id;

    const titleHeader = document.getElementById('add-saver-modal-title');
    if (titleHeader) titleHeader.innerText = 'Chỉnh sửa mục tiết kiệm';

    const titleInput = document.getElementById('saver-input-title');
    if (titleInput) titleInput.value = item.title || '';

    const momoInput = document.getElementById('saver-input-momo');
    if (momoInput) momoInput.value = (item.momo || 0).toLocaleString('vi-VN');

    const bankInput = document.getElementById('saver-input-bank');
    if (bankInput) bankInput.value = (item.bank || 0).toLocaleString('vi-VN');

    const targetInput = document.getElementById('saver-input-target');
    if (targetInput) targetInput.value = (item.target || 0).toLocaleString('vi-VN');

    const debtInput = document.getElementById('saver-input-debt');
    if (debtInput) debtInput.value = (item.debt || 0).toLocaleString('vi-VN');

    const modalEl = document.getElementById('add-saver-modal');
    if (modalEl) modalEl.classList.add('active');
}

function closeAddSaverModal() {
    const modalEl = document.getElementById('add-saver-modal');
    if (modalEl) modalEl.classList.remove('active');
    const form = document.getElementById('add-saver-form');
    if (form) form.reset();
}

async function handleAddSaverSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const idInput = document.getElementById('saver-item-id');
    const id = idInput ? idInput.value : '';

    const titleInput = document.getElementById('saver-input-title');
    const title = titleInput ? titleInput.value.trim() : '';

    if (!title) {
        alert('Vui lòng nhập tên mục tiết kiệm!');
        return;
    }

    const momoRaw = document.getElementById('saver-input-momo').value.replace(/\D/g, '');
    const momo = parseInt(momoRaw, 10) || 0;

    const bankRaw = document.getElementById('saver-input-bank').value.replace(/\D/g, '');
    const bank = parseInt(bankRaw, 10) || 0;

    const targetRaw = document.getElementById('saver-input-target').value.replace(/\D/g, '');
    const target = parseInt(targetRaw, 10) || 0;

    const debtRaw = document.getElementById('saver-input-debt').value.replace(/\D/g, '');
    const debt = parseInt(debtRaw, 10) || 0;

    let saverToSync = null;

    if (id) {
        // Cập nhật mục hiện có
        const existing = state.savers.find(s => s.id === id);
        if (existing) {
            existing.title = title;
            existing.momo = momo;
            existing.bank = bank;
            existing.target = target;
            existing.debt = debt;
            saverToSync = existing;
        }
    } else {
        // Thêm mục mới
        const newSaver = {
            id: 'saver-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            title: title,
            momo: momo,
            bank: bank,
            target: target,
            debt: debt
        };
        state.savers.push(newSaver);
        saverToSync = newSaver;
    }

    saveSaverData();
    renderSaverTable();
    closeAddSaverModal();

    if (saverToSync) {
        await syncSaverItemToSupabase(saverToSync);
    }
}

async function deleteSaverItem(id) {
    const item = state.savers.find(s => s.id === id);
    if (!item) return;

    if (confirm(`Bạn có chắc muốn xóa mục tiết kiệm "${item.title}" không?`)) {
        state.savers = state.savers.filter(s => s.id !== id);
        saveSaverData();
        renderSaverTable();
        await deleteSaverFromSupabase(id);
    }
}

// Chức năng điều chỉnh số tiền (Tăng / Giảm)
function openAdjustAmountModal(saverId, field) {
    const item = state.savers.find(s => s.id === saverId);
    if (!item) return;

    currentAdjustingSaverId = saverId;
    currentAdjustingField = field;

    const fieldLabel = FIELD_LABELS[field] || field;
    const subtitleEl = document.getElementById('adjust-modal-subtitle');
    if (subtitleEl) {
        subtitleEl.innerText = `Mục: ${item.title} · ${fieldLabel}`;
    }

    const currentValEl = document.getElementById('adjust-current-val');
    if (currentValEl) {
        currentValEl.innerText = formatCurrency(item[field] || 0);
    }

    const customInput = document.getElementById('adjust-custom-input');
    if (customInput) customInput.value = '';

    const modalEl = document.getElementById('adjust-saver-amount-modal');
    if (modalEl) modalEl.classList.add('active');
}

function closeAdjustAmountModal() {
    const modalEl = document.getElementById('adjust-saver-amount-modal');
    if (modalEl) modalEl.classList.remove('active');
    currentAdjustingSaverId = null;
    currentAdjustingField = null;
}

function quickAdjustAmount(delta) {
    if (!currentAdjustingSaverId || !currentAdjustingField) return;

    const item = state.savers.find(s => s.id === currentAdjustingSaverId);
    if (!item) return;

    const currentAmt = item[currentAdjustingField] || 0;
    const newAmt = Math.max(0, currentAmt + delta);
    item[currentAdjustingField] = newAmt;

    saveSaverData();
    renderSaverTable();
    syncSaverItemToSupabase(item);

    const currentValEl = document.getElementById('adjust-current-val');
    if (currentValEl) {
        currentValEl.innerText = formatCurrency(newAmt);
    }
}

function applyCustomAdjust(mode) {
    if (!currentAdjustingSaverId || !currentAdjustingField) return;

    const item = state.savers.find(s => s.id === currentAdjustingSaverId);
    if (!item) return;

    const customInput = document.getElementById('adjust-custom-input');
    const rawVal = customInput ? customInput.value.replace(/\D/g, '') : '';
    const inputAmt = parseInt(rawVal, 10) || 0;

    if (inputAmt <= 0 && mode !== 'set') {
        alert('Vui lòng nhập số tiền hợp lệ lớn hơn 0!');
        return;
    }

    const currentAmt = item[currentAdjustingField] || 0;
    let newAmt = currentAmt;

    if (mode === 'add') {
        newAmt = currentAmt + inputAmt;
    } else if (mode === 'sub') {
        newAmt = Math.max(0, currentAmt - inputAmt);
    } else if (mode === 'set') {
        newAmt = Math.max(0, inputAmt);
    }

    item[currentAdjustingField] = newAmt;
    saveSaverData();
    renderSaverTable();
    syncSaverItemToSupabase(item);

    const currentValEl = document.getElementById('adjust-current-val');
    if (currentValEl) {
        currentValEl.innerText = formatCurrency(newAmt);
    }

    if (customInput) customInput.value = '';
    closeAdjustAmountModal();
}

// Đăng ký các hàm toàn cục cho onclick trong HTML
window.openSaverModal = openSaverModal;
window.closeSaverModal = closeSaverModal;
window.openAddSaverModal = openAddSaverModal;
window.openEditSaverModal = openEditSaverModal;
window.closeAddSaverModal = closeAddSaverModal;
window.handleAddSaverSubmit = handleAddSaverSubmit;
window.deleteSaverItem = deleteSaverItem;
window.openAdjustAmountModal = openAdjustAmountModal;
window.closeAdjustAmountModal = closeAdjustAmountModal;
window.quickAdjustAmount = quickAdjustAmount;
window.applyCustomAdjust = applyCustomAdjust;
