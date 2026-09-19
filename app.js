const dbUrl = "https://sf2g-bf285-default-rtdb.firebaseio.com";
const urlWebNhiemVu = "https://nhap-code.vercel.app";
const isVi = (navigator.language || '').toLowerCase().includes('vi');

// =========================================================
// PERFORMANCE CONFIG
// =========================================================
const META_PATH = 'gameMeta';
const META_URL = `${dbUrl}/${META_PATH}.json`;
const LEGACY_GAMES_URL = `${dbUrl}/games.json`;

const META_CACHE_KEY = 'soletgames:games-meta:v3';
const META_CACHE_TTL = 5 * 60 * 1000; // 5 phút
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

// =========================================================
// SMALL HELPERS
// =========================================================
function formatPrice(price) {
    if (!price) return '';
    const formattedNumber = numberFormatter.format(Number(price));
    return isVi ? `${formattedNumber} VNĐ` : `$${formattedNumber}`;
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
    const spinner = document.getElementById('globalSpinner');
    if (spinner) spinner.style.display = 'flex';
}

function hideSpinner() {
    const spinner = document.getElementById('globalSpinner');
    if (spinner) spinner.style.display = 'none';
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

    const tags = String(category).split(',');
    for (const rawTag of tags) {
        const tag = rawTag.trim();
        if (tag) userPrefs[tag] = (userPrefs[tag] || 0) + 1;
    }

    try {
        localStorage.setItem('userCategoryPrefs', JSON.stringify(userPrefs));
    } catch {
        // localStorage có thể đầy/quyền truy cập bị chặn; không để lỗi làm hỏng app.
    }
}

// =========================================================
// FIREBASE FETCH
// =========================================================
async function fetchJson(url, timeoutMs = FETCH_TIMEOUT) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    } finally {
        window.clearTimeout(timer);
    }
}

// =========================================================
// META CACHE + NORMALIZED INDEX
// =========================================================
function applyGamesMeta(data) {
    allGamesData = (data && typeof data === 'object') ? data : Object.create(null);

    const list = [];
    for (const [gameId, game] of Object.entries(allGamesData)) {
        if (!game || typeof game !== 'object') continue;

        const name = String(game.name || '');
        const developer = String(game.developer || '');
        const category = String(game.category || '');
        const platforms = String(game.platforms || '');

        list.push({
            id: gameId,
            game,
            name,
            nameLower: name.toLowerCase(),
            developer,
            developerLower: developer.toLowerCase(),
            searchText: `${name} ${developer}`.toLowerCase(),
            primaryCategory: category.split(',')[0]?.trim() || '',
            category,
            platforms
        });
    }

    gamesList = list;
}

function readCachedGamesMeta() {
    try {
        const raw = sessionStorage.getItem(META_CACHE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.data) return null;

        const timestamp = Number(parsed.timestamp) || 0;
        applyGamesMeta(parsed.data);
        metaCacheTimestamp = timestamp;

        return {
            data: parsed.data,
            timestamp
        };
    } catch {
        try {
            sessionStorage.removeItem(META_CACHE_KEY);
        } catch {}
        return null;
    }
}

function writeCachedGamesMeta(data) {
    try {
        sessionStorage.setItem(META_CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data
        }));
    } catch {
        // Cache fail không được phép chặn UI.
    }
}

async function refreshGamesMeta() {
    if (metaRefreshPromise) return metaRefreshPromise;

    metaRefreshPromise = (async () => {
        let data = null;

        // Fast path: node metadata nhẹ.
        try {
            data = await fetchJson(META_URL);
        } catch (metaError) {
            console.warn('Không tải được gameMeta, thử legacy /games:', metaError);
        }

        // Compatibility path: dùng cấu trúc cũ nếu gameMeta chưa tồn tại.
        // Sau khi tạo gameMeta thì đường này sẽ không còn được dùng.
        if (
            !data ||
            typeof data !== 'object' ||
            Array.isArray(data) ||
            Object.keys(data).length === 0
        ) {
            data = await fetchJson(LEGACY_GAMES_URL);
        }

        applyGamesMeta(data || {});
        metaCacheTimestamp = Date.now();
        writeCachedGamesMeta(allGamesData);

        return allGamesData;
    })()
        .catch(error => {
            console.error('Lỗi tải metadata Firebase:', error);
            throw error;
        })
        .finally(() => {
            metaRefreshPromise = null;
        });

    return metaRefreshPromise;
}

async function fetchGamesMeta() {
    const now = Date.now();

    // Memory cache: nhanh nhất, không request mạng.
    if (
        gamesList.length > 0 &&
        now - metaCacheTimestamp <= META_CACHE_TTL
    ) {
        return allGamesData;
    }

    // Đã có cache cũ trong memory:
    // trả UI ngay rồi refresh nền.
    if (gamesList.length > 0) {
        void refreshGamesMeta().catch(() => {});
        return allGamesData;
    }

    const cached = readCachedGamesMeta();

    if (cached) {
        // Cache còn mới => dùng ngay, không gọi Firebase.
        if (now - cached.timestamp <= META_CACHE_TTL) {
            return allGamesData;
        }

        // Cache cũ => stale-while-revalidate.
        void refreshGamesMeta().catch(() => {});
        return allGamesData;
    }

    return refreshGamesMeta();
}

async function fetchGameDetailData(gameId) {
    try {
        return await fetchJson(
            `${dbUrl}/games/${encodeURIComponent(gameId)}.json`
        );
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
        window.location.href =
            `/?user=${encodeURIComponent(developer)}`;
    };

    document.getElementById('gSize').innerText =
        `SIZE: ${data.size || 'N/A'}`;

    const thumb = document.getElementById('gThumb');

    thumb.loading = 'eager';
    thumb.decoding = 'async';
    thumb.fetchPriority = 'high';
    thumb.src = getImageUrl(
        data.img,
        'https://via.placeholder.com/600x280?text=No+Image'
    );

    document.getElementById('gLink').href =
        `${urlWebNhiemVu}/?id=${encodeURIComponent(gameId)}`;

    const platformsEl =
        document.getElementById('gPlatformsDetail');

    platformsEl.innerHTML = data.platforms
        ? String(data.platforms)
            .split(',')
            .map(platform =>
                `<span class="plat-badge">${escapeHtml(platform.trim())}</span>`
            )
            .join('')
        : '';

    const categoryEl =
        document.getElementById('gCategoryDetail');

    if (data.category) {
        categoryEl.innerText =
            String(data.category).split(',')[0];

        categoryEl.style.display = 'inline-block';
    } else {
        categoryEl.style.display = 'none';
    }

    const priceContainer =
        document.getElementById('gPriceContainer');

    if (data.price) {
        priceContainer.style.display = 'block';

        document.getElementById('gFakePrice').innerText =
            formatPrice(data.price);
    } else {
        priceContainer.style.display = 'none';
    }

    const shareBtn =
        document.getElementById('shareBtn');

    shareBtn.onclick = async () => {
        try {
            await navigator.clipboard.writeText(
                window.location.href
            );

            alert(
                isVi
                    ? 'Đã copy link!'
                    : 'Link copied!'
            );
        } catch {
            alert(
                isVi
                    ? 'Không thể copy link.'
                    : 'Could not copy link.'
            );
        }
    };

    trackUserPreference(data.category);
}

function renderDetailExtra(data) {
    const devContentEl =
        document.getElementById('customDevContent');

    if (
        data.customHtml &&
        String(data.customHtml).trim() !== ''
    ) {
        if (typeof DOMPurify !== 'undefined') {
            devContentEl.innerHTML =
                DOMPurify.sanitize(data.customHtml, {
                    ADD_TAGS: ['iframe'],
                    ADD_ATTR: [
                        'allow',
                        'allowfullscreen',
                        'frameborder',
                        'scrolling',
                        'src',
                        'style'
                    ]
                });
        } else {
            devContentEl.innerHTML =
                data.customHtml;
        }

        devContentEl.style.display = 'block';
    } else {
        devContentEl.innerHTML = '';
        devContentEl.style.display = 'none';
    }

    const existingStyle =
        document.getElementById('devCustomCss');

    if (existingStyle) {
        existingStyle.remove();
    }

    if (
        data.customCss &&
        String(data.customCss).trim() !== ''
    ) {
        const styleEl =
            document.createElement('style');

        styleEl.id = 'devCustomCss';
        styleEl.textContent = data.customCss;

        document.head.appendChild(styleEl);
    }

    const reviewSec =
        document.getElementById('reviewSec');

    const rText =
        document.getElementById('rText');

    const rImg =
        document.getElementById('rImg');

    if (data.reviewText || data.reviewImg) {
        reviewSec.style.display = 'block';

        rText.innerText =
            data.reviewText || '';

        if (data.reviewImg) {
            rImg.src =
                getImageUrl(data.reviewImg, '');

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
    const recGrid =
        document.getElementById('recGrid');

    if (!recGrid) return;

    let count = 0;
    let html = '';

    for (const item of gamesList) {
        if (item.id === id) continue;

        html += `
            <a
                href="?id=${encodeURIComponent(item.id)}"
                class="rec-card"
                data-loading="1"
            >
                <img
                    src="${escapeHtml(
                        getImageUrl(
                            item.game.img,
                            'https://via.placeholder.com/150x80'
                        )
                    )}"
                    loading="lazy"
                    decoding="async"
                    alt=""
                >
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${escapeHtml(item.name)}
                </div>
            </a>
        `;

        if (++count >= 4) break;
    }

    recGrid.innerHTML = html;
}

async function initDetail() {
    document.getElementById('detailView').style.display =
        'block';

    // Không bắt buộc tải toàn bộ metadata để mở một game trực tiếp.
    // Nếu có cache thì render ngay; nếu không thì lấy đúng game.
    let baseData =
        allGamesData[id];

    if (!baseData) {
        const cached =
            readCachedGamesMeta();

        baseData =
            cached?.data?.[id] || null;
    }

    let initialData =
        baseData;

    // Lấy full game trực tiếp.
    const detailData =
        await fetchGameDetailData(id);

    if (detailData) {
        initialData =
            baseData
                ? { ...baseData, ...detailData }
                : detailData;
    }

    if (!initialData) {
        document.getElementById('detailView').innerHTML =
            '<div style="text-align:center; padding:50px;">GAME NOT FOUND</div>';

        hideSpinner();
        return;
    }

    renderBasicDetail(
        initialData,
        id
    );

    renderDetailExtra(
        initialData
    );

    hideSpinner();

    // Recommendation không nằm trên critical path.
    scheduleIdle(async () => {
        try {
            await fetchGamesMeta();
            renderRecommendations();
        } catch (error) {
            console.warn(
                'Không tải được recommendation:',
                error
            );
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

        timer = window.setTimeout(
            () => fn(...args),
            delay
        );
    };
}

function createGameCardHtml(
    item,
    index,
    total
) {
    const game =
        item.game;

    const image =
        escapeHtml(
            getImageUrl(game.img)
        );

    const name =
        escapeHtml(
            item.name
        );

    const developer =
        escapeHtml(
            item.developer || 'Unknown'
        );

    let priceHtml = '';

    if (game.price) {
        priceHtml = `
            <div style="margin-bottom: 8px;">
                <span class="fake-price">
                    ${escapeHtml(
                        formatPrice(game.price)
                    )}
                </span>

                <span class="free-badge">
                    FREE
                </span>
            </div>
        `;
    }

    const categoryHtml =
        item.category
            ? `
                <span class="category-tag">
                    ${escapeHtml(
                        item.primaryCategory
                    )}
                </span>
            `
            : '';

    const platformsHtml =
        item.platforms
            ? `
                <div class="platforms">
                    ${
                        item.platforms
                            .split(',')
                            .map(
                                platform =>
                                    `<span class="plat-badge">${escapeHtml(platform.trim())}</span>`
                            )
                            .join('')
                    }
                </div>
            `
            : '';

    let reviewPanelHtml = '';

    if (
        game.reviewText ||
        game.reviewImg
    ) {
        const revTitle =
            isVi
                ? '⭐ Nổi bật / Review'
                : '⭐ Featured / Review';

        const imgHtml =
            game.reviewImg
                ? `
                    <img
                        class="rev-img"
                        src="${escapeHtml(
                            getImageUrl(
                                game.reviewImg,
                                ''
                            )
                        )}"
                        alt="Review"
                        loading="lazy"
                        decoding="async"
                    >
                `
                : '';

        const textHtml =
            game.reviewText
                ? `
                    <p class="review-panel-text">
                        ${escapeHtml(
                            game.reviewText
                        )}
                    </p>
                `
                : '';

        reviewPanelHtml = `
            <div class="review-panel">
                <div class="review-panel-title">
                    ${revTitle}
                </div>

                ${imgHtml}

                ${textHtml}
            </div>
        `;
    }

    let html = `
        <div
            class="game-card"
            style="content-visibility:auto; contain-intrinsic-size:260px;"
        >
            ${reviewPanelHtml}

            <span class="card-badge">
                VERIFIED
            </span>

            <div style="flex-grow: 1;">
                <img
                    src="${image}"
                    loading="lazy"
                    decoding="async"
                    fetchpriority="low"
                    alt=""
                >

                ${platformsHtml}

                <h3 class="game-title">
                    ${name}
                </h3>

                <p
                    class="dev-name"
                    style="cursor:pointer; text-decoration:underline;"
                    data-user="${escapeHtml(
                        item.developer || 'Unknown'
                    )}"
                >
                    ${developer}
                </p>

                ${categoryHtml}

                ${priceHtml}
            </div>

            <div
                style="
                    display:flex;
                    justify-content:space-between;
                    align-items:flex-end;
                    margin-top:15px;
                "
            >
                <p
                    style="
                        color:#888;
                        font-size:11px;
                        margin:0;
                    "
                >
                    ${escapeHtml(
                        game.size || 'N/A'
                    )}
                </p>

                <a
                    href="?id=${encodeURIComponent(item.id)}"
                    class="btn"
                    style="padding:8px 15px;"
                    data-loading="1"
                >
                    VIEW
                </a>
            </div>
        </div>
    `;

    if (
        (index + 1) % 3 === 0 &&
        index !== total - 1
    ) {
        html +=
            '<div class="row-divider"></div>';
    }

    return html;
}

function updateGrid(
    targetUser = null
) {
    const searchInput =
        document.getElementById(
            'searchInput'
        );

    const sortSelect =
        document.getElementById(
            'sortSelect'
        );

    const grid =
        document.getElementById(
            'gameGrid'
        );

    if (!grid) return;

    const query =
        searchInput?.value
            .trim()
            .toLowerCase() || '';

    const sortMethod =
        sortSelect?.value || 'new';

    const filtered = [];

    if (targetUser) {
        const normalizedUser =
            targetUser.toLowerCase();

        for (const item of gamesList) {
            if (
                item.developerLower ===
                normalizedUser
            ) {
                filtered.push(item);
            }
        }
    } else if (query) {
        for (const item of gamesList) {
            if (
                item.searchText.includes(query)
            ) {
                filtered.push(item);
            }
        }
    } else {
        // Không cần filter bằng includes('')
        // cho từng game.
        filtered.push(...gamesList);
    }

    if (sortMethod === 'az') {
        filtered.sort(
            (a, b) =>
                a.name.localeCompare(b.name)
        );
    } else if (sortMethod === 'new') {
        filtered.reverse();
    } else if (
        sortMethod === 'recommended'
    ) {
        filtered.sort(
            (a, b) => {
                const scoreA =
                    userPrefs[
                        a.primaryCategory
                    ] || 0;

                const scoreB =
                    userPrefs[
                        b.primaryCategory
                    ] || 0;

                return scoreB - scoreA;
            }
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML =
            '<div style="grid-column:1/-1; text-align:center; color:#555; padding:20px;">NO GAMES FOUND</div>';

        return;
    }

    // Build 1 lần -> DOM 1 lần.
    let html = '';

    for (
        let i = 0;
        i < filtered.length;
        i++
    ) {
        html += createGameCardHtml(
            filtered[i],
            i,
            filtered.length
        );
    }

    grid.innerHTML =
        html;
}

function setupListEvents(
    targetUser = null
) {
    const grid =
        document.getElementById(
            'gameGrid'
        );

    const searchInput =
        document.getElementById(
            'searchInput'
        );

    const sortSelect =
        document.getElementById(
            'sortSelect'
        );

    // 1 event listener cho cả grid.
    if (grid) {
        grid.addEventListener(
            'click',
            event => {
                const userEl =
                    event.target.closest(
                        '[data-user]'
                    );

                if (userEl) {
                    event.preventDefault();

                    window.location.href =
                        `/?user=${encodeURIComponent(
                            userEl.dataset.user
                        )}`;

                    return;
                }

                const loadingLink =
                    event.target.closest(
                        'a[data-loading="1"]'
                    );

                if (loadingLink) {
                    showSpinner();
                }
            }
        );
    }

    if (!targetUser) {
        const refreshGrid =
            getDebounced(
                () => updateGrid(),
                100
            );

        searchInput?.addEventListener(
            'input',
            refreshGrid,
            { passive: true }
        );

        sortSelect?.addEventListener(
            'change',
            () => updateGrid()
        );
    }
}

async function initList(
    targetUser = null
) {
    document.getElementById(
        'listView'
    ).style.display =
        'block';

    await fetchGamesMeta();

    const grid =
        document.getElementById(
            'gameGrid'
        );

    if (
        targetUser &&
        grid
    ) {
        const heading =
            document.createElement(
                'h2'
            );

        heading.style.cssText =
            'text-transform: uppercase; margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 10px;';

        heading.append(
            'GAMES BY: '
        );

        const nameEl =
            document.createElement(
                'span'
            );

        nameEl.style.color =
            '#00e676';

        nameEl.textContent =
            targetUser;

        heading.appendChild(
            nameEl
        );

        grid.before(
            heading
        );
    }

    updateGrid(
        targetUser
            ? targetUser.toLowerCase()
            : null
    );

    setupListEvents(
        targetUser
    );

    hideSpinner();
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
        console.error(
            'Init error:',
            error
        );

        hideSpinner();
    }
}

if (
    document.readyState ===
    'loading'
) {
    document.addEventListener(
        'DOMContentLoaded',
        init,
        { once: true }
    );
} else {
    init();
}
