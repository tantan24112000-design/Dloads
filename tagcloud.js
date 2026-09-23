// =========================================================
// DLOADS - SIDEBAR: TAG CLOUD
// File riêng, KHÔNG sửa app.js. Load trước app.js.
// =========================================================
(function () {
    'use strict';

    let selTags = new Set();
    let selPlats = new Set();
    let getItems = () => [];
    let onChange = () => {};

    function esc(v) {
        return String(v ?? '')
            .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
    }

    function lang() { return window.isVN ? 'vi' : 'en'; }

    // ---------------------------------------------------------
    // CSS luôn cần (không phụ thuộc sidebar)
    // ---------------------------------------------------------
    function injectBaseCss() {
        if (document.getElementById('sidebarBaseCss')) return;
        const s = document.createElement('style');
        s.id = 'sidebarBaseCss';
        s.textContent = `
        /* Card: ẩn dung lượng bên dưới, nút VIEW full width */
        .game-card > div:last-child { display: block !important; margin-top: 15px !important; }
        .game-card > div:last-child > p { display: none !important; }
        .game-card > div:last-child > .btn { 
            display: block !important; 
            width: 100% !important;
            box-sizing: border-box; 
            padding: 10px !important; 
        }

        /* Khung dung lượng trong bảng review */
        .rev-size { 
            font-size: 10px; 
            border-top: 1px solid #222; 
            margin-top: auto; 
            padding-top: 8px; 
            display: flex;
            align-items: center;
            gap: 4px;
        }

        #detailSize { 
            font-size: 12px; 
            margin: 10px 0 0 0; 
            display: flex;
            align-items: center;
            gap: 4px;
        }

        /* Nhãn chữ (DUNG LƯỢNG / SIZE) */
        .rev-size-label, #detailSize .size-label {
            text-transform: uppercase !important;
            font-family: sans-serif !important;
            font-weight: bold !important;
            color: #ffffff !important;
            letter-spacing: 1px;
        }

        /* Giá trị số MB / GB */
        .rev-size-val, #detailSize .size-val {
            text-transform: none !important;
            font-weight: normal !important;
            color: #cccccc !important;
            letter-spacing: normal !important;
        }
        `;
        document.head.appendChild(s);
    }

    // ---------------------------------------------------------
    // CSS chỉ cần khi build sidebar (menu chính)
    // ---------------------------------------------------------
    function injectSidebarCss() {
        if (document.getElementById('sidebarCss')) return;
        const s = document.createElement('style');
        s.id = 'sidebarCss';
        s.textContent = `
        .layout-side, .layout-side * {
            text-transform: uppercase !important;
            font-family: sans-serif !important;
            font-weight: bold !important;
            color: #ffffff !important;
        }

        .container { max-width: 2500px !important; }
        
        /* BẮT BUỘC NẰM NGANG, BẤT CHẤP THIẾT BỊ */
        .layout-row { 
            display: flex; 
            gap: 20px; 
            align-items: stretch; 
            flex-wrap: nowrap; /* Không cho rớt dòng */
        }
        
        .layout-main { flex: 1; min-width: 0; }
        .layout-side { width: 260px; flex-shrink: 0; display: flex; flex-direction: column; }

        .side-box { background: #0a0a0a; border: 1px solid #121212; padding: 15px; margin-bottom: 20px; }
        #tagBox { flex: 1; display: flex; flex-direction: column; margin-bottom: 0; }

        .side-title { font-size: 11px; letter-spacing: 2px; color: #ffffff !important; font-weight: bold !important; font-family: sans-serif !important;
            margin: 0 0 12px 0; border-bottom: 1px solid #222; padding-bottom: 8px; }
        .side-sub { font-size: 10px; letter-spacing: 1px; color: #ffffff !important; font-weight: bold !important; font-family: sans-serif !important; margin: 14px 0 8px 0; }
        .side-sub:first-of-type { margin-top: 0; }

        .tag-list { display: flex; flex-wrap: wrap; gap: 6px; }
        .tag-item { font-size: 10px; letter-spacing: 1px; color: #ffffff !important; font-weight: bold !important; font-family: sans-serif !important;
            background: #121212; border: 1px solid #333; padding: 4px 7px; cursor: pointer; transition: 0.2s; user-select: none; }
        .tag-item:hover { color: #ffffff !important; border-color: #666; }
        .tag-item.on { color: #ffffff !important; background: #333; border-color: #fff; }
        .tag-count { color: #ffffff !important; font-weight: bold !important; font-family: sans-serif !important; margin-left: 4px; }
        .tag-item.on .tag-count { color: #ffffff !important; }
        .tag-clear { width: 100%; margin-top: auto; background: #121212; border: 1px solid #333; color: #ffffff !important; font-weight: bold !important; font-family: sans-serif !important;
            font-size: 10px; letter-spacing: 1px; padding: 7px; cursor: pointer; }
        .tag-clear:hover { color: #ffffff !important; border-color: #fff; }

        /* RESPONSIVE TRÊN ĐIỆN THOẠI (ÉP NẰM CẠNH, THU NHỎ LẠI) */
        @media (max-width: 900px) {
            .layout-row { 
                gap: 10px; 
                overflow-x: auto; /* Thêm thanh trượt ngang nếu màn hẹp */
                padding-bottom: 10px;
                -webkit-overflow-scrolling: touch; 
            }
            .layout-main { min-width: 60%; } /* Giữ cho phần main không bị ép chết */
            .layout-side { width: 140px; } /* Sidebar nhỏ gọn lại */
            .side-box { padding: 10px; }
            .tag-item { font-size: 9px; padding: 3px 5px; }
            .tag-count { margin-left: 2px; }
            .side-title { font-size: 10px; letter-spacing: 1px; margin-bottom: 8px; }
        }
        `;
        document.head.appendChild(s);
    }

    // ---------------------------------------------------------
    // LAYOUT
    // ---------------------------------------------------------
    function buildLayout() {
        const container = document.querySelector('.container');
        const listView = document.getElementById('listView');
        const detailView = document.getElementById('detailView');
        if (!container || !listView) return null;

        const row = document.createElement('div');
        row.className = 'layout-row';

        const main = document.createElement('div');
        main.className = 'layout-main';
        main.appendChild(listView);
        if (detailView) main.appendChild(detailView);

        const side = document.createElement('aside');
        side.className = 'layout-side';
        side.id = 'sideBar';

        row.appendChild(main);
        row.appendChild(side);
        container.appendChild(row);
        return side;
    }

    // ---------------------------------------------------------
    // TAG CLOUD
    // ---------------------------------------------------------
    function collect(items) {
        const tags = new Map();
        const plats = new Map();
        for (const it of items || []) {
            for (const raw of String(it.category || '').split(',')) {
                const t = raw.trim();
                if (t) tags.set(t, (tags.get(t) || 0) + 1);
            }
            for (const raw of String(it.platforms || '').split(',')) {
                const p = raw.trim();
                if (p) plats.set(p, (plats.get(p) || 0) + 1);
            }
        }
        const sort = m => [...m.entries()].sort((a, b) => b[1] - a[0] || a[0].localeCompare(b[0]));
        return { tags: sort(tags), plats: sort(plats) };
    }

    function renderTagBox() {
        const box = document.getElementById('tagBox');
        if (!box) return;

        const { tags, plats } = collect(getItems());
        if (!tags.length && !plats.length) { box.style.display = 'none'; return; }
        box.style.display = 'flex';

        const line = (list, sel, kind) => list.map(([name, count]) =>
            `<span class="tag-item ${sel.has(name) ? 'on' : ''}" data-kind="${kind}" data-name="${esc(name)}">${esc(name)}<span class="tag-count">${count}</span></span>`
        ).join('');

        box.innerHTML = `
            <p class="side-title" data-vi="LỌC THEO THẺ" data-en="FILTER BY TAG">FILTER BY TAG</p>
            ${tags.length ? `<p class="side-sub" data-vi="THỂ LOẠI" data-en="GENRES">GENRES</p>
            <div class="tag-list">${line(tags, selTags, 'tag')}</div>` : ''}
            ${plats.length ? `<p class="side-sub" data-vi="NỀN TẢNG" data-en="PLATFORMS">PLATFORMS</p>
            <div class="tag-list">${line(plats, selPlats, 'plat')}</div>` : ''}
        `;

        box.querySelectorAll('.tag-item').forEach(el => {
            el.onclick = () => {
                const set = el.dataset.kind === 'tag' ? selTags : selPlats;
                const name = el.dataset.name;
                set.has(name) ? set.delete(name) : set.add(name);
                renderTagBox();
                onChange();
            };
        });

        const clear = document.getElementById('tagClear');
        if (clear) clear.onclick = () => { selTags.clear(); selPlats.clear(); renderTagBox(); onChange(); };

        if (window.applyLanguage) window.applyLanguage();
    }

    // ---------------------------------------------------------
    // DUNG LƯỢNG -> BẢNG REVIEW
    // ---------------------------------------------------------
    function moveSizeOnCards() {
        document.querySelectorAll('#gameGrid .game-card').forEach(card => {
            const bottom = card.lastElementChild;
            const sizeP = bottom ? bottom.querySelector('p') : null;
            const panel = card.querySelector('.review-panel');
            if (!sizeP || !panel || panel.querySelector('.rev-size')) return;

            const label = window.isVN ? 'DUNG LƯỢNG' : 'SIZE';
            const rawText = sizeP.textContent.replace(/dung lượng:|size:/i, '').trim();

            const div = document.createElement('div');
            div.className = 'rev-size';
            div.innerHTML = `<span class="rev-size-label">${label}:</span> <span class="rev-size-val">${esc(rawText)}</span>`;
            panel.appendChild(div);
        });
    }

    function moveSizeOnDetail() {
        const sizeEl = document.getElementById('gSize');
        const reviewSec = document.getElementById('reviewSec');
        if (!sizeEl || !reviewSec) return;
        if (reviewSec.style.display === 'none' || document.getElementById('detailSize')) return;

        const label = window.isVN ? 'DUNG LƯỢNG' : 'SIZE';
        const rawText = sizeEl.innerText.replace(/dung lượng:|size:/i, '').trim();

        const clone = document.createElement('p');
        clone.id = 'detailSize';
        clone.innerHTML = `<span class="size-label">${label}:</span> <span class="size-val">${esc(rawText)}</span>`;
        reviewSec.appendChild(clone);
        sizeEl.style.display = 'none';
    }

    function watchGrid() {
        const grid = document.getElementById('gameGrid');
        if (grid) new MutationObserver(moveSizeOnCards).observe(grid, { childList: true });

        const detail = document.getElementById('detailView');
        if (detail) new MutationObserver(moveSizeOnDetail).observe(detail, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['style']
        });
    }

    // ---------------------------------------------------------
    // API cho app.js
    // ---------------------------------------------------------
    window.TagCloud = {
        matches(item) {
            if (!selTags.size && !selPlats.size) return true;

            if (selTags.size) {
                const tags = String(item.category || '').split(',').map(t => t.trim());
                if (!tags.some(t => selTags.has(t))) return false;
            }
            if (selPlats.size) {
                const plats = String(item.platforms || '').split(',').map(p => p.trim());
                if (!plats.some(p => selPlats.has(p))) return false;
            }
            return true;
        },

        init(opts) {
            getItems = opts?.getItems || getItems;
            onChange = opts?.onChange || onChange;
            renderTagBox();
            moveSizeOnCards();
        }
    };

    // ---------------------------------------------------------
    // BOOT
    // ---------------------------------------------------------
    function boot() {
        injectBaseCss();

        const qs = new URLSearchParams(location.search);
        const isMainMenu = !qs.get('id') && !qs.get('user');

        if (isMainMenu) {
            injectSidebarCss();
            const side = buildLayout();
            if (side) {
                side.innerHTML = `
                    <div class="side-box" id="tagBox"></div>
                    <div class="side-box" id="chatBox"></div>
                `;
                if (typeof setupChat === 'function') setupChat();
            }
        }

        watchGrid();
        moveSizeOnDetail();

        if (window.applyLanguage) window.applyLanguage();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
