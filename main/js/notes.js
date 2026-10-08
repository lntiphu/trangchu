/**
 * Money - Quản lý Ghi chú Cá nhân (Notes Module)
 * Cho phép người dùng lưu lại thông tin với 2 trường: Tên ghi chú và Mô tả ghi chú.
 * Tự động đồng bộ hóa thời gian thực lên bảng "notes" trên Supabase với Row Level Security.
 */
(function() {
    'use strict';

    const SUPABASE_URL = 'https://ghdydszifdaiphcjguri.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZHlkc3ppZmRhaXBoY2pndXJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjAzOTgsImV4cCI6MjEwMDE5NjM5OH0.ZTpS0cdmmCO4eH41nXFGQpnAELgD5iMwOEpl_mG7S1c';

    let notesClient = null;
    let currentUserId = null;
    let notesSubscription = null;
    let notes = [];
    let isEditingId = null;
    let editingIsFavorite = false;
    let currentFilter = 'all'; // 'all' hoặc 'fav'

    const SAMPLE_NOTES = [
        {
            title: 'Tip test màn hình',
            content: 'Hạ độ sáng xuống 0\nVào web Ezio Monitor Test\nBấm Start\nVào dòng số 8 để Test',
            isFavorite: true
        },
        {
            title: 'Mẹo vặt chăm sóc da',
            content: '- Trị gàu: giã gừng nát rồi để vào nước ấm mát xa da đầu.\n- Se khít lỗ chân lông: thái mỏng dưa leo rồi đem đông đá đắp mặt.\n- Mụn đầu đen: đắp lòng trắng trứng gà lên mũi.\n- Giảm Cholesterol: bơ, đậu bắp, tỏi, trà xanh, óc chó.',
            isFavorite: false
        },
        {
            title: 'Checklist đi du lịch',
            content: '1. Căn cước công dân, thẻ ngân hàng, tiền mặt dự phòng\n2. Củ sạc đa năng + pin dự phòng\n3. Thuốc đau đầu, tiêu hóa, băng cá nhân\n4. Quần áo dự phòng + áo khoác nhẹ',
            isFavorite: true
        }
    ];

    // Khởi tạo Supabase client cho module Notes
    function initSupabase() {
        if (typeof supabase !== 'undefined' && supabase.createClient) {
            try {
                notesClient = window.__QLCT_SUPABASE_CLIENT || supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                    auth: { persistSession: true, autoRefreshToken: true },
                    realtime: { timeout: 5000 }
                });
                window.__QLCT_SUPABASE_CLIENT = notesClient;
            } catch (err) {
                console.warn('[Notes] Lỗi tạo Supabase client:', err);
            }
        }
    }

    // Tạo ID duy nhất cho ghi chú
    function generateNoteId() {
        return 'note_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    }

    // Định dạng ngày giờ thân thiện (VD: 14:30 · 30/09/2026)
    function formatNoteDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return '';
            const hours = String(d.getHours()).padStart(2, '0');
            const mins = String(d.getMinutes()).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${hours}:${mins} · ${day}/${month}/${year}`;
        } catch {
            return dateStr;
        }
    }

    // Lưu vào LocalStorage của tài khoản hiện tại
    function saveNotesLocally() {
        const storageKey = currentUserId ? `money_notes_${currentUserId}` : 'money_notes_local';
        try {
            localStorage.setItem(storageKey, JSON.stringify(notes));
        } catch (e) {
            console.warn('[Notes] Lỗi lưu LocalStorage:', e);
        }
    }

    // Tải dữ liệu từ LocalStorage
    function loadNotesLocally() {
        const storageKey = currentUserId ? `money_notes_${currentUserId}` : 'money_notes_local';
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                notes = JSON.parse(raw);
                if (!Array.isArray(notes)) notes = [];
            } else {
                notes = [];
            }
        } catch (e) {
            console.warn('[Notes] Lỗi đọc LocalStorage:', e);
            notes = [];
        }
        renderNotesList();
    }

    // Tải ghi chú từ bảng "notes" trên Supabase
    async function fetchNotesFromSupabase() {
        if (!notesClient || !currentUserId) return;

        try {
            const { data, error } = await notesClient
                .from('notes')
                .select('*')
                .eq('user_id', currentUserId)
                .order('created_at', { ascending: false });

            if (error) {
                if (error.code === '42P01') {
                    console.info('[Notes] Bảng "notes" chưa tồn tại trên Supabase. Đang chạy chế độ Local Storage.');
                } else {
                    console.warn('[Notes] Lỗi tải ghi chú từ Supabase:', error.message);
                }
                return;
            }

            if (data && Array.isArray(data)) {
                notes = data.map(row => ({
                    id: row.id,
                    title: row.title || '',
                    content: row.content || '',
                    isFavorite: Boolean(row.is_favorite || row.isFavorite),
                    createdAt: row.created_at || new Date().toISOString(),
                    updatedAt: row.updated_at || new Date().toISOString()
                }));
                saveNotesLocally();
                renderNotesList();
            }
        } catch (err) {
            console.warn('[Notes] Lỗi kết nối Supabase:', err);
        }
    }

    // Lưu / Cập nhật ghi chú lên Supabase
    async function syncNoteToSupabase(note) {
        if (!notesClient || !currentUserId) return;

        try {
            const payload = {
                id: note.id,
                user_id: currentUserId,
                title: note.title,
                content: note.content || '',
                is_favorite: Boolean(note.isFavorite),
                created_at: note.createdAt || new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { error } = await notesClient
                .from('notes')
                .upsert([payload], { onConflict: 'user_id,id' });

            if (error && error.code !== '42P01') {
                console.warn('[Notes] Lỗi đồng bộ ghi chú:', error.message);
            }
        } catch (e) {
            console.warn('[Notes] Lỗi đồng bộ note:', e);
        }
    }

    // Xóa ghi chú trên Supabase
    async function deleteNoteFromSupabase(noteId) {
        if (!notesClient || !currentUserId) return;

        try {
            const { error } = await notesClient
                .from('notes')
                .delete()
                .eq('user_id', currentUserId)
                .eq('id', noteId);

            if (error && error.code !== '42P01') {
                console.warn('[Notes] Lỗi xóa note trên Supabase:', error.message);
            }
        } catch (e) {
            console.warn('[Notes] Lỗi xóa note:', e);
        }
    }

    // Thiết lập Realtime cho bảng "notes"
    function setupNotesRealtime() {
        if (!notesClient || !currentUserId) return;

        if (notesSubscription) {
            try { notesSubscription.unsubscribe(); } catch(e){}
        }

        try {
            notesSubscription = notesClient
                .channel(`money-notes-realtime-${currentUserId}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'notes',
                    filter: `user_id=eq.${currentUserId}`
                }, payload => {
                    handleNotesRealtimeChange(payload);
                })
                .subscribe();
        } catch (e) {
            console.warn('[Notes] Không thể đăng ký Realtime:', e);
        }
    }

    // Xử lý thay đổi Realtime từ Supabase
    function handleNotesRealtimeChange(payload) {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === 'INSERT') {
            if (newRow && !notes.some(n => n.id === newRow.id)) {
                notes.unshift({
                    id: newRow.id,
                    title: newRow.title || '',
                    content: newRow.content || '',
                    isFavorite: Boolean(newRow.is_favorite || newRow.isFavorite),
                    createdAt: newRow.created_at,
                    updatedAt: newRow.updated_at
                });
                saveNotesLocally();
                renderNotesList();
            }
        } else if (eventType === 'UPDATE') {
            if (newRow) {
                const idx = notes.findIndex(n => n.id === newRow.id);
                if (idx !== -1) {
                    notes[idx] = {
                        id: newRow.id,
                        title: newRow.title || '',
                        content: newRow.content || '',
                        isFavorite: Boolean(newRow.is_favorite || newRow.isFavorite),
                        createdAt: newRow.created_at,
                        updatedAt: newRow.updated_at
                    };
                    saveNotesLocally();
                    renderNotesList();
                }
            }
        } else if (eventType === 'DELETE') {
            if (oldRow && oldRow.id) {
                notes = notes.filter(n => n.id !== oldRow.id);
                saveNotesLocally();
                renderNotesList();
            }
        }
    }

    // Chuẩn hóa và render các dòng văn bản không bị thụt lề
    function formatCleanContentHtml(contentStr) {
        if (!contentStr || !contentStr.trim()) {
            return '<em class="notes-no-content">(Không có mô tả chi tiết)</em>';
        }
        // Tách theo dòng, trim từng dòng và bọc trong div dòng riêng biệt
        const lines = contentStr.split(/\r?\n/);
        return lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                return '<span class="note-card-empty-line"></span>';
            }
            return `<div class="note-card-line">${escapeHtml(trimmed)}</div>`;
        }).join('');
    }

    // Hiển thị danh sách ghi chú
    function renderNotesList() {
        const container = document.getElementById('notes-cards-container');
        const searchInput = document.getElementById('notes-search-input');
        const clearSearchBtn = document.getElementById('btn-clear-notes-search');
        const badgeAll = document.getElementById('notes-badge-all');
        const badgeFav = document.getElementById('notes-badge-fav');

        if (!container) return;

        const query = (searchInput ? searchInput.value : '').trim().toLowerCase();

        if (clearSearchBtn) {
            clearSearchBtn.style.display = query ? 'flex' : 'none';
        }

        const favCount = notes.filter(n => Boolean(n.isFavorite)).length;
        if (badgeAll) badgeAll.textContent = String(notes.length);
        if (badgeFav) badgeFav.textContent = String(favCount);

        let filtered = notes.filter(n => {
            if (currentFilter === 'fav' && !n.isFavorite) {
                return false;
            }
            if (!query) return true;
            const t = (n.title || '').toLowerCase();
            const c = (n.content || '').toLowerCase();
            return t.includes(query) || c.includes(query);
        });

        if (filtered.length === 0) {
            if (query) {
                container.innerHTML = `
                    <div class="notes-empty-state">
                        <i data-lucide="search-x" class="notes-empty-icon"></i>
                        <h4>Không tìm thấy ghi chú</h4>
                        <p>Không có ghi chú nào khớp với từ khóa "<strong>${escapeHtml(query)}</strong>"</p>
                        <button type="button" class="notes-empty-btn" id="btn-empty-clear-search">
                            <i data-lucide="x"></i>
                            <span>Xóa từ khóa tìm kiếm</span>
                        </button>
                    </div>
                `;
                const btnClearSearch = document.getElementById('btn-empty-clear-search');
                if (btnClearSearch && searchInput) {
                    btnClearSearch.addEventListener('click', () => {
                        searchInput.value = '';
                        renderNotesList();
                        searchInput.focus();
                    });
                }
            } else if (currentFilter === 'fav') {
                container.innerHTML = `
                    <div class="notes-empty-state">
                        <i data-lucide="pin" class="notes-empty-icon" style="color: #2E7D32;"></i>
                        <h4>Chưa có ghi chú được ghim</h4>
                        <p>Ghim những ghi chú quan trọng để truy cập nhanh hơn.</p>
                        <button type="button" class="notes-empty-btn" id="btn-switch-to-all">
                            <span>Xem tất cả ghi chú</span>
                        </button>
                    </div>
                `;
                const btnSwitchAll = document.getElementById('btn-switch-to-all');
                if (btnSwitchAll) {
                    btnSwitchAll.addEventListener('click', () => {
                        setNotesFilter('all');
                    });
                }
            } else {
                container.innerHTML = `
                    <div class="notes-empty-state">
                        <i data-lucide="file-plus" class="notes-empty-icon"></i>
                        <h4>Chưa có ghi chú nào</h4>
                        <p>Bạn chưa tạo ghi chú nào. Hãy tạo ghi chú đầu tiên hoặc nạp các ghi chú mẫu hữu ích để trải nghiệm.</p>
                        <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
                            <button type="button" class="notes-empty-btn" id="btn-empty-add-note">
                                <i data-lucide="plus"></i>
                                <span>Thêm ghi chú</span>
                            </button>
                            <button type="button" class="notes-sample-btn" id="btn-empty-load-sample" style="padding: 8px 14px; font-size: 0.8rem;">
                                <i data-lucide="sparkles"></i>
                                <span>Nạp mẫu ngay</span>
                            </button>
                        </div>
                    </div>
                `;
                const btnEmptyAdd = document.getElementById('btn-empty-add-note');
                if (btnEmptyAdd) {
                    btnEmptyAdd.addEventListener('click', () => openNoteEntryModal());
                }
                const btnEmptySample = document.getElementById('btn-empty-load-sample');
                if (btnEmptySample) {
                    btnEmptySample.addEventListener('click', () => loadSampleNotes());
                }
            }

            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }
            return;
        }

        let html = '';
        filtered.forEach((note, index) => {
            const dateText = formatNoteDate(note.updatedAt || note.createdAt);
            const contentHtml = formatCleanContentHtml(note.content);
            const isFav = Boolean(note.isFavorite);
            const favClass = isFav ? 'is-fav' : '';
            const favIconFill = isFav ? 'fill="currentColor"' : '';

            html += `
                <div class="note-card" data-note-id="${escapeHtml(note.id)}">
                    <div class="note-card-header">
                        <div class="note-card-title-group">
                            <div class="note-card-top-meta">
                                <span class="note-index-badge">#${index + 1}</span>
                                <span class="note-card-date"><i data-lucide="clock"></i> ${dateText}</span>
                            </div>
                            <h4 class="note-card-title">${escapeHtml(note.title)}</h4>
                        </div>
                        <div class="note-card-actions">
                            <button type="button" class="note-action-btn btn-fav-note ${favClass}" data-id="${escapeHtml(note.id)}" title="${isFav ? 'Bỏ ghim ghi chú' : 'Ghim ghi chú'}" aria-label="${isFav ? 'Bỏ ghim ghi chú' : 'Ghim ghi chú'}">
                                <i data-lucide="pin" ${favIconFill}></i>
                            </button>
                            <button type="button" class="note-action-btn btn-copy-note" data-id="${escapeHtml(note.id)}" title="Sao chép nội dung" aria-label="Sao chép">
                                <i data-lucide="copy"></i>
                            </button>
                            <button type="button" class="note-action-btn btn-edit-note" data-id="${escapeHtml(note.id)}" title="Chỉnh sửa ghi chú" aria-label="Chỉnh sửa">
                                <i data-lucide="edit-3"></i>
                            </button>
                            <button type="button" class="note-action-btn btn-delete-note" data-id="${escapeHtml(note.id)}" title="Xóa ghi chú" aria-label="Xóa">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </div>
                    <div class="note-card-content">
                        ${contentHtml}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Gắn sự kiện cho các nút hành động
        container.querySelectorAll('.btn-fav-note').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleNoteFavorite(btn.getAttribute('data-id'));
            });
        });

        container.querySelectorAll('.btn-copy-note').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                copyNoteContent(btn.getAttribute('data-id'));
            });
        });

        container.querySelectorAll('.btn-edit-note').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                editNote(btn.getAttribute('data-id'));
            });
        });

        container.querySelectorAll('.btn-delete-note').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteNote(btn.getAttribute('data-id'));
            });
        });

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    // Đổi tab lọc
    function setNotesFilter(filter) {
        currentFilter = filter;
        const btnAll = document.getElementById('btn-filter-notes-all');
        const btnFav = document.getElementById('btn-filter-notes-fav');

        if (btnAll) btnAll.classList.toggle('active', filter === 'all');
        if (btnFav) btnFav.classList.toggle('active', filter === 'fav');

        renderNotesList();
    }

    // Đánh dấu yêu thích / quan trọng
    function toggleNoteFavorite(id) {
        const note = notes.find(n => n.id === id);
        if (!note) return;

        note.isFavorite = !note.isFavorite;
        note.updatedAt = new Date().toISOString();
        saveNotesLocally();
        renderNotesList();
        syncNoteToSupabase(note);
        showNotesToast(note.isFavorite ? 'Đã ghim vào mục Quan trọng ❤️' : 'Đã bỏ ghim Quan trọng');
    }

    // Nạp ghi chú mẫu
    function loadSampleNotes() {
        const now = new Date().toISOString();
        let addedCount = 0;

        SAMPLE_NOTES.forEach(sample => {
            const exists = notes.some(n => n.title.trim().toLowerCase() === sample.title.trim().toLowerCase());
            if (!exists) {
                const newNote = {
                    id: generateNoteId(),
                    title: sample.title,
                    content: sample.content,
                    isFavorite: Boolean(sample.isFavorite),
                    createdAt: now,
                    updatedAt: now
                };
                notes.push(newNote);
                syncNoteToSupabase(newNote);
                addedCount++;
            }
        });

        if (addedCount > 0) {
            saveNotesLocally();
            renderNotesList();
            showNotesToast(`Đã thêm ${addedCount} ghi chú mẫu! ✨`);
        } else {
            showNotesToast('Các ghi chú mẫu đã có sẵn trong danh sách!');
        }
    }

    // Thoát mã HTML an toàn để chống XSS
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/&lt;/g, '&lt;')
            .replace(/&gt;/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Sao chép nội dung ghi chú vào clipboard
    function copyNoteContent(id) {
        const note = notes.find(n => n.id === id);
        if (!note) return;

        const textToCopy = `${note.title}\n\n${(note.content || '').trim()}`.trim();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                showNotesToast('Đã sao chép nội dung ghi chú! 📋');
            }).catch(() => {
                fallbackCopyText(textToCopy);
            });
        } else {
            fallbackCopyText(textToCopy);
        }
    }

    function fallbackCopyText(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            showNotesToast('Đã sao chép nội dung ghi chú! 📋');
        } catch {
            showNotesToast('Không thể sao chép');
        }
        document.body.removeChild(ta);
    }

    // Thông báo Toast nhỏ
    function showNotesToast(msg) {
        let toast = document.getElementById('notes-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'notes-toast';
            toast.className = 'notes-toast';
            const modalSheet = document.querySelector('#notes-modal .notes-page-sheet');
            if (modalSheet) {
                modalSheet.appendChild(toast);
            } else {
                document.body.appendChild(toast);
            }
        }
        toast.innerHTML = `<i data-lucide="check-circle-2" style="width: 14px; height: 14px; color: #4ade80;"></i> ${escapeHtml(msg)}`;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2200);
    }

    function updateNoteEditorCount() {
        const contentInput = document.getElementById('note-content-input');
        const countEl = document.getElementById('notes-content-count');
        if (!contentInput || !countEl) return;
        countEl.textContent = `${contentInput.value.length} / ${contentInput.maxLength || 3000}`;
    }

    function updateNoteEditorPinState() {
        const pinButton = document.getElementById('btn-toggle-note-pin');
        if (!pinButton) return;
        pinButton.classList.toggle('is-pinned', editingIsFavorite);
        pinButton.setAttribute('aria-pressed', editingIsFavorite ? 'true' : 'false');
        pinButton.title = editingIsFavorite ? 'Bỏ ghim ghi chú' : 'Ghim ghi chú';
    }

    function toggleNoteEditorPin() {
        editingIsFavorite = !editingIsFavorite;
        updateNoteEditorPinState();
    }

    // Mở Bottom Sheet Thêm / Sửa Ghi chú
    function openNoteEntryModal(id = null) {
        const modal = document.getElementById('notes-entry-modal');
        if (!modal) return;

        const titleInput = document.getElementById('note-title-input');
        const contentInput = document.getElementById('note-content-input');
        const idInput = document.getElementById('note-id');
        const headingEl = document.getElementById('notes-entry-form-title');
        const descEl = document.getElementById('notes-entry-form-description');
        const btnSaveText = document.getElementById('btn-save-note-text');
        const statusEl = document.getElementById('notes-entry-status');

        if (id) {
            const note = notes.find(n => n.id === id);
            if (!note) return;
            isEditingId = id;
            if (idInput) idInput.value = note.id;
            if (titleInput) titleInput.value = note.title || '';
            if (contentInput) contentInput.value = (note.content || '').trim();
            if (headingEl) headingEl.textContent = 'Chỉnh sửa ghi chú';
            if (descEl) descEl.textContent = 'Cập nhật lại tiêu đề hoặc nội dung cần ghi nhớ.';
            if (btnSaveText) btnSaveText.textContent = 'Cập nhật';
            if (statusEl) statusEl.textContent = 'Chỉnh sửa ghi chú';
            editingIsFavorite = Boolean(note.isFavorite);
        } else {
            isEditingId = null;
            if (idInput) idInput.value = '';
            if (titleInput) titleInput.value = '';
            if (contentInput) contentInput.value = '';
            if (headingEl) headingEl.textContent = 'Ghi chú mới';
            if (descEl) descEl.textContent = 'Nhập thông tin tiêu đề và nội dung cần lưu trữ.';
            if (btnSaveText) btnSaveText.textContent = 'Lưu ghi chú';
            if (statusEl) statusEl.textContent = 'Ghi chú mới';
            editingIsFavorite = false;
        }

        updateNoteEditorCount();
        updateNoteEditorPinState();

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }

        setTimeout(() => {
            if (titleInput) titleInput.focus();
        }, 150);
    }

    // Đóng Bottom Sheet Thêm / Sửa Ghi chú
    function closeNoteEntryModal() {
        const modal = document.getElementById('notes-entry-modal');
        if (!modal) return;

        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        isEditingId = null;
        editingIsFavorite = false;

        const form = document.getElementById('notes-form');
        if (form) form.reset();
    }

    // Xử lý nạp dữ liệu để sửa ghi chú
    function editNote(id) {
        openNoteEntryModal(id);
    }

    // Xử lý submit lưu ghi chú (Tạo mới hoặc Cập nhật)
    async function handleSaveNote(e) {
        if (e) e.preventDefault();

        const titleInput = document.getElementById('note-title-input');
        const contentInput = document.getElementById('note-content-input');

        const title = (titleInput ? titleInput.value : '').trim();
        // Lấy nội dung, loại bỏ thụt lề đầu tiên bằng trim()
        const content = (contentInput ? contentInput.value : '').trim();

        if (!title) {
            showNotesToast('Vui lòng nhập tên ghi chú!');
            if (titleInput) titleInput.focus();
            return;
        }

        if (isEditingId) {
            // Cập nhật ghi chú có sẵn
            const idx = notes.findIndex(n => n.id === isEditingId);
            if (idx !== -1) {
                notes[idx].title = title;
                notes[idx].content = content;
                notes[idx].isFavorite = editingIsFavorite;
                notes[idx].updatedAt = new Date().toISOString();
                
                const updatedNote = notes[idx];
                saveNotesLocally();
                renderNotesList();
                syncNoteToSupabase(updatedNote);
                showNotesToast('Đã cập nhật ghi chú thành công! ✨');
            }
        } else {
            // Thêm ghi chú mới
            const newNote = {
                id: generateNoteId(),
                title: title,
                content: content,
                isFavorite: editingIsFavorite,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            notes.unshift(newNote);
            saveNotesLocally();
            renderNotesList();
            syncNoteToSupabase(newNote);
            showNotesToast('Đã thêm ghi chú mới! 📝');
        }

        closeNoteEntryModal();
    }

    // Xóa ghi chú
    function deleteNote(id) {
        const note = notes.find(n => n.id === id);
        if (!note) return;

        if (confirm(`Bạn có chắc chắn muốn xóa ghi chú "${note.title}"?`)) {
            notes = notes.filter(n => n.id !== id);
            saveNotesLocally();
            renderNotesList();
            deleteNoteFromSupabase(id);
            if (isEditingId === id) closeNoteEntryModal();
            showNotesToast('Đã xóa ghi chú 🗑️');
        }
    }

    // Mở Modal trang Ghi Chú
    function openNotesModal() {
        const modal = document.getElementById('notes-modal');
        if (!modal || modal.classList.contains('active')) return;

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        if (typeof window.enterAppView === 'function') {
            window.enterAppView('notes-modal');
        }

        // Nạp và render lại dữ liệu mới nhất
        loadNotesLocally();
        if (currentUserId) {
            fetchNotesFromSupabase();
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    // Đóng Modal trang Ghi Chú và quay lại Modal 5 Options / Hub
    function closeNotesModal(returnToHub = true, fromHistory = false) {
        const modal = document.getElementById('notes-modal');
        if (!modal) return;

        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        closeNoteEntryModal();

        if (!fromHistory && typeof window.exitAppView === 'function') {
            window.exitAppView();
        }

        if (returnToHub) {
            if (typeof window.showWelcomeHubPage === 'function') {
                window.showWelcomeHubPage({ fromHistory });
            } else if (typeof window.showOptionsModal === 'function') {
                window.showOptionsModal({ fromHistory });
            }
        }
    }

    // Khởi tạo các sự kiện cho module Notes
    function registerNotesEvents() {
        initSupabase();

        // Lấy session hiện tại
        if (notesClient) {
            notesClient.auth.getSession().then(({ data: { session } }) => {
                if (session && session.user) {
                    currentUserId = session.user.id;
                    loadNotesLocally();
                    fetchNotesFromSupabase();
                    setupNotesRealtime();
                } else {
                    currentUserId = null;
                    loadNotesLocally();
                }
            }).catch(e => {
                console.warn('[Notes] Session check error:', e);
                loadNotesLocally();
            });

            notesClient.auth.onAuthStateChange((event, session) => {
                const nextUserId = session && session.user ? session.user.id : null;
                if (nextUserId === currentUserId) return;
                currentUserId = nextUserId;
                loadNotesLocally();
                if (currentUserId) {
                    fetchNotesFromSupabase();
                    setupNotesRealtime();
                }
            });
        } else {
            loadNotesLocally();
        }

        // Form Submit
        const form = document.getElementById('notes-form');
        if (form) {
            form.addEventListener('submit', handleSaveNote);
        }

        const contentInput = document.getElementById('note-content-input');
        if (contentInput) contentInput.addEventListener('input', updateNoteEditorCount);

        const pinEditorButton = document.getElementById('btn-toggle-note-pin');
        if (pinEditorButton) pinEditorButton.addEventListener('click', toggleNoteEditorPin);

        // Đóng form entry bottom sheet
        const btnCloseEntry = document.getElementById('btn-close-notes-entry-modal');
        if (btnCloseEntry) {
            btnCloseEntry.addEventListener('click', closeNoteEntryModal);
        }

        const btnCancelEntry = document.getElementById('btn-cancel-note-entry');
        if (btnCancelEntry) {
            btnCancelEntry.addEventListener('click', closeNoteEntryModal);
        }

        // Click outside entry sheet to close
        const entryOverlay = document.getElementById('notes-entry-modal');
        if (entryOverlay) {
            entryOverlay.addEventListener('click', (e) => {
                if (e.target === entryOverlay) {
                    closeNoteEntryModal();
                }
            });
        }

        // Tìm kiếm ghi chú
        const searchInput = document.getElementById('notes-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                renderNotesList();
            });
        }

        const btnClearSearch = document.getElementById('btn-clear-notes-search');
        if (btnClearSearch && searchInput) {
            btnClearSearch.addEventListener('click', () => {
                searchInput.value = '';
                renderNotesList();
                searchInput.focus();
            });
        }

        // Filter tabs
        const btnFilterAll = document.getElementById('btn-filter-notes-all');
        if (btnFilterAll) {
            btnFilterAll.addEventListener('click', () => setNotesFilter('all'));
        }

        const btnFilterFav = document.getElementById('btn-filter-notes-fav');
        if (btnFilterFav) {
            btnFilterFav.addEventListener('click', () => setNotesFilter('fav'));
        }

        // Nút nạp sample notes
        const btnSample = document.getElementById('btn-load-sample-notes');
        if (btnSample) {
            btnSample.addEventListener('click', loadSampleNotes);
        }

        // Nút thêm từ hero banner
        const btnHeroAdd = document.getElementById('btn-hero-add-note');
        if (btnHeroAdd) {
            btnHeroAdd.addEventListener('click', () => openNoteEntryModal());
        }

        // Nút đóng / quay lại từ modal ghi chú
        const btnClose = document.getElementById('btn-close-notes-modal');
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                closeNotesModal(true);
            });
        }

        // Nút toggle mở form thêm nhanh từ header
        const btnToggleAdd = document.getElementById('btn-toggle-add-note');
        if (btnToggleAdd) {
            btnToggleAdd.addEventListener('click', () => {
                openNoteEntryModal();
            });
        }
    }

    // Expose global methods
    window.NotesModule = {
        openModal: openNotesModal,
        closeModal: closeNotesModal,
        openEntryModal: openNoteEntryModal,
        closeEntryModal: closeNoteEntryModal,
        fetchFromSupabase: fetchNotesFromSupabase,
        setCurrentUser: (userId) => {
            currentUserId = userId;
            loadNotesLocally();
            if (userId) {
                fetchNotesFromSupabase();
                setupNotesRealtime();
            }
        }
    };

    window.openNotesModal = openNotesModal;
    window.closeNotesModal = closeNotesModal;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', registerNotesEvents);
    } else {
        registerNotesEvents();
    }
})();
