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
    // CSS cơ bản (Chỉ chỉnh đúng phần dung lượng & card trong sidebar/grid)
    // ---------------------------------------------------------
    function injectBaseCss() {
        if (document.getElementById('sidebarBaseCss')) return;
        const s = document.createElement('style');
        s.id = 'sidebarBaseCss';
        s.textContent = `
        .rev-size, #detailSize {
            text-transform: uppercase;
            font-family: sans-serif;
            font-weight: bold;
            color: #ffffff;
        }

        /* Dung lượng nằm trong bảng review */
        .rev-size { font-size: 10px; border-top: 1px solid #222; margin-top: auto; padding-top: 8px; letter-spacing: 1px; }
        #detailSize { font-size: 12px; margin: 10px 0 0 0; letter-spacing: 1px; }
        `;
        document.head.appendChild(s);
    }

    // ---------------------------------------------------------
    // CSS riêng cho Sidebar (Chỉ tác dụng BÊN TRONG #sideBar)
    // ---------------------------------------------------------
    function injectSidebarCss() {
        if (document.getElementById('sidebarCss')) return;
        const s = document.createElement('style');
        s.id = 'sidebarCss';
        s.textContent = `
        /* Chỉ ép style chữ trắng, sans-serif, in đậm BÊN TRONG #sideBar */
        #sideBar, #sideBar * {
            text-transform: uppercase !important;
            font-family: sans-serif !important;
            font-weight: bold !important;
            color: #ffffff !important;
        }

        .layout-row { display: flex; gap: 20px; align-items: stretch; }
        .layout-main { flex: 1; min-width: 0; }
        .layout-side { width: 260px; flex-shrink: 0; display: flex; flex-direction: column; }
        @media (max-width: 1450px) {
            .layout-row { flex-direction: column; }
            .layout-side { width: 100%; }
        }

        #sideBar .side-box { background: #0a0a0a; border: 1px solid #121212; padding: 15px; margin-bottom: 20px; }

        #tagBox { flex: 1; display: flex; flex-direction: column; margin-bottom: 0; }

        #sideBar .side-title { font-size: 11px; letter-spacing: 2px; margin: 0 0 12px 0; border-bottom: 1px solid #222; padding-bottom: 8px; }
        #sideBar .side-sub { font-size: 10px; letter-spacing: 1px; margin: 14px 0 8px 0; }
        #sideBar .side-sub:first-of-type { margin-top: 0; }

        #sideBar .tag-list { display: flex; flex-wrap: wrap; gap: 6px; }
        #sideBar .tag-item { font-size: 10px; letter-spacing: 1px; background: #121212; border: 1px solid #333; padding: 4px 7px; cursor: pointer; transition: 0.2s; user-select: none; }
        #sideBar .tag-item:hover { border-color: #666; }
        #sideBar .tag-item.on { background: #333; border-color: #fff; }
        #sideBar .tag-count { margin-left: 4px; }
        #sideBar .tag-clear { width: 100%; margin-top: auto; background: #121212; border: 1px solid #333; font-size: 10px; letter-spacing: 1px; padding: 7px; cursor: pointer; }
        #sideBar .tag-clear:hover { border-color: #fff; }
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
            const div = document.createElement('div');
            div.className = 'rev-size';
            div.dataset.size = sizeP.textContent.trim();
            div.textContent = `${label}: ${div.dataset.size}`;
            panel.appendChild(div);
        });
    }

    function moveSizeOnDetail() {
        const sizeEl = document.getElementById('gSize');
        const reviewSec = document.getElementById('reviewSec');
        if (!sizeEl || !reviewSec) return;
        if (reviewSec.style.display === 'none' || document.getElementById('detailSize')) return;

        const clone = document.createElement('p');
        clone.id = 'detailSize';
        clone.textContent = sizeEl.innerText;
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
