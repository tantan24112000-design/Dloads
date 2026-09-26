// =========================================================
// DLOADS - SHARED CORE
// Dùng chung cho index.html (Games) và groups.html (Groups).
// File này PHẢI được nạp TRƯỚC app.js / groups.js, và SAU
// 2 script firebase-app.js / firebase-auth.js.
// =========================================================

// ---- Supabase ----
const SUPABASE_URL = 'https://djcdgqofyzjtgxijzsgq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5rLqcMcK5xyuJfj4j8MSSw_obYu5sdM';

const REST = `${SUPABASE_URL}/rest/v1`;
const SB_HEADERS = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept: 'application/json'
};

// ---- Ngôn ngữ ----
const isVi = (navigator.language || '').toLowerCase().includes('vi');

window.isVN = (navigator.language || navigator.userLanguage || 'en').toLowerCase().startsWith('vi');

window.applyLanguage = function () {
    document.querySelectorAll('[data-vi]').forEach(el => {
        const text = window.isVN ? el.getAttribute('data-vi') : el.getAttribute('data-en');
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = text;
        } else if (el.tagName === 'OPTION') {
            el.innerText = text;
        } else {
            el.innerHTML = text;
        }
    });
    const profileDiv = document.getElementById('userProfile');
    if (profileDiv) profileDiv.title = window.isVN ? "Trang cá nhân của tao" : "My Profile";
};

window.addEventListener('DOMContentLoaded', window.applyLanguage);

// ---- UI helpers ----
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

// ---- Supabase REST helpers ----
async function sbFetch(query, timeoutMs = 10000) {
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

async function sbInsert(table, row, opts = {}) {
    const res = await fetch(`${REST}/${table}`, {
        method: 'POST',
        headers: { ...SB_HEADERS, 'Content-Type': 'application/json', Prefer: opts.prefer || 'return=representation' },
        body: JSON.stringify(row)
    });
    if (!res.ok) throw new Error(await res.text());
    if (opts.prefer === 'return=minimal') return null;
    const rows = await res.json();
    return rows && rows[0] ? rows[0] : null;
}

async function sbUpsertRow(table, row, onConflict) {
    const res = await fetch(`${REST}/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`, {
        method: 'POST',
        headers: { ...SB_HEADERS, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row)
    });
    if (!res.ok) throw new Error(await res.text());
}

async function sbRemove(table, filter) {
    const res = await fetch(`${REST}/${table}?${filter}`, {
        method: 'DELETE',
        headers: { ...SB_HEADERS, Prefer: 'return=minimal' }
    });
    if (!res.ok) throw new Error(await res.text());
}

// ---- Firebase Auth (header giống nhau trên mọi trang) ----
const fConfig = {
    apiKey: "AIzaSyC5LzxgMCOvF01tSMWjoVWt3jjYAnJR394",
    authDomain: "sf2g-bf285.firebaseapp.com",
    projectId: "sf2g-bf285",
    databaseURL: "https://sf2g-bf285-default-rtdb.firebaseio.com",
    storageBucket: "sf2g-bf285.firebasestorage.app",
    messagingSenderId: "982578480996",
    appId: "1:982578480996:web:609acf09d1d5b951299c71",
    measurementId: "G-VD58ECNEPQ"
};
if (!firebase.apps.length) firebase.initializeApp(fConfig);

firebase.auth().onAuthStateChanged(async user => {
    if (user) {
        document.getElementById('navLogin').style.display = 'none';
        document.getElementById('navUpload').style.display = 'block';

        const profileDiv = document.getElementById('userProfile');
        const avaImg = document.getElementById('avatarImg');
        profileDiv.style.display = 'block';

        let dName = user.displayName || "Dev";
        let dAvatar = "basicavtr.png";

        try {
            const res = await fetch(`https://sf2g-bf285-default-rtdb.firebaseio.com/users/${user.uid}.json`);
            const data = await res.json();

            if (data && data.avatar) {
                dAvatar = data.avatar;
            }
        } catch (e) {}

        avaImg.src = dAvatar;

        profileDiv.onclick = () => {
            window.location.href = `/?user=${encodeURIComponent(dName)}`;
        };

        window.setCommentUser && window.setCommentUser({ uid: user.uid, name: dName, avatar: dAvatar });
        window.setGroupsUser && window.setGroupsUser({ uid: user.uid, name: dName, avatar: dAvatar });
    } else {
        window.setCommentUser && window.setCommentUser(null);
        window.setGroupsUser && window.setGroupsUser(null);
    }
});
