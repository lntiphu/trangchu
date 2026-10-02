/**
 * Money - Mô-đun Ghi Chú Cá Nhân (ghichu/js/app.js)
 * Module độc lập 100%, có thể chạy standalone hoặc bên trong iframe của hệ thống chính.
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

    // Quay lại màn hình chính của ứng dụng
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
                notesClient = window.__QLCT_SUPABASE_CLIENT || supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                    auth: { persistSession: true, autoRefreshToken: true },
                    realtime: { timeout: 5000 }
                });
                window.__QLCT_SUPABASE_CLIENT = notesClient;
            } catch (err) {
                console.warn('[Ghi Chú] Lỗi tạo Supabase client:', err);
            }
        }
    }

    function generateNoteId() {
        return 'note_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    }

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

    function saveNotesLocally() {
        const storageKey = currentUserId ? `money_notes_${currentUserId}` : 'money_notes_local';
        try {
            localStorage.setItem(storageKey, JSON.stringify(notes));
        } catch (e) {
            console.warn('[Ghi Chú] Lỗi lưu LocalStorage:', e);
        }
    }

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
            console.warn('[Ghi Chú] Lỗi đọc LocalStorage:', e);
            notes = [];
        }
        renderNotesList();
    }

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
                    console.info('[Ghi Chú] Bảng "notes" chưa tồn tại trên Supabase. Đang chạy offline LocalStorage.');
                } else {
                    console.warn('[Ghi Chú] Lỗi tải ghi chú:', error.message);
                }
                return;
            }

            if (data && Array.isArray(data)) {
                notes = data.map(row => ({
                    id: row.id,
                    title: row.title || '',
                    content: row.content || '',
                    createdAt: row.created_at || new Date().toISOString(),
                    updatedAt: row.updated_at || new Date().toISOString()
                }));
                saveNotesLocally();
                renderNotesList();
            }
        } catch (err) {
            console.warn('[Ghi Chú] Lỗi kết nối Supabase:', err);
        }
    }

    async function syncNoteToSupabase(note) {
        if (!notesClient || !currentUserId) return;

        try {
            const payload = {
                id: note.id,
                user_id: currentUserId,
                title: note.title,
                content: note.content || '',
                created_at: note.createdAt || new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { error } = await notesClient
                .from('notes')
                .upsert([payload], { onConflict: 'user_id,id' });

            if (error && error.code !== '42P01') {
                console.warn('[Ghi Chú] Lỗi đồng bộ ghi chú:', error.message);
            }
        } catch (e) {
            console.warn('[Ghi Chú] Lỗi đồng bộ note:', e);
        }
    }

    async function deleteNoteFromSupabase(noteId) {
        if (!notesClient || !currentUserId) return;

        try {
            const { error } = await notesClient
                .from('notes')
                .delete()
                .eq('user_id', currentUserId)
                .eq('id', noteId);

            if (error && error.code !== '42P01') {
                console.warn('[Ghi Chú] Lỗi xóa note trên Supabase:', error.message);
            }
        } catch (e) {
            console.warn('[Ghi Chú] Lỗi xóa note:', e);
        }
    }

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
            console.warn('[Ghi Chú] Lỗi Realtime:', e);
        }
    }

    function handleNotesRealtimeChange(payload) {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === 'INSERT') {
            if (newRow && !notes.some(n => n.id === newRow.id)) {
                notes.unshift({
                    id: newRow.id,
                    title: newRow.title || '',
                    content: newRow.content || '',
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

    function renderNotesList() {
        const container = document.getElementById('notes-cards-container');
        const counterEl = document.getElementById('notes-counter-badge');
        const searchInput = document.getElementById('notes-search-input');
        if (!container) return;

        const query = (searchInput ? searchInput.value : '').trim().toLowerCase();

        const filtered = notes.filter(n => {
            if (!query) return true;
            const t = (n.title || '').toLowerCase();
            const c = (n.content || '').toLowerCase();
            return t.includes(query) || c.includes(query);
        });

        if (counterEl) {
            counterEl.textContent = `${filtered.length} / ${notes.length} ghi chú`;
        }

        if (filtered.length === 0) {
            if (query) {
                container.innerHTML = `
                    <div class="notes-empty-state">
                        <i data-lucide="search-x" class="notes-empty-icon"></i>
                        <h4>Không tìm thấy ghi chú</h4>
                        <p>Không có ghi chú nào khớp với từ khóa "<strong>${escapeHtml(query)}</strong>"</p>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="notes-empty-state">
                        <i data-lucide="file-plus" class="notes-empty-icon"></i>
                        <h4>Chưa có ghi chú nào</h4>
                        <p>Nhập Tên và Mô tả ghi chú ở ô phía trên rồi bấm "Lưu ghi chú" để tạo ghi chú đầu tiên của bạn.</p>
                    </div>
                `;
            }
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }
            return;
        }

        let html = '';
        filtered.forEach(note => {
            const dateText = formatNoteDate(note.updatedAt || note.createdAt);
            const contentHtml = note.content 
                ? escapeHtml(note.content).replace(/\n/g, '<br>') 
                : '<em class="notes-no-content">(Không có mô tả)</em>';

            html += `
                <div class="note-card" data-note-id="${escapeHtml(note.id)}">
                    <div class="note-card-header">
                        <div class="note-card-title-group">
                            <h4 class="note-card-title">${escapeHtml(note.title)}</h4>
                            <span class="note-card-date"><i data-lucide="clock"></i> ${dateText}</span>
                        </div>
                        <div class="note-card-actions">
                            <button type="button" class="note-action-btn btn-copy-note" data-id="${escapeHtml(note.id)}" title="Sao chép nội dung" aria-label="Sao chép">
                                <i data-lucide="copy"></i>
                            </button>
                            <button type="button" class="note-action-btn btn-edit-note" data-id="${escapeHtml(note.id)}" title="Chỉnh sửa ghi chú" aria-label="Chỉnh sửa">
                                <i data-lucide="edit-2"></i>
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

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function copyNoteContent(id) {
        const note = notes.find(n => n.id === id);
        if (!note) return;

        const textToCopy = `${note.title}\n\n${note.content || ''}`.trim();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                showNotesToast('Đã sao chép nội dung ghi chú!');
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
            showNotesToast('Đã sao chép nội dung ghi chú!');
        } catch {
            showNotesToast('Không thể sao chép');
        }
        document.body.removeChild(ta);
    }

    function showNotesToast(msg) {
        let toast = document.getElementById('notes-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'notes-toast';
            toast.className = 'notes-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2200);
    }

    function openNoteModal(isEdit) {
        const modal = document.getElementById('notes-modal-overlay');
        if (modal) {
            modal.classList.add('active');
            const titleInput = document.getElementById('note-title-input');
            if (titleInput) {
                setTimeout(() => titleInput.focus(), 150);
            }
        }
    }

    function closeNoteModal() {
        const modal = document.getElementById('notes-modal-overlay');
        if (modal) {
            modal.classList.remove('active');
        }
        resetNoteForm();
    }

    function editNote(id) {
        const note = notes.find(n => n.id === id);
        if (!note) return;

        isEditingId = id;
        const idInput = document.getElementById('note-id');
        const titleInput = document.getElementById('note-title-input');
        const contentInput = document.getElementById('note-content-input');
        const headingEl = document.getElementById('notes-form-heading');
        const btnSaveText = document.getElementById('btn-save-note-text');

        if (idInput) idInput.value = note.id;
        if (titleInput) titleInput.value = note.title;
        if (contentInput) contentInput.value = note.content || '';
        if (headingEl) headingEl.textContent = 'Chỉnh sửa ghi chú';
        if (btnSaveText) btnSaveText.textContent = 'Cập nhật ghi chú';

        openNoteModal(true);
    }

    function resetNoteForm() {
        isEditingId = null;
        const form = document.getElementById('notes-form');
        if (form) form.reset();

        const idInput = document.getElementById('note-id');
        if (idInput) idInput.value = '';

        const headingEl = document.getElementById('notes-form-heading');
        const btnSaveText = document.getElementById('btn-save-note-text');

        if (headingEl) headingEl.textContent = 'Thêm ghi chú mới';
        if (btnSaveText) btnSaveText.textContent = 'Lưu ghi chú';
    }

    async function handleSaveNote(e) {
        if (e) e.preventDefault();

        const titleInput = document.getElementById('note-title-input');
        const contentInput = document.getElementById('note-content-input');

        const title = (titleInput ? titleInput.value : '').trim();
        const content = (contentInput ? contentInput.value : '').trim();

        if (!title) {
            showNotesToast('Vui lòng nhập tên ghi chú!');
            if (titleInput) titleInput.focus();
            return;
        }

        if (isEditingId) {
            const idx = notes.findIndex(n => n.id === isEditingId);
            if (idx !== -1) {
                notes[idx].title = title;
                notes[idx].content = content;
                notes[idx].updatedAt = new Date().toISOString();
                
                const updatedNote = notes[idx];
                saveNotesLocally();
                renderNotesList();
                syncNoteToSupabase(updatedNote);
                showNotesToast('Đã cập nhật ghi chú thành công!');
            }
        } else {
            const newNote = {
                id: generateNoteId(),
                title: title,
                content: content,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            notes.unshift(newNote);
            saveNotesLocally();
            renderNotesList();
            syncNoteToSupabase(newNote);
            showNotesToast('Đã thêm ghi chú mới!');
        }

        closeNoteModal();
    }

    function deleteNote(id) {
        const note = notes.find(n => n.id === id);
        if (!note) return;

        if (confirm(`Bạn có chắc chắn muốn xóa ghi chú "${note.title}"?`)) {
            notes = notes.filter(n => n.id !== id);
            saveNotesLocally();
            renderNotesList();
            deleteNoteFromSupabase(id);
            if (isEditingId === id) resetNoteForm();
            showNotesToast('Đã xóa ghi chú');
        }
    }

    function initApp() {
        initSupabase();

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
                console.warn('[Ghi Chú] Auth check:', e);
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

        const form = document.getElementById('notes-form');
        if (form) form.addEventListener('submit', handleSaveNote);

        const btnCancel = document.getElementById('btn-cancel-note-form');
        if (btnCancel) btnCancel.addEventListener('click', closeNoteModal);

        const btnCloseModal = document.getElementById('btn-close-note-modal');
        if (btnCloseModal) btnCloseModal.addEventListener('click', closeNoteModal);

        const modalOverlay = document.getElementById('notes-modal-overlay');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) closeNoteModal();
            });
        }

        const searchInput = document.getElementById('notes-search-input');
        if (searchInput) searchInput.addEventListener('input', renderNotesList);

        const btnToggleAdd = document.getElementById('btn-toggle-add-note');
        if (btnToggleAdd) {
            btnToggleAdd.addEventListener('click', () => {
                resetNoteForm();
                openNoteModal(false);
            });
        }

        const btnNavSearch = document.getElementById('btn-nav-search');
        if (btnNavSearch) {
            btnNavSearch.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                if (searchInput) searchInput.focus();
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
})();
