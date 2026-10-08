/**
 * Sổ tay (tính năng thứ 10)
 * Lưu chính trên Supabase, có localStorage làm cache dự phòng.
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'qlct_handbook_entries_v1';
    const SUPABASE_URL = 'https://ghdydszifdaiphcjguri.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZHlkc3ppZmRhaXBoY2pndXJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjAzOTgsImV4cCI6MjEwMDE5NjM5OH0.ZTpS0cdmmCO4eH41nXFGQpnAELgD5iMwOEpl_mG7S1c';
    const CATEGORIES = ['Ho/cảm cúm', 'Tiêu hóa', 'Da liễu', 'Xương khớp', 'Mẹo vặt gia đình', 'Khác'];
    let entries = [];
    let currentDetailId = null;
    let editingId = null;
    let handbookClient = null;
    let currentUserId = null;
    let storageMode = 'local';
    let loadedUserKey = null;
    let loadingPromise = null;

    // Ba bài mẫu để người dùng có thể xem thử ngay lần đầu.
    const SAMPLE_ENTRIES = [
        {
            title: 'Nước gừng ấm giảm ho',
            category: 'Ho/cảm cúm',
            use: 'Làm ấm cổ họng, hỗ trợ giảm cảm giác khó chịu khi ho nhẹ hoặc nhiễm lạnh.',
            ingredients: 'Gừng tươi, nước ấm, một ít mật ong nếu phù hợp.',
            method: 'Rửa sạch và thái vài lát gừng. Hãm với nước nóng khoảng 5–10 phút. Đợi nước bớt nóng rồi mới thêm mật ong và uống từng ngụm nhỏ.',
            warning: 'Không dùng mật ong cho trẻ dưới 1 tuổi. Không tự điều trị nếu khó thở, sốt cao hoặc triệu chứng kéo dài.',
            source: 'Kinh nghiệm gia đình',
            personal: 'Uống ấm vào buổi tối, theo dõi phản ứng của cơ thể.',
            favorite: true
        },
        {
            title: 'Nước chanh muối hỗ trợ tiêu hóa',
            category: 'Tiêu hóa',
            use: 'Bổ sung nước và tạo cảm giác dễ chịu sau khi vận động hoặc ăn uống khó tiêu nhẹ.',
            ingredients: 'Nước ấm, vài giọt chanh, một nhúm muối nhỏ.',
            method: 'Pha loãng chanh và muối trong một cốc nước ấm. Uống chậm, không uống khi bụng đang kích ứng.',
            warning: 'Người đau dạ dày, trào ngược hoặc cần hạn chế muối nên hỏi ý kiến bác sĩ trước khi dùng.',
            source: 'Sổ tay gia đình',
            personal: 'Pha loãng, không dùng thay nước uống hằng ngày.',
            favorite: false
        },
        {
            title: 'Chườm ấm khi mỏi cơ nhẹ',
            category: 'Xương khớp',
            use: 'Hỗ trợ thư giãn vùng cơ bị căng mỏi sau khi làm việc hoặc vận động nhẹ.',
            ingredients: 'Khăn sạch và nước ấm vừa phải.',
            method: 'Nhúng khăn vào nước ấm, vắt ráo rồi chườm lên vùng mỏi 10–15 phút. Có thể kết hợp nghỉ ngơi và vận động nhẹ.',
            warning: 'Không chườm lên vùng sưng nóng, vết thương hở hoặc khi nghi ngờ chấn thương nặng.',
            source: 'Kinh nghiệm chăm sóc tại nhà',
            personal: 'Dừng ngay nếu thấy đau tăng hoặc da bị bỏng rát.',
            favorite: false
        }
    ];

    function createId() {
        return `handbook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    // Chuẩn hóa để tìm kiếm tiếng Việt không phân biệt dấu.
    function normalize(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .trim();
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDate(value) {
        try {
            return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
        } catch {
            return '';
        }
    }

    function getLocalStorageKey() {
        return currentUserId ? `${STORAGE_KEY}_${currentUserId}` : STORAGE_KEY;
    }

    function saveEntriesLocally() {
        try {
            localStorage.setItem(getLocalStorageKey(), JSON.stringify(entries));
        } catch (error) {
            console.warn('[Sổ tay] Không thể lưu cache localStorage:', error);
        }
    }

    function loadEntriesLocally() {
        const saved = localStorage.getItem(getLocalStorageKey());
        if (saved === null) {
            entries = SAMPLE_ENTRIES.map(item => ({
                ...item,
                id: createId(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }));
            saveEntriesLocally();
            return;
        }
        try {
            const parsed = JSON.parse(saved);
            entries = Array.isArray(parsed) ? parsed : [];
        } catch {
            entries = [];
        }
    }

    function initSupabase() {
        if (typeof supabase === 'undefined' || !supabase.createClient) return;
        try {
            handbookClient = window.__QLCT_SUPABASE_CLIENT || supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                auth: { persistSession: true, autoRefreshToken: true },
                realtime: { timeout: 5000 }
            });
            window.__QLCT_SUPABASE_CLIENT = handbookClient;
        } catch (error) {
            console.warn('[Sổ tay] Không thể khởi tạo Supabase:', error);
        }
    }

    // Đổi tên cột Supabase về tên dùng trong giao diện.
    function rowToEntry(row) {
        return {
            id: row.id,
            title: row.title || '',
            category: CATEGORIES.includes(row.category) ? row.category : 'Khác',
            use: row.benefits || '',
            ingredients: row.ingredients || '',
            method: row.method || '',
            warning: row.warnings || '',
            source: row.source || '',
            personal: row.personal_note || '',
            favorite: Boolean(row.is_favorite),
            createdAt: row.created_at || new Date().toISOString(),
            updatedAt: row.updated_at || new Date().toISOString()
        };
    }

    function entryToRow(entry) {
        return {
            id: entry.id,
            user_id: currentUserId,
            title: entry.title,
            category: entry.category,
            benefits: entry.use || '',
            ingredients: entry.ingredients || '',
            method: entry.method || '',
            warnings: entry.warning || '',
            source: entry.source || '',
            personal_note: entry.personal || '',
            is_favorite: Boolean(entry.favorite),
            created_at: entry.createdAt || new Date().toISOString(),
            updated_at: entry.updatedAt || new Date().toISOString()
        };
    }

    async function syncEntryToSupabase(entry) {
        if (!handbookClient || !currentUserId) return;
        const { error } = await handbookClient.from('handbook_entries').upsert([entryToRow(entry)], { onConflict: 'user_id,id' });
        if (error) {
            console.warn('[Sổ tay] Lỗi lưu Supabase:', error.message);
            updateStorageStatus('Lỗi đồng bộ, đang giữ bản local', 'error');
        } else {
            updateStorageStatus('Đã lưu trên Supabase', 'remote');
        }
    }

    async function deleteEntryFromSupabase(id) {
        if (!handbookClient || !currentUserId) return;
        const { error } = await handbookClient.from('handbook_entries').delete().eq('user_id', currentUserId).eq('id', id);
        if (error) {
            console.warn('[Sổ tay] Lỗi xóa trên Supabase:', error.message);
            updateStorageStatus('Lỗi đồng bộ, đang giữ bản local', 'error');
        }
    }

    async function seedRemoteSamples() {
        const sampleEntries = SAMPLE_ENTRIES.map(item => ({
            ...item,
            id: createId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }));
        const { error } = await handbookClient.from('handbook_entries').upsert(sampleEntries.map(entryToRow), { onConflict: 'user_id,id' });
        if (error) throw error;
        localStorage.setItem(`${STORAGE_KEY}_seeded_${currentUserId}`, '1');
        return sampleEntries;
    }

    async function loadEntries() {
        if (loadingPromise) return loadingPromise;
        loadingPromise = (async () => {
            if (handbookClient) {
                try {
                    const { data: sessionData } = await handbookClient.auth.getSession();
                    currentUserId = sessionData?.session?.user?.id || null;
                } catch (error) {
                    console.warn('[Sổ tay] Không đọc được phiên đăng nhập:', error);
                }
            }

            const userKey = currentUserId || 'local';
            if (loadedUserKey === userKey) return;

            if (handbookClient && currentUserId) {
                const { data, error } = await handbookClient
                    .from('handbook_entries')
                    .select('*')
                    .eq('user_id', currentUserId)
                    .order('updated_at', { ascending: false });

                if (!error) {
                    storageMode = 'supabase';
                    if (Array.isArray(data) && data.length) {
                        entries = data.map(rowToEntry);
                    } else if (!localStorage.getItem(`${STORAGE_KEY}_seeded_${currentUserId}`)) {
                        try {
                            entries = await seedRemoteSamples();
                        } catch (seedError) {
                            storageMode = 'local';
                            console.warn('[Sổ tay] Không thể tạo bài mẫu trên Supabase:', seedError.message);
                            loadEntriesLocally();
                        }
                    } else {
                        entries = [];
                    }
                    saveEntriesLocally();
                    updateStorageStatus(storageMode === 'supabase' ? 'Đã đồng bộ Supabase' : 'Đang dùng bản local', storageMode === 'supabase' ? 'remote' : 'local');
                } else {
                    storageMode = 'local';
                    console.warn('[Sổ tay] Không tải được bảng handbook_entries:', error.message);
                    loadEntriesLocally();
                    updateStorageStatus('Chưa kết nối được Supabase · đang dùng bản local', 'error');
                }
            } else {
                storageMode = 'local';
                loadEntriesLocally();
                updateStorageStatus('Chưa đăng nhập · đang lưu trên thiết bị', 'local');
            }

            loadedUserKey = userKey;
            renderEntries();
        })().finally(() => {
            loadingPromise = null;
        });
        return loadingPromise;
    }

    function getFilteredEntries() {
        const query = normalize(document.getElementById('handbook-search-input')?.value);
        const category = document.getElementById('handbook-category-filter')?.value || 'all';
        const onlyFavorite = Boolean(document.getElementById('handbook-favorite-filter')?.checked);

        return entries
            .filter(entry => category === 'all' || entry.category === category)
            .filter(entry => !onlyFavorite || Boolean(entry.favorite))
            .filter(entry => {
                if (!query) return true;
                return [entry.title, entry.use, entry.ingredients].some(field => normalize(field).includes(query));
            })
            .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    }

    function renderEntries() {
        const container = document.getElementById('handbook-cards-container');
        const count = document.getElementById('handbook-entry-count');
        if (!container) return;

        const filtered = getFilteredEntries();
        if (count) count.textContent = `${filtered.length} / ${entries.length} bài`;
        const query = normalize(document.getElementById('handbook-search-input')?.value);

        if (!filtered.length) {
            container.innerHTML = `<div class="handbook-empty-state"><i data-lucide="book-x"></i><h3>${query ? 'Không tìm thấy bài phù hợp' : 'Chưa có bài nào'}</h3><p>${query ? 'Thử từ khóa khác hoặc xóa bộ lọc để xem thêm.' : 'Bấm “Thêm bài” để bắt đầu lưu nội dung cho gia đình.'}</p></div>`;
            refreshIcons();
            return;
        }

        container.innerHTML = filtered.map((entry, index) => {
            const excerpt = entry.use || entry.ingredients || entry.method || 'Chưa có mô tả ngắn.';
            return `
                <article class="handbook-card ${entry.favorite ? 'is-favorite' : ''}" data-handbook-id="${escapeHtml(entry.id)}" tabindex="0" role="button" aria-label="Mở bài ${escapeHtml(entry.title)}">
                    <div class="handbook-card-topline"><span class="handbook-card-index">#${index + 1}</span><span class="handbook-card-category">${escapeHtml(entry.category)}</span><button type="button" class="handbook-star-btn ${entry.favorite ? 'is-active' : ''}" data-action="favorite" data-id="${escapeHtml(entry.id)}" aria-label="${entry.favorite ? 'Bỏ yêu thích' : 'Đánh dấu yêu thích'}" title="${entry.favorite ? 'Bỏ yêu thích' : 'Đánh dấu yêu thích'}">★</button></div>
                    <h3>${escapeHtml(entry.title)}</h3>
                    <p>${escapeHtml(excerpt)}</p>
                    <div class="handbook-card-footer"><span><i data-lucide="calendar-days"></i>${formatDate(entry.updatedAt || entry.createdAt)}</span><span class="handbook-card-open">Xem chi tiết <i data-lucide="arrow-up-right"></i></span></div>
                </article>
            `;
        }).join('');

        container.querySelectorAll('[data-action="favorite"]').forEach(button => {
            button.addEventListener('click', event => {
                event.stopPropagation();
                toggleFavorite(button.dataset.id);
            });
        });
        container.querySelectorAll('.handbook-card').forEach(card => {
            const open = () => openDetail(card.dataset.handbookId);
            card.addEventListener('click', open);
            card.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    open();
                }
            });
        });
        refreshIcons();
    }

    function refreshIcons() {
        if (typeof createLucideIcons === 'function') createLucideIcons();
    }

    function updateStorageStatus(message, type = 'remote') {
        const status = document.getElementById('handbook-sync-status');
        if (!status) return;
        status.textContent = message;
        status.classList.toggle('is-local', type === 'local');
        status.classList.toggle('is-error', type === 'error');
    }

    function setModalState(id, active) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.toggle('active', active);
        modal.setAttribute('aria-hidden', active ? 'false' : 'true');
    }

    function openHandbookModal() {
        void loadEntries();
        renderEntries();
        setModalState('handbook-modal', true);
        if (typeof pushAppView === 'function') pushAppView('handbook-modal');
        refreshIcons();
    }

    function closeHandbookModal(returnToHub = true, fromHistory = false) {
        closeDetail();
        closeEntryModal();
        setModalState('handbook-modal', false);
        if (returnToHub && !fromHistory && typeof leaveAppView === 'function') leaveAppView();
    }

    function openDetail(id) {
        const entry = entries.find(item => item.id === id);
        if (!entry) return;
        currentDetailId = id;
        const category = document.getElementById('handbook-detail-category');
        const title = document.getElementById('handbook-detail-title');
        const body = document.getElementById('handbook-detail-body');
        if (category) category.textContent = `${entry.favorite ? '★ ' : ''}${entry.category}`;
        if (title) title.textContent = entry.title;
        if (body) {
            const fields = [
                ['Công dụng', entry.use, 'sparkles'],
                ['Nguyên liệu', entry.ingredients, 'leaf'],
                ['Cách làm / cách dùng', entry.method, 'list-ordered'],
                ['Lưu ý / chống chỉ định', entry.warning, 'triangle-alert'],
                ['Nguồn', entry.source, 'link'],
                ['Ghi chú cá nhân', entry.personal, 'heart']
            ];
            body.innerHTML = fields.map(([label, value, icon]) => `<section class="handbook-detail-section"><h3><i data-lucide="${icon}"></i>${label}</h3><p>${value ? escapeHtml(value).replace(/\r?\n/g, '<br>') : '<em>Chưa cập nhật</em>'}</p></section>`).join('');
        }
        setModalState('handbook-detail-modal', true);
        refreshIcons();
    }

    function closeDetail() {
        currentDetailId = null;
        setModalState('handbook-detail-modal', false);
    }

    function valueOf(id) {
        return document.getElementById(id)?.value.trim() || '';
    }

    function fillEntryForm(entry) {
        const values = {
            'handbook-entry-id': entry?.id || '',
            'handbook-entry-title': entry?.title || '',
            'handbook-entry-category': entry?.category || CATEGORIES[0],
            'handbook-entry-use': entry?.use || '',
            'handbook-entry-ingredients': entry?.ingredients || '',
            'handbook-entry-method': entry?.method || '',
            'handbook-entry-warning': entry?.warning || '',
            'handbook-entry-source': entry?.source || '',
            'handbook-entry-personal': entry?.personal || ''
        };
        Object.entries(values).forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (input) input.value = value;
        });
    }

    function openEntryModal(id = null) {
        editingId = id;
        const entry = id ? entries.find(item => item.id === id) : null;
        fillEntryForm(entry);
        const title = document.getElementById('handbook-entry-form-title');
        const saveText = document.getElementById('handbook-save-text');
        if (title) title.textContent = entry ? 'Chỉnh sửa bài' : 'Thêm bài mới';
        if (saveText) saveText.textContent = entry ? 'Cập nhật bài' : 'Lưu bài';
        document.getElementById('handbook-form-error')?.setAttribute('hidden', '');
        setModalState('handbook-entry-modal', true);
        refreshIcons();
        setTimeout(() => document.getElementById('handbook-entry-title')?.focus(), 120);
    }

    function closeEntryModal() {
        editingId = null;
        setModalState('handbook-entry-modal', false);
        document.getElementById('handbook-entry-form')?.reset();
    }

    function showFormError(message) {
        const error = document.getElementById('handbook-form-error');
        if (!error) return;
        error.textContent = message;
        error.removeAttribute('hidden');
    }

    function handleSubmit(event) {
        event.preventDefault();
        const title = valueOf('handbook-entry-title');
        const category = valueOf('handbook-entry-category');
        if (!title || !CATEGORIES.includes(category)) {
            showFormError('Vui lòng nhập Tên bài và chọn Danh mục.');
            return;
        }

        const old = editingId ? entries.find(item => item.id === editingId) : null;
        const item = {
            id: old?.id || createId(),
            title,
            category,
            use: valueOf('handbook-entry-use'),
            ingredients: valueOf('handbook-entry-ingredients'),
            method: valueOf('handbook-entry-method'),
            warning: valueOf('handbook-entry-warning'),
            source: valueOf('handbook-entry-source'),
            personal: valueOf('handbook-entry-personal'),
            favorite: Boolean(old?.favorite),
            createdAt: old?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (old) entries = entries.map(entry => entry.id === old.id ? item : entry);
        else entries.unshift(item);
        saveEntriesLocally();
        void syncEntryToSupabase(item);
        renderEntries();
        closeEntryModal();
        openDetail(item.id);
    }

    function toggleFavorite(id) {
        const entry = entries.find(item => item.id === id);
        if (!entry) return;
        entry.favorite = !Boolean(entry.favorite);
        entry.updatedAt = new Date().toISOString();
        saveEntriesLocally();
        void syncEntryToSupabase(entry);
        renderEntries();
        if (currentDetailId === id) openDetail(id);
    }

    function deleteEntry(id) {
        const entry = entries.find(item => item.id === id);
        if (!entry) return;
        if (!window.confirm(`Bạn có chắc muốn xóa bài “${entry.title}” không?`)) return;
        entries = entries.filter(item => item.id !== id);
        saveEntriesLocally();
        void deleteEntryFromSupabase(id);
        closeDetail();
        renderEntries();
    }

    function printEntry(id) {
        const entry = entries.find(item => item.id === id);
        if (!entry) return;
        const printable = window.open('', '_blank', 'width=820,height=900');
        if (!printable) return;
        const sections = [
            ['Danh mục', entry.category], ['Công dụng', entry.use], ['Nguyên liệu', entry.ingredients],
            ['Cách làm / cách dùng', entry.method], ['Lưu ý / chống chỉ định', entry.warning],
            ['Nguồn', entry.source], ['Ghi chú cá nhân', entry.personal]
        ];
        printable.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(entry.title)}</title><style>body{font-family:Arial,sans-serif;color:#243126;max-width:760px;margin:40px auto;padding:0 24px;line-height:1.6}h1{color:#276b3b}h2{font-size:16px;color:#276b3b;border-bottom:1px solid #d9e5da;padding-bottom:4px;margin-top:22px}p{white-space:pre-wrap;margin:6px 0}small{color:#68766b}@media print{body{margin:0}}</style></head><body><small>SỔ TAY · ${escapeHtml(entry.category)}</small><h1>${escapeHtml(entry.title)}</h1>${sections.map(([label, value]) => `<h2>${label}</h2><p>${value ? escapeHtml(value) : 'Chưa cập nhật'}</p>`).join('')}<small>Thông tin chỉ mang tính tham khảo, không thay thế tư vấn y tế.</small></body></html>`);
        printable.document.close();
        printable.focus();
        setTimeout(() => printable.print(), 250);
    }

    function exportEntries() {
        const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries }, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `so-tay-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function importEntries(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                const imported = Array.isArray(parsed) ? parsed : parsed.entries;
                if (!Array.isArray(imported)) throw new Error('invalid');
                entries = imported.filter(item => item && item.title).map(item => ({
                    id: item.id || createId(), title: String(item.title), category: CATEGORIES.includes(item.category) ? item.category : 'Khác',
                    use: String(item.use || ''), ingredients: String(item.ingredients || ''), method: String(item.method || ''),
                    warning: String(item.warning || ''), source: String(item.source || ''), personal: String(item.personal || ''),
                    favorite: Boolean(item.favorite), createdAt: item.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
                }));
                saveEntriesLocally();
                if (handbookClient && currentUserId) {
                    void Promise.all(entries.map(syncEntryToSupabase));
                }
                renderEntries();
                window.alert(`Đã nhập ${entries.length} bài vào Sổ tay.`);
            } catch {
                window.alert('File JSON không đúng định dạng Sổ tay.');
            }
        };
        reader.readAsText(file, 'utf-8');
    }

    function bindEvents() {
        // Dùng chung phiên đăng nhập và Supabase client của ứng dụng chính.
        initSupabase();
        if (handbookClient) {
            handbookClient.auth.onAuthStateChange((event, session) => {
                const nextUserId = session?.user?.id || null;
                if (nextUserId === currentUserId) return;
                currentUserId = nextUserId;
                loadedUserKey = null;
                void loadEntries();
            });
        }
        void loadEntries();

        document.getElementById('welcome-opt-handbook')?.addEventListener('click', openHandbookModal);
        document.getElementById('btn-close-handbook-modal')?.addEventListener('click', () => closeHandbookModal());
        document.getElementById('btn-add-handbook-entry')?.addEventListener('click', () => openEntryModal());
        document.getElementById('btn-close-handbook-detail')?.addEventListener('click', closeDetail);
        document.getElementById('btn-edit-handbook-detail')?.addEventListener('click', () => {
            const id = currentDetailId;
            closeDetail();
            if (id) openEntryModal(id);
        });
        document.getElementById('btn-delete-handbook-detail')?.addEventListener('click', () => {
            if (currentDetailId) deleteEntry(currentDetailId);
        });
        document.getElementById('btn-print-handbook-detail')?.addEventListener('click', () => {
            if (currentDetailId) printEntry(currentDetailId);
        });
        document.getElementById('btn-close-handbook-entry')?.addEventListener('click', closeEntryModal);
        document.getElementById('btn-cancel-handbook-entry')?.addEventListener('click', closeEntryModal);
        document.getElementById('handbook-entry-form')?.addEventListener('submit', handleSubmit);
        document.getElementById('handbook-search-input')?.addEventListener('input', event => {
            const clear = document.getElementById('btn-clear-handbook-search');
            if (clear) clear.hidden = !event.target.value;
            renderEntries();
        });
        document.getElementById('handbook-category-filter')?.addEventListener('change', renderEntries);
        document.getElementById('handbook-favorite-filter')?.addEventListener('change', renderEntries);
        document.getElementById('btn-clear-handbook-search')?.addEventListener('click', () => {
            const input = document.getElementById('handbook-search-input');
            if (input) input.value = '';
            document.getElementById('btn-clear-handbook-search').hidden = true;
            renderEntries();
            input?.focus();
        });
        document.getElementById('btn-export-handbook')?.addEventListener('click', exportEntries);
        document.getElementById('btn-import-handbook')?.addEventListener('click', () => document.getElementById('handbook-import-input')?.click());
        document.getElementById('handbook-import-input')?.addEventListener('change', event => {
            importEntries(event.target.files?.[0]);
            event.target.value = '';
        });
        document.getElementById('handbook-modal')?.addEventListener('click', event => {
            if (event.target.id === 'handbook-modal') closeHandbookModal();
        });
        document.getElementById('handbook-detail-modal')?.addEventListener('click', event => {
            if (event.target.id === 'handbook-detail-modal') closeDetail();
        });
        document.getElementById('handbook-entry-modal')?.addEventListener('click', event => {
            if (event.target.id === 'handbook-entry-modal') closeEntryModal();
        });
    }

    window.openHandbookModal = openHandbookModal;
    window.closeHandbookModal = closeHandbookModal;
    window.closeHandbookDetail = closeDetail;
    window.closeHandbookEntryModal = closeEntryModal;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindEvents);
    else bindEvents();
})();
