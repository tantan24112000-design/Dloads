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
let activeTagFilter = null;

const numberFormatter = new Intl.NumberFormat('en-US');

const params = new URLSearchParams(window.location.search);
const id = params.get('id');
const userPage = params.get('user');

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
    if (s) s.style.display = 'flex';
}

function hideSpinner() {
    const s = document.getElementById('globalSpinner');
    if (s) s.style.display = 'none';
}

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
            tagsLower: game.category
                ? game.category.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
                : [],
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
            alert(isVi ? 'Đã copy link!' : 'Link copied!');
        } catch {
            alert(isVi ? 'Không thể copy link.' : 'Could not copy link.');
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
function getDebounced(fn, delay = 120) {
    let timer = 0;
    return (...args) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => fn(...args), delay);
    };
}

// =========================================================
// TAG CLOUD (LỀ TRỐNG HAI BÊN TRANG CHỦ) - trang trí + lọc nhanh theo tag
// =========================================================
const TAG_CLOUD_MIN_MARGIN = 130; // lề mỗi bên phải rộng tối thiểu ngần này mới hiện tag
const TAG_CLOUD_MAX_ITEMS = 26;
let tagCloudEntries = [];

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function getAllUniqueTags() {
    const seen = new Map();

    for (const item of gamesList) {
        if (!item.category) continue;

        for (const raw of item.category.split(',')) {
            const trimmed = raw.trim();
            if (!trimmed) continue;

            const lower = trimmed.toLowerCase();
            if (!seen.has(lower)) seen.set(lower, trimmed);
        }
    }

    return [...seen.values()];
}

// Chia đều theo "khoang" rồi rung ngẫu nhiên trong khoang đó, để tag rải random
// nhưng không dồn cục / đè lên nhau quá nhiều.
function buildTagCloudEntries() {
    const tags = shuffleArray(getAllUniqueTags()).slice(0, TAG_CLOUD_MAX_ITEMS);
    const n = tags.length;
    if (n === 0) return [];

    const entries = tags.map((tag, i) => {
        const binStart = i / n;
        const binSize = 1 / n;
        const jitter = (Math.random() - 0.5) * binSize * 0.8;

        return {
            tag,
            side: Math.random() < 0.5 ? 'left' : 'right',
            topFraction: Math.min(0.97, Math.max(0.03, binStart + binSize / 2 + jitter))
        };
    });

    return shuffleArray(entries);
}

function layoutTagCloud() {
    const layer = document.getElementById('tagCloudLayer');
    if (!layer || tagCloudEntries.length === 0) return;

    const bodyPaddingX = 20;   // khớp với padding của body trong CSS
    const containerMax = 900;  // khớp với max-width của .container
    const viewportW = document.documentElement.clientWidth;
    const contentAreaW = viewportW - bodyPaddingX * 2;
    const marginEach = (contentAreaW - containerMax) / 2;

    if (marginEach < TAG_CLOUD_MIN_MARGIN) {
        layer.style.display = 'none';
        return;
    }

    const leftStart = bodyPaddingX + 10;
    const sideWidth = marginEach - 20;
    const rightStart = bodyPaddingX + marginEach + containerMax + 10;

    const listView = document.getElementById('listView');
    const refHeight = Math.max(listView ? listView.offsetHeight : 0, window.innerHeight);
    const topPad = 60;
    const usableHeight = Math.max(refHeight - topPad - 60, 200);

    layer.innerHTML = '';
    const frag = document.createDocumentFragment();

    for (const entry of tagCloudEntries) {
        const el = document.createElement('span');
        el.className = 'tag-cloud-item';
        el.textContent = entry.tag;
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.dataset.tag = entry.tag;

        el.style.top = `${Math.round(topPad + entry.topFraction * usableHeight)}px`;
        el.style.width = `${Math.round(sideWidth)}px`;
        el.style.textAlign = entry.side === 'left' ? 'left' : 'right';
        el.style.left = `${Math.round(entry.side === 'left' ? leftStart : rightStart)}px`;

        frag.appendChild(el);
    }

    layer.appendChild(frag);
    layer.style.display = 'block';
}

function applyTagFilter(tag) {
    if (!tag) return;

    activeTagFilter = tag;

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    updateGrid();
    updateTagFilterIndicator();
}

function clearTagFilter() {
    activeTagFilter = null;
    updateGrid();
    updateTagFilterIndicator();
}

function updateTagFilterIndicator() {
    const el = document.getElementById('tagFilterIndicator');
    if (!el) return;

    if (activeTagFilter) {
        el.style.display = 'flex';
        el.innerHTML = `
            <span>${isVi ? 'Đang lọc theo' : 'Filtering by'}: <b>${escapeHtml(activeTagFilter)}</b></span>
            <span class="tag-filter-clear" id="tagFilterClear">${isVi ? 'Xoá lọc ✕' : 'Clear ✕'}</span>
        `;
        const clearBtn = document.getElementById('tagFilterClear');
        if (clearBtn) clearBtn.onclick = clearTagFilter;
    } else {
        el.style.display = 'none';
        el.innerHTML = '';
    }
}

function initTagCloud() {
    const layer = document.getElementById('tagCloudLayer');
    if (!layer) return;

    tagCloudEntries = buildTagCloudEntries();
    if (tagCloudEntries.length === 0) return;

    layoutTagCloud();

    layer.addEventListener('click', event => {
        const el = event.target.closest('.tag-cloud-item');
        if (el) applyTagFilter(el.dataset.tag);
    });

    layer.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const el = event.target.closest('.tag-cloud-item');
        if (!el) return;
        event.preventDefault();
        applyTagFilter(el.dataset.tag);
    });

    window.addEventListener('resize', getDebounced(layoutTagCloud, 150), { passive: true });
}

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

    const query = searchInput?.value.trim().toLowerCase() || '';
    const sortMethod = sortSelect?.value || 'new';

    let filtered;

    if (targetUser) {
        const normalizedUser = targetUser.toLowerCase();
        filtered = gamesList.filter(item => item.developerLower === normalizedUser);
    } else {
        filtered = gamesList.slice();
    }

    if (query) {
        filtered = filtered.filter(item => item.searchText.includes(query));
    }

    if (activeTagFilter) {
        const tagLower = activeTagFilter.toLowerCase();
        filtered = filtered.filter(item => item.tagsLower && item.tagsLower.includes(tagLower));
    }

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
        return;
    }

    let html = '';
    for (let i = 0; i < filtered.length; i++) {
        html += createGameCardHtml(filtered[i], i, filtered.length);
    }

    grid.innerHTML = html;
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
        scheduleIdle(initTagCloud);
    }
}

// =========================================================
// START
// =========================================================
async function init() {
    try {
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
