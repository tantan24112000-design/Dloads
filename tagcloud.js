// =========================================================
// TAG CLOUD (CỘT TAG BÊN PHẢI NÚT SORT TRANG CHỦ) - lọc nhanh theo tag
// Thay toàn bộ đoạn từ comment "TAG CLOUD" cũ đến hết hàm initTagCloud() bằng đoạn này.
// =========================================================
const TAG_CLOUD_GAP_FROM_SORT = 75.6; // khoảng cách từ mép phải nút sort ("Cho bạn") tới cột tag (px)
const TAG_CLOUD_EDGE_PAD = 20;        // chừa lề phải màn hình (px)
const TAG_CLOUD_MIN_WIDTH = 240;      // cột tag hẹp hơn mức này thì ẩn luôn (px)
const TAG_CLOUD_MAX_WIDTH = 420;      // bề rộng tối đa của cột tag (px)
const TAG_CLOUD_MAX_ITEMS = 12;       // số tag tối đa hiển thị (ưu tiên tag nhiều game nhất)
const TAG_CLOUD_PER_ROW = 3;          // số tag mỗi hàng
let tagCloudEntries = [];

// Style cho cột tag - nhét thẳng vào đây để chỉ cần sửa app.js.
// Dùng selector có #id nên tự đè lên CSS cũ (.tag-cloud-layer / .tag-cloud-item) trong HTML.
function ensureTagCloudStyles() {
    if (document.getElementById('tagCloudStyles')) return;

    const style = document.createElement('style');
    style.id = 'tagCloudStyles';
    style.textContent = `
        #tagCloudLayer {
            position: absolute;
            grid-template-columns: repeat(${TAG_CLOUD_PER_ROW}, minmax(0, max-content));
            column-gap: 22px;
            row-gap: 14px;
            align-content: start;
            pointer-events: auto;
            z-index: 1;
        }
        #tagCloudLayer .tag-cloud-title {
            grid-column: 1 / -1;
            margin: 0 0 4px 0;
            color: #fff;
            font-family: inherit;
            font-size: 15px;
            font-weight: 600;
            font-style: normal;
            line-height: 1.5;
            letter-spacing: normal;
            text-transform: none;
            user-select: none;
        }
        #tagCloudLayer .tag-cloud-item {
            position: static;
            display: block;
            min-width: 0;
            margin: 0;
            padding: 0;
            background: none;
            border: none;
            box-shadow: none;
            color: #fff;
            font-family: inherit;
            font-size: 20px;
            font-weight: 700;
            line-height: 1.5;
            letter-spacing: normal;
            text-transform: none;
            text-align: left;
            text-decoration: none;
            text-underline-offset: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            cursor: pointer;
            transition: none;
            outline: none;
        }
        #tagCloudLayer .tag-cloud-item:hover,
        #tagCloudLayer .tag-cloud-item:active,
        #tagCloudLayer .tag-cloud-item:focus-visible,
        #tagCloudLayer .tag-cloud-item.is-active {
            background: none;
            color: #fff;
            text-decoration: underline;
        }
    `;
    document.head.appendChild(style);
}

// Lấy tag theo độ phổ biến (nhiều game nhất lên đầu), bằng nhau thì xếp A-Z.
// Không random nữa nên mỗi lần vào trang thứ tự luôn giống nhau.
function getTopTags() {
    const counts = new Map();

    for (const item of gamesList) {
        if (!item.category) continue;

        for (const raw of item.category.split(',')) {
            const trimmed = raw.trim();
            if (!trimmed) continue;

            const lower = trimmed.toLowerCase();
            const cur = counts.get(lower);
            if (cur) cur.count++;
            else counts.set(lower, { tag: trimmed, count: 1 });
        }
    }

    return [...counts.values()]
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
        .slice(0, TAG_CLOUD_MAX_ITEMS)
        .map(entry => ({ tag: entry.tag }));
}

function buildTagCloudEntries() {
    return getTopTags();
}

// Dựng DOM 1 lần: tiêu đề "All Tags" + các tag.
function renderTagCloud() {
    const layer = document.getElementById('tagCloudLayer');
    if (!layer) return;

    layer.innerHTML = '';
    const frag = document.createDocumentFragment();

    const title = document.createElement('div');
    title.className = 'tag-cloud-title';
    title.textContent = 'All Tags';
    frag.appendChild(title);

    for (const entry of tagCloudEntries) {
        const el = document.createElement('span');
        el.className = 'tag-cloud-item';
        el.textContent = entry.tag;
        el.title = entry.tag;
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.dataset.tag = entry.tag;
        frag.appendChild(el);
    }

    layer.appendChild(frag);
    syncTagCloudActive();
}

// Đặt vị trí: cách mép phải nút sort đúng TAG_CLOUD_GAP_FROM_SORT px, top ngang nút sort.
function layoutTagCloud() {
    const layer = document.getElementById('tagCloudLayer');
    const sortEl = document.getElementById('sortSelect');
    if (!layer || !sortEl || tagCloudEntries.length === 0) return;

    const rect = sortEl.getBoundingClientRect();
    const viewportW = document.documentElement.clientWidth;
    const leftInView = rect.right + TAG_CLOUD_GAP_FROM_SORT;
    const availableW = viewportW - leftInView - TAG_CLOUD_EDGE_PAD;

    if (availableW < TAG_CLOUD_MIN_WIDTH) {
        layer.style.display = 'none';
        return;
    }

    layer.style.left = `${leftInView + window.scrollX}px`;
    layer.style.top = `${rect.top + window.scrollY}px`;
    layer.style.width = `${Math.min(availableW, TAG_CLOUD_MAX_WIDTH)}px`;
    layer.style.display = 'grid';
}

// Tag đang lọc thì giữ gạch chân.
function syncTagCloudActive() {
    const layer = document.getElementById('tagCloudLayer');
    if (!layer) return;

    const activeLower = activeTagFilter ? activeTagFilter.toLowerCase() : '';

    for (const el of layer.querySelectorAll('.tag-cloud-item')) {
        el.classList.toggle(
            'is-active',
            !!activeLower && el.dataset.tag.toLowerCase() === activeLower
        );
    }
}

function applyTagFilter(tag) {
    if (!tag) return;

    activeTagFilter = tag;

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    updateGrid();
    updateTagFilterIndicator();
    syncTagCloudActive();
    layoutTagCloud(); // dòng "Đang lọc theo" đẩy nút sort xuống -> canh lại
}

function clearTagFilter() {
    activeTagFilter = null;
    updateGrid();
    updateTagFilterIndicator();
    syncTagCloudActive();
    layoutTagCloud();
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

    ensureTagCloudStyles();
    renderTagCloud();
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

    // Resize + scrollbar hiện/ẩn (đổi bề rộng body) đều làm nút sort lệch -> canh lại.
    const relayout = getDebounced(layoutTagCloud, 100);
    window.addEventListener('resize', relayout, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(document.body);
}
