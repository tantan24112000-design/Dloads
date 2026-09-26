// =========================================================
// DLOADS - GROUPS (giao diện kiểu Discord, dùng chung Supabase REST
// và các helper (escapeHtml, getImageUrl, showToast, sbFetch, isVi, ...)
// đã khai báo trong app.js — file này PHẢI load SAU app.js.
// =========================================================
const GROUP_ICON_BUCKET = 'group-icons';
const GROUP_POLL_MS = 4000;

let groupsUser = null; // { uid, name, avatar } - set từ hook window.setGroupsUser
let groupsList = [];
let groupIconUploadedUrl = '';
let gdLastMsgKey = null;

const gdState = {
    group: null,
    channels: [],
    activeChannelId: null,
    members: [],
    isOwner: false,
    isBanned: false,
    pollTimer: null
};

// Gọi từ hook auth trong index.html mỗi khi trạng thái đăng nhập đổi
window.setGroupsUser = function (user) {
    groupsUser = user;
    refreshGroupsAuthUI();
};

function refreshGroupsAuthUI() {
    const loggedOut = document.getElementById('groupCreateLoggedOut');
    const form = document.getElementById('groupCreateForm');
    if (loggedOut && form) {
        loggedOut.style.display = groupsUser ? 'none' : 'block';
        form.style.display = groupsUser ? 'block' : 'none';
    }
    if (gdState.group) renderGroupComposerLockState();
}

// =========================================================
// SUPABASE - helpers ghi dữ liệu (bảng games/comments đã có sbFetch ở app.js)
// =========================================================
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

// =========================================================
// ICON UPLOAD (nén ảnh phía client, đẩy thẳng lên Supabase Storage
// bằng anon key - bucket group-icons phải cho phép anon insert)
// =========================================================
function compressGroupIcon(file, maxSize = 512, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > height && width > maxSize) { height *= maxSize / width; width = maxSize; }
                else if (height > maxSize) { width *= maxSize / height; height = maxSize; }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                canvas.toBlob(b => b ? resolve(b) : reject(new Error('compress fail')), 'image/jpeg', quality);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function uploadGroupIcon(file) {
    const blob = await compressGroupIcon(file);
    const path = `icons/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${GROUP_ICON_BUCKET}/${path}`, {
        method: 'POST',
        headers: { ...SB_HEADERS, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
        body: blob
    });

    if (!res.ok) throw new Error(await res.text());
    return `${SUPABASE_URL}/storage/v1/object/public/${GROUP_ICON_BUCKET}/${path}`;
}

// =========================================================
// GROUPS FEED (list + search + create)
// =========================================================
async function fetchGroups() {
    try {
        return await sbFetch('groups?select=*&order=created_at.desc&limit=200');
    } catch (error) {
        console.error('Lỗi tải danh sách nhóm:', error);
        return [];
    }
}

function isGroupBanned(g) {
    return !!g.banned_until && new Date(g.banned_until).getTime() > Date.now();
}

function groupCardHtml(g) {
    const banned = isGroupBanned(g);
    const icon = escapeHtml(getImageUrl(g.icon, 'basicavtr.png'));
    const href = banned ? '#' : `/?group=${encodeURIComponent(g.id)}`;

    return `
        <a href="${href}" class="group-card${banned ? ' is-banned' : ''}">
            ${banned ? `<span class="group-card-banned">${isVi ? 'ĐÃ KHOÁ' : 'SUSPENDED'}</span>` : ''}
            <div class="group-card-head">
                <img class="group-card-icon" src="${icon}" loading="lazy" decoding="async" alt="">
                <div style="min-width:0;">
                    <div class="group-card-name">${escapeHtml(g.name || 'Unnamed')}</div>
                    <div class="group-card-owner">${isVi ? 'Chủ nhóm' : 'Owner'}: ${escapeHtml(g.owner_name || 'Unknown')}</div>
                </div>
            </div>
            <p class="group-card-desc">${escapeHtml(g.description || '')}</p>
        </a>
    `;
}

function renderGroupGrid(query) {
    const grid = document.getElementById('groupGrid');
    if (!grid) return;

    const q = (query || '').trim().toLowerCase();
    const filtered = q
        ? groupsList.filter(g =>
            (g.name || '').toLowerCase().includes(q) ||
            (g.description || '').toLowerCase().includes(q) ||
            (g.owner_name || '').toLowerCase().includes(q))
        : groupsList;

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:#555; padding:20px;">${isVi ? 'KHÔNG TÌM THẤY NHÓM' : 'NO GROUPS FOUND'}</div>`;
        return;
    }

    grid.innerHTML = filtered.map(groupCardHtml).join('');
}

async function initGroupsList() {
    document.getElementById('groupsListView').style.display = 'block';
    refreshGroupsAuthUI();

    groupsList = await fetchGroups();
    renderGroupGrid('');
    hideSpinner();

    const searchInput = document.getElementById('groupSearchInput');
    searchInput?.addEventListener('input', getDebounced(() => renderGroupGrid(searchInput.value), 100), { passive: true });

    document.getElementById('createGroupBtn')?.addEventListener('click', openCreateGroupModal);
    document.getElementById('groupCreateCancel')?.addEventListener('click', closeCreateGroupModal);
    document.getElementById('groupCreateSubmit')?.addEventListener('click', handleCreateGroupSubmit);
    document.getElementById('groupIconFile')?.addEventListener('change', handleGroupIconChange);
}

function openCreateGroupModal() {
    const modal = document.getElementById('createGroupModal');
    if (!modal) return;

    groupIconUploadedUrl = '';
    document.getElementById('groupIconPreview').src = 'basicavtr.png';
    document.getElementById('groupNameInput').value = '';
    document.getElementById('groupDescInput').value = '';
    document.getElementById('groupIconFile').value = '';

    refreshGroupsAuthUI();
    modal.style.display = 'flex';
}

function closeCreateGroupModal() {
    const modal = document.getElementById('createGroupModal');
    if (modal) modal.style.display = 'none';
}

async function handleGroupIconChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    const preview = document.getElementById('groupIconPreview');
    preview.src = URL.createObjectURL(file);

    try {
        groupIconUploadedUrl = await uploadGroupIcon(file);
    } catch (error) {
        console.error('Lỗi upload icon nhóm:', error);
        showToast(isVi ? 'Tải icon thất bại.' : 'Icon upload failed.');
    }
}

async function handleCreateGroupSubmit() {
    if (!groupsUser) {
        showToast(isVi ? 'Bạn cần đăng nhập.' : 'You must be logged in.');
        return;
    }

    const name = document.getElementById('groupNameInput').value.trim();
    const description = document.getElementById('groupDescInput').value.trim();

    if (!name) {
        showToast(isVi ? 'Vui lòng nhập tên nhóm.' : 'Please enter a group name.');
        return;
    }

    const btn = document.getElementById('groupCreateSubmit');
    btn.disabled = true;

    try {
        const group = await sbInsert('groups', {
            name,
            description,
            icon: groupIconUploadedUrl || '',
            owner_uid: groupsUser.uid,
            owner_name: groupsUser.name,
            owner_avatar: groupsUser.avatar || ''
        });
        if (!group) throw new Error('insert failed');

        await sbInsert('group_channels', { group_id: group.id, name: 'general', position: 0 }, { prefer: 'return=minimal' });
        await sbUpsertRow('group_members', {
            group_id: group.id,
            user_id: groupsUser.uid,
            user_name: groupsUser.name,
            user_avatar: groupsUser.avatar || '',
            role: 'owner'
        }, 'group_id,user_id');

        window.location.href = `/?group=${encodeURIComponent(group.id)}`;
    } catch (error) {
        console.error('Lỗi tạo nhóm:', error);
        showToast(isVi ? 'Tạo nhóm thất bại.' : 'Failed to create group.');
        btn.disabled = false;
    }
}

// =========================================================
// GROUP DETAIL (giao diện kiểu Discord)
// =========================================================
async function initGroupDetail(gid) {
    document.getElementById('groupDetailView').style.display = 'block';

    const rows = await sbFetch(`groups?id=eq.${encodeURIComponent(gid)}&select=*&limit=1`).catch(() => []);
    const group = rows && rows[0];

    if (!group) {
        document.getElementById('groupDetailView').innerHTML =
            `<div style="text-align:center; padding:50px;">${isVi ? 'KHÔNG TÌM THẤY NHÓM' : 'GROUP NOT FOUND'}</div>`;
        hideSpinner();
        return;
    }

    gdState.group = group;
    gdState.isOwner = !!(groupsUser && groupsUser.uid === group.owner_uid);

    document.getElementById('gdIcon').src = getImageUrl(group.icon, 'basicavtr.png');
    document.getElementById('gdName').textContent = group.name || 'Unnamed';

    if (isGroupBanned(group)) {
        showGroupNotice(isVi
            ? 'Nhóm này đang tạm thời bị khóa bởi quản trị viên.'
            : 'This group has been temporarily suspended by an admin.');
        hideSpinner();
        return;
    }

    if (groupsUser) {
        const bans = await sbFetch(
            `group_bans?group_id=eq.${encodeURIComponent(gid)}&user_id=eq.${encodeURIComponent(groupsUser.uid)}&select=*&limit=1`
        ).catch(() => []);
        const ban = bans && bans[0];
        gdState.isBanned = !!(ban && (!ban.banned_until || new Date(ban.banned_until).getTime() > Date.now()));

        if (gdState.isBanned) {
            showGroupNotice(isVi ? 'Bạn đã bị cấm khỏi nhóm này.' : 'You have been banned from this group.');
            hideSpinner();
            return;
        }

        // Tự thêm vào group_members nếu chưa có (auto-join khi ghé thăm nhóm)
        await sbUpsertRow('group_members', {
            group_id: gid,
            user_id: groupsUser.uid,
            user_name: groupsUser.name,
            user_avatar: groupsUser.avatar || '',
            role: gdState.isOwner ? 'owner' : 'member'
        }, 'group_id,user_id').catch(() => {});
    }

    await loadGroupChannels(gid);
    await loadGroupMembers(gid);
    bindGroupDetailEvents(gid);
    renderGroupComposerLockState();
    hideSpinner();

    gdState.pollTimer = window.setInterval(() => {
        if (gdState.activeChannelId) loadGroupMessages(gdState.activeChannelId, true);
    }, GROUP_POLL_MS);

    window.addEventListener('beforeunload', () => window.clearInterval(gdState.pollTimer));
}

function showGroupNotice(text) {
    document.getElementById('gdShell').style.display = 'none';
    const notice = document.getElementById('gdBannedNotice');
    notice.textContent = text;
    notice.style.display = 'block';
}

async function loadGroupChannels(gid) {
    const channels = await sbFetch(
        `group_channels?group_id=eq.${encodeURIComponent(gid)}&select=*&order=position.asc,created_at.asc`
    ).catch(() => []);

    gdState.channels = channels || [];
    if (!gdState.activeChannelId && gdState.channels.length) {
        gdState.activeChannelId = gdState.channels[0].id;
    }

    document.getElementById('gdAddChannelWrap').style.display = gdState.isOwner ? 'block' : 'none';
    renderChannelList();

    if (gdState.activeChannelId) {
        const ch = gdState.channels.find(c => c.id === gdState.activeChannelId);
        document.getElementById('gdChannelTitle').textContent = ch ? `# ${ch.name}` : '';
        await loadGroupMessages(gdState.activeChannelId);
    } else {
        document.getElementById('gdMessages').innerHTML =
            `<div style="color:#555; font-size:12px; text-align:center; padding:20px;">${isVi ? 'Chưa có kênh chat nào.' : 'No channels yet.'}</div>`;
    }
}

function renderChannelList() {
    const list = document.getElementById('gdChannelList');
    if (!list) return;

    if (!gdState.channels.length) {
        list.innerHTML = `<div style="color:#555; font-size:11px; padding:8px;">${isVi ? 'Chưa có kênh chat.' : 'No channels yet.'}</div>`;
        return;
    }

    list.innerHTML = gdState.channels.map(ch => `
        <div class="discord-channel-item${ch.id === gdState.activeChannelId ? ' active' : ''}" data-channel-id="${ch.id}">
            <span class="ch-hash">#&nbsp;${escapeHtml(ch.name)}</span>
            ${gdState.isOwner ? `<span class="discord-channel-del" data-del-channel="${ch.id}" title="${isVi ? 'Xóa kênh' : 'Delete channel'}">✕</span>` : ''}
        </div>
    `).join('');
}

function setActiveChannel(channelId) {
    gdState.activeChannelId = channelId;
    gdLastMsgKey = null;
    renderChannelList();

    const ch = gdState.channels.find(c => c.id === channelId);
    document.getElementById('gdChannelTitle').textContent = ch ? `# ${ch.name}` : '';
    loadGroupMessages(channelId);
}

async function loadGroupMessages(channelId, silent = false) {
    const msgs = await sbFetch(`group_messages?channel_id=eq.${encodeURIComponent(channelId)}&select=*&order=created_at.asc&limit=200`)
        .catch(() => null);
    if (!msgs) return;

    const key = `${channelId}:${msgs.length}:${msgs[msgs.length - 1]?.id || ''}`;
    if (silent && key === gdLastMsgKey) return;
    gdLastMsgKey = key;

    renderGroupMessages(msgs);
}

function renderGroupMessages(msgs) {
    const box = document.getElementById('gdMessages');
    if (!box) return;

    const wasAtBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;

    if (!msgs.length) {
        box.innerHTML = `<div style="color:#555; font-size:12px; text-align:center; padding:20px;">${isVi ? 'Chưa có tin nhắn nào. Hãy là người đầu tiên!' : 'No messages yet. Say hi!'}</div>`;
        return;
    }

    box.innerHTML = msgs.map(m => `
        <div class="discord-msg">
            <img class="discord-msg-avatar" src="${escapeHtml(getImageUrl(m.user_avatar, 'basicavtr.png'))}" loading="lazy" decoding="async" alt="">
            <div class="discord-msg-body">
                <div class="discord-msg-head">
                    <span class="discord-msg-name">${escapeHtml(m.user_name || 'User')}</span>
                    <span class="discord-msg-time">${timeAgo(m.created_at)}</span>
                </div>
                <p class="discord-msg-text">${escapeHtml(m.text)}</p>
            </div>
        </div>
    `).join('');

    if (wasAtBottom) box.scrollTop = box.scrollHeight;
}

async function loadGroupMembers(gid) {
    const members = await sbFetch(`group_members?group_id=eq.${encodeURIComponent(gid)}&select=*&order=joined_at.asc`).catch(() => []);
    gdState.members = members || [];
    renderMemberList();
}

function renderMemberList() {
    const list = document.getElementById('gdMemberList');
    const countEl = document.getElementById('gdMemberCount');
    if (!list) return;

    countEl.textContent = gdState.members.length;

    list.innerHTML = gdState.members.map(m => {
        const isOwnerRow = m.user_id === gdState.group.owner_uid;
        const canManage = gdState.isOwner && groupsUser && m.user_id !== groupsUser.uid;

        return `
            <div class="discord-member-row">
                <img class="discord-member-avatar" src="${escapeHtml(getImageUrl(m.user_avatar, 'basicavtr.png'))}" loading="lazy" decoding="async" alt="">
                <span class="discord-member-name${isOwnerRow ? ' is-owner' : ''}">${isOwnerRow ? '<span class="discord-member-crown">♛</span> ' : ''}${escapeHtml(m.user_name || 'User')}</span>
                ${canManage ? `
                    <span class="discord-member-actions">
                        <button data-kick="${escapeHtml(m.user_id)}">${isVi ? 'Đá' : 'Kick'}</button>
                        <button class="member-ban-btn" data-ban="${escapeHtml(m.user_id)}" data-ban-name="${escapeHtml(m.user_name || 'User')}">${isVi ? 'Cấm' : 'Ban'}</button>
                    </span>
                ` : ''}
            </div>
        `;
    }).join('');
}

function bindGroupDetailEvents(gid) {
    document.getElementById('gdChannelList')?.addEventListener('click', event => {
        const delBtn = event.target.closest('[data-del-channel]');
        if (delBtn) {
            event.stopPropagation();
            deleteChannel(delBtn.dataset.delChannel, gid);
            return;
        }
        const item = event.target.closest('.discord-channel-item');
        if (item) setActiveChannel(item.dataset.channelId);
    });

    document.getElementById('gdAddChannelBtn')?.addEventListener('click', () => addChannel(gid));

    document.getElementById('gdMemberList')?.addEventListener('click', event => {
        const kickBtn = event.target.closest('[data-kick]');
        if (kickBtn) { kickMember(gid, kickBtn.dataset.kick); return; }

        const banBtn = event.target.closest('[data-ban]');
        if (banBtn) { banMember(gid, banBtn.dataset.ban, banBtn.dataset.banName); }
    });

    const sendBtn = document.getElementById('gdMsgSend');
    const input = document.getElementById('gdMsgInput');
    const submit = () => sendGroupMessage(gid, input, sendBtn);
    sendBtn?.addEventListener('click', submit);
    input?.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });
}

async function addChannel(gid) {
    const name = (window.prompt(isVi ? 'Tên kênh chat mới:' : 'New channel name:') || '').trim();
    if (!name) return;

    try {
        const position = gdState.channels.length;
        const ch = await sbInsert('group_channels', { group_id: gid, name, position });
        if (ch) {
            gdState.channels.push(ch);
            setActiveChannel(ch.id);
        } else {
            await loadGroupChannels(gid);
        }
    } catch (error) {
        console.error('Lỗi tạo kênh:', error);
        showToast(isVi ? 'Tạo kênh thất bại.' : 'Failed to create channel.');
    }
}

async function deleteChannel(channelId, gid) {
    if (gdState.channels.length <= 1) {
        showToast(isVi ? 'Nhóm cần ít nhất 1 kênh chat.' : 'A group needs at least 1 channel.');
        return;
    }
    if (!window.confirm(isVi ? 'Xóa kênh chat này? Toàn bộ tin nhắn sẽ mất.' : 'Delete this channel? All its messages will be lost.')) return;

    try {
        await sbRemove('group_channels', `id=eq.${encodeURIComponent(channelId)}`);
        gdState.channels = gdState.channels.filter(c => c.id !== channelId);

        if (gdState.activeChannelId === channelId) {
            gdState.activeChannelId = gdState.channels[0]?.id || null;
        }

        renderChannelList();
        if (gdState.activeChannelId) setActiveChannel(gdState.activeChannelId);
    } catch (error) {
        console.error('Lỗi xóa kênh:', error);
        showToast(isVi ? 'Xóa kênh thất bại.' : 'Failed to delete channel.');
    }
}

async function kickMember(gid, userId) {
    if (!window.confirm(isVi ? 'Đá thành viên này khỏi nhóm?' : 'Kick this member from the group?')) return;

    try {
        await sbRemove('group_members', `group_id=eq.${encodeURIComponent(gid)}&user_id=eq.${encodeURIComponent(userId)}`);
        await loadGroupMembers(gid);
        showToast(isVi ? 'Đã đá thành viên.' : 'Member kicked.');
    } catch (error) {
        console.error('Lỗi kick thành viên:', error);
        showToast(isVi ? 'Thao tác thất bại.' : 'Action failed.');
    }
}

async function banMember(gid, userId, userName) {
    const raw = window.prompt(isVi
        ? 'Cấm bao nhiêu giờ? (để trống = cấm vĩnh viễn)'
        : 'Ban for how many hours? (leave blank = permanent)');
    if (raw === null) return;

    const trimmed = raw.trim();
    const hours = trimmed === '' ? null : Number(trimmed);

    if (trimmed !== '' && (!Number.isFinite(hours) || hours <= 0)) {
        showToast(isVi ? 'Số giờ không hợp lệ.' : 'Invalid number of hours.');
        return;
    }

    const bannedUntil = hours ? new Date(Date.now() + hours * 3600 * 1000).toISOString() : null;

    try {
        await sbUpsertRow('group_bans', {
            group_id: gid,
            user_id: userId,
            user_name: userName,
            banned_until: bannedUntil
        }, 'group_id,user_id');

        await sbRemove('group_members', `group_id=eq.${encodeURIComponent(gid)}&user_id=eq.${encodeURIComponent(userId)}`);
        await loadGroupMembers(gid);
        showToast(isVi ? 'Đã cấm thành viên.' : 'Member banned.');
    } catch (error) {
        console.error('Lỗi ban thành viên:', error);
        showToast(isVi ? 'Thao tác thất bại.' : 'Action failed.');
    }
}

async function sendGroupMessage(gid, input, btn) {
    const text = input.value.trim();
    if (!text || !groupsUser || !gdState.activeChannelId) return;

    btn.disabled = true;

    try {
        await sbInsert('group_messages', {
            group_id: gid,
            channel_id: gdState.activeChannelId,
            user_id: groupsUser.uid,
            user_name: groupsUser.name,
            user_avatar: groupsUser.avatar || '',
            text
        }, { prefer: 'return=minimal' });

        input.value = '';
        await loadGroupMessages(gdState.activeChannelId);
    } catch (error) {
        console.error('Lỗi gửi tin nhắn:', error);
        showToast(isVi ? 'Gửi tin nhắn thất bại.' : 'Failed to send message.');
    } finally {
        btn.disabled = false;
    }
}

function renderGroupComposerLockState() {
    const composer = document.getElementById('gdComposerWrap');
    const locked = document.getElementById('gdLocked');
    if (!composer || !locked) return;

    if (groupsUser) {
        composer.style.display = 'flex';
        locked.style.display = 'none';
    } else {
        composer.style.display = 'none';
        locked.style.display = 'block';
    }
}

// =========================================================
// START
// =========================================================
async function initGroupsModule() {
    try {
        if (typeof groupsPage !== 'undefined' && groupsPage) {
            await initGroupsList();
        } else if (typeof groupId !== 'undefined' && groupId) {
            await initGroupDetail(groupId);
        }
    } catch (error) {
        console.error('Groups init error:', error);
        hideSpinner();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGroupsModule, { once: true });
} else {
    initGroupsModule();
}
