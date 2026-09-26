// =========================================================
// DLOADS - DATA LAYER: SUPABASE (Firebase chỉ còn lo Auth)
// =========================================================
const SUPABASE_URL = 'https://djcdgqofyzjtgxijzsgq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5rLqcMcK5xyuJfj4j8MSSw_obYu5sdM';

const REST = `${SUPABASE_URL}/rest/v1`;
const SB_HEADERS = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept: 'application/json'
};

// Chỉ lấy cột nhẹ cho trang list -> cắt băng thông tối đa.
const LIST_COLUMNS = 'id,name,developer,category,platforms,size,price,img,review_img,review_text';
const LIST_LIMIT = 200;

const urlWebNhiemVu = "https://nhap-code.vercel.app";
const isVi = (navigator.language || '').toLowerCase().includes('vi');

const META_CACHE_KEY = 'dloads:games-meta:sb1';
const META_CACHE_TTL = 10 * 60 * 1000;
const FETCH_TIMEOUT = 10000;

let allGamesData = Object.create(null);
let gamesList = [];
let userPrefs = loadUserPreferences();
let metaRefreshPromise = null;
let metaCacheTimestamp = 0;

const numberFormatter = new Intl.NumberFormat('en-US');

const params = new URLSearchParams(window.location.search);
const id = params.get('id');
const userPage = params.get('user');
const groupId = params.get('group');

// =========================================================
// HELPERS
// =========================================================
function formatPrice(price) {
    if (!price) return '';
    const n = numberFormatter.format(Number(price));
    return isVi ? `${n} VNĐ` : `$${n}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function getImageUrl(value, fallback = 'https://via.placeholder.com/300x180') {
    const url = String(value || '').trim();
    return url || fallback;
}

function showSpinner() {
    const s = document.getElementById('globalSpinner');
    if (!s) return;
    s.style.display = 'flex';
    s.classList.remove('hiding');
}

function hideSpinner() {
    const s = document.getElementById('globalSpinner');
    if (!s) return;
    s.classList.add('hiding');
    window.setTimeout(() => { s.style.display = 'none'; }, 250);
}

// Thông báo nhỏ nổi ở dưới, tự biến mất - thay cho alert()
function showToast(message) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.addEventListener('animationend', event => {
        if (event.animationName === 'toastOut') toast.remove();
    });
    container.appendChild(toast);
}

// Bắt sự kiện load của mọi <img> (kể cả ảnh chèn động) để tắt shimmer khi ảnh vào xong
document.addEventListener('load', event => {
    if (event.target.tagName === 'IMG') event.target.classList.add('img-loaded');
}, true);

function scheduleIdle(callback) {
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(callback, { timeout: 1500 });
    } else {
        window.setTimeout(callback, 0);
    }
}

function loadUserPreferences() {
    try {
        return JSON.parse(localStorage.getItem('userCategoryPrefs')) || Object.create(null);
    } catch {
        return Object.create(null);
    }
}

function trackUserPreference(category) {
    if (!category) return;

    for (const rawTag of String(category).split(',')) {
        const tag = rawTag.trim();
        if (tag) userPrefs[tag] = (userPrefs[tag] || 0) + 1;
    }

    try {
        localStorage.setItem('userCategoryPrefs', JSON.stringify(userPrefs));
    } catch {}
}

function getDebounced(fn, delay = 120) {
    let timer = 0;
    return (...args) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => fn(...args), delay);
    };
}

function timeAgo(dateStr) {
    const diffMs = Math.max(0, Date.now() - new Date(dateStr).getTime());
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return isVi ? 'Vừa xong' : 'Just now';
    if (mins < 60) return isVi ? `${mins} phút trước` : `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return isVi ? `${hours} giờ trước` : `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return isVi ? `${days} ngày trước` : `${days}d ago`;
    const months = Math.floor(days / 30);
    return isVi ? `${months} tháng trước` : `${months}mo ago`;
}

// =========================================================
// SUPABASE FETCH
// =========================================================
async function sbFetch(query, timeoutMs = FETCH_TIMEOUT) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(`${REST}/${query}`, {
            signal: controller.signal,
            headers: SB_HEADERS
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        window.clearTimeout(timer);
    }
}

// Map snake_case -> shape cũ để phần render không phải sửa.
function normalizeGame(row) {
    return {
        id: row.id,
        name: row.name || '',
        developer: row.developer || '',
        category: row.category || '',
        platforms: row.platforms || '',
        size: row.size || '',
        price: row.price || '',
        link: row.link || '',
        img: row.img || '',
        reviewImg: row.review_img || '',
        reviewText: row.review_text || '',
        customHtml: row.custom_html || '',
        customCss: row.custom_css || ''
    };
}

// =========================================================
// CACHE + INDEX
// =========================================================
function applyGamesMeta(rows) {
    const list = [];
    const map = Object.create(null);

    for (const row of rows || []) {
        if (!row || typeof row !== 'object' || !row.id) continue;

        const game = normalizeGame(row);
        map[game.id] = game;

        list.push({
            id: game.id,
            game,
            name: game.name,
            nameLower: game.name.toLowerCase(),
            developer: game.developer,
            developerLower: game.developer.toLowerCase(),
            searchText: `${game.name} ${game.developer}`.toLowerCase(),
            primaryCategory: game.category.split(',')[0]?.trim() || '',
            category: game.category,
            platforms: game.platforms
        });
    }

    allGamesData = map;
    gamesList = list;
}

function readCachedGamesMeta() {
    try {
        const raw = sessionStorage.getItem(META_CACHE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.data)) return null;

        applyGamesMeta(parsed.data);
        metaCacheTimestamp = Number(parsed.timestamp) || 0;

        return { data: parsed.data, timestamp: metaCacheTimestamp };
    } catch {
        try { sessionStorage.removeItem(META_CACHE_KEY); } catch {}
        return null;
    }
}

function writeCachedGamesMeta(rows) {
    try {
        sessionStorage.setItem(META_CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: rows
        }));
    } catch {}
}

async function refreshGamesMeta() {
    if (metaRefreshPromise) return metaRefreshPromise;

    metaRefreshPromise = (async () => {
        const rows = await sbFetch(
            `games?select=${LIST_COLUMNS}&order=created_at.desc&limit=${LIST_LIMIT}`
        );

        applyGamesMeta(rows);
        metaCacheTimestamp = Date.now();
        writeCachedGamesMeta(rows);

        return allGamesData;
    })()
        .catch(error => {
            console.error('Lỗi tải danh sách game:', error);
            throw error;
        })
        .finally(() => {
            metaRefreshPromise = null;
        });

    return metaRefreshPromise;
}

async function fetchGamesMeta() {
    const now = Date.now();

    if (gamesList.length > 0 && now - metaCacheTimestamp <= META_CACHE_TTL) {
        return allGamesData;
    }

    if (gamesList.length > 0) {
        void refreshGamesMeta().catch(() => {});
        return allGamesData;
    }

    const cached = readCachedGamesMeta();

    if (cached) {
        if (now - cached.timestamp <= META_CACHE_TTL) return allGamesData;
        void refreshGamesMeta().catch(() => {});
        return allGamesData;
    }

    return refreshGamesMeta();
}

async function fetchGameDetailData(gameId) {
    try {
        const rows = await sbFetch(
            `games?id=eq.${encodeURIComponent(gameId)}&select=*&limit=1`
        );
        return rows && rows[0] ? normalizeGame(rows[0]) : null;
    } catch (error) {
        console.error('Lỗi tải chi tiết game:', error);
        return null;
    }
}

// =========================================================
// BÌNH LUẬN (khoá nếu chưa đăng nhập, giao diện kiểu YouTube)
// =========================================================
let currentUser = null; // { uid, name, avatar } - set từ hook window.setCommentUser
let commentLikeState = loadCommentLikeState();

function loadCommentLikeState() {
    try { return JSON.parse(localStorage.getItem('commentLikes')) || {}; }
    catch { return {}; }
}

function saveCommentLikeState() {
    try { localStorage.setItem('commentLikes', JSON.stringify(commentLikeState)); } catch {}
}

const HEART_ICON = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-10-9.1C.3 8.4 2 4.8 5.6 4.2c2-.3 3.9.6 5 2.2.9-1.6 2.9-2.5 4.9-2.2 3.6.6 5.3 4.2 3.6 7.7C19.5 16.4 12 21 12 21z" stroke-width="1.6" stroke-linejoin="round"/></svg>';

function commentAvatarHtml(avatar, size) {
    const src = escapeHtml(getImageUrl(avatar, 'basicavtr.png'));
    return `<img class="comment-avatar" style="width:${size}px;height:${size}px;" src="${src}" loading="lazy" decoding="async" alt="">`;
}

// Gọi từ hook auth trong index.html mỗi khi trạng thái đăng nhập đổi
window.setCommentUser = function (user) {
    currentUser = user;
    const composer = document.getElementById('commentComposer');
    const locked = document.getElementById('commentLocked');
    if (!composer || !locked) return;

    if (user) {
        composer.style.display = 'flex';
        locked.style.display = 'none';
        const avatarImg = document.getElementById('composerAvatar');
        if (avatarImg) avatarImg.src = getImageUrl(user.avatar, 'basicavtr.png');
    } else {
        composer.style.display = 'none';
        locked.style.display = 'flex';
    }
};

async function fetchComments(gameId) {
    try {
        return await sbFetch(`comments?game_id=eq.${encodeURIComponent(gameId)}&select=*&order=created_at.asc`);
    } catch (error) {
        console.error('Lỗi tải bình luận:', error);
        return [];
    }
}

async function postComment(gameId, text, parentId = null) {
    if (!currentUser || !text.trim()) return null;

    try {
        const res = await fetch(`${REST}/comments`, {
            method: 'POST',
            headers: { ...SB_HEADERS, 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify({
                game_id: gameId,
                user_id: currentUser.uid,
                user_name: currentUser.name,
                user_avatar: currentUser.avatar || '',
                parent_id: parentId,
                text: text.trim(),
                likes: 0
            })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        return rows && rows[0] ? rows[0] : null;
    } catch (error) {
        console.error('Lỗi gửi bình luận:', error);
        showToast(isVi ? 'Gửi bình luận thất bại.' : 'Failed to post comment.');
        return null;
    }
}

async function toggleCommentLike(commentId, btnEl, countEl) {
    const liked = !!commentLikeState[commentId];
    const current = Number(countEl.dataset.count) || 0;
    const newCount = Math.max(0, liked ? current - 1 : current + 1);

    commentLikeState[commentId] = !liked;
    saveCommentLikeState();
    btnEl.classList.toggle('liked', !liked);
    countEl.dataset.count = newCount;
    countEl.textContent = newCount > 0 ? newCount : '';

    try {
        await fetch(`${REST}/comments?id=eq.${encodeURIComponent(commentId)}`, {
            method: 'PATCH',
            headers: { ...SB_HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ likes: newCount })
        });
    } catch (error) {
        console.warn('Không đồng bộ được lượt tim:', error);
    }
}

function commentItemHtml(comment, isReply) {
    const liked = !!commentLikeState[comment.id];
    const likeCount = Number(comment.likes) || 0;
    const avatarSize = isReply ? 28 : 36;

    return `
        <div class="comment-item" data-comment-id="${comment.id}">
            ${commentAvatarHtml(comment.user_avatar, avatarSize)}
            <div class="comment-body">
                <div class="comment-head">
                    <span class="comment-name">${escapeHtml(comment.user_name || 'User')}</span>
                    <span class="comment-time">${timeAgo(comment.created_at)}</span>
                </div>
                <p class="comment-text">${escapeHtml(comment.text)}</p>
                <div class="comment-actions">
                    <button class="comment-like-btn${liked ? ' liked' : ''}" data-comment-id="${comment.id}">
                        ${HEART_ICON}
                        <span class="like-count" data-count="${likeCount}">${likeCount > 0 ? likeCount : ''}</span>
                    </button>
                    ${isReply ? '' : `<button class="comment-reply-btn" data-comment-id="${comment.id}">${isVi ? 'TRẢ LỜI' : 'REPLY'}</button>`}
                </div>
                ${isReply ? '' : `<div class="comment-reply-slot" id="replySlot-${comment.id}"></div>`}
                ${isReply ? '' : `<div class="comment-replies" id="replies-${comment.id}"></div>`}
            </div>
        </div>
    `;
}

function renderComments(list) {
    const container = document.getElementById('commentList');
    if (!container) return;

    const topLevel = list.filter(c => !c.parent_id);
    const repliesMap = {};
    for (const c of list) {
        if (c.parent_id) {
            (repliesMap[c.parent_id] ||= []).push(c);
        }
    }

    if (topLevel.length === 0) {
        container.innerHTML = `<div style="color:#555; font-size:12px; padding:6px 0;">${isVi ? 'Chưa có bình luận nào.' : 'No comments yet.'}</div>`;
        return;
    }

    container.innerHTML = topLevel.map(c => commentItemHtml(c, false)).join('');

    for (const comment of topLevel) {
        const replies = repliesMap[comment.id];
        if (!replies || !replies.length) continue;
        const repliesEl = document.getElementById(`replies-${comment.id}`);
        if (repliesEl) repliesEl.innerHTML = replies.map(r => commentItemHtml(r, true)).join('');
    }
}

function openReplyComposer(parentId, gameId) {
    const slot = document.getElementById(`replySlot-${parentId}`);
    if (!slot || !currentUser) return;

    if (slot.childElementCount > 0) {
        slot.innerHTML = '';
        return;
    }

    slot.innerHTML = `
        <div class="comment-reply-composer">
            ${commentAvatarHtml(currentUser.avatar, 28)}
            <div class="comment-input-wrap">
                <input type="text" class="comment-input reply-input" maxlength="500" placeholder="${isVi ? 'Trả lời...' : 'Reply...'}">
            </div>
            <button class="comment-post-btn reply-post-btn">${isVi ? 'Gửi' : 'Reply'}</button>
        </div>
    `;

    const input = slot.querySelector('.reply-input');
    const btn = slot.querySelector('.reply-post-btn');
    input.focus();

    const submit = async () => {
        const text = input.value.trim();
        if (!text) return;
        btn.disabled = true;
        const saved = await postComment(gameId, text, parentId);
        btn.disabled = false;
        if (saved) {
            slot.innerHTML = '';
            const repliesEl = document.getElementById(`replies-${parentId}`);
            if (repliesEl) repliesEl.insertAdjacentHTML('beforeend', commentItemHtml(saved, true));
        }
    };

    btn.onclick = submit;
    input.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });
}

function setupCommentEvents(gameId) {
    const list = document.getElementById('commentList');
    if (!list || list.dataset.bound) return;
    list.dataset.bound = '1';

    list.addEventListener('click', event => {
        const likeBtn = event.target.closest('.comment-like-btn');
        if (likeBtn) {
            if (!currentUser) return;
            toggleCommentLike(likeBtn.dataset.commentId, likeBtn, likeBtn.querySelector('.like-count'));
            return;
        }

        const replyBtn = event.target.closest('.comment-reply-btn');
        if (replyBtn) openReplyComposer(replyBtn.dataset.commentId, gameId);
    });
}

function setupCommentComposer(gameId) {
    const input = document.getElementById('commentInput');
    const btn = document.getElementById('commentPostBtn');
    if (!input || !btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';

    const submit = async () => {
        const text = input.value.trim();
        if (!text || !currentUser) return;
        btn.disabled = true;
        const saved = await postComment(gameId, text, null);
        btn.disabled = false;
        if (!saved) return;

        input.value = '';
        const container = document.getElementById('commentList');
        if (container && !container.querySelector('.comment-item')) container.innerHTML = '';
        container?.insertAdjacentHTML('beforeend', commentItemHtml(saved, false));
    };

    btn.onclick = submit;
    input.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });
}

async function initComments(gameId) {
    setupCommentComposer(gameId);
    setupCommentEvents(gameId);
    renderComments(await fetchComments(gameId));
}

// =========================================================
// DETAIL PAGE
// =========================================================
function renderBasicDetail(data, gameId) {
    const name = data.name || 'Unknown Game';
    const developer = data.developer || 'Unknown Studio';

    document.getElementById('gName').innerText = name;

    document.getElementById('gDevDetail').innerHTML =
        `A game by <span id="detailDeveloperLink" style="color:#fff; font-weight:bold; cursor:pointer; text-decoration:underline;">${escapeHtml(developer)}</span>`;

    document.getElementById('detailDeveloperLink').onclick = () => {
        window.location.href = `/?user=${encodeURIComponent(developer)}`;
    };

    document.getElementById('gSize').innerText = `SIZE: ${data.size || 'N/A'}`;

    const thumb = document.getElementById('gThumb');
    thumb.loading = 'eager';
    thumb.decoding = 'async';
    thumb.fetchPriority = 'high';
    thumb.src = getImageUrl(data.img, 'https://via.placeholder.com/600x280?text=No+Image');

    document.getElementById('gLink').href =
        `${urlWebNhiemVu}/?id=${encodeURIComponent(gameId)}`;

    document.getElementById('gPlatformsDetail').innerHTML = data.platforms
        ? String(data.platforms).split(',')
            .map(p => `<span class="plat-badge">${escapeHtml(p.trim())}</span>`)
            .join('')
        : '';

    const categoryEl = document.getElementById('gCategoryDetail');

    if (data.category) {
        categoryEl.innerText = String(data.category).split(',')[0];
        categoryEl.style.display = 'inline-block';
    } else {
        categoryEl.style.display = 'none';
    }

    const priceContainer = document.getElementById('gPriceContainer');

    if (data.price) {
        priceContainer.style.display = 'block';
        document.getElementById('gFakePrice').innerText = formatPrice(data.price);
    } else {
        priceContainer.style.display = 'none';
    }

    document.getElementById('shareBtn').onclick = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            showToast(isVi ? 'Đã copy link!' : 'Link copied!');
        } catch {
            showToast(isVi ? 'Không thể copy link.' : 'Could not copy link.');
        }
    };

    trackUserPreference(data.category);
}

function renderDetailExtra(data) {
    const devContentEl = document.getElementById('customDevContent');

    if (data.customHtml && String(data.customHtml).trim() !== '') {
        if (typeof DOMPurify !== 'undefined') {
            devContentEl.innerHTML = DOMPurify.sanitize(data.customHtml, {
                ADD_TAGS: ['iframe'],
                ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'style']
            });
        } else {
            devContentEl.innerHTML = data.customHtml;
        }
        devContentEl.style.display = 'block';
    } else {
        devContentEl.innerHTML = '';
        devContentEl.style.display = 'none';
    }

    const existingStyle = document.getElementById('devCustomCss');
    if (existingStyle) existingStyle.remove();

    if (data.customCss && String(data.customCss).trim() !== '') {
        const styleEl = document.createElement('style');
        styleEl.id = 'devCustomCss';
        styleEl.textContent = data.customCss;
        document.head.appendChild(styleEl);
    }

    const reviewSec = document.getElementById('reviewSec');
    const rText = document.getElementById('rText');
    const rImg = document.getElementById('rImg');

    if (data.reviewText || data.reviewImg) {
        reviewSec.style.display = 'block';
        rText.innerText = data.reviewText || '';

        if (data.reviewImg) {
            rImg.src = getImageUrl(data.reviewImg, '');
            rImg.loading = 'lazy';
            rImg.decoding = 'async';
            rImg.style.display = 'block';
        } else {
            rImg.removeAttribute('src');
            rImg.style.display = 'none';
        }
    } else {
        reviewSec.style.display = 'none';
    }
}

function renderRecommendations() {
    const recGrid = document.getElementById('recGrid');
    if (!recGrid) return;

    let count = 0;
    let html = '';

    for (const item of gamesList) {
        if (item.id === id) continue;

        html += `
            <a href="?id=${encodeURIComponent(item.id)}" class="rec-card" data-loading="1">
                <img src="${escapeHtml(getImageUrl(item.game.img, 'https://via.placeholder.com/150x80'))}" loading="lazy" decoding="async" alt="">
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.name)}</div>
            </a>
        `;

        if (++count >= 4) break;
    }

    recGrid.innerHTML = html;
}

async function initDetail() {
    document.getElementById('detailView').style.display = 'block';

    let baseData = allGamesData[id];

    if (!baseData) {
        const cached = readCachedGamesMeta();
        baseData = allGamesData[id] || null;
        if (cached && !baseData) baseData = allGamesData[id] || null;
    }

    let initialData = baseData;

    const detailData = await fetchGameDetailData(id);

    if (detailData) {
        initialData = baseData ? { ...baseData, ...detailData } : detailData;
    }

    if (!initialData) {
        document.getElementById('detailView').innerHTML =
            '<div style="text-align:center; padding:50px;">GAME NOT FOUND</div>';
        hideSpinner();
        return;
    }

    renderBasicDetail(initialData, id);
    renderDetailExtra(initialData);
    hideSpinner();

    initComments(id);

    scheduleIdle(async () => {
        try {
            await fetchGamesMeta();
            renderRecommendations();
        } catch (error) {
            console.warn('Không tải được recommendation:', error);
        }
    });
}

// =========================================================
// LIST PAGE
// =========================================================
function createGameCardHtml(item, index, total) {
    const game = item.game;
    const image = escapeHtml(getImageUrl(game.img));
    const name = escapeHtml(item.name);
    const developer = escapeHtml(item.developer || 'Unknown');

    let priceHtml = '';

    if (game.price) {
        priceHtml = `
            <div style="margin-bottom: 8px;">
                <span class="fake-price">${escapeHtml(formatPrice(game.price))}</span>
                <span class="free-badge">FREE</span>
            </div>
        `;
    }

    const categoryHtml = item.category
        ? `<span class="category-tag">${escapeHtml(item.primaryCategory)}</span>`
        : '';

    const platformsHtml = item.platforms
        ? `<div class="platforms">${item.platforms.split(',')
            .map(p => `<span class="plat-badge">${escapeHtml(p.trim())}</span>`)
            .join('')}</div>`
        : '';

    let reviewPanelHtml = '';

    if (game.reviewText || game.reviewImg) {
        const revTitle = isVi ? '⭐ Nổi bật / Review' : '⭐ Featured / Review';

        const imgHtml = game.reviewImg
            ? `<img class="rev-img" src="${escapeHtml(getImageUrl(game.reviewImg, ''))}" alt="Review" loading="lazy" decoding="async">`
            : '';

        const textHtml = game.reviewText
            ? `<p class="review-panel-text">${escapeHtml(game.reviewText)}</p>`
            : '';

        reviewPanelHtml = `
            <div class="review-panel">
                <div class="review-panel-title">${revTitle}</div>
                ${imgHtml}
                ${textHtml}
            </div>
        `;
    }

    let html = `
        <div class="game-card" style="content-visibility:auto; contain-intrinsic-size:260px;">
            ${reviewPanelHtml}
            <span class="card-badge">VERIFIED</span>
            <div style="flex-grow: 1;">
                <img src="${image}" loading="lazy" decoding="async" fetchpriority="low" alt="">
                ${platformsHtml}
                <h3 class="game-title">${name}</h3>
                <p class="dev-name" style="cursor:pointer; text-decoration:underline;" data-user="${escapeHtml(item.developer || 'Unknown')}">${developer}</p>
                ${categoryHtml}
                ${priceHtml}
            </div>
            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:15px;">
                <p style="color:#888; font-size:11px; margin:0;">${escapeHtml(game.size || 'N/A')}</p>
                <a href="?id=${encodeURIComponent(item.id)}" class="btn" style="padding:8px 15px;" data-loading="1">VIEW</a>
            </div>
        </div>
    `;

    if ((index + 1) % 3 === 0 && index !== total - 1) {
        html += '<div class="row-divider"></div>';
    }

    return html;
}

function updateGrid(targetUser = null) {
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const grid = document.getElementById('gameGrid');

    if (!grid) return;

    grid.classList.add('is-updating');

    const query = searchInput?.value.trim().toLowerCase() || '';
    const sortMethod = sortSelect?.value || 'new';

    let filtered = [];

    if (targetUser) {
        const normalizedUser = targetUser.toLowerCase();
        for (const item of gamesList) {
            if (item.developerLower === normalizedUser) filtered.push(item);
        }
    } else if (query) {
        for (const item of gamesList) {
            if (item.searchText.includes(query)) filtered.push(item);
        }
    } else {
        filtered.push(...gamesList);
    }
    if (window.TagCloud) filtered = filtered.filter(TagCloud.matches);
    // Supabase đã trả về created_at DESC => 'new' không cần xử lý thêm.
    if (sortMethod === 'az') {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMethod === 'recommended') {
        filtered.sort((a, b) =>
            (userPrefs[b.primaryCategory] || 0) - (userPrefs[a.primaryCategory] || 0)
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML =
            '<div style="grid-column:1/-1; text-align:center; color:#555; padding:20px;">NO GAMES FOUND</div>';
        requestAnimationFrame(() => grid.classList.remove('is-updating'));
        return;
    }

    let html = '';
    for (let i = 0; i < filtered.length; i++) {
        html += createGameCardHtml(filtered[i], i, filtered.length);
    }

    grid.innerHTML = html;
    requestAnimationFrame(() => grid.classList.remove('is-updating'));
}

function setupListEvents(targetUser = null) {
    const grid = document.getElementById('gameGrid');
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');

    if (grid) {
        grid.addEventListener('click', event => {
            const userEl = event.target.closest('[data-user]');

            if (userEl) {
                event.preventDefault();
                window.location.href = `/?user=${encodeURIComponent(userEl.dataset.user)}`;
                return;
            }

            if (event.target.closest('a[data-loading="1"]')) showSpinner();
        });
    }

    if (!targetUser) {
        const refreshGrid = getDebounced(() => updateGrid(), 100);
        searchInput?.addEventListener('input', refreshGrid, { passive: true });
        sortSelect?.addEventListener('change', () => updateGrid());
    }
}

async function initList(targetUser = null) {
    document.getElementById('listView').style.display = 'block';

    await fetchGamesMeta();

    const grid = document.getElementById('gameGrid');

    if (targetUser && grid) {
        const heading = document.createElement('h2');
        heading.style.cssText =
            'text-transform: uppercase; margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 10px;';
        heading.append('GAMES BY: ');

        const nameEl = document.createElement('span');
        nameEl.style.color = '#00e676';
        nameEl.textContent = targetUser;
        heading.appendChild(nameEl);

        grid.before(heading);
    }

    updateGrid(targetUser ? targetUser.toLowerCase() : null);
    setupListEvents(targetUser);
    hideSpinner();
    if (!targetUser) {
    window.TagCloud?.init({ getItems: () => gamesList, onChange: () => updateGrid() });
}
}

// =========================================================
// START
// =========================================================
async function init() {
    try {
        // Trang không có UI danh sách/chi tiết game (vd: groups.html) thì bỏ qua —
        // trang đó tự khởi tạo lấy (xem groups.js).
        if (!document.getElementById('listView') && !document.getElementById('detailView')) {
            hideSpinner();
            return;
        }
        if (id) {
            await initDetail();
        } else {
            await initList(userPage);
        }
    } catch (error) {
        console.error('Init error:', error);
        hideSpinner();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
