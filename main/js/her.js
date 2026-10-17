/**
 * Két Bí Mật về Cô Ấy (Her Vault) - UX/UI Redesign 2026
 * Module quản lý toàn diện thông tin cô ấy:
 * 1. Hồ sơ cá nhân (Nickname, Avatar, Sinh nhật, Ngày kỷ niệm, Lời nhắn gửi)
 * 2. Size & Số đo cơ thể (kèm gợi ý size nhanh, tính BMI & tỉ lệ vóc dáng, size nhẫn nhiều ngón)
 * 3. Đồ ăn: Phải mua & Không nên mua (kèm tìm kiếm, copy nhanh & vòng quay ngẫu nhiên "Hôm nay ăn gì?")
 * 4. Ghi chú về cô ấy (kèm tìm kiếm, bộ lọc danh mục, ghim ghi chú quan trọng & copy nhanh)
 * 5. Quan tâm: Ngày kỷ niệm (Hero Countdown) & Wishlist quà tặng (Lọc trạng thái, ngân sách dự kiến, link sản phẩm)
 * 6. Nhật ký tâm trạng & Cẩm nang cấp cứu khi cô ấy giận / đến ngày "dâu"
 * Lưu trữ: Supabase + LocalStorage offline-first
 */
(function () {
    'use strict';

    const SUPABASE_URL = 'https://ghdydszifdaiphcjguri.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZHlkc3ppZmRhaXBoY2pndXJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjAzOTgsImV4cCI6MjEwMDE5NjM5OH0.ZTpS0cdmmCO4eH41nXFGQpnAELgD5iMwOEpl_mG7S1c';

    const STORAGE_PREFIX = 'qlct_her_vault_v1';
    let herClient = null;
    let currentUserId = null;

    // Trạng thái hiển thị hiện tại
    let currentTab = 'info';               // 'info' | 'food' | 'notes' | 'dates' | 'mood'
    let currentFoodSubtab = 'must_buy';    // 'must_buy' | 'should_not_buy'
    let currentDateSubtab = 'anniversary'; // 'anniversary' | 'wishlist' | 'memory'

    // Bộ lọc & Tìm kiếm
    let foodSearchQuery = '';
    let notesSearchQuery = '';
    let currentNoteCat = 'all';
    let wishlistFilter = 'all';            // 'all' | 'pending' | 'gifted'
    let moodFilter = 'all';                // 'all' | specific mood

    // Form Entry Modal State
    let currentEntryType = null;          // 'food' | 'note' | 'date' | 'wishlist' | 'mood' | 'ring' | 'memory'
    let currentEditingId = null;

    // Dữ liệu Profile cá nhân & Thông tin đo lường
    let profile = {
        nickname: 'Cô ấy',
        avatar: '🌸',
        birthday: '',
        anniversary_date: '',
        quote: 'Lưu lại những điều nhỏ bé để yêu thương cô ấy nhiều hơn ✨',
        shirt_size: '',
        pants_size: '',
        shoe_size: '',
        bra_size: '',
        ring_general: '',
        ring_sizes: [],
        height: '',
        weight: '',
        bust: '',
        waist: '',
        hips: '',
        shoulder: '',
        bicep: '',
        fav_colors: '',
        fav_scent: '',
        skin_type: '',
        note: ''
    };

    let foods = [];
    let notes = [];
    let dates = [];
    let wishlist = [];
    let moods = [];
    let memories = [];

    const MOOD_CONFIG = {
        happy: { label: 'Vui vẻ', emoji: '😊', bg: '#FEF9C3', color: '#854D0E', border: '#FDE047' },
        love: { label: 'Ngọt ngào', emoji: '🥰', bg: '#FFE4E6', color: '#9F1239', border: '#FDA4AF' },
        sad: { label: 'Buồn bã', emoji: '🥺', bg: '#E0F2FE', color: '#0369A1', border: '#BAE6FD' },
        angry: { label: 'Giận dỗi', emoji: '😤', bg: '#FFEDD5', color: '#9A3412', border: '#FDBA74' },
        tired: { label: 'Mệt mỏi', emoji: '😴', bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' },
        period: { label: 'Ngày "dâu"', emoji: '🌸', bg: '#FCE7F3', color: '#9D174D', border: '#F472B6' }
    };

    function createId(prefix = 'item') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 (Hà Nội)

    function getVietnamTodayParts(input = Date.now()) {
        const ms = input instanceof Date ? input.getTime() : (typeof input === 'number' ? input : new Date(input).getTime());
        if (Number.isNaN(ms)) return null;
        const shifted = new Date(ms + VN_OFFSET_MS);
        return {
            year: shifted.getUTCFullYear(),
            month: shifted.getUTCMonth(),
            day: shifted.getUTCDate(),
            isoDate: shifted.toISOString().slice(0, 10),
            midnightUtcMs: Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
        };
    }

    function formatDateVN(dateStr) {
        if (!dateStr) return '';
        try {
            const cleanStr = String(dateStr).trim();
            // Check if already in dd/mm/yyyy or d/m/yyyy format
            const dmyMatch = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (dmyMatch) {
                return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${dmyMatch[3]}`;
            }
            // Check if in yyyy-mm-dd or yyyy-mm-ddTHH:mm:ss format
            const ymdMatch = cleanStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (ymdMatch) {
                const [, y, m, d] = ymdMatch;
                return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
            }
            // Fallback to Date object parsing in UTC+7
            const vn = getVietnamTodayParts(dateStr);
            if (vn) {
                const day = String(vn.day).padStart(2, '0');
                const month = String(vn.month + 1).padStart(2, '0');
                const year = vn.year;
                return `${day}/${month}/${year}`;
            }
            return dateStr;
        } catch {
            return dateStr;
        }
    }

    function parseDateVNToISO(dmyStr) {
        if (!dmyStr) return '';
        const clean = String(dmyStr).trim();
        const dmy = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dmy) {
            const [, d, m, y] = dmy;
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(clean)) {
            const [y, m, d] = clean.split('-');
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return '';
    }

    function renderHerDatePickerHtml({ id, label, value = '', required = false, icon = 'calendar' }) {
        const isoVal = value ? (parseDateVNToISO(value) || value) : '';
        const displayVal = formatDateVN(isoVal);
        return `
            <div class="her-form-group">
                <label for="${id}_display"><i data-lucide="${icon}" class="her-field-icon"></i> ${label}</label>
                <div class="her-date-picker-wrap">
                    <input type="text"
                           id="${id}_display"
                           class="her-form-input her-date-display-input"
                           placeholder="dd/mm/yyyy"
                           maxlength="10"
                           autocomplete="off"
                           ${required ? 'required' : ''}
                           value="${displayVal}">
                    <div class="her-date-picker-trigger" title="Mở lịch chọn ngày">
                        <i data-lucide="calendar"></i>
                        <input type="date"
                               id="${id}"
                               class="her-native-date-input"
                               tabindex="-1"
                               aria-label="${label}"
                               value="${isoVal}">
                    </div>
                </div>
            </div>
        `;
    }

    function bindHerDatePicker(id) {
        const nativeInput = document.getElementById(id);
        const displayInput = document.getElementById(`${id}_display`);
        if (!nativeInput || !displayInput) return;

        const syncFromNative = () => {
            if (nativeInput.value) {
                displayInput.value = formatDateVN(nativeInput.value);
            }
        };

        nativeInput.addEventListener('change', syncFromNative);
        nativeInput.addEventListener('input', syncFromNative);

        const trigger = nativeInput.closest('.her-date-picker-trigger');
        if (trigger) {
            trigger.addEventListener('click', (e) => {
                if (e.target !== nativeInput && typeof nativeInput.showPicker === 'function') {
                    try { nativeInput.showPicker(); } catch {}
                }
            });
        }

        displayInput.addEventListener('input', () => {
            const val = displayInput.value.trim();
            const dmy = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (dmy) {
                const [, d, m, y] = dmy;
                nativeInput.value = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
        });

        displayInput.addEventListener('blur', () => {
            const val = displayInput.value.trim();
            if (!val) {
                nativeInput.value = '';
                return;
            }
            const dmy = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (dmy) {
                const [, d, m, y] = dmy;
                displayInput.value = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
                nativeInput.value = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            } else if (nativeInput.value) {
                displayInput.value = formatDateVN(nativeInput.value);
            }
        });
    }

    function setHerDateValue(id, val) {
        const nativeInput = document.getElementById(id);
        const displayInput = document.getElementById(`${id}_display`);
        if (!nativeInput && !displayInput) return;
        const iso = val ? (parseDateVNToISO(val) || val) : '';
        if (nativeInput) nativeInput.value = iso;
        if (displayInput) displayInput.value = formatDateVN(iso);
    }

    function getHerDateValue(id) {
        const displayInput = document.getElementById(`${id}_display`);
        const nativeInput = document.getElementById(id);
        if (displayInput && displayInput.value && displayInput.value.trim()) {
            const iso = parseDateVNToISO(displayInput.value.trim());
            if (iso) return iso;
        }
        if (nativeInput && nativeInput.value) return nativeInput.value;
        return '';
    }

    function refreshIcons() {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    // ========================================================================
    // TOAST NOTIFICATION & FEEDBACK
    // ========================================================================
    let toastTimeout = null;
    function showHerToast(text) {
        const toast = document.getElementById('her-toast');
        if (!toast) return;
        toast.innerHTML = `<i data-lucide="sparkles"></i> <span>${escapeHtml(text)}</span>`;
        toast.classList.add('show');
        refreshIcons();
        if (navigator.vibrate) {
            try { navigator.vibrate(25); } catch {}
        }
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 2200);
    }

    async function copyToClipboard(text, successMsg = 'Đã sao chép vào bộ nhớ tạm ✨') {
        if (!text) return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            showHerToast(successMsg);
        } catch {
            showHerToast('Không thể sao chép');
        }
    }

    function updateSyncBadge(text, isError = false) {
        const badge = document.getElementById('her-sync-badge');
        const span = document.getElementById('her-sync-text');
        if (!badge || !span) return;
        span.textContent = text;
        badge.classList.toggle('her-sync-error', isError);
    }

    // ========================================================================
    // SUPABASE & LOCAL STORAGE
    // ========================================================================
    function initSupabase() {
        if (herClient) return;
        try {
            if (window.supabase && typeof window.supabase.createClient === 'function') {
                herClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            }
        } catch (err) {
            console.warn('[Her Vault] Không thể khởi tạo Supabase:', err);
        }
    }

    function getStorageKey(key) {
        return currentUserId ? `${STORAGE_PREFIX}_${key}_${currentUserId}` : `${STORAGE_PREFIX}_${key}`;
    }

    function saveLocal() {
        try {
            localStorage.setItem(getStorageKey('profile'), JSON.stringify(profile));
            localStorage.setItem(getStorageKey('foods'), JSON.stringify(foods));
            localStorage.setItem(getStorageKey('notes'), JSON.stringify(notes));
            localStorage.setItem(getStorageKey('dates'), JSON.stringify(dates));
            localStorage.setItem(getStorageKey('wishlist'), JSON.stringify(wishlist));
            localStorage.setItem(getStorageKey('moods'), JSON.stringify(moods));
            localStorage.setItem(getStorageKey('memories'), JSON.stringify(memories));
        } catch (e) {
            console.warn('[Her Vault] Lưu local thất bại:', e);
        }
    }

    function loadLocal() {
        try {
            const rawProfile = localStorage.getItem(getStorageKey('profile'));
            const rawFoods = localStorage.getItem(getStorageKey('foods'));
            const rawNotes = localStorage.getItem(getStorageKey('notes'));
            const rawDates = localStorage.getItem(getStorageKey('dates'));
            const rawWishlist = localStorage.getItem(getStorageKey('wishlist'));
            const rawMoods = localStorage.getItem(getStorageKey('moods'));
            const rawMemories = localStorage.getItem(getStorageKey('memories'));

            if (rawProfile) {
                profile = { ...profile, ...JSON.parse(rawProfile) };
            }
            foods = rawFoods ? JSON.parse(rawFoods) : [];
            notes = rawNotes ? JSON.parse(rawNotes) : [];
            dates = rawDates ? JSON.parse(rawDates) : [];
            wishlist = rawWishlist ? JSON.parse(rawWishlist) : [];
            moods = rawMoods ? JSON.parse(rawMoods) : [];
            memories = rawMemories ? JSON.parse(rawMemories) : [];
        } catch (e) {
            console.warn('[Her Vault] Lỗi đọc local:', e);
        }
    }

    async function loadData() {
        loadLocal();
        renderAll();

        initSupabase();
        if (!herClient || !currentUserId) {
            updateSyncBadge('Đang lưu trên thiết bị');
            return;
        }

        try {
            updateSyncBadge('Đang đồng bộ...');
            // 1. Profile
            const { data: pData, error: pErr } = await herClient.from('her_profile').select('*').eq('user_id', currentUserId).maybeSingle();
            if (!pErr && pData) {
                let extra = {};
                if (pData.note) {
                    try {
                        extra = JSON.parse(pData.note);
                    } catch {
                        extra = { note: pData.note };
                    }
                }
                profile = {
                    nickname: extra.nickname || profile.nickname || 'Cô ấy',
                    avatar: extra.avatar || profile.avatar || '🌸',
                    birthday: extra.birthday || profile.birthday || '',
                    anniversary_date: extra.anniversary_date || profile.anniversary_date || '',
                    quote: extra.quote || profile.quote || 'Lưu lại những điều nhỏ bé để yêu thương cô ấy nhiều hơn ✨',
                    fav_colors: extra.fav_colors || profile.fav_colors || '',
                    fav_scent: extra.fav_scent || profile.fav_scent || '',
                    skin_type: extra.skin_type || profile.skin_type || '',
                    shirt_size: pData.shirt_size || '',
                    pants_size: pData.pants_size || '',
                    shoe_size: pData.shoe_size || '',
                    bra_size: pData.bra_size || '',
                    ring_general: pData.ring_general || '',
                    ring_sizes: Array.isArray(pData.ring_sizes) ? pData.ring_sizes : [],
                    height: pData.height || '',
                    weight: pData.weight || '',
                    bust: pData.bust || '',
                    waist: pData.waist || '',
                    hips: pData.hips || '',
                    shoulder: pData.shoulder || '',
                    bicep: pData.bicep || '',
                    note: extra.note || ''
                };
            }

            // 2. Foods
            const { data: fData, error: fErr } = await herClient.from('her_foods').select('*').eq('user_id', currentUserId);
            if (!fErr && fData && fData.length > 0) {
                foods = fData.map(r => ({
                    id: r.id,
                    type: r.type,
                    name: r.name,
                    note: r.note,
                    place: r.place,
                    createdAt: r.created_at
                }));
            }

            // 3. Notes
            const { data: nData, error: nErr } = await herClient.from('her_notes').select('*').eq('user_id', currentUserId);
            if (!nErr && nData && nData.length > 0) {
                notes = nData.map(r => ({
                    id: r.id,
                    title: r.title,
                    content: r.content,
                    category: r.category,
                    is_pinned: Boolean(r.category?.includes('[PINNED]')),
                    createdAt: r.created_at
                }));
            }

            // 4. Dates
            const { data: dData, error: dErr } = await herClient.from('her_dates').select('*').eq('user_id', currentUserId);
            if (!dErr && dData && dData.length > 0) {
                dates = dData.map(r => ({
                    id: r.id,
                    title: r.title,
                    event_date: r.event_date,
                    repeat_yearly: r.repeat_yearly,
                    note: r.note,
                    createdAt: r.created_at
                }));
            }

            // 5. Wishlist
            const { data: wData, error: wErr } = await herClient.from('her_wishlist').select('*').eq('user_id', currentUserId);
            if (!wErr && wData && wData.length > 0) {
                wishlist = wData.map(r => ({
                    id: r.id,
                    title: r.title,
                    price_range: r.price_range,
                    link: r.link,
                    priority: r.priority,
                    is_gifted: r.is_gifted,
                    note: r.note,
                    createdAt: r.created_at
                }));
            }

            // 6. Moods
            const { data: mData, error: mErr } = await herClient.from('her_moods').select('*').eq('user_id', currentUserId);
            if (!mErr && mData && mData.length > 0) {
                moods = mData.map(r => ({
                    id: r.id,
                    mood_date: r.mood_date,
                    mood_type: r.mood_type,
                    title: r.title,
                    note: r.note,
                    solution: r.solution,
                    createdAt: r.created_at
                }));
            }

            // 7. Memories
            const { data: memData, error: memErr } = await herClient.from('her_memories').select('*').eq('user_id', currentUserId).order('memory_date', { ascending: false });
            if (!memErr && memData && memData.length > 0) {
                memories = memData.map(r => ({
                    id: r.id,
                    title: r.title,
                    memory_date: r.memory_date,
                    category: r.category || 'Kỷ niệm 💕',
                    location: r.location || '',
                    description: r.description || '',
                    photo_url: r.photo_url || '',
                    createdAt: r.created_at
                }));
            }

            saveLocal();
            renderAll();
            updateSyncBadge('Đã kết nối Supabase');
        } catch (err) {
            console.warn('[Her Vault] Đồng bộ Supabase lỗi:', err);
            updateSyncBadge('Đang lưu trên thiết bị');
        }
    }

    // ========================================================================
    // CUTE MASCOT SVGS (CAPYBARA HERO WITH RED CAPE & MASK)
    // ========================================================================
    function getZenCapybaraSvg() {
        return `
        <svg class="her-mascot-svg" viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <ellipse cx="60" cy="130" rx="32" ry="5.5" fill="#E2E8F0" opacity="0.6" />
            <path d="M40 50 L16 118 C16 118 50 128 104 118 L80 50 Z" fill="#FF4B55" />
            <path d="M40 50 L18 117 C18 117 46 122 72 120 L56 50 Z" fill="#E0333E" opacity="0.5" />
            <ellipse cx="38" cy="116" rx="15" ry="8" fill="#935E50" transform="rotate(-6 38 116)" />
            <ellipse cx="82" cy="116" rx="15" ry="8" fill="#935E50" transform="rotate(6 82 116)" />
            <circle cx="28" cy="116" r="3" fill="#7D493D" />
            <circle cx="92" cy="116" r="3" fill="#7D493D" />
            <ellipse cx="60" cy="88" rx="29" ry="32" fill="#B27866" />
            <ellipse cx="60" cy="94" rx="18" ry="21" fill="#FDEBD0" />
            <path d="M38 74 C30 84 26 98 34 111" stroke="#935E50" stroke-width="7" stroke-linecap="round" fill="none" />
            <path d="M82 74 C90 84 94 98 86 111" stroke="#935E50" stroke-width="7" stroke-linecap="round" fill="none" />
            <circle cx="34" cy="111" r="5" fill="#7D493D" />
            <circle cx="86" cy="111" r="5" fill="#7D493D" />
            <rect x="38" y="24" width="44" height="42" rx="16" fill="#B27866" />
            <ellipse cx="38" cy="25" rx="5.5" ry="4.5" fill="#8D5B4C" />
            <ellipse cx="82" cy="25" rx="5.5" ry="4.5" fill="#8D5B4C" />
            <path d="M36 38 C36 32 46 31 60 34 C74 31 84 32 84 38 C84 45 74 46 60 43 C46 46 36 45 36 38 Z" fill="#FF4B55" />
            <ellipse cx="49" cy="38" rx="4" ry="4" fill="#FFFFFF" />
            <ellipse cx="71" cy="38" rx="4" ry="4" fill="#FFFFFF" />
            <circle cx="50" cy="38" r="2.2" fill="#1E2448" />
            <circle cx="70" cy="38" r="2.2" fill="#1E2448" />
            <circle cx="51" cy="37" r="0.7" fill="#FFFFFF" />
            <circle cx="71" cy="37" r="0.7" fill="#FFFFFF" />
            <rect x="50" y="44" width="20" height="15" rx="5" fill="#935E50" />
            <circle cx="56" cy="48" r="1.5" fill="#3E2723" />
            <circle cx="64" cy="48" r="1.5" fill="#3E2723" />
            <path d="M57 53 Q60 55.5 63 53" stroke="#3E2723" stroke-width="1.4" stroke-linecap="round" fill="none" />
            <circle cx="60" cy="62" r="3.5" fill="#FFE4E8" stroke="#FF4B55" stroke-width="2" />
        </svg>
        `;
    }

    function getHeartCapybaraSvg() {
        return `
        <svg class="her-mascot-svg" viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <ellipse cx="60" cy="132" rx="30" ry="5.5" fill="#E2E8F0" opacity="0.6" />
            <path d="M42 46 L20 116 C20 116 50 126 100 116 L78 46 Z" fill="#FF4B55" />
            <path d="M42 46 L22 115 C22 115 45 120 70 118 L55 46 Z" fill="#E0333E" opacity="0.5" />
            <ellipse cx="46" cy="125" rx="9" ry="6" fill="#8D5B4C" />
            <ellipse cx="74" cy="125" rx="9" ry="6" fill="#8D5B4C" />
            <ellipse cx="60" cy="85" rx="30" ry="36" fill="#B27866" />
            <ellipse cx="60" cy="91" rx="18" ry="24" fill="#FDEBD0" />
            <path d="M60 84 C60 84 53 74 46 81 C39 88 50 97 60 103 C70 97 81 88 74 81 C67 74 60 84 60 84 Z" fill="#FF334B" />
            <circle cx="44" cy="89" r="6" fill="#8D5B4C" />
            <circle cx="76" cy="89" r="6" fill="#8D5B4C" />
            <rect x="38" y="24" width="44" height="42" rx="16" fill="#B27866" />
            <ellipse cx="38" cy="25" rx="5.5" ry="4.5" fill="#8D5B4C" />
            <ellipse cx="82" cy="25" rx="5.5" ry="4.5" fill="#8D5B4C" />
            <path d="M36 38 C36 32 46 31 60 34 C74 31 84 32 84 38 C84 45 74 46 60 43 C46 46 36 45 36 38 Z" fill="#FF4B55" />
            <ellipse cx="49" cy="38" rx="4" ry="4" fill="#FFFFFF" />
            <ellipse cx="71" cy="38" rx="4" ry="4" fill="#FFFFFF" />
            <circle cx="50" cy="38" r="2.2" fill="#1E2448" />
            <circle cx="70" cy="38" r="2.2" fill="#1E2448" />
            <circle cx="51" cy="37" r="0.7" fill="#FFFFFF" />
            <circle cx="71" cy="37" r="0.7" fill="#FFFFFF" />
            <rect x="50" y="44" width="20" height="15" rx="5" fill="#935E50" />
            <circle cx="56" cy="48" r="1.5" fill="#3E2723" />
            <circle cx="64" cy="48" r="1.5" fill="#3E2723" />
            <path d="M57 53 Q60 55.5 63 53" stroke="#3E2723" stroke-width="1.4" stroke-linecap="round" fill="none" />
            <circle cx="60" cy="62" r="3.5" fill="#FFE4E8" stroke="#FF4B55" stroke-width="2" />
        </svg>
        `;
    }

    // ========================================================================
    // TAB NAVIGATION & BADGES
    // ========================================================================
    function updateHeaderBadge() {
        const badge = document.getElementById('her-header-badge');
        if (!badge) return;
        let count = 1;
        if (currentTab === 'food') {
            const c = foods.filter(f => f.type === currentFoodSubtab).length;
            count = c > 0 ? c : 1;
        } else if (currentTab === 'notes') {
            count = notes.length > 0 ? notes.length : 1;
        } else if (currentTab === 'dates') {
            if (currentDateSubtab === 'anniversary') {
                count = dates.length > 0 ? dates.length : 1;
            } else if (currentDateSubtab === 'wishlist') {
                count = wishlist.length > 0 ? wishlist.length : 1;
            } else {
                count = memories.length > 0 ? memories.length : 1;
            }
        } else if (currentTab === 'mood') {
            count = moods.length > 0 ? moods.length : 1;
        }
        badge.textContent = String(count);
    }

    function updateTabBadges() {
        const foodCount = foods.length;
        const notesCount = notes.length;
        const datesCount = dates.length + wishlist.length + memories.length;
        const moodCount = moods.length;

        const bFood = document.getElementById('her-tab-count-food');
        const bNotes = document.getElementById('her-tab-count-notes');
        const bDates = document.getElementById('her-tab-count-dates');
        const bMood = document.getElementById('her-tab-count-mood');

        if (bFood) {
            bFood.textContent = foodCount;
            bFood.style.display = foodCount > 0 ? 'flex' : 'none';
        }
        if (bNotes) {
            bNotes.textContent = notesCount;
            bNotes.style.display = notesCount > 0 ? 'flex' : 'none';
        }
        if (bDates) {
            bDates.textContent = datesCount;
            bDates.style.display = datesCount > 0 ? 'flex' : 'none';
        }
        if (bMood) {
            bMood.textContent = moodCount;
            bMood.style.display = moodCount > 0 ? 'flex' : 'none';
        }

        updateHeaderBadge();
    }

    function switchTab(tabName) {
        currentTab = tabName;

        // Header dynamic color
        const header = document.getElementById('her-page-header');
        if (header) {
            if (tabName === 'food') {
                header.classList.remove('theme-coral');
                header.classList.add('theme-mint');
            } else {
                header.classList.remove('theme-mint');
                header.classList.add('theme-coral');
            }
        }

        // Toggle buttons active state
        document.querySelectorAll('.her-tab-btn').forEach(btn => {
            const isTarget = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isTarget);
            btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
        });

        // Toggle panel visibility
        document.querySelectorAll('.her-tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `her-tab-content-${tabName}`);
        });

        updateHeaderBadge();

        const scrollArea = document.getElementById('her-page-scroll');
        if (scrollArea) scrollArea.scrollTop = 0;
        refreshIcons();
    }

    function switchFoodSubtab(subtab) {
        currentFoodSubtab = subtab;
        document.getElementById('btn-food-subtab-must')?.classList.toggle('active', subtab === 'must_buy');
        document.getElementById('btn-food-subtab-avoid')?.classList.toggle('active', subtab === 'should_not_buy');

        const btnAdd = document.getElementById('btn-add-her-food');
        const textSpan = document.getElementById('her-add-food-btn-text');
        if (btnAdd) {
            if (subtab === 'must_buy') {
                btnAdd.className = 'her-action-bar-btn her-action-mint';
                if (textSpan) textSpan.textContent = 'Thêm món nên mua';
            } else {
                btnAdd.className = 'her-action-bar-btn her-action-coral';
                if (textSpan) textSpan.textContent = 'Thêm món không nên mua';
            }
        }
        renderFoods();
        updateHeaderBadge();
        refreshIcons();
    }

    function switchDateSubtab(subtab) {
        currentDateSubtab = subtab;
        document.getElementById('btn-dates-subtab-anniversary')?.classList.toggle('active', subtab === 'anniversary');
        document.getElementById('btn-dates-subtab-wishlist')?.classList.toggle('active', subtab === 'wishlist');
        document.getElementById('btn-dates-subtab-memory')?.classList.toggle('active', subtab === 'memory');

        const btnAdd = document.getElementById('btn-add-her-date-wish');
        const textSpan = document.getElementById('her-add-date-wish-btn-text');
        const anniCard = document.getElementById('her-anniversary-hero-card');
        const wishCard = document.getElementById('her-wishlist-summary-card');
        const memCard = document.getElementById('her-memory-summary-card');

        if (subtab === 'anniversary') {
            if (anniCard) anniCard.style.display = 'flex';
            if (wishCard) wishCard.style.display = 'none';
            if (memCard) memCard.style.display = 'none';
            if (textSpan) textSpan.textContent = 'Thêm ngày kỷ niệm';
        } else if (subtab === 'wishlist') {
            if (anniCard) anniCard.style.display = 'none';
            if (wishCard) wishCard.style.display = 'flex';
            if (memCard) memCard.style.display = 'none';
            if (textSpan) textSpan.textContent = 'Thêm món quà mong muốn';
        } else if (subtab === 'memory') {
            if (anniCard) anniCard.style.display = 'none';
            if (wishCard) wishCard.style.display = 'none';
            if (memCard) memCard.style.display = 'flex';
            if (textSpan) textSpan.textContent = 'Thêm kỷ niệm của 2 đứa';
        }

        renderDatesAndWishlist();
        updateHeaderBadge();
        refreshIcons();
    }

    // ========================================================================
    // HERO PROFILE CARD & BODY STATS
    // ========================================================================
    function updateHeroProfileCard() {
        const nameEl = document.getElementById('her-hero-name');
        const headerTitle = document.getElementById('her-header-title-text');
        const headerSub = document.getElementById('her-header-subtitle-text');
        const avatarEl = document.getElementById('her-hero-avatar');
        const quoteEl = document.getElementById('her-hero-quote');
        const daysText = document.getElementById('her-hero-days-text');
        const bdayChip = document.getElementById('her-hero-bday-chip');
        const bdayText = document.getElementById('her-hero-bday-text');

        const nick = profile.nickname || 'Cô ấy';
        if (nameEl) nameEl.textContent = nick;
        if (headerTitle) headerTitle.textContent = 'Két Bí Mật';
        if (headerSub) headerSub.textContent = `Bí mật về ${nick}`;
        if (avatarEl) avatarEl.textContent = profile.avatar || '🌸';
        if (quoteEl) quoteEl.textContent = profile.quote || 'Lưu lại những điều nhỏ bé để yêu thương cô ấy nhiều hơn ✨';

        // Relationship Days
        if (daysText) {
            if (profile.anniversary_date) {
                try {
                    const todayVn = getVietnamTodayParts();
                    const clean = String(profile.anniversary_date).slice(0, 10);
                    const [y, m, d] = clean.split('-').map(Number);
                    const startMs = Date.UTC(y, m - 1, d);
                    const diff = Math.floor((todayVn.midnightUtcMs - startMs) / (1000 * 60 * 60 * 24));
                    const formattedDate = formatDateVN(profile.anniversary_date);
                    if (diff >= 0) {
                        daysText.textContent = `Bên nhau ${diff} ngày 💕 (${formattedDate})`;
                    } else {
                        daysText.textContent = `Kỷ niệm: ${formattedDate}`;
                    }
                } catch {
                    daysText.textContent = 'Bên nhau mỗi ngày';
                }
            } else {
                daysText.textContent = 'Bên nhau mỗi ngày';
            }
        }

        // Birthday chip
        if (bdayChip && bdayText) {
            if (profile.birthday) {
                bdayChip.style.display = 'inline-flex';
                try {
                    const todayVn = getVietnamTodayParts();
                    const clean = String(profile.birthday).slice(0, 10);
                    const [by, bm, bd] = clean.split('-').map(Number);
                    let nextBdayMs = Date.UTC(todayVn.year, bm - 1, bd);
                    if (nextBdayMs < todayVn.midnightUtcMs) {
                        nextBdayMs = Date.UTC(todayVn.year + 1, bm - 1, bd);
                    }
                    const diffDays = Math.round((nextBdayMs - todayVn.midnightUtcMs) / (1000 * 60 * 60 * 24));
                    const formattedBday = formatDateVN(profile.birthday);
                    if (diffDays === 0) {
                        bdayText.textContent = `Hôm nay sinh nhật cô ấy! (${formattedBday}) 🎂`;
                    } else {
                        bdayText.textContent = `Sinh nhật: ${formattedBday} (còn ${diffDays} ngày) 🎂`;
                    }
                } catch {
                    bdayText.textContent = `Sinh nhật: ${formatDateVN(profile.birthday)}`;
                }
            } else {
                bdayChip.style.display = 'none';
            }
        }
    }

    function updateBodyStats() {
        const box = document.getElementById('her-bmi-summary-box');
        const title = document.getElementById('her-bmi-title');
        const desc = document.getElementById('her-bmi-desc');
        if (!box || !title || !desc) return;

        const h = parseFloat(profile.height);
        const w = parseFloat(profile.weight);

        if (h > 50 && w > 20) {
            const hM = h / 100;
            const bmi = (w / (hM * hM)).toFixed(1);
            box.style.display = 'flex';

            let comment = '';
            if (bmi < 18.5) {
                comment = 'Vóc dáng thanh mảnh, bạn nhớ tẩm bổ thêm cho cô ấy nhé! ✨';
            } else if (bmi <= 23) {
                comment = 'Vóc dáng cực chuẩn & cân đối lý tưởng! 💖';
            } else {
                comment = 'Dáng người tròn trịa đáng yêu, ôm cực ấm áp! 🥰';
            }

            title.textContent = `Chiều cao ${h}cm • Nặng ${w}kg → BMI: ${bmi}`;

            let extraCurve = '';
            if (profile.bust && profile.waist && profile.hips) {
                extraCurve = ` • 3 Vòng: ${profile.bust} - ${profile.waist} - ${profile.hips} cm ⏳`;
            }
            desc.textContent = comment + extraCurve;
        } else if (profile.bust && profile.waist && profile.hips) {
            box.style.display = 'flex';
            title.textContent = `Tỉ lệ 3 vòng: ${profile.bust} - ${profile.waist} - ${profile.hips} cm ⏳`;
            desc.textContent = 'Dáng đồng hồ cát quyến rũ tuyệt đẹp!';
        } else {
            box.style.display = 'none';
        }
    }

    // ========================================================================
    // RENDER FUNCTIONS
    // ========================================================================
    function renderAll() {
        updateHeroProfileCard();
        renderProfile();
        renderFoods();
        renderNotes();
        renderDatesAndWishlist();
        renderMoods();
        updateTabBadges();
        refreshIcons();
    }

    // TAB 1: THÔNG TIN
    function renderProfile() {
        const mapInputs = {
            'her-size-shirt': profile.shirt_size,
            'her-size-pants': profile.pants_size,
            'her-size-shoes': profile.shoe_size,
            'her-size-bra': profile.bra_size,
            'her-size-ring-general': profile.ring_general,
            'her-body-height': profile.height,
            'her-body-weight': profile.weight,
            'her-body-bust': profile.bust,
            'her-body-waist': profile.waist,
            'her-body-hips': profile.hips,
            'her-body-shoulder': profile.shoulder,
            'her-body-bicep': profile.bicep,
            'her-fav-colors': profile.fav_colors,
            'her-fav-scent': profile.fav_scent,
            'her-skin-type': profile.skin_type
        };

        Object.entries(mapInputs).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el && document.activeElement !== el) el.value = val || '';
        });

        // Render Ring Chips
        const ringList = document.getElementById('her-ring-list');
        if (ringList) {
            if (!profile.ring_sizes || profile.ring_sizes.length === 0) {
                ringList.innerHTML = `
                    <div class="her-ring-empty-box" id="btn-empty-ring-cta" title="Bấm để thêm size ngón tay">
                        <i data-lucide="plus-circle"></i>
                        <span>Chưa lưu ngón cụ thể. Bấm <strong>+ Thêm ngón tay</strong> để lưu size ngón áp út, ngón giữa...</span>
                    </div>
                `;
                document.getElementById('btn-empty-ring-cta')?.addEventListener('click', () => openEntryModal('ring'));
            } else {
                ringList.innerHTML = profile.ring_sizes.map(r => {
                    const isEngagement = (r.finger || '').includes('Cầu hôn') || (r.finger || '').includes('Cưới');
                    let displayName = escapeHtml(r.finger || '');
                    let badgeHtml = '';
                    if (isEngagement) {
                        displayName = displayName.replace(/-?\s*Cầu hôn\/Cưới/i, '').trim();
                        badgeHtml = '<span class="her-ring-wedding-pill" title="Ngón đeo nhẫn cưới / cầu hôn">💍 Cầu hôn/Cưới</span>';
                    }
                    return `
                        <div class="her-ring-chip ${isEngagement ? 'is-wedding' : ''}">
                            <div class="her-ring-chip-name-wrap">
                                <span class="her-ring-chip-bullet">✦</span>
                                <span class="finger-name">${displayName}</span>
                                ${badgeHtml}
                            </div>
                            <div class="her-ring-chip-value-wrap">
                                <span class="finger-size">${escapeHtml(r.size)}</span>
                                <button type="button" class="btn-del-ring" data-ring-id="${r.id}" title="Xóa ngón này" aria-label="Xóa ngón này">
                                    <i data-lucide="x"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');

                ringList.querySelectorAll('.btn-del-ring').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const rId = btn.dataset.ringId;
                        profile.ring_sizes = profile.ring_sizes.filter(item => item.id !== rId);
                        saveLocal();
                        void syncProfileToSupabase();
                        renderProfile();
                        showHerToast('Đã xóa ghi chú size ngón tay');
                    });
                });
            }
        }

        updateBodyStats();
        refreshIcons();
    }

    async function syncProfileToSupabase() {
        if (!herClient || !currentUserId) return;
        try {
            const extra = {
                nickname: profile.nickname,
                avatar: profile.avatar,
                birthday: profile.birthday,
                anniversary_date: profile.anniversary_date,
                quote: profile.quote,
                fav_colors: profile.fav_colors,
                fav_scent: profile.fav_scent,
                skin_type: profile.skin_type,
                note: profile.note
            };
            await herClient.from('her_profile').upsert([{
                user_id: currentUserId,
                shirt_size: profile.shirt_size,
                pants_size: profile.pants_size,
                shoe_size: profile.shoe_size,
                bra_size: profile.bra_size,
                ring_general: profile.ring_general,
                ring_sizes: profile.ring_sizes,
                height: profile.height,
                weight: profile.weight,
                bust: profile.bust,
                waist: profile.waist,
                hips: profile.hips,
                shoulder: profile.shoulder,
                bicep: profile.bicep,
                note: JSON.stringify(extra),
                updated_at: new Date().toISOString()
            }]);
        } catch (e) {
            console.warn('[Her Vault] Lưu profile Supabase lỗi:', e);
        }
    }

    function saveProfileFromInputs(showToast = true) {
        profile.shirt_size = document.getElementById('her-size-shirt')?.value.trim() || '';
        profile.pants_size = document.getElementById('her-size-pants')?.value.trim() || '';
        profile.shoe_size = document.getElementById('her-size-shoes')?.value.trim() || '';
        profile.bra_size = document.getElementById('her-size-bra')?.value.trim() || '';
        profile.ring_general = document.getElementById('her-size-ring-general')?.value.trim() || '';
        profile.height = document.getElementById('her-body-height')?.value.trim() || '';
        profile.weight = document.getElementById('her-body-weight')?.value.trim() || '';
        profile.bust = document.getElementById('her-body-bust')?.value.trim() || '';
        profile.waist = document.getElementById('her-body-waist')?.value.trim() || '';
        profile.hips = document.getElementById('her-body-hips')?.value.trim() || '';
        profile.shoulder = document.getElementById('her-body-shoulder')?.value.trim() || '';
        profile.bicep = document.getElementById('her-body-bicep')?.value.trim() || '';
        profile.fav_colors = document.getElementById('her-fav-colors')?.value.trim() || '';
        profile.fav_scent = document.getElementById('her-fav-scent')?.value.trim() || '';
        profile.skin_type = document.getElementById('her-skin-type')?.value.trim() || '';

        saveLocal();
        void syncProfileToSupabase();
        updateBodyStats();

        if (showToast) {
            showHerToast('Đã lưu thông tin size & số đo ✨');
        }
    }

    // TAB 2: ĐỒ ĂN
    function renderFoods() {
        const container = document.getElementById('her-food-list');
        if (!container) return;

        let filtered = foods.filter(item => item.type === currentFoodSubtab);

        // Lọc theo từ khóa tìm kiếm
        if (foodSearchQuery) {
            const q = foodSearchQuery.toLowerCase();
            filtered = filtered.filter(f =>
                (f.name && f.name.toLowerCase().includes(q)) ||
                (f.note && f.note.toLowerCase().includes(q)) ||
                (f.place && f.place.toLowerCase().includes(q))
            );
        }

        if (filtered.length === 0) {
            const isMustBuy = currentFoodSubtab === 'must_buy';
            container.innerHTML = `
                <div class="her-empty-state">
                    ${getZenCapybaraSvg()}
                    <h3 class="her-empty-title">${foodSearchQuery ? 'Không tìm thấy món phù hợp' : (isMustBuy ? 'Đồ ăn cô ấy thích?' : 'Món cô ấy không thích / dị ứng?')}</h3>
                    <p class="her-empty-desc">${foodSearchQuery ? 'Thử tìm với từ khóa khác nhé!' : (isMustBuy ? 'Ghi lại để lần sau đi chợ hoặc order đồ ăn!' : 'Tránh mua nhầm những món làm cô ấy khó chịu hay dị ứng.')}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(item => `
            <div class="her-item-card her-card-${item.type}">
                <div class="her-item-content">
                    <div class="her-item-header">
                        <span class="her-food-badge ${item.type === 'must_buy' ? 'badge-green' : 'badge-red'}">
                            ${item.type === 'must_buy' ? '✅ Phải mua' : '❌ Không mua'}
                        </span>
                        <h4 class="her-item-title">${escapeHtml(item.name)}</h4>
                    </div>
                    ${item.note ? `<p class="her-item-note"><i data-lucide="sparkles"></i> ${escapeHtml(item.note)}</p>` : ''}
                    ${item.place ? `<p class="her-item-place"><i data-lucide="map-pin"></i> ${escapeHtml(item.place)}</p>` : ''}
                </div>
                <div class="her-item-actions">
                    <button type="button" class="her-btn-icon btn-edit-food" data-id="${item.id}" title="Chỉnh sửa"><i data-lucide="edit-2"></i></button>
                    <button type="button" class="her-btn-icon btn-del-food" data-id="${item.id}" title="Xóa"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.btn-edit-food').forEach(b => b.addEventListener('click', () => openEntryModal('food', b.dataset.id)));
        container.querySelectorAll('.btn-del-food').forEach(b => b.addEventListener('click', () => deleteFood(b.dataset.id)));
        refreshIcons();
    }

    async function deleteFood(id) {
        const item = foods.find(f => f.id === id);
        if (!item || !window.confirm(`Bạn có chắc muốn xóa món “${item.name}” không?`)) return;
        foods = foods.filter(f => f.id !== id);
        saveLocal();
        renderFoods();
        updateTabBadges();
        showHerToast(`Đã xóa món ${item.name}`);
        if (herClient && currentUserId) {
            await herClient.from('her_foods').delete().eq('user_id', currentUserId).eq('id', id);
        }
    }

    // TAB 3: GHI CHÚ
    function renderNotes() {
        const container = document.getElementById('her-notes-list');
        if (!container) return;

        let filtered = [...notes];

        // Lọc theo Category
        if (currentNoteCat !== 'all') {
            filtered = filtered.filter(n => (n.category || '').includes(currentNoteCat));
        }

        // Lọc theo Tìm kiếm
        if (notesSearchQuery) {
            const q = notesSearchQuery.toLowerCase();
            filtered = filtered.filter(n =>
                (n.title && n.title.toLowerCase().includes(q)) ||
                (n.content && n.content.toLowerCase().includes(q))
            );
        }

        // Sắp xếp: Ghi chú được ghim lên đầu tiên
        filtered.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="her-empty-state">
                    ${getHeartCapybaraSvg()}
                    <h3 class="her-empty-title">${notesSearchQuery || currentNoteCat !== 'all' ? 'Không tìm thấy ghi chú' : 'Chưa có ghi chú nào'}</h3>
                    <p class="her-empty-desc">${notesSearchQuery ? 'Thử tìm từ khóa khác nhé!' : 'Ghi lại thói quen, sở thích nhỏ của cô ấy...'}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(item => `
            <div class="her-item-card her-note-card ${item.is_pinned ? 'is-pinned' : ''}">
                <div class="her-item-content">
                    <div class="her-item-header">
                        ${item.is_pinned ? '<span class="her-pin-badge"><i data-lucide="pin"></i> Đã ghim</span>' : ''}
                        <span class="her-note-tag">${escapeHtml((item.category || 'Ghi chú').replace('[PINNED]', '').trim())}</span>
                        <h4 class="her-item-title">${escapeHtml(item.title)}</h4>
                    </div>
                    <div class="her-item-body">${escapeHtml(item.content).replace(/\r?\n/g, '<br>')}</div>
                    ${item.createdAt ? `<div class="her-item-date"><i data-lucide="calendar"></i> ${formatDateVN(item.createdAt.slice(0, 10))}</div>` : ''}
                </div>
                <div class="her-item-actions">
                    <button type="button" class="her-btn-icon btn-pin-note ${item.is_pinned ? 'active' : ''}" data-id="${item.id}" title="${item.is_pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}"><i data-lucide="pin"></i></button>
                    <button type="button" class="her-btn-icon btn-edit-note" data-id="${item.id}" title="Chỉnh sửa"><i data-lucide="edit-2"></i></button>
                    <button type="button" class="her-btn-icon btn-del-note" data-id="${item.id}" title="Xóa"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.btn-pin-note').forEach(b => b.addEventListener('click', () => togglePinNote(b.dataset.id)));
        container.querySelectorAll('.btn-edit-note').forEach(b => b.addEventListener('click', () => openEntryModal('note', b.dataset.id)));
        container.querySelectorAll('.btn-del-note').forEach(b => b.addEventListener('click', () => deleteNote(b.dataset.id)));
        refreshIcons();
    }

    async function togglePinNote(id) {
        const item = notes.find(n => n.id === id);
        if (!item) return;
        item.is_pinned = !item.is_pinned;
        // encode pin status in category for DB compatibility
        const cleanCat = (item.category || 'Chung').replace('[PINNED]', '').trim();
        item.category = item.is_pinned ? `${cleanCat} [PINNED]` : cleanCat;
        saveLocal();
        renderNotes();
        showHerToast(item.is_pinned ? 'Đã ghim ghi chú lên đầu 📌' : 'Đã bỏ ghim ghi chú');
        if (herClient && currentUserId) {
            await herClient.from('her_notes').update({ category: item.category, updated_at: new Date().toISOString() }).eq('user_id', currentUserId).eq('id', id);
        }
    }

    async function deleteNote(id) {
        const item = notes.find(n => n.id === id);
        if (!item || !window.confirm(`Bạn có chắc muốn xóa ghi chú “${item.title}” không?`)) return;
        notes = notes.filter(n => n.id !== id);
        saveLocal();
        renderNotes();
        updateTabBadges();
        showHerToast(`Đã xóa ghi chú: ${item.title}`);
        if (herClient && currentUserId) {
            await herClient.from('her_notes').delete().eq('user_id', currentUserId).eq('id', id);
        }
    }

    // TAB 4: QUAN TÂM (NGÀY KỶ NIỆM & WISHLIST)
    function calculateDaysBadge(eventDateStr, repeatYearly) {
        if (!eventDateStr) return '';
        try {
            const todayVn = getVietnamTodayParts();

            const clean = String(eventDateStr).slice(0, 10);
            const [year, month, day] = clean.split('-').map(Number);
            let targetThisYearMs = Date.UTC(todayVn.year, month - 1, day);

            if (repeatYearly) {
                if (targetThisYearMs < todayVn.midnightUtcMs) {
                    targetThisYearMs = Date.UTC(todayVn.year + 1, month - 1, day);
                }
                const diffTime = targetThisYearMs - todayVn.midnightUtcMs;
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays === 0) return `<span class="badge-anniversary badge-today"><i data-lucide="party-popper"></i> Hôm nay là ngày kỷ niệm!</span>`;
                if (diffDays <= 7) return `<span class="badge-anniversary badge-upcoming"><i data-lucide="clock"></i> Sắp tới: Còn <strong>${diffDays}</strong> ngày!</span>`;
                return `<span class="badge-anniversary"><i data-lucide="clock"></i> Còn <strong>${diffDays}</strong> ngày nữa</span>`;
            } else {
                const originDateMs = Date.UTC(year, month - 1, day);
                const diffTime = todayVn.midnightUtcMs - originDateMs;
                const passedDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                return `<span class="badge-anniversary badge-passed"><i data-lucide="heart"></i> Đã <strong>${passedDays}</strong> ngày</span>`;
            }
        } catch {
            return '';
        }
    }

    function updateUpcomingAnniversaryBanner() {
        const card = document.getElementById('her-anniversary-hero-card');
        const titleEl = document.getElementById('her-anni-hero-title');
        const badgeEl = document.getElementById('her-anni-hero-badge');
        if (!card || !titleEl || !badgeEl) return;

        if (dates.length === 0) {
            card.style.display = 'none';
            return;
        }

        const todayVn = getVietnamTodayParts();

        // Tìm sự kiện có số ngày còn lại nhỏ nhất
        let closestEvent = null;
        let minDiff = Infinity;

        dates.forEach(d => {
            if (!d.event_date) return;
            try {
                const clean = String(d.event_date).slice(0, 10);
                const [, month, day] = clean.split('-').map(Number);
                let targetMs = Date.UTC(todayVn.year, month - 1, day);
                if (targetMs < todayVn.midnightUtcMs) {
                    targetMs = Date.UTC(todayVn.year + 1, month - 1, day);
                }
                const diff = Math.round((targetMs - todayVn.midnightUtcMs) / (1000 * 60 * 60 * 24));
                if (diff < minDiff) {
                    minDiff = diff;
                    closestEvent = d;
                }
            } catch {}
        });

        if (closestEvent && minDiff < 366) {
            card.style.display = currentDateSubtab === 'anniversary' ? 'flex' : 'none';
            titleEl.textContent = closestEvent.title;
            badgeEl.textContent = minDiff === 0 ? `Hôm nay diễn ra! 🎉 (${formatDateVN(closestEvent.event_date)})` : `Còn ${minDiff} ngày nữa (${formatDateVN(closestEvent.event_date)})`;
        } else {
            card.style.display = 'none';
        }
    }

    function renderDatesAndWishlist() {
        const container = document.getElementById('her-dates-list');
        if (!container) return;

        if (currentDateSubtab === 'anniversary') {
            updateUpcomingAnniversaryBanner();

            if (dates.length === 0) {
                container.innerHTML = `
                    <div class="her-empty-state">
                        ${getHeartCapybaraSvg()}
                        <h3 class="her-empty-title">Thêm ngày hẹn hò đầu tiên,</h3>
                        <p class="her-empty-desc">sinh nhật, kỷ niệm ngày yêu nhau...</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = dates.map(item => `
                <div class="her-item-card her-date-card">
                    <div class="her-item-content">
                        <div class="her-item-header">
                            <span class="her-date-pill"><i data-lucide="calendar-heart"></i> ${formatDateVN(item.event_date)}</span>
                            <h4 class="her-item-title">${escapeHtml(item.title)}</h4>
                        </div>
                        <div class="her-date-badge-row">
                            ${calculateDaysBadge(item.event_date, item.repeat_yearly)}
                        </div>
                        ${item.note ? `<p class="her-item-note"><i data-lucide="sparkles"></i> ${escapeHtml(item.note)}</p>` : ''}
                    </div>
                    <div class="her-item-actions">
                        <button type="button" class="her-btn-icon btn-edit-date" data-id="${item.id}" title="Chỉnh sửa"><i data-lucide="edit-2"></i></button>
                        <button type="button" class="her-btn-icon btn-del-date" data-id="${item.id}" title="Xóa"><i data-lucide="trash-2"></i></button>
                    </div>
                </div>
            `).join('');

            container.querySelectorAll('.btn-edit-date').forEach(b => b.addEventListener('click', () => openEntryModal('date', b.dataset.id)));
            container.querySelectorAll('.btn-del-date').forEach(b => b.addEventListener('click', () => deleteDate(b.dataset.id)));
        } else if (currentDateSubtab === 'wishlist') {
            // Wishlist
            const wishCountText = document.getElementById('her-wish-count-text');
            const pendingItems = wishlist.filter(w => !w.is_gifted);
            if (wishCountText) {
                wishCountText.textContent = `${pendingItems.length} món chưa tặng`;
            }

            let filteredWishlist = [...wishlist];
            if (wishlistFilter === 'pending') {
                filteredWishlist = filteredWishlist.filter(w => !w.is_gifted);
            } else if (wishlistFilter === 'gifted') {
                filteredWishlist = filteredWishlist.filter(w => w.is_gifted);
            }

            if (filteredWishlist.length === 0) {
                container.innerHTML = `
                    <div class="her-empty-state">
                        ${getHeartCapybaraSvg()}
                        <h3 class="her-empty-title">Ghi lại những gì cô ấy muốn!</h3>
                        <p class="her-empty-desc">Sinh nhật, lễ, hay bất cứ khi nào cô ấy thủ thỉ khen một món đồ xinh xắn.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = filteredWishlist.map(item => {
                const stars = '⭐'.repeat(item.priority || 1);
                return `
                    <div class="her-item-card her-wish-card ${item.is_gifted ? 'is-gifted' : ''}">
                        <div class="her-item-content">
                            <div class="her-item-header">
                                <span class="her-wish-priority" title="Mức độ yêu thích: ${item.priority} sao">${stars}</span>
                                <h4 class="her-item-title ${item.is_gifted ? 'line-through' : ''}">${escapeHtml(item.title)}</h4>
                                ${item.is_gifted ? '<span class="her-gifted-badge"><i data-lucide="gift"></i> Đã tặng</span>' : ''}
                            </div>
                            ${item.price_range ? `<p class="her-item-price"><i data-lucide="tag"></i> Dự kiến: ${escapeHtml(item.price_range)}</p>` : ''}
                            ${item.note ? `<p class="her-item-note"><i data-lucide="file-text"></i> ${escapeHtml(item.note)}</p>` : ''}
                            ${item.link ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="her-wish-link-btn"><i data-lucide="external-link"></i> Xem sản phẩm</a>` : ''}
                        </div>
                        <div class="her-item-actions">
                            <button type="button" class="her-btn-icon btn-toggle-gift" data-id="${item.id}" title="${item.is_gifted ? 'Đánh dấu chưa tặng' : 'Đánh dấu đã tặng'}">
                                <i data-lucide="${item.is_gifted ? 'check-circle' : 'circle'}"></i>
                            </button>
                            <button type="button" class="her-btn-icon btn-edit-wish" data-id="${item.id}" title="Chỉnh sửa"><i data-lucide="edit-2"></i></button>
                            <button type="button" class="her-btn-icon btn-del-wish" data-id="${item.id}" title="Xóa"><i data-lucide="trash-2"></i></button>
                        </div>
                    </div>
                `;
            }).join('');

            container.querySelectorAll('.btn-toggle-gift').forEach(b => b.addEventListener('click', () => toggleGiftStatus(b.dataset.id)));
            container.querySelectorAll('.btn-edit-wish').forEach(b => b.addEventListener('click', () => openEntryModal('wishlist', b.dataset.id)));
            container.querySelectorAll('.btn-del-wish').forEach(b => b.addEventListener('click', () => deleteWish(b.dataset.id)));
        } else if (currentDateSubtab === 'memory') {
            renderMemories(container);
        }
        refreshIcons();
    }

    function formatMemoryElapsed(dateStr) {
        if (!dateStr) return '';
        try {
            const todayVn = getVietnamTodayParts();
            const clean = String(dateStr).slice(0, 10);
            const [y, m, d] = clean.split('-').map(Number);
            const memDateMs = Date.UTC(y, m - 1, d);
            const diffMs = todayVn.midnightUtcMs - memDateMs;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            if (diffDays === 0) return '✨ Hôm nay là ngày kỷ niệm!';
            if (diffDays > 0) {
                const years = Math.floor(diffDays / 365);
                const remainingDays = diffDays % 365;
                const months = Math.floor(remainingDays / 30);
                if (years > 0) {
                    return `Đã bên nhau ${diffDays} ngày (${years} năm ${months > 0 ? months + ' tháng' : ''}) 💕`;
                }
                if (months > 0) {
                    return `Đã ${diffDays} ngày (${months} tháng trước) 💕`;
                }
                return `Đã ${diffDays} ngày trôi qua 💕`;
            } else {
                return `Còn ${Math.abs(diffDays)} ngày nữa ⏳`;
            }
        } catch {
            return '';
        }
    }

    function renderMemories(container) {
        const memCountBadge = document.getElementById('her-mem-count-badge');
        if (memCountBadge) {
            memCountBadge.textContent = `${memories.length} kỷ niệm`;
        }

        if (memories.length === 0) {
            container.innerHTML = `
                <div class="her-empty-state">
                    ${getHeartCapybaraSvg()}
                    <h3 class="her-empty-title">Lưu lại những kỷ niệm của 2 đứa!</h3>
                    <p class="her-empty-desc">Ngày tỏ tình, nụ hôn đầu, chuyến đi du lịch đầu tiên hay những cột mốc đáng nhớ...</p>
                </div>
            `;
            return;
        }

        const sorted = [...memories].sort((a, b) => new Date(b.memory_date || 0) - new Date(a.memory_date || 0));

        container.innerHTML = sorted.map(item => `
            <div class="her-item-card her-memory-card">
                <div class="her-item-content">
                    <div class="her-item-header">
                        <span class="her-memory-category-pill">${escapeHtml(item.category || 'Kỷ niệm 💕')}</span>
                        <span class="her-date-pill"><i data-lucide="calendar"></i> ${formatDateVN(item.memory_date)}</span>
                    </div>
                    <h4 class="her-memory-title">${escapeHtml(item.title)}</h4>
                    <div class="her-memory-elapsed-badge">
                        <i data-lucide="heart"></i> <span>${formatMemoryElapsed(item.memory_date)}</span>
                    </div>
                    ${item.location ? `
                        <div class="her-memory-location-row">
                            <i data-lucide="map-pin"></i> <span>${escapeHtml(item.location)}</span>
                        </div>
                    ` : ''}
                    ${item.description ? `
                        <p class="her-memory-desc">${escapeHtml(item.description)}</p>
                    ` : ''}
                </div>
                <div class="her-item-actions">
                    <button type="button" class="her-btn-icon btn-edit-memory" data-id="${item.id}" title="Chỉnh sửa"><i data-lucide="edit-2"></i></button>
                    <button type="button" class="her-btn-icon btn-del-memory" data-id="${item.id}" title="Xóa"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.btn-edit-memory').forEach(b => b.addEventListener('click', () => openEntryModal('memory', b.dataset.id)));
        container.querySelectorAll('.btn-del-memory').forEach(b => b.addEventListener('click', () => deleteMemory(b.dataset.id)));
    }

    async function deleteMemory(id) {
        const item = memories.find(m => m.id === id);
        if (!item || !window.confirm(`Bạn có chắc muốn xóa kỷ niệm “${item.title}” (${formatDateVN(item.memory_date)}) không?`)) return;
        memories = memories.filter(m => m.id !== id);
        saveLocal();
        renderDatesAndWishlist();
        updateTabBadges();
        showHerToast(`Đã xóa kỷ niệm: ${item.title}`);
        if (herClient && currentUserId) {
            await herClient.from('her_memories').delete().eq('user_id', currentUserId).eq('id', id);
        }
    }

    async function deleteDate(id) {
        const item = dates.find(d => d.id === id);
        if (!item || !window.confirm(`Bạn có chắc muốn xóa ngày “${item.title}” (${formatDateVN(item.event_date)}) không?`)) return;
        dates = dates.filter(d => d.id !== id);
        saveLocal();
        renderDatesAndWishlist();
        updateTabBadges();
        showHerToast(`Đã xóa ngày: ${item.title}`);
        if (herClient && currentUserId) {
            await herClient.from('her_dates').delete().eq('user_id', currentUserId).eq('id', id);
        }
    }

    async function toggleGiftStatus(id) {
        const item = wishlist.find(w => w.id === id);
        if (!item) return;
        item.is_gifted = !item.is_gifted;
        item.updatedAt = new Date().toISOString();
        saveLocal();
        renderDatesAndWishlist();
        if (item.is_gifted && typeof window.confetti === 'function') {
            try {
                window.confetti({ particleCount: 40, spread: 55, origin: { y: 0.65 } });
            } catch {}
        }
        showHerToast(item.is_gifted ? 'Đã tặng món quà này cho cô ấy 🎁✨' : 'Đã chuyển về danh sách mong muốn');
        if (herClient && currentUserId) {
            await herClient.from('her_wishlist').update({ is_gifted: item.is_gifted, updated_at: item.updatedAt }).eq('user_id', currentUserId).eq('id', id);
        }
    }

    async function deleteWish(id) {
        const item = wishlist.find(w => w.id === id);
        if (!item || !window.confirm(`Bạn có chắc muốn xóa món quà “${item.title}” không?`)) return;
        wishlist = wishlist.filter(w => w.id !== id);
        saveLocal();
        renderDatesAndWishlist();
        updateTabBadges();
        showHerToast(`Đã xóa món quà: ${item.title}`);
        if (herClient && currentUserId) {
            await herClient.from('her_wishlist').delete().eq('user_id', currentUserId).eq('id', id);
        }
    }

    // TAB 5: TÂM TRẠNG
    function renderMoods() {
        const container = document.getElementById('her-mood-list');
        if (!container) return;

        let filtered = [...moods];
        if (moodFilter !== 'all') {
            filtered = filtered.filter(m => m.mood_type === moodFilter);
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="her-empty-state">
                    ${getHeartCapybaraSvg()}
                    <h3 class="her-empty-title">Hôm nay cô ấy thế nào?</h3>
                    <p class="her-empty-desc">Vui, buồn hay giận dỗi? Lưu lại để quan tâm và chăm sóc cô ấy chu đáo hơn nhé!</p>
                </div>
            `;
            return;
        }

        // Sắp xếp ngày mới nhất lên đầu
        filtered.sort((a, b) => (b.mood_date || '').localeCompare(a.mood_date || ''));

        container.innerHTML = filtered.map(item => {
            const conf = MOOD_CONFIG[item.mood_type] || MOOD_CONFIG.happy;
            return `
                <div class="her-item-card her-mood-card">
                    <div class="her-item-content">
                        <div class="her-item-header">
                            <span class="her-mood-badge" style="background:${conf.bg};color:${conf.color};border:1px solid ${conf.border}">
                                <span>${conf.emoji}</span>
                                <strong>${conf.label}</strong>
                            </span>
                            <span class="her-mood-date"><i data-lucide="calendar"></i> ${formatDateVN(item.mood_date)}</span>
                        </div>
                        ${item.title ? `<h4 class="her-item-title her-mood-title">${escapeHtml(item.title)}</h4>` : ''}
                        ${item.note ? `<div class="her-mood-note">${escapeHtml(item.note).replace(/\r?\n/g, '<br>')}</div>` : ''}
                        ${item.solution ? `
                            <div class="her-mood-solution-box">
                                <div class="solution-label"><i data-lucide="heart-handshake"></i> Bí kíp dỗ dành / Điều cần làm:</div>
                                <div class="solution-text">${escapeHtml(item.solution).replace(/\r?\n/g, '<br>')}</div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="her-item-actions">
                        <button type="button" class="her-btn-icon btn-edit-mood" data-id="${item.id}" title="Chỉnh sửa"><i data-lucide="edit-2"></i></button>
                        <button type="button" class="her-btn-icon btn-del-mood" data-id="${item.id}" title="Xóa"><i data-lucide="trash-2"></i></button>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.btn-edit-mood').forEach(b => b.addEventListener('click', () => openEntryModal('mood', b.dataset.id)));
        container.querySelectorAll('.btn-del-mood').forEach(b => b.addEventListener('click', () => deleteMood(b.dataset.id)));
        refreshIcons();
    }

    async function deleteMood(id) {
        const item = moods.find(m => m.id === id);
        if (!item || !window.confirm(`Bạn có chắc muốn xóa nhật ký tâm trạng ngày ${formatDateVN(item.mood_date)} không?`)) return;
        moods = moods.filter(m => m.id !== id);
        saveLocal();
        renderMoods();
        updateTabBadges();
        showHerToast('Đã xóa nhật ký tâm trạng');
        if (herClient && currentUserId) {
            await herClient.from('her_moods').delete().eq('user_id', currentUserId).eq('id', id);
        }
    }

    // ========================================================================
    // ENTRY MODAL FORM (THÊM / SỬA CHO TỪNG LOẠI)
    // ========================================================================
    function openEntryModal(type, id = null) {
        currentEntryType = type;
        currentEditingId = id;

        const formTitle = document.getElementById('her-entry-title');
        const formFields = document.getElementById('her-entry-fields-container');
        if (!formTitle || !formFields) return;

        let titleText = '';
        let fieldsHtml = '';

        if (type === 'food') {
            const item = id ? foods.find(f => f.id === id) : null;
            const targetType = item ? item.type : currentFoodSubtab;
            titleText = item ? 'Chỉnh sửa món ăn' : (targetType === 'must_buy' ? 'Thêm món nên mua' : 'Thêm món không nên mua');

            fieldsHtml = `
                <div class="her-form-group">
                    <label>Phân loại món <span>*</span></label>
                    <div class="her-radio-group">
                        <label class="her-radio-label">
                            <input type="radio" name="food_type" value="must_buy" ${targetType === 'must_buy' ? 'checked' : ''}>
                            <span class="her-radio-custom radio-green">✅ Phải mua</span>
                        </label>
                        <label class="her-radio-label">
                            <input type="radio" name="food_type" value="should_not_buy" ${targetType === 'should_not_buy' ? 'checked' : ''}>
                            <span class="her-radio-custom radio-red">❌ Không nên mua</span>
                        </label>
                    </div>
                </div>
                <div class="her-form-group">
                    <label for="food_name">Tên món ăn / đồ uống <span>*</span></label>
                    <input type="text" id="food_name" class="her-form-input" required placeholder="Ví dụ: Trà sữa Ô long, Bún bò..." value="${escapeHtml(item?.name || '')}">
                </div>
                <div class="her-form-group">
                    <label for="food_note">Ghi chú khẩu vị / lưu ý</label>
                    <textarea id="food_note" class="her-form-textarea" rows="3" placeholder="Ví dụ: 30% đường, không hành, dị ứng tiêu...">${escapeHtml(item?.note || '')}</textarea>
                </div>
                <div class="her-form-group">
                    <label for="food_place">Quán quen / Địa chỉ mua</label>
                    <input type="text" id="food_place" class="her-form-input" placeholder="Ví dụ: Quán gần công ty, tiệm Phúc Long..." value="${escapeHtml(item?.place || '')}">
                </div>
            `;
        } else if (type === 'note') {
            const item = id ? notes.find(n => n.id === id) : null;
            titleText = item ? 'Chỉnh sửa ghi chú' : 'Thêm ghi chú mới';

            fieldsHtml = `
                <div class="her-form-group">
                    <label for="note_title">Tiêu đề ghi chú <span>*</span></label>
                    <input type="text" id="note_title" class="her-form-input" required placeholder="Ví dụ: Sở thích đặc biệt, Lời dặn dò..." value="${escapeHtml(item?.title || '')}">
                </div>
                <div class="her-form-group">
                    <label for="note_category">Phân loại nhãn</label>
                    <select id="note_category" class="her-form-input">
                        <option value="Sở thích" ${(item?.category || '').includes('Sở thích') ? 'selected' : ''}>🎀 Sở thích</option>
                        <option value="Thói quen" ${(item?.category || '').includes('Thói quen') ? 'selected' : ''}>☕ Thói quen</option>
                        <option value="Bí kíp" ${(item?.category || '').includes('Bí kíp') ? 'selected' : ''}>💡 Bí kíp dỗ dành</option>
                        <option value="Dặn dò" ${(item?.category || '').includes('Dặn dò') ? 'selected' : ''}>📌 Dặn dò</option>
                        <option value="Chung" ${(item?.category || '').includes('Chung') ? 'selected' : ''}>📝 Chung</option>
                    </select>
                </div>
                <div class="her-form-group">
                    <label for="note_content">Nội dung chi tiết <span>*</span></label>
                    <textarea id="note_content" class="her-form-textarea" rows="5" required placeholder="Viết lại những điều bạn muốn ghi nhớ về cô ấy...">${escapeHtml(item?.content || '')}</textarea>
                </div>
            `;
        } else if (type === 'date') {
            const item = id ? dates.find(d => d.id === id) : null;
            titleText = item ? 'Chỉnh sửa ngày kỷ niệm' : 'Thêm ngày kỷ niệm';
            const defaultDate = item?.event_date || getVietnamTodayParts().isoDate;

            fieldsHtml = `
                <div class="her-form-group">
                    <label for="date_title">Tên ngày kỷ niệm <span>*</span></label>
                    <input type="text" id="date_title" class="her-form-input" required placeholder="Ví dụ: Sinh nhật cô ấy, Ngày chính thức yêu..." value="${escapeHtml(item?.title || '')}">
                    <div class="her-quick-suggesters" data-target="date_title">
                        <button type="button" class="her-quick-chip" data-val="Valentine 14/02 🌹" data-date="02-14">🌹 Valentine 14/02</button>
                        <button type="button" class="her-quick-chip" data-val="Quốc tế Phụ nữ 08/03 🌷" data-date="03-08">🌷 08/03</button>
                        <button type="button" class="her-quick-chip" data-val="Phụ nữ Việt Nam 20/10 💐" data-date="10-20">💐 20/10</button>
                        <button type="button" class="her-quick-chip" data-val="Giáng sinh 25/12 🎄" data-date="12-25">🎄 25/12</button>
                        <button type="button" class="her-quick-chip" data-val="Ngày chính thức yêu 💕">💕 Ngày yêu</button>
                        <button type="button" class="her-quick-chip" data-val="Sinh nhật cô ấy 🎂">🎂 Sinh nhật</button>
                        <button type="button" class="her-quick-chip" data-val="Ngày hẹn hò đầu tiên ☕">☕ Hẹn hò đầu</button>
                    </div>
                </div>
                ${renderHerDatePickerHtml({
                    id: 'date_val',
                    label: 'Ngày kỷ niệm (dd/mm/yyyy) <span>*</span>',
                    value: defaultDate,
                    required: true,
                    icon: 'calendar-heart'
                })}
                <div class="her-form-group">
                    <label class="her-checkbox-label">
                        <input type="checkbox" id="date_repeat" ${item ? (item.repeat_yearly ? 'checked' : '') : 'checked'}>
                        <span>Lặp lại hàng năm (sinh nhật, ngày kỷ niệm yêu...)</span>
                    </label>
                </div>
                <div class="her-form-group">
                    <label for="date_note">Kế hoạch / Ghi chú chuẩn bị</label>
                    <textarea id="date_note" class="her-form-textarea" rows="3" placeholder="Ví dụ: Đặt bàn ăn tối, mua hoa tulip, bất ngờ tặng quà...">${escapeHtml(item?.note || '')}</textarea>
                </div>
            `;
        } else if (type === 'wishlist') {
            const item = id ? wishlist.find(w => w.id === id) : null;
            titleText = item ? 'Chỉnh sửa món quà mong muốn' : 'Thêm món quà mong muốn';

            fieldsHtml = `
                <div class="her-form-group">
                    <label for="wish_title">Tên món quà / đồ muốn mua <span>*</span></label>
                    <input type="text" id="wish_title" class="her-form-input" required placeholder="Ví dụ: Son môi Chanel, Váy hoa nhí, Gấu bông..." value="${escapeHtml(item?.title || '')}">
                </div>
                <div class="her-form-group">
                    <label for="wish_priority">Mức độ cô ấy mong muốn</label>
                    <select id="wish_priority" class="her-form-input">
                        <option value="3" ${item?.priority === 3 ? 'selected' : ''}>⭐⭐⭐ Cực kỳ thích / Nhắc nhiều lần</option>
                        <option value="2" ${item?.priority === 2 ? 'selected' : ''}>⭐⭐ Rất thích</option>
                        <option value="1" ${item?.priority === 1 ? 'selected' : ''}>⭐ Thích / Muốn thử</option>
                    </select>
                </div>
                <div class="her-form-group">
                    <label for="wish_price">Khoảng giá dự kiến</label>
                    <input type="text" id="wish_price" class="her-form-input" placeholder="Ví dụ: 500k - 1tr..." value="${escapeHtml(item?.price_range || '')}">
                </div>
                <div class="her-form-group">
                    <label for="wish_link">Link sản phẩm (Shopee, Lazada, web...)</label>
                    <input type="url" id="wish_link" class="her-form-input" placeholder="https://..." value="${escapeHtml(item?.link || '')}">
                </div>
                <div class="her-form-group">
                    <label for="wish_note">Chi tiết màu sắc / mẫu mã / size</label>
                    <textarea id="wish_note" class="her-form-textarea" rows="2" placeholder="Ví dụ: Màu đỏ đất số 12, size S...">${escapeHtml(item?.note || '')}</textarea>
                </div>
                ${item ? `
                <div class="her-form-group">
                    <label class="her-checkbox-label">
                        <input type="checkbox" id="wish_gifted" ${item.is_gifted ? 'checked' : ''}>
                        <span>Đã tặng cho cô ấy 💝</span>
                    </label>
                </div>
                ` : ''}
            `;
        } else if (type === 'mood') {
            const item = id ? moods.find(m => m.id === id) : null;
            titleText = item ? 'Chỉnh sửa nhật ký tâm trạng' : 'Ghi lại tâm trạng cô ấy';
            const defaultDate = item?.mood_date || getVietnamTodayParts().isoDate;
            const currentMood = item?.mood_type || 'happy';

            fieldsHtml = `
                ${renderHerDatePickerHtml({
                    id: 'mood_date',
                    label: 'Ngày ghi nhận (dd/mm/yyyy) <span>*</span>',
                    value: defaultDate,
                    required: true,
                    icon: 'calendar'
                })}
                <div class="her-form-group">
                    <label>Tâm trạng của cô ấy hôm nay <span>*</span></label>
                    <div class="her-mood-picker">
                        ${Object.entries(MOOD_CONFIG).map(([k, cfg]) => `
                            <label class="her-mood-radio">
                                <input type="radio" name="mood_type" value="${k}" ${currentMood === k ? 'checked' : ''}>
                                <div class="her-mood-choice" style="border-color:${cfg.border}">
                                    <span class="emoji">${cfg.emoji}</span>
                                    <span class="name">${cfg.label}</span>
                                </div>
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="her-form-group">
                    <label for="mood_title">Chuyện gì đã xảy ra? (Tóm tắt)</label>
                    <input type="text" id="mood_title" class="her-form-input" placeholder="Ví dụ: Đi làm về mệt, Được khen xinh, Bị stress..." value="${escapeHtml(item?.title || '')}">
                </div>
                <div class="her-form-group">
                    <label for="mood_note">Chi tiết câu chuyện / lời cô ấy nói</label>
                    <textarea id="mood_note" class="her-form-textarea" rows="3" placeholder="Ghi lại để hiểu cô ấy hơn...">${escapeHtml(item?.note || '')}</textarea>
                </div>
                <div class="her-form-group">
                    <label for="mood_solution">Bí kíp dỗ dành / Điều bạn cần làm</label>
                    <textarea id="mood_solution" class="her-form-textarea" rows="2" placeholder="Ví dụ: Mua trà sữa, massage lưng, chở đi hóng gió, ôm thật chặt...">${escapeHtml(item?.solution || '')}</textarea>
                </div>
            `;
        } else if (type === 'ring') {
            titleText = 'Thêm size ngón đeo nhẫn';
            fieldsHtml = `
                <div class="her-form-group">
                    <label for="ring_finger">Tên ngón tay <span>*</span></label>
                    <select id="ring_finger" class="her-form-input">
                        <option value="Ngón áp út (tay trái) - Cầu hôn/Cưới">Ngón áp út (tay trái) - Cầu hôn/Cưới</option>
                        <option value="Ngón áp út (tay phải)">Ngón áp út (tay phải)</option>
                        <option value="Ngón trỏ (tay trái)">Ngón trỏ (tay trái)</option>
                        <option value="Ngón trỏ (tay phải)">Ngón trỏ (tay phải)</option>
                        <option value="Ngón giữa (tay trái)">Ngón giữa (tay trái)</option>
                        <option value="Ngón giữa (tay phải)">Ngón giữa (tay phải)</option>
                        <option value="Ngón cái">Ngón cái</option>
                        <option value="Ngón út">Ngón út</option>
                    </select>
                </div>
                <div class="her-form-group">
                    <label for="ring_size_val">Size nhẫn <span>*</span></label>
                    <input type="text" id="ring_size_val" class="her-form-input" required placeholder="Ví dụ: Size 10 hoặc 11 (đường kính 16mm)...">
                    <div class="her-quick-suggesters" data-target="ring_size_val">
                        <button type="button" class="her-quick-chip" data-val="Size 9 (15.3mm)">Size 9</button>
                        <button type="button" class="her-quick-chip" data-val="Size 10 (16.0mm)">Size 10</button>
                        <button type="button" class="her-quick-chip" data-val="Size 11 (16.5mm)">Size 11</button>
                        <button type="button" class="her-quick-chip" data-val="Size 12 (17.2mm)">Size 12</button>
                        <button type="button" class="her-quick-chip" data-val="Size 14 (18.0mm)">Size 14</button>
                    </div>
                </div>
            `;
        } else if (type === 'memory') {
            const item = id ? memories.find(m => m.id === id) : null;
            titleText = item ? 'Chỉnh sửa kỷ niệm của 2 đứa' : 'Thêm kỷ niệm của 2 đứa';
            const defaultDate = item?.memory_date || getVietnamTodayParts().isoDate;
            const currentCategory = item?.category || '💕 Hẹn hò & Tỏ tình';

            fieldsHtml = `
                <div class="her-form-group">
                    <label for="memory_title">Tên kỷ niệm / Cột mốc <span>*</span></label>
                    <input type="text" id="memory_title" class="her-form-input" required placeholder="Ví dụ: Ngày tỏ tình, Lần đầu đi xem phim, Nụ hôn đầu..." value="${escapeHtml(item?.title || '')}">
                    <div class="her-quick-suggesters" data-target="memory_title">
                        <button type="button" class="her-quick-chip" data-val="Ngày tỏ tình 💕">💕 Ngày tỏ tình</button>
                        <button type="button" class="her-quick-chip" data-val="Buổi hẹn hò đầu tiên ☕">☕ Hẹn hò đầu</button>
                        <button type="button" class="her-quick-chip" data-val="Lần đầu nắm tay 🤝">🤝 Lần đầu nắm tay</button>
                        <button type="button" class="her-quick-chip" data-val="Nụ hôn đầu tiên 💋">💋 Nụ hôn đầu</button>
                        <button type="button" class="her-quick-chip" data-val="Chuyến du lịch đầu tiên ✈️">✈️ Đi du lịch</button>
                        <button type="button" class="her-quick-chip" data-val="Kỷ niệm 100 ngày yêu 💯">💯 100 ngày</button>
                        <button type="button" class="her-quick-chip" data-val="Kỷ niệm 1 năm yêu nhau 💍">💍 1 năm yêu</button>
                        <button type="button" class="her-quick-chip" data-val="Lần đầu về ra mắt 🏡">🏡 Về ra mắt</button>
                    </div>
                </div>
                ${renderHerDatePickerHtml({
                    id: 'memory_date',
                    label: 'Ngày kỷ niệm diễn ra (dd/mm/yyyy) <span>*</span>',
                    value: defaultDate,
                    required: true,
                    icon: 'calendar'
                })}
                <div class="her-form-group">
                    <label for="memory_category">Chủ đề kỷ niệm</label>
                    <select id="memory_category" class="her-form-input">
                        <option value="💕 Hẹn hò & Tỏ tình" ${currentCategory.includes('Hẹn hò') ? 'selected' : ''}>💕 Hẹn hò & Tỏ tình</option>
                        <option value="✈️ Du lịch & Đi chơi" ${currentCategory.includes('Du lịch') ? 'selected' : ''}>✈️ Du lịch & Đi chơi</option>
                        <option value="💍 Cột mốc tình yêu" ${currentCategory.includes('Cột mốc') ? 'selected' : ''}>💍 Cột mốc tình yêu</option>
                        <option value="🎁 Quà tặng & Bất ngờ" ${currentCategory.includes('Quà tặng') ? 'selected' : ''}>🎁 Quà tặng & Bất ngờ</option>
                        <option value="☕ Khoảnh khắc đời thường" ${currentCategory.includes('đời thường') ? 'selected' : ''}>☕ Khoảnh khắc đời thường</option>
                        <option value="🌟 Kỷ niệm đặc biệt" ${currentCategory.includes('đặc biệt') ? 'selected' : ''}>🌟 Kỷ niệm đặc biệt</option>
                    </select>
                </div>
                <div class="her-form-group">
                    <label for="memory_location">Địa điểm gắn liền (nếu có)</label>
                    <input type="text" id="memory_location" class="her-form-input" placeholder="Ví dụ: Hồ Tây - Hà Nội, Đà Lạt, Quán cà phê..." value="${escapeHtml(item?.location || '')}">
                </div>
                <div class="her-form-group">
                    <label for="memory_desc">Cảm xúc & Câu chuyện kỷ niệm</label>
                    <textarea id="memory_desc" class="her-form-textarea" rows="4" placeholder="Viết lại những điều ngọt ngào, cảm xúc hay câu chuyện đáng nhớ của 2 đứa vào ngày hôm ấy...">${escapeHtml(item?.description || '')}</textarea>
                </div>
            `;
        }

        formTitle.textContent = titleText;
        formFields.innerHTML = fieldsHtml;

        // Kích hoạt bộ chọn ngày chuẩn dd/mm/yyyy
        if (type === 'date') bindHerDatePicker('date_val');
        else if (type === 'memory') bindHerDatePicker('memory_date');
        else if (type === 'mood') bindHerDatePicker('mood_date');

        // Bắt sự kiện suggester chips nếu có trong form
        formFields.querySelectorAll('.her-quick-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const targetInput = document.getElementById(chip.parentElement.dataset.target);
                if (targetInput) targetInput.value = chip.dataset.val;
                if (chip.dataset.date) {
                    const [m, d] = chip.dataset.date.split('-');
                    const year = new Date().getFullYear();
                    const iso = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                    setHerDateValue('date_val', iso);
                }
            });
        });

        const modal = document.getElementById('her-entry-modal');
        if (modal) {
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            if (typeof pushAppView === 'function') pushAppView('her-entry-modal');
        }
        refreshIcons();
    }

    function closeEntryModal(fromHistory = false) {
        const modal = document.getElementById('her-entry-modal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        currentEntryType = null;
        currentEditingId = null;
        if (fromHistory !== true && typeof leaveAppView === 'function') leaveAppView();
    }

    async function handleEntrySubmit(event) {
        event.preventDefault();
        if (!currentEntryType) return;

        if (currentEntryType === 'food') {
            const foodType = document.querySelector('input[name="food_type"]:checked')?.value || currentFoodSubtab;
            const name = document.getElementById('food_name')?.value.trim();
            const note = document.getElementById('food_note')?.value.trim() || '';
            const place = document.getElementById('food_place')?.value.trim() || '';

            if (!name) return;

            if (currentEditingId) {
                const item = foods.find(f => f.id === currentEditingId);
                if (item) {
                    item.type = foodType;
                    item.name = name;
                    item.note = note;
                    item.place = place;
                    item.updatedAt = new Date().toISOString();
                }
            } else {
                foods.unshift({
                    id: createId('food'),
                    type: foodType,
                    name,
                    note,
                    place,
                    createdAt: new Date().toISOString()
                });
            }
            saveLocal();
            renderFoods();
            updateTabBadges();
            closeEntryModal();
            showHerToast(currentEditingId ? 'Đã cập nhật món ăn' : 'Đã thêm món ăn mới ✨');

            if (herClient && currentUserId) {
                const item = currentEditingId ? foods.find(f => f.id === currentEditingId) : foods[0];
                await herClient.from('her_foods').upsert([{
                    id: item.id,
                    user_id: currentUserId,
                    type: item.type,
                    name: item.name,
                    note: item.note,
                    place: item.place,
                    updated_at: new Date().toISOString()
                }]);
            }
        } else if (currentEntryType === 'note') {
            const title = document.getElementById('note_title')?.value.trim();
            const category = document.getElementById('note_category')?.value || 'Chung';
            const content = document.getElementById('note_content')?.value.trim();

            if (!title || !content) return;

            if (currentEditingId) {
                const item = notes.find(n => n.id === currentEditingId);
                if (item) {
                    item.title = title;
                    item.category = item.is_pinned ? `${category} [PINNED]` : category;
                    item.content = content;
                    item.updatedAt = new Date().toISOString();
                }
            } else {
                notes.unshift({
                    id: createId('note'),
                    title,
                    category,
                    content,
                    is_pinned: false,
                    createdAt: new Date().toISOString()
                });
            }
            saveLocal();
            renderNotes();
            updateTabBadges();
            closeEntryModal();
            showHerToast(currentEditingId ? 'Đã cập nhật ghi chú' : 'Đã thêm ghi chú mới ✨');

            if (herClient && currentUserId) {
                const item = currentEditingId ? notes.find(n => n.id === currentEditingId) : notes[0];
                await herClient.from('her_notes').upsert([{
                    id: item.id,
                    user_id: currentUserId,
                    title: item.title,
                    category: item.category,
                    content: item.content,
                    updated_at: new Date().toISOString()
                }]);
            }
        } else if (currentEntryType === 'date') {
            const title = document.getElementById('date_title')?.value.trim();
            const event_date = getHerDateValue('date_val');
            const repeat_yearly = Boolean(document.getElementById('date_repeat')?.checked);
            const note = document.getElementById('date_note')?.value.trim() || '';

            if (!title || !event_date) return;

            if (currentEditingId) {
                const item = dates.find(d => d.id === currentEditingId);
                if (item) {
                    item.title = title;
                    item.event_date = event_date;
                    item.repeat_yearly = repeat_yearly;
                    item.note = note;
                    item.updatedAt = new Date().toISOString();
                }
            } else {
                dates.unshift({
                    id: createId('date'),
                    title,
                    event_date,
                    repeat_yearly,
                    note,
                    createdAt: new Date().toISOString()
                });
            }
            saveLocal();
            renderDatesAndWishlist();
            updateTabBadges();
            closeEntryModal();
            showHerToast(currentEditingId ? 'Đã cập nhật ngày kỷ niệm' : 'Đã thêm ngày kỷ niệm mới 📅');

            if (herClient && currentUserId) {
                const item = currentEditingId ? dates.find(d => d.id === currentEditingId) : dates[0];
                await herClient.from('her_dates').upsert([{
                    id: item.id,
                    user_id: currentUserId,
                    title: item.title,
                    event_date: item.event_date,
                    repeat_yearly: item.repeat_yearly,
                    note: item.note,
                    updated_at: new Date().toISOString()
                }]);
            }
        } else if (currentEntryType === 'wishlist') {
            const title = document.getElementById('wish_title')?.value.trim();
            const priority = parseInt(document.getElementById('wish_priority')?.value, 10) || 1;
            const price_range = document.getElementById('wish_price')?.value.trim() || '';
            const link = document.getElementById('wish_link')?.value.trim() || '';
            const note = document.getElementById('wish_note')?.value.trim() || '';
            const is_gifted = Boolean(document.getElementById('wish_gifted')?.checked);

            if (!title) return;

            if (currentEditingId) {
                const item = wishlist.find(w => w.id === currentEditingId);
                if (item) {
                    item.title = title;
                    item.priority = priority;
                    item.price_range = price_range;
                    item.link = link;
                    item.note = note;
                    item.is_gifted = is_gifted;
                    item.updatedAt = new Date().toISOString();
                }
            } else {
                wishlist.unshift({
                    id: createId('wish'),
                    title,
                    priority,
                    price_range,
                    link,
                    is_gifted: false,
                    note,
                    createdAt: new Date().toISOString()
                });
            }
            saveLocal();
            renderDatesAndWishlist();
            updateTabBadges();
            closeEntryModal();
            showHerToast(currentEditingId ? 'Đã cập nhật món quà' : 'Đã thêm món quà vào Wishlist 🎁');

            if (herClient && currentUserId) {
                const item = currentEditingId ? wishlist.find(w => w.id === currentEditingId) : wishlist[0];
                await herClient.from('her_wishlist').upsert([{
                    id: item.id,
                    user_id: currentUserId,
                    title: item.title,
                    priority: item.priority,
                    price_range: item.price_range,
                    link: item.link,
                    is_gifted: item.is_gifted,
                    note: item.note,
                    updated_at: new Date().toISOString()
                }]);
            }
        } else if (currentEntryType === 'mood') {
            const mood_date = getHerDateValue('mood_date') || new Date().toISOString().slice(0, 10);
            const mood_type = document.querySelector('input[name="mood_type"]:checked')?.value || 'happy';
            const title = document.getElementById('mood_title')?.value.trim() || '';
            const note = document.getElementById('mood_note')?.value.trim() || '';
            const solution = document.getElementById('mood_solution')?.value.trim() || '';

            if (currentEditingId) {
                const item = moods.find(m => m.id === currentEditingId);
                if (item) {
                    item.mood_date = mood_date;
                    item.mood_type = mood_type;
                    item.title = title;
                    item.note = note;
                    item.solution = solution;
                    item.updatedAt = new Date().toISOString();
                }
            } else {
                moods.unshift({
                    id: createId('mood'),
                    mood_date,
                    mood_type,
                    title,
                    note,
                    solution,
                    createdAt: new Date().toISOString()
                });
            }
            saveLocal();
            renderMoods();
            updateTabBadges();
            closeEntryModal();
            showHerToast('Đã lưu nhật ký tâm trạng 🌸');

            if (herClient && currentUserId) {
                const item = currentEditingId ? moods.find(m => m.id === currentEditingId) : moods[0];
                await herClient.from('her_moods').upsert([{
                    id: item.id,
                    user_id: currentUserId,
                    mood_date: item.mood_date,
                    mood_type: item.mood_type,
                    title: item.title,
                    note: item.note,
                    solution: item.solution,
                    updated_at: new Date().toISOString()
                }]);
            }
        } else if (currentEntryType === 'ring') {
            const finger = document.getElementById('ring_finger')?.value;
            const size = document.getElementById('ring_size_val')?.value.trim();
            if (!finger || !size) return;

            if (!profile.ring_sizes) profile.ring_sizes = [];
            profile.ring_sizes.push({
                id: createId('ring'),
                finger,
                size
            });

            saveLocal();
            void syncProfileToSupabase();
            renderProfile();
            closeEntryModal();
            showHerToast('Đã lưu size ngón đeo nhẫn 💍');
        } else if (currentEntryType === 'memory') {
            const title = document.getElementById('memory_title')?.value.trim();
            const memory_date = getHerDateValue('memory_date');
            const category = document.getElementById('memory_category')?.value || '💕 Hẹn hò & Tỏ tình';
            const location = document.getElementById('memory_location')?.value.trim() || '';
            const description = document.getElementById('memory_desc')?.value.trim() || '';

            if (!title || !memory_date) return;

            if (currentEditingId) {
                const item = memories.find(m => m.id === currentEditingId);
                if (item) {
                    item.title = title;
                    item.memory_date = memory_date;
                    item.category = category;
                    item.location = location;
                    item.description = description;
                    item.updatedAt = new Date().toISOString();
                }
            } else {
                memories.unshift({
                    id: createId('mem'),
                    title,
                    memory_date,
                    category,
                    location,
                    description,
                    createdAt: new Date().toISOString()
                });
            }
            saveLocal();
            renderDatesAndWishlist();
            updateTabBadges();
            closeEntryModal();
            showHerToast(currentEditingId ? 'Đã cập nhật kỷ niệm' : 'Đã thêm kỷ niệm mới của 2 đứa 💕');

            if (herClient && currentUserId) {
                const item = currentEditingId ? memories.find(m => m.id === currentEditingId) : memories[0];
                await herClient.from('her_memories').upsert([{
                    id: item.id,
                    user_id: currentUserId,
                    title: item.title,
                    memory_date: item.memory_date,
                    category: item.category,
                    location: item.location,
                    description: item.description,
                    updated_at: new Date().toISOString()
                }]);
            }
        }
    }

    // ========================================================================
    // PROFILE MODAL (CÁ NHÂN HÓA HỒ SƠ)
    // ========================================================================
    function openProfileModal() {
        const modal = document.getElementById('her-profile-modal');
        if (!modal) return;

        const nickInput = document.getElementById('her-profile-nickname-input');
        const bdayInput = document.getElementById('her-profile-bday-input');
        const anniInput = document.getElementById('her-profile-anni-input');
        const quoteInput = document.getElementById('her-profile-quote-input');

        if (nickInput) nickInput.value = profile.nickname || 'Cô ấy';
        setHerDateValue('her-profile-bday-input', profile.birthday || '');
        setHerDateValue('her-profile-anni-input', profile.anniversary_date || '');
        bindHerDatePicker('her-profile-bday-input');
        bindHerDatePicker('her-profile-anni-input');
        if (quoteInput) quoteInput.value = profile.quote || '';

        // Highlight selected avatar
        document.querySelectorAll('.her-avatar-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.avatar === (profile.avatar || '🌸'));
        });

        // Bắt sự kiện suggester chips trong profile modal
        document.querySelectorAll('#her-profile-modal .her-quick-chip').forEach(chip => {
            chip.onclick = () => {
                const targetId = chip.parentElement.dataset.target;
                const targetInput = document.getElementById(targetId);
                if (targetInput) {
                    targetInput.value = chip.dataset.val;
                    targetInput.focus();
                }
            };
        });

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        if (typeof pushAppView === 'function') pushAppView('her-profile-modal');
        refreshIcons();
    }

    function closeProfileModal() {
        const modal = document.getElementById('her-profile-modal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        if (typeof leaveAppView === 'function') leaveAppView();
    }

    function handleProfileSubmit(e) {
        e.preventDefault();
        const nick = document.getElementById('her-profile-nickname-input')?.value.trim();
        if (!nick) return;

        profile.nickname = nick;
        profile.birthday = getHerDateValue('her-profile-bday-input');
        profile.anniversary_date = getHerDateValue('her-profile-anni-input');
        profile.quote = document.getElementById('her-profile-quote-input')?.value.trim() || '';

        saveLocal();
        void syncProfileToSupabase();
        updateHeroProfileCard();
        closeProfileModal();
        showHerToast('Đã lưu hồ sơ cô ấy ✨');
    }

    // ========================================================================
    // RANDOM FOOD PICKER MODAL (HÔM NAY ĂN GÌ? 🎲)
    // ========================================================================
    function openRandomFoodModal() {
        const mustBuyFoods = foods.filter(f => f.type === 'must_buy');
        const modal = document.getElementById('her-random-food-modal');
        const nameEl = document.getElementById('her-random-dish-name');
        const noteEl = document.getElementById('her-random-dish-note');
        const placeEl = document.getElementById('her-random-dish-place');
        if (!modal) return;

        if (mustBuyFoods.length === 0) {
            if (nameEl) nameEl.textContent = 'Chưa có món yêu thích!';
            if (noteEl) noteEl.textContent = 'Hãy thêm các món cô ấy thích vào danh sách "Phải mua" trước nhé!';
            if (placeEl) placeEl.style.display = 'none';
        } else {
            spinDish();
        }

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        if (typeof pushAppView === 'function') pushAppView('her-random-food-modal');
        refreshIcons();
    }

    function closeRandomFoodModal() {
        const modal = document.getElementById('her-random-food-modal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        if (typeof leaveAppView === 'function') leaveAppView();
    }

    function spinDish() {
        const mustBuyFoods = foods.filter(f => f.type === 'must_buy');
        const nameEl = document.getElementById('her-random-dish-name');
        const noteEl = document.getElementById('her-random-dish-note');
        const placeEl = document.getElementById('her-random-dish-place');
        if (mustBuyFoods.length === 0 || !nameEl) return;

        nameEl.textContent = 'Đang chọn món ngon... ✨';
        let count = 0;
        const interval = setInterval(() => {
            const rand = mustBuyFoods[Math.floor(Math.random() * mustBuyFoods.length)];
            nameEl.textContent = rand.name;
            count++;
            if (count > 7) {
                clearInterval(interval);
                const chosen = mustBuyFoods[Math.floor(Math.random() * mustBuyFoods.length)];
                nameEl.textContent = chosen.name;
                if (noteEl) noteEl.textContent = chosen.note ? `Lưu ý: ${chosen.note}` : 'Món tủ của cô ấy đó, mua ngay thôi!';
                if (placeEl) {
                    if (chosen.place) {
                        placeEl.textContent = `📍 ${chosen.place}`;
                        placeEl.style.display = 'inline-block';
                    } else {
                        placeEl.style.display = 'none';
                    }
                }
                if (typeof window.confetti === 'function') {
                    try {
                        window.confetti({ particleCount: 35, spread: 60, origin: { y: 0.55 } });
                    } catch {}
                }
                showHerToast(`Gợi ý: ${chosen.name} 🎉`);
            }
        }, 70);
    }

    // ========================================================================
    // OPEN / CLOSE MAIN MODAL
    // ========================================================================
    function openHerModal() {
        void loadData();
        const modal = document.getElementById('her-modal');
        if (modal) {
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            if (typeof pushAppView === 'function') pushAppView('her-modal');
        }
        updateHeaderBadge();
        refreshIcons();
    }

    function closeHerModal(returnToHub = true, fromHistory = false) {
        closeEntryModal(true);
        closeProfileModal();
        closeRandomFoodModal();
        const modal = document.getElementById('her-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        }
        if (returnToHub && fromHistory !== true && typeof leaveAppView === 'function') {
            leaveAppView();
        }
    }

    // ========================================================================
    // EVENT BINDINGS
    // ========================================================================
    function bindEvents() {
        initSupabase();
        if (herClient) {
            herClient.auth.onAuthStateChange((event, session) => {
                const nextUserId = session?.user?.id || null;
                if (nextUserId === currentUserId) return;
                currentUserId = nextUserId;
                void loadData();
            });
        }
        void loadData();

        // Welcome Hub card
        document.getElementById('welcome-opt-her')?.addEventListener('click', openHerModal);

        // Header back button
        document.getElementById('btn-close-her-modal')?.addEventListener('click', () => closeHerModal());

        // Header profile button & Hero edit triggers
        document.getElementById('btn-open-her-profile')?.addEventListener('click', openProfileModal);
        document.getElementById('btn-edit-her-hero-profile')?.addEventListener('click', openProfileModal);
        document.getElementById('btn-edit-avatar-trigger')?.addEventListener('click', openProfileModal);

        // Nav tabs
        document.getElementById('her-tab-btn-info')?.addEventListener('click', () => switchTab('info'));
        document.getElementById('her-tab-btn-food')?.addEventListener('click', () => switchTab('food'));
        document.getElementById('her-tab-btn-notes')?.addEventListener('click', () => switchTab('notes'));
        document.getElementById('her-tab-btn-dates')?.addEventListener('click', () => switchTab('dates'));
        document.getElementById('her-tab-btn-mood')?.addEventListener('click', () => switchTab('mood'));

        // Tab 1: Profile & Size actions
        document.getElementById('btn-save-her-info')?.addEventListener('click', () => saveProfileFromInputs(true));
        document.getElementById('btn-add-her-ring')?.addEventListener('click', () => openEntryModal('ring'));

        // Quick Suggesters in Tab 1
        document.querySelectorAll('.her-quick-suggesters .her-quick-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const targetId = chip.parentElement.dataset.target;
                const input = document.getElementById(targetId);
                if (input) {
                    input.value = chip.dataset.val;
                    saveProfileFromInputs(false);
                    showHerToast(`Đã chọn: ${chip.dataset.val}`);
                }
            });
        });

        // Auto-save on blur for inputs
        const profileInputs = [
            'her-size-shirt', 'her-size-pants', 'her-size-shoes', 'her-size-bra', 'her-size-ring-general',
            'her-body-height', 'her-body-weight', 'her-body-bust', 'her-body-waist', 'her-body-hips', 'her-body-shoulder', 'her-body-bicep',
            'her-fav-colors', 'her-fav-scent', 'her-skin-type'
        ];
        profileInputs.forEach(id => {
            document.getElementById(id)?.addEventListener('blur', () => saveProfileFromInputs(false));
            document.getElementById(id)?.addEventListener('input', () => updateBodyStats());
        });

        // Tab 2: Food actions
        document.getElementById('btn-food-subtab-must')?.addEventListener('click', () => switchFoodSubtab('must_buy'));
        document.getElementById('btn-food-subtab-avoid')?.addEventListener('click', () => switchFoodSubtab('should_not_buy'));
        document.getElementById('btn-add-her-food')?.addEventListener('click', () => openEntryModal('food'));
        document.getElementById('btn-random-her-food')?.addEventListener('click', openRandomFoodModal);

        // Food search
        const foodSearchInput = document.getElementById('her-food-search');
        const clearFoodSearchBtn = document.getElementById('btn-clear-food-search');
        foodSearchInput?.addEventListener('input', (e) => {
            foodSearchQuery = e.target.value.trim();
            if (clearFoodSearchBtn) clearFoodSearchBtn.style.display = foodSearchQuery ? 'flex' : 'none';
            renderFoods();
        });
        clearFoodSearchBtn?.addEventListener('click', () => {
            if (foodSearchInput) foodSearchInput.value = '';
            foodSearchQuery = '';
            clearFoodSearchBtn.style.display = 'none';
            renderFoods();
        });

        // Tab 3: Notes actions
        document.getElementById('btn-add-her-note')?.addEventListener('click', () => openEntryModal('note'));

        // Notes search & category filter chips
        const notesSearchInput = document.getElementById('her-notes-search');
        const clearNotesSearchBtn = document.getElementById('btn-clear-notes-search');
        notesSearchInput?.addEventListener('input', (e) => {
            notesSearchQuery = e.target.value.trim();
            if (clearNotesSearchBtn) clearNotesSearchBtn.style.display = notesSearchQuery ? 'flex' : 'none';
            renderNotes();
        });
        clearNotesSearchBtn?.addEventListener('click', () => {
            if (notesSearchInput) notesSearchInput.value = '';
            notesSearchQuery = '';
            clearNotesSearchBtn.style.display = 'none';
            renderNotes();
        });

        document.querySelectorAll('#her-notes-filter-chips .her-filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('#her-notes-filter-chips .her-filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                currentNoteCat = chip.dataset.cat;
                renderNotes();
            });
        });

        // Tab 4: Dates, Wishlist & Memory actions
        document.getElementById('btn-dates-subtab-anniversary')?.addEventListener('click', () => switchDateSubtab('anniversary'));
        document.getElementById('btn-dates-subtab-wishlist')?.addEventListener('click', () => switchDateSubtab('wishlist'));
        document.getElementById('btn-dates-subtab-memory')?.addEventListener('click', () => switchDateSubtab('memory'));
        document.getElementById('btn-add-her-date-wish')?.addEventListener('click', () => {
            if (currentDateSubtab === 'anniversary') openEntryModal('date');
            else if (currentDateSubtab === 'wishlist') openEntryModal('wishlist');
            else if (currentDateSubtab === 'memory') openEntryModal('memory');
        });

        // Wishlist Filter Tabs
        document.querySelectorAll('.her-wish-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.her-wish-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                wishlistFilter = btn.dataset.wishFilter;
                renderDatesAndWishlist();
            });
        });

        // Tab 5: Mood actions & SOS Cheat-sheet Toggle
        document.getElementById('btn-add-her-mood')?.addEventListener('click', () => openEntryModal('mood'));
        document.getElementById('btn-toggle-her-sos')?.addEventListener('click', () => {
            const body = document.getElementById('her-sos-body');
            const chevron = document.getElementById('her-sos-chevron');
            if (!body) return;
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? 'flex' : 'none';
            if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        });

        // Mood Filter Chips
        document.querySelectorAll('#her-mood-filter-chips .her-filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('#her-mood-filter-chips .her-filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                moodFilter = chip.dataset.mood;
                renderMoods();
            });
        });

        // Entry Modal events
        document.getElementById('btn-close-her-entry')?.addEventListener('click', () => closeEntryModal());
        document.getElementById('btn-cancel-her-entry')?.addEventListener('click', () => closeEntryModal());
        document.getElementById('her-entry-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'her-entry-modal') closeEntryModal();
        });
        document.getElementById('her-entry-form')?.addEventListener('submit', handleEntrySubmit);

        // Profile Modal events
        document.getElementById('btn-close-her-profile')?.addEventListener('click', closeProfileModal);
        document.getElementById('btn-cancel-her-profile')?.addEventListener('click', closeProfileModal);
        document.getElementById('her-profile-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'her-profile-modal') closeProfileModal();
        });
        document.getElementById('her-profile-form')?.addEventListener('submit', handleProfileSubmit);

        // Avatar selector inside Profile Modal
        document.querySelectorAll('.her-avatar-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.her-avatar-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                profile.avatar = opt.dataset.avatar;
            });
        });

        // Random Food Modal events
        document.getElementById('btn-close-her-random-food')?.addEventListener('click', closeRandomFoodModal);
        document.getElementById('her-random-food-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'her-random-food-modal') closeRandomFoodModal();
        });
        document.getElementById('btn-spin-dish')?.addEventListener('click', spinDish);
    }

    // Expose to window for app navigation
    window.openHerModal = openHerModal;
    window.closeHerModal = closeHerModal;
    window.closeHerEntryModal = closeEntryModal;
    window.closeHerProfileModal = closeProfileModal;
    window.closeHerRandomFoodModal = closeRandomFoodModal;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindEvents);
    } else {
        bindEvents();
    }
})();
