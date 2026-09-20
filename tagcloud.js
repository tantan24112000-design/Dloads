// =========================================================
// TAGCLOUD.JS - Cột tag lọc nhanh, nằm bên phải nút sort ở trang chủ
// Tự chứa: tự chèn CSS + DOM, HTML/app.js không cần CSS hay thẻ riêng.
//
// HTML:   <script src="tagcloud.js"></script>   (đặt TRƯỚC app.js)
// app.js: TagCloud.init({ getItems, onChange })  và  TagCloud.matches(item)
// =========================================================
(function () {
    'use strict';

    const GAP_FROM_SORT = 75.6; // px, từ mép phải nút sort ("Cho bạn") tới cột tag
    const EDGE_PAD = 20;        // px, chừa lề phải màn hình
    const MIN_WIDTH = 240;      // px, cột tag hẹp hơn mức này thì ẩn luôn
    const MAX_WIDTH = 420;      // px, bề rộng tối đa của cột tag
    const MAX_ITEMS = 12;       // số tag tối đa (ưu tiên tag nhiều game nhất)
    const PER_ROW = 3;          // số tag mỗi hàng

    const isVi = (navigator.language || '').toLowerCase().includes('vi');

    let layer = null;
    let indicator = null;
    let tags = [];
    let activeTag = null;       // tag đang lọc (null = không lọc)
    let onChange = function () {};
    let ready = false;

    // ---------------------------------------------------------
    // CSS
    // ---------------------------------------------------------
    function injectStyles() {
        if (document.getElementById('tcStyles')) return;

        const style = document.createElement('style');
        style.id = 'tcStyles';
        style.textContent = `
            #tcLayer {
                position: absolute;
                display: none;
                grid-template-columns: repeat(${PER_ROW}, minmax(0, max-content));
                column-gap: 22px;
                row-gap: 14px;
                align-content: start;
                z-index: 1;
            }
            #tcLayer .tc-title {
                grid-column: 1 / -1;
                margin: 0 0 4px 0;
                color: #fff;
                font-size: 15px;
                font-weight: 600;
                line-height: 1.5;
                user-select: none;
            }
            #tcLayer .tc-item {
                display: block;
                min-width: 0;
                color: #fff;
                font-size: 20px;
                font-weight: 700;
                line-height: 1.5;
                text-underline-offset: 4px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                cursor: pointer;
                outline: none;
                user-select: none;
            }
            #tcLayer .tc-item:hover,
            #tcLayer .tc-item:active,
            #tcLayer .tc-item:focus-visible,
            #tcLayer .tc-item.is-active {
                text-decoration: underline;
            }

            .tc-indicator {
                display: none;
                align-items: center;
                gap: 10px;
                font-size: 12px;
                color: #999;
                margin-bottom: 12px;
            }
            .tc-indicator b { color: #fff; font-weight: 700; }
            .tc-clear { cursor: pointer; color: #999; }
            .tc-clear:hover { color: #fff; text-decoration: underline; }
        `;
        document.head.appendChild(style);
    }

    // ---------------------------------------------------------
    // DOM
    // ---------------------------------------------------------
    function createDom() {
        layer = document.createElement('div');
        layer.id = 'tcLayer';
        layer.setAttribute('role', 'group');
        layer.setAttribute('aria-label', 'All Tags');
        document.body.appendChild(layer);

        // Dòng "Đang lọc theo: ..." nằm ngay trên thanh search/sort
        const bar = document.querySelector('.controls-bar');
        indicator = document.createElement('div');
        indicator.className = 'tc-indicator';
        if (bar && bar.parentNode) bar.parentNode.insertBefore(indicator, bar);
    }

    function render() {
        layer.textContent = '';
        const frag = document.createDocumentFragment();

        const title = document.createElement('div');
        title.className = 'tc-title';
        title.textContent = 'All Tags';
        frag.appendChild(title);

        for (const tag of tags) {
            const el = document.createElement('span');
            el.className = 'tc-item';
            el.textContent = tag;
            el.title = tag;
            el.tabIndex = 0;
            el.setAttribute('role', 'button');
            el.dataset.tag = tag;
            frag.appendChild(el);
        }

        layer.appendChild(frag);
    }

    // Đặt vị trí: cách mép phải nút sort đúng GAP_FROM_SORT px, top ngang nút sort.
    function layout() {
        const sortEl = document.getElementById('sortSelect');
        if (!layer || !sortEl) return;

        const rect = sortEl.getBoundingClientRect();
        const leftInView = rect.right + GAP_FROM_SORT;
        const availableW = document.documentElement.clientWidth - leftInView - EDGE_PAD;

        if (availableW < MIN_WIDTH) {
            layer.style.display = 'none';
            return;
        }

        layer.style.left = `${leftInView + window.scrollX}px`;
        layer.style.top = `${rect.top + window.scrollY}px`;
        layer.style.width = `${Math.min(availableW, MAX_WIDTH)}px`;
        layer.style.display = 'grid';
    }

    // Tag đang lọc thì giữ gạch chân.
    function syncActive() {
        if (!layer) return;
        const want = activeTag ? activeTag.toLowerCase() : '';

        for (const el of layer.querySelectorAll('.tc-item')) {
            el.classList.toggle('is-active', !!want && el.dataset.tag.toLowerCase() === want);
        }
    }

    function updateIndicator() {
        if (!indicator) return;
        indicator.textContent = '';

        if (!activeTag) {
            indicator.style.display = 'none';
            return;
        }

        const label = document.createElement('span');
        label.append(`${isVi ? 'Đang lọc theo' : 'Filtering by'}: `);
        const b = document.createElement('b');
        b.textContent = activeTag;
        label.appendChild(b);

        const clear = document.createElement('span');
        clear.className = 'tc-clear';
        clear.textContent = isVi ? 'Xoá lọc ✕' : 'Clear ✕';
        clear.addEventListener('click', clearFilter);

        indicator.append(label, clear);
        indicator.style.display = 'flex';
    }

    // ---------------------------------------------------------
    // LOGIC
    // ---------------------------------------------------------
    // Tag theo độ phổ biến (nhiều game nhất lên đầu), bằng nhau thì A-Z.
    function getTopTags(items) {
        const counts = new Map();

        for (const item of items) {
            if (!item || !item.category) continue;

            for (const raw of String(item.category).split(',')) {
                const tag = raw.trim();
                if (!tag) continue;

                const key = tag.toLowerCase();
                const cur = counts.get(key);
                if (cur) cur.count++;
                else counts.set(key, { tag, count: 1 });
            }
        }

        return [...counts.values()]
            .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
            .slice(0, MAX_ITEMS)
            .map(entry => entry.tag);
    }

    // app.js dùng trong updateGrid: filtered.filter(TagCloud.matches)
    function matches(item) {
        if (!activeTag) return true;
        const want = activeTag.toLowerCase();

        return String((item && item.category) || '')
            .split(',')
            .some(t => t.trim().toLowerCase() === want);
    }

    function applyFilter(tag) {
        if (!tag) return;
        activeTag = tag;

        const search = document.getElementById('searchInput');
        if (search) search.value = '';

        updateIndicator();
        onChange();
        syncActive();
        layout(); // dòng "Đang lọc theo" đẩy nút sort xuống -> canh lại
    }

    function clearFilter() {
        activeTag = null;

        updateIndicator();
        onChange();
        syncActive();
        layout();
    }

    function init(options) {
        if (ready) return;
        if (!document.getElementById('sortSelect')) return;

        const opts = options || {};
        if (typeof opts.onChange === 'function') onChange = opts.onChange;

        const items = typeof opts.getItems === 'function' ? opts.getItems() : [];
        tags = getTopTags(items || []);
        if (tags.length === 0) return;

        ready = true;

        injectStyles();
        createDom();
        render();
        layout();

        layer.addEventListener('click', event => {
            const el = event.target.closest('.tc-item');
            if (el) applyFilter(el.dataset.tag);
        });

        layer.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const el = event.target.closest('.tc-item');
            if (!el) return;
            event.preventDefault();
            applyFilter(el.dataset.tag);
        });

        // Resize + scrollbar hiện/ẩn (đổi bề rộng body) đều làm nút sort lệch -> canh lại.
        let timer = 0;
        const relayout = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(layout, 100);
        };
        window.addEventListener('resize', relayout, { passive: true });
        if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(document.body);
    }

    window.TagCloud = { init: init, matches: matches, clear: clearFilter };
})();
