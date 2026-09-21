// =========================================================
// DLOADS - SIDEBAR: TAG CLOUD + REGIONAL CHAT
// File riêng, KHÔNG sửa app.js. Load trước app.js.
// =========================================================
(function () {
    'use strict';

    const RTDB = 'https://sf2g-bf285-default-rtdb.firebaseio.com';
    const MAX_MSG = 40;
    const POLL_MS = 8000;
    const SEND_COOLDOWN = 3000;

    const REGIONS = [
        { k: 'vn', vi: 'VIỆT NAM', en: 'VIETNAM' },
        { k: 'intl', vi: 'NƯỚC NGOÀI', en: 'INTERNATIONAL' },
        { k: 'global', vi: 'CHUNG', en: 'GENERAL' }
    ];

    let selTags = new Set();
    let selPlats = new Set();
    let getItems = () => [];
    let onChange = () => {};
    let curRegion = localStorage.getItem('dloads:region') ||
        ((navigator.language || '').toLowerCase().includes('vi') ? 'vn' : 'intl');
    let lastSend = 0;
    let pollTimer = 0;

    function esc(v) {
        return String(v ?? '')
            .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
    }

    function lang() { return window.isVN ? 'vi' : 'en'; }

    // ---------------------------------------------------------
    // CSS (giữ style gốc: đen, viền xám, không màu mè)
    // ---------------------------------------------------------
    function injectCss() {
        const s = document.createElement('style');
        s.id = 'sidebarCss';
        s.textContent = `
        .container { max-width: 1240px !important; }
        .layout-row { display: flex; gap: 20px; align-items: flex-start; }
        .layout-main { flex: 1; min-width: 0; }
        .layout-side { width: 260px; flex-shrink: 0; }
        @media (max-width: 1000px) {
            .layout-row { flex-direction: column; }
            .layout-side { width: 100%; }
        }

        .side-box { background: #0a0a0a; border: 1px solid #222; padding: 15px; margin-bottom: 20px; }
        .side-title { font-size: 11px; letter-spacing: 2px; color: #888; text-transform: uppercase;
            margin: 0 0 12px 0; border-bottom: 1px solid #222; padding-bottom: 8px; }
        .side-sub { font-size: 10px; letter-spacing: 1px; color: #666; text-transform: uppercase; margin: 14px 0 8px 0; }
        .side-sub:first-of-type { margin-top: 0; }

        .tag-list { display: flex; flex-wrap: wrap; gap: 6px; }
        .tag-item { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #aaa;
            background: #111; border: 1px solid #333; padding: 4px 7px; cursor: pointer; transition: 0.2s; user-select: none; }
        .tag-item:hover { color: #fff; border-color: #666; }
        .tag-item.on { color: #000; background: #fff; border-color: #fff; }
        .tag-count { color: #666; margin-left: 4px; }
        .tag-item.on .tag-count { color: #444; }
        .tag-clear { width: 100%; margin-top: 12px; background: #111; border: 1px solid #333; color: #888;
            font-size: 10px; letter-spacing: 1px; padding: 7px; cursor: pointer; text-transform: uppercase; }
        .tag-clear:hover { color: #fff; border-color: #fff; }

        .chat-tabs { display: flex; gap: 5px; margin-bottom: 10px; }
        .chat-tab { flex: 1; font-size: 9px; letter-spacing: 1px; text-align: center; background: #111;
            border: 1px solid #333; color: #888; padding: 6px 2px; cursor: pointer; text-transform: uppercase; transition: 0.2s; }
        .chat-tab:hover { color: #fff; border-color: #666; }
        .chat-tab.on { background: #fff; color: #000; border-color: #fff; }
        .chat-log { height: 230px; overflow-y: auto; background: #050505; border: 1px solid #222; padding: 10px; margin-bottom: 10px; }
        .chat-msg { font-size: 12px; line-height: 1.45; color: #ccc; margin-bottom: 8px; word-break: break-word; }
        .chat-msg b { color: #fff; font-weight: bold; font-size: 11px; letter-spacing: 0.5px; }
        .chat-empty { color: #555; font-size: 11px; text-align: center; padding: 20px 0; letter-spacing: 1px; }
        .chat-name, .chat-input { width: 100%; box-sizing: border-box; background: #0a0a0a; border: 1px solid #333;
            color: #fff; padding: 9px 10px; font-size: 12px; outline: none; margin-bottom: 8px; font-family: inherit; }
        .chat-name:focus, .chat-input:focus { border-color: #fff; }
        .chat-send { width: 100%; background: #fff; color: #000; border: 1px solid #fff; padding: 9px;
            font-size: 11px; font-weight: bold; letter-spacing: 1px; cursor: pointer; text-transform: uppercase; }
        .chat-send:hover { background: #000; color: #fff; }
        .chat-note { font-size: 10px; color: #555; margin: 8px 0 0 0; font-style: italic; text-align: center; }

        /* Card: ẩn dung lượng, nút VIEW full width */
        .game-card > div:last-child { display: block !important; margin-top: 15px !important; }
        .game-card > div:last-child > p { display: none !important; }
        .game-card > div:last-child > .btn { display: block !important; width: 100% !important;
            box-sizing: border-box; padding: 10px !important; }

        /* Dung lượng nằm trong bảng review */
        .rev-size { font-size: 10px; color: #888; letter-spacing: 1px; text-transform: uppercase;
            border-top: 1px solid #222; margin-top: auto; padding-top: 8px; }
        #detailSize { font-size: 12px; color: #888; margin: 10px 0 0 0; letter-spacing: 1px; }
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
        const sort = m => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        return { tags: sort(tags), plats: sort(plats) };
    }

    function renderTagBox() {
        const box = document.getElementById('tagBox');
        if (!box) return;

        const { tags, plats } = collect(getItems());
        if (!tags.length && !plats.length) { box.style.display = 'none'; return; }
        box.style.display = 'block';

        const line = (list, sel, kind) => list.map(([name, count]) =>
            `<span class="tag-item ${sel.has(name) ? 'on' : ''}" data-kind="${kind}" data-name="${esc(name)}">${esc(name)}<span class="tag-count">${count}</span></span>`
        ).join('');

        box.innerHTML = `
            <p class="side-title" data-vi="LỌC THEO THẺ" data-en="FILTER BY TAG">FILTER BY TAG</p>
            ${tags.length ? `<p class="side-sub" data-vi="THỂ LOẠI" data-en="GENRES">GENRES</p>
            <div class="tag-list">${line(tags, selTags, 'tag')}</div>` : ''}
            ${plats.length ? `<p class="side-sub" data-vi="NỀN TẢNG" data-en="PLATFORMS">PLATFORMS</p>
            <div class="tag-list">${line(plats, selPlats, 'plat')}</div>` : ''}
            <button class="tag-clear" id="tagClear" data-vi="XÓA BỘ LỌC" data-en="CLEAR FILTERS">CLEAR FILTERS</button>
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
    // CHAT THEO KHU VỰC
    // ---------------------------------------------------------
    function chatHtml() {
        const tabs = REGIONS.map(r =>
            `<div class="chat-tab ${r.k === curRegion ? 'on' : ''}" data-region="${r.k}" data-vi="${r.vi}" data-en="${r.en}">${r.en}</div>`
        ).join('');

        return `
            <p class="side-title" data-vi="CHAT THEO KHU VỰC" data-en="REGIONAL CHAT">REGIONAL CHAT</p>
            <div class="chat-tabs">${tabs}</div>
            <div class="chat-log" id="chatLog">
                <div class="chat-empty" data-vi="ĐANG TẢI..." data-en="LOADING...">LOADING...</div>
            </div>
            <input type="text" id="chatName" class="chat-name" maxlength="20"
                data-vi="Tên của bạn" data-en="Your name" placeholder="Your name">
            <input type="text" id="chatInput" class="chat-input" maxlength="200"
                data-vi="Nhập tin nhắn..." data-en="Type a message..." placeholder="Type a message...">
            <button class="chat-send" id="chatSend" data-vi="GỬI" data-en="SEND">SEND</button>
            <p class="chat-note" data-vi="Giữ lịch sự. Tin nhắn hiển thị công khai."
               data-en="Be respectful. Messages are public.">Be respectful. Messages are public.</p>
        `;
    }

    function timeLabel(ts) {
        try {
            return new Date(ts).toLocaleTimeString(window.isVN ? 'vi-VN' : 'en-US',
                { hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
    }

    async function loadChat() {
        const log = document.getElementById('chatLog');
        if (!log) return;

        try {
            const res = await fetch(`${RTDB}/chat/${curRegion}.json?orderBy="$key"&limitToLast=${MAX_MSG}`);
            const data = await res.json();
            const rows = data ? Object.values(data).filter(Boolean) : [];
            rows.sort((a, b) => (a.ts || 0) - (b.ts || 0));

            if (!rows.length) {
                log.innerHTML = `<div class="chat-empty" data-vi="CHƯA CÓ TIN NHẮN" data-en="NO MESSAGES YET">NO MESSAGES YET</div>`;
            } else {
                log.innerHTML = rows.map(m =>
                    `<div class="chat-msg"><b>${esc(m.n || 'Guest')}</b> <span style="color:#555; font-size:10px;">${esc(timeLabel(m.ts))}</span><br>${esc(m.t || '')}</div>`
                ).join('');
                log.scrollTop = log.scrollHeight;
            }
        } catch {
            log.innerHTML = `<div class="chat-empty" data-vi="KHÔNG TẢI ĐƯỢC CHAT" data-en="COULD NOT LOAD CHAT">COULD NOT LOAD CHAT</div>`;
        }

        if (window.applyLanguage) window.applyLanguage();
    }

    async function sendChat() {
        const nameEl = document.getElementById('chatName');
        const inputEl = document.getElementById('chatInput');
        if (!inputEl) return;

        const text = inputEl.value.trim();
        if (!text) return;

        if (Date.now() - lastSend < SEND_COOLDOWN) {
            alert(window.isVN ? 'Gửi chậm thôi, đợi vài giây.' : 'Slow down, wait a few seconds.');
            return;
        }

        const user = (window.firebase && firebase.apps.length) ? firebase.auth().currentUser : null;
        const name = (user && user.displayName) || nameEl?.value.trim() ||
            (window.isVN ? 'Khách' : 'Guest');

        lastSend = Date.now();
        inputEl.value = '';

        try {
            localStorage.setItem('dloads:chatName', name);
        } catch {}

        try {
            await fetch(`${RTDB}/chat/${curRegion}.json`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ n: name.slice(0, 20), t: text.slice(0, 200), ts: Date.now() })
            });
        } catch {}

        loadChat();
    }

    function setupChat() {
        const box = document.getElementById('chatBox');
        if (!box) return;

        box.innerHTML = chatHtml();

        box.querySelectorAll('.chat-tab').forEach(tab => {
            tab.onclick = () => {
                curRegion = tab.dataset.region;
                try { localStorage.setItem('dloads:region', curRegion); } catch {}
                box.querySelectorAll('.chat-tab').forEach(t => t.classList.toggle('on', t === tab));
                loadChat();
            };
        });

        const nameEl = document.getElementById('chatName');
        try {
            const saved = localStorage.getItem('dloads:chatName');
            if (saved && nameEl) nameEl.value = saved;
        } catch {}

        document.getElementById('chatSend').onclick = sendChat;
        document.getElementById('chatInput').addEventListener('keydown', e => {
            if (e.key === 'Enter') sendChat();
        });

        if (window.applyLanguage) window.applyLanguage();
        loadChat();

        clearInterval(pollTimer);
        pollTimer = setInterval(() => {
            if (document.visibilityState === 'visible') loadChat();
        }, POLL_MS);
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
        injectCss();
        const side = buildLayout();
        if (!side) return;

        const onDetail = !!new URLSearchParams(location.search).get('id');

        side.innerHTML = `
            <div class="side-box" id="tagBox" style="display:none;"></div>
            <div class="side-box" id="chatBox"></div>
        `;
        if (onDetail) document.getElementById('tagBox').remove();

        setupChat();
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
