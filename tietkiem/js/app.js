/**
 * Money - Mô-đun Quản Lý Tiết Kiệm (tietkiem/js/app.js)
 * Hoạt động độc lập 100%, đồng bộ trực tiếp với bảng `savers` trên Supabase.
 */
(function() {
    'use strict';

    const SUPABASE_URL = 'https://ghdydszifdaiphcjguri.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZHlkc3ppZmRhaXBoY2pndXJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjAzOTgsImV4cCI6MjEwMDE5NjM5OH0.ZTpS0cdmmCO4eH41nXFGQpnAELgD5iMwOEpl_mG7S1c';

    let saverClient = null;
    let currentUserId = null;
    let saverSubscription = null;
    let savers = [];
    let currentAdjustingSaverId = null;
    let currentAdjustingField = null;

    const SAVER_FIELD_NAMES = {
        momo: 'Tiền MoMo',
        bank: 'Tiền Ngân hàng',
        target: 'Mục tiêu tiền',
        debt: 'Tiền thiếu nợ'
    };

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

    function initSupabase() {
        if (typeof supabase !== 'undefined' && supabase.createClient) {
            try {
                saverClient = window.__QLCT_SUPABASE_CLIENT || supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                    auth: { persistSession: true, autoRefreshToken: true },
                    realtime: { timeout: 5000 }
                });
                window.__QLCT_SUPABASE_CLIENT = saverClient;
            } catch (err) {
                console.warn('[Saver] Lỗi tạo Supabase client:', err);
            }
        }
    }

    function formatCurrency(num) {
        return (Number(num) || 0).toLocaleString('vi-VN') + ' VNĐ';
    }

    function parseAmountInput(val) {
        if (!val) return 0;
        const cleaned = String(val).replace(/\D/g, '');
        return cleaned ? parseInt(cleaned, 10) : 0;
    }

    function saveSaverData() {
        const storageKey = currentUserId ? `money_savers_${currentUserId}` : 'money_savers_local';
        try {
            localStorage.setItem(storageKey, JSON.stringify(savers));
        } catch (e) {
            console.warn('[Saver] Lỗi lưu LocalStorage:', e);
        }
    }

    function loadSaverData() {
        const storageKey = currentUserId ? `money_savers_${currentUserId}` : 'money_savers_local';
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                savers = JSON.parse(raw);
                if (!Array.isArray(savers)) savers = [];
            } else {
                savers = [];
            }
        } catch (e) {
            console.warn('[Saver] Lỗi đọc LocalStorage:', e);
            savers = [];
        }
        renderSaverTable();
    }

    async function fetchSaversFromSupabase() {
        if (!saverClient || !currentUserId) return;

        try {
            const { data, error } = await saverClient
                .from('savers')
                .select('*')
                .eq('user_id', currentUserId)
                .order('created_at', { ascending: false });

            if (error) {
                console.warn('[Saver] Lỗi tải từ Supabase:', error.message);
                return;
            }

            if (data && Array.isArray(data)) {
                savers = data.map(item => ({
                    id: String(item.id),
                    title: item.title || '',
                    momo: Number(item.momo) || 0,
                    bank: Number(item.bank) || 0,
                    target: Number(item.target) || 0,
                    debt: Number(item.debt) || 0,
                    createdAt: item.created_at || new Date().toISOString()
                }));
                saveSaverData();
                renderSaverTable();
            }
        } catch (err) {
            console.warn('[Saver] Lỗi kết nối:', err);
        }
    }

    async function syncSaverItemToSupabase(item) {
        if (!saverClient || !currentUserId || !item) return;

        try {
            const payload = {
                id: String(item.id),
                user_id: currentUserId,
                title: item.title,
                momo: Number(item.momo) || 0,
                bank: Number(item.bank) || 0,
                target: Number(item.target) || 0,
                debt: Number(item.debt) || 0,
                created_at: item.createdAt || new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            await saverClient
                .from('savers')
                .upsert([payload], { onConflict: 'user_id,id' });
        } catch (e) {
            console.warn('[Saver] Lỗi sync item:', e);
        }
    }

    async function deleteSaverItemFromSupabase(id) {
        if (!saverClient || !currentUserId) return;

        try {
            await saverClient
                .from('savers')
                .delete()
                .eq('user_id', currentUserId)
                .eq('id', String(id));
        } catch (e) {
            console.warn('[Saver] Lỗi xóa item:', e);
        }
    }

    function setupSaverRealtime() {
        if (!saverClient || !currentUserId) return;

        if (saverSubscription) {
            try { saverSubscription.unsubscribe(); } catch(e){}
        }

        try {
            saverSubscription = saverClient
                .channel(`money-savers-realtime-${currentUserId}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'savers',
                    filter: `user_id=eq.${currentUserId}`
                }, payload => {
                    handleRealtimeChange(payload);
                })
                .subscribe();
        } catch (e) {
            console.warn('[Saver] Lỗi setup realtime:', e);
        }
    }

    function handleRealtimeChange(payload) {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === 'INSERT') {
            if (newRow && !savers.some(s => s.id === String(newRow.id))) {
                savers.unshift({
                    id: String(newRow.id),
                    title: newRow.title || '',
                    momo: Number(newRow.momo) || 0,
                    bank: Number(newRow.bank) || 0,
                    target: Number(newRow.target) || 0,
                    debt: Number(newRow.debt) || 0,
                    createdAt: newRow.created_at
                });
                saveSaverData();
                renderSaverTable();
            }
        } else if (eventType === 'UPDATE') {
            if (newRow) {
                const idx = savers.findIndex(s => s.id === String(newRow.id));
                if (idx !== -1) {
                    savers[idx] = {
                        id: String(newRow.id),
                        title: newRow.title || '',
                        momo: Number(newRow.momo) || 0,
                        bank: Number(newRow.bank) || 0,
                        target: Number(newRow.target) || 0,
                        debt: Number(newRow.debt) || 0,
                        createdAt: newRow.created_at
                    };
                    saveSaverData();
                    renderSaverTable();
                }
            }
        } else if (eventType === 'DELETE') {
            if (oldRow && oldRow.id) {
                savers = savers.filter(s => s.id !== String(oldRow.id));
                saveSaverData();
                renderSaverTable();
            }
        }
    }

    function renderSaverTable() {
        const container = document.getElementById('saver-cards-container');
        if (!container) return;

        let totalMomo = 0;
        let totalBank = 0;
        let totalTarget = 0;
        let totalDebt = 0;

        // Calculate totals from ALL savers
        savers.forEach(item => {
            totalMomo += Number(item.momo) || 0;
            totalBank += Number(item.bank) || 0;
            totalTarget += Number(item.target) || 0;
            totalDebt += Number(item.debt) || 0;
        });

        if (savers.length === 0) {
            container.innerHTML = `
                <div class="saver-empty-state">
                    <div style="font-size: 2.5rem; margin-bottom: 8px;">💰</div>
                    <p style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">Chưa có mục tiết kiệm nào</p>
                    <p style="font-size: 0.78rem; color: var(--text-tertiary); margin-top: 4px;">Bấm nút <strong>(+)</strong> ở dưới để tạo mục đầu tiên.</p>
                </div>
            `;
            updateSaverSummary(0, 0, 0, 0);
            return;
        }

        // Apply search filter by title
        const searchInput = document.getElementById('saver-search-input');
        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const filteredSavers = searchTerm
            ? savers.filter(s => (s.title || '').toLowerCase().includes(searchTerm))
            : savers;

        if (filteredSavers.length === 0 && searchTerm) {
            container.innerHTML = `
                <div class="saver-empty-state">
                    <div style="font-size: 2.2rem; margin-bottom: 8px;">🔍</div>
                    <p style="font-weight: 700; color: var(--text-primary);">Không tìm thấy mục tiêu nào</p>
                    <p style="font-size: 0.78rem; color: var(--text-tertiary); margin-top: 4px;">Thử tìm kiếm với từ khóa khác</p>
                </div>
            `;
            updateSaverSummary(totalMomo, totalBank, totalTarget, totalDebt);
            return;
        }

        let html = '';
        filteredSavers.forEach(item => {
            const momo = Number(item.momo) || 0;
            const bank = Number(item.bank) || 0;
            const target = Number(item.target) || 0;
            const debt = Number(item.debt) || 0;

            const savedAmount = momo + bank;
            let progressPercent = target > 0 ? (savedAmount / target * 100).toFixed(1) : 0;
            // Clean up .0 if whole number
            if (String(progressPercent).endsWith('.0')) {
                progressPercent = parseInt(progressPercent, 10);
            }

            html += `
                <div class="saver-card" data-saver-id="${item.id}">
                    <div class="saver-card-header">
                        <div class="saver-card-title-row">
                            <i data-lucide="bookmark" class="saver-card-icon"></i>
                            <span class="saver-card-title">${escapeHtml(item.title)}</span>
                        </div>
                        <div class="saver-card-actions">
                            <button type="button" class="saver-card-action-btn" onclick="editSaverItem('${item.id}')" title="Sửa thông tin">
                                <i data-lucide="edit-2"></i>
                            </button>
                            <button type="button" class="saver-card-action-btn btn-delete" onclick="deleteSaverItem('${item.id}')" title="Xóa">
                                <i data-lucide="trash-2"></i>
                            </button>
                            ${target > 0 ? `<span class="saver-card-percent">${progressPercent}%</span>` : ''}
                        </div>
                    </div>

                    <div class="saver-card-grid">
                        <div class="saver-card-field">
                            <span class="saver-field-label">MOMO</span>
                            <button type="button" class="saver-field-value val-momo" onclick="openAdjustAmountModal('${item.id}', 'momo')" title="Bấm để điều chỉnh">
                                <span>${formatCurrency(momo)}</span>
                            </button>
                        </div>
                        <div class="saver-card-field">
                            <span class="saver-field-label">NGÂN HÀNG</span>
                            <button type="button" class="saver-field-value val-bank" onclick="openAdjustAmountModal('${item.id}', 'bank')" title="Bấm để điều chỉnh">
                                <span>${formatCurrency(bank)}</span>
                            </button>
                        </div>
                        <div class="saver-card-field">
                            <span class="saver-field-label">MỤC TIÊU</span>
                            <button type="button" class="saver-field-value val-target" onclick="openAdjustAmountModal('${item.id}', 'target')" title="Bấm để điều chỉnh">
                                <span>${formatCurrency(target)}</span>
                            </button>
                        </div>
                        <div class="saver-card-field">
                            <span class="saver-field-label">THIẾU NỢ</span>
                            <button type="button" class="saver-field-value ${debt > 0 ? 'val-debt-has' : 'val-debt-zero'}" onclick="openAdjustAmountModal('${item.id}', 'debt')" title="Bấm để điều chỉnh">
                                <span>${formatCurrency(debt)}</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        updateSaverSummary(totalMomo, totalBank, totalTarget, totalDebt);

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function updateSaverSummary(momo, bank, target, debt) {
        const momoEl = document.getElementById('saver-sum-momo');
        const bankEl = document.getElementById('saver-sum-bank');
        const targetEl = document.getElementById('saver-sum-target');
        const debtEl = document.getElementById('saver-sum-debt');

        if (momoEl) momoEl.textContent = formatCurrency(momo);
        if (bankEl) bankEl.textContent = formatCurrency(bank);
        if (targetEl) targetEl.textContent = formatCurrency(target);
        if (debtEl) debtEl.textContent = formatCurrency(debt);
    }

    function openAddSaverModal() {
        document.getElementById('saver-item-id').value = '';
        document.getElementById('saver-input-title').value = '';
        document.getElementById('saver-input-momo').value = '';
        document.getElementById('saver-input-bank').value = '';
        document.getElementById('saver-input-target').value = '';
        document.getElementById('saver-input-debt').value = '';
        document.getElementById('add-saver-modal-title').textContent = 'Thêm mục tiết kiệm';

        const modalEl = document.getElementById('add-saver-modal');
        if (modalEl) modalEl.classList.add('active');
        document.getElementById('saver-input-title').focus();
    }

    function closeAddSaverModal() {
        const modalEl = document.getElementById('add-saver-modal');
        if (modalEl) modalEl.classList.remove('active');
    }

    function editSaverItem(id) {
        const item = savers.find(s => s.id === String(id));
        if (!item) return;

        document.getElementById('saver-item-id').value = item.id;
        document.getElementById('saver-input-title').value = item.title;
        document.getElementById('saver-input-momo').value = (item.momo || 0).toLocaleString('vi-VN');
        document.getElementById('saver-input-bank').value = (item.bank || 0).toLocaleString('vi-VN');
        document.getElementById('saver-input-target').value = (item.target || 0).toLocaleString('vi-VN');
        document.getElementById('saver-input-debt').value = (item.debt || 0).toLocaleString('vi-VN');
        document.getElementById('add-saver-modal-title').textContent = 'Chỉnh sửa mục tiết kiệm';

        const modalEl = document.getElementById('add-saver-modal');
        if (modalEl) modalEl.classList.add('active');
    }

    function deleteSaverItem(id) {
        const item = savers.find(s => s.id === String(id));
        if (!item) return;

        if (confirm(`Bạn có chắc muốn xóa mục tiết kiệm "${item.title}"?`)) {
            savers = savers.filter(s => s.id !== String(id));
            saveSaverData();
            renderSaverTable();
            deleteSaverItemFromSupabase(id);
        }
    }

    function handleSaveSaver(e) {
        if (e) e.preventDefault();

        const idField = document.getElementById('saver-item-id').value;
        const title = document.getElementById('saver-input-title').value.trim();
        const momo = parseAmountInput(document.getElementById('saver-input-momo').value);
        const bank = parseAmountInput(document.getElementById('saver-input-bank').value);
        const target = parseAmountInput(document.getElementById('saver-input-target').value);
        const debt = parseAmountInput(document.getElementById('saver-input-debt').value);

        if (!title) {
            alert('Vui lòng nhập tên mục tiết kiệm');
            return;
        }

        if (idField) {
            const idx = savers.findIndex(s => s.id === idField);
            if (idx !== -1) {
                savers[idx].title = title;
                savers[idx].momo = momo;
                savers[idx].bank = bank;
                savers[idx].target = target;
                savers[idx].debt = debt;
                syncSaverItemToSupabase(savers[idx]);
            }
        } else {
            const newItem = {
                id: 'saver_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                title: title,
                momo: momo,
                bank: bank,
                target: target,
                debt: debt,
                createdAt: new Date().toISOString()
            };
            savers.unshift(newItem);
            syncSaverItemToSupabase(newItem);
        }

        saveSaverData();
        renderSaverTable();
        closeAddSaverModal();
    }

    function openAdjustAmountModal(id, field) {
        const item = savers.find(s => s.id === String(id));
        if (!item) return;

        currentAdjustingSaverId = String(id);
        currentAdjustingField = field;

        const subtitleEl = document.getElementById('adjust-modal-subtitle');
        const currentValEl = document.getElementById('adjust-current-val');
        const customInputEl = document.getElementById('adjust-custom-input');

        const fieldLabel = SAVER_FIELD_NAMES[field] || field;
        if (subtitleEl) subtitleEl.textContent = `Mục: ${item.title} · ${fieldLabel}`;
        const currentVal = Number(item[field]) || 0;
        if (currentValEl) currentValEl.textContent = currentVal.toLocaleString('vi-VN') + ' VNĐ';
        if (customInputEl) customInputEl.value = '';

        const modalEl = document.getElementById('adjust-saver-amount-modal');
        if (modalEl) modalEl.classList.add('active');
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function closeAdjustAmountModal() {
        const modalEl = document.getElementById('adjust-saver-amount-modal');
        if (modalEl) modalEl.classList.remove('active');
        currentAdjustingSaverId = null;
        currentAdjustingField = null;
    }

    function quickAdjustAmount(delta) {
        if (!currentAdjustingSaverId || !currentAdjustingField) return;

        const item = savers.find(s => s.id === currentAdjustingSaverId);
        if (!item) return;

        let currentVal = Number(item[currentAdjustingField]) || 0;
        let nextVal = Math.max(0, currentVal + delta);
        item[currentAdjustingField] = nextVal;

        saveSaverData();
        renderSaverTable();
        syncSaverItemToSupabase(item);

        const currentValEl = document.getElementById('adjust-current-val');
        if (currentValEl) currentValEl.textContent = nextVal.toLocaleString('vi-VN') + ' VNĐ';
    }

    function applyCustomAdjust(action) {
        if (!currentAdjustingSaverId || !currentAdjustingField) return;

        const customInputEl = document.getElementById('adjust-custom-input');
        const customVal = parseAmountInput(customInputEl.value);

        const item = savers.find(s => s.id === currentAdjustingSaverId);
        if (!item) return;

        let currentVal = Number(item[currentAdjustingField]) || 0;
        let nextVal = currentVal;

        if (action === 'add') {
            nextVal = currentVal + customVal;
        } else if (action === 'sub') {
            nextVal = Math.max(0, currentVal - customVal);
        } else if (action === 'set') {
            nextVal = Math.max(0, customVal);
        }

        item[currentAdjustingField] = nextVal;
        saveSaverData();
        renderSaverTable();
        syncSaverItemToSupabase(item);
        closeAdjustAmountModal();
    }

    function formatNumberInput(inputEl) {
        if (!inputEl) return;
        inputEl.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (val) {
                e.target.value = parseInt(val, 10).toLocaleString('vi-VN');
            } else {
                e.target.value = '';
            }
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toggleSaverSearch() {
        const bar = document.getElementById('saver-search-bar');
        const input = document.getElementById('saver-search-input');
        if (!bar) return;
        if (bar.style.display === 'none' || !bar.style.display) {
            bar.style.display = 'block';
            if (input) {
                input.focus();
            }
        } else {
            bar.style.display = 'none';
            if (input) input.value = '';
            const clearBtn = document.getElementById('saver-search-clear');
            if (clearBtn) clearBtn.style.display = 'none';
            renderSaverTable();
        }
    }

    function filterSaverCards() {
        const input = document.getElementById('saver-search-input');
        const clearBtn = document.getElementById('saver-search-clear');
        if (clearBtn) {
            clearBtn.style.display = input && input.value.trim() ? 'flex' : 'none';
        }
        renderSaverTable();
    }

    function clearSaverSearch() {
        const input = document.getElementById('saver-search-input');
        const clearBtn = document.getElementById('saver-search-clear');
        if (input) {
            input.value = '';
            input.focus();
        }
        if (clearBtn) clearBtn.style.display = 'none';
        renderSaverTable();
    }

    window.openAddSaverModal = openAddSaverModal;
    window.closeAddSaverModal = closeAddSaverModal;
    window.editSaverItem = editSaverItem;
    window.deleteSaverItem = deleteSaverItem;
    window.openAdjustAmountModal = openAdjustAmountModal;
    window.closeAdjustAmountModal = closeAdjustAmountModal;
    window.quickAdjustAmount = quickAdjustAmount;
    window.applyCustomAdjust = applyCustomAdjust;
    window.toggleSaverSearch = toggleSaverSearch;
    window.filterSaverCards = filterSaverCards;
    window.clearSaverSearch = clearSaverSearch;

    function initApp() {
        initSupabase();

        if (saverClient) {
            saverClient.auth.getSession().then(({ data: { session } }) => {
                if (session && session.user) {
                    currentUserId = session.user.id;
                    loadSaverData();
                    fetchSaversFromSupabase();
                    setupSaverRealtime();
                } else {
                    currentUserId = null;
                    loadSaverData();
                }
            }).catch(e => {
                console.warn('[Saver] Auth check:', e);
                loadSaverData();
            });

            saverClient.auth.onAuthStateChange((event, session) => {
                const nextUserId = session && session.user ? session.user.id : null;
                if (nextUserId === currentUserId) return;
                currentUserId = nextUserId;
                loadSaverData();
                if (currentUserId) {
                    fetchSaversFromSupabase();
                    setupSaverRealtime();
                }
            });
        } else {
            loadSaverData();
        }

        const form = document.getElementById('add-saver-form');
        if (form) form.addEventListener('submit', handleSaveSaver);

        ['saver-input-momo', 'saver-input-bank', 'saver-input-target', 'saver-input-debt', 'adjust-custom-input']
            .forEach(id => formatNumberInput(document.getElementById(id)));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
})();
