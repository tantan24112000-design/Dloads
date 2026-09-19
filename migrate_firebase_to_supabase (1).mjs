/*
 MIGRATE: Firebase RTDB -> Supabase (1 lần duy nhất)

 - Node 18+ , không cần cài package.
 - Chạy:  SUPABASE_SERVICE_KEY=eyJ... node migrate_firebase_to_supabase.mjs
 - base64 trong /games sẽ được decode -> upload lên Storage -> lưu URL.
 - Firebase Auth GIỮ NGUYÊN, script này chỉ chuyển data.
*/

const FIREBASE_DB   = 'https://sf2g-bf285-default-rtdb.firebaseio.com';
const SUPABASE_URL  = 'https://djcdgqofyzjtgxijzsgq.supabase.co';
const SERVICE_KEY   = 'sb_secret_zhp1nlSfOeXoJlBVVOmuOg_47V3JDLG';
const BUCKET        = 'game-images';

if (!SERVICE_KEY) {
    console.error('Thiếu SUPABASE_SERVICE_KEY (Settings > API > service_role).');
    process.exit(1);
}

const authHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`
};

function isDataImage(v) {
    return typeof v === 'string' && v.trim().startsWith('data:image/');
}

async function uploadDataUrl(dataUrl, path) {
    const match = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(dataUrl.trim());
    if (!match) return null;

    const mime = match[1];
    const ext = mime.split('/')[1].replace('jpeg', 'jpg');
    const bytes = Buffer.from(match[2], 'base64');
    const fullPath = `${path}.${ext}`;

    const res = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fullPath}`,
        {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': mime, 'x-upsert': 'true' },
            body: bytes
        }
    );

    if (!res.ok) {
        console.warn('Upload fail', fullPath, res.status, await res.text());
        return null;
    }

    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fullPath}`;
}

async function resolveImage(value, path) {
    if (!value) return null;
    if (isDataImage(value)) return await uploadDataUrl(value, path);
    return String(value);
}

async function upsert(table, rows) {
    if (!rows.length) return;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(rows)
    });

    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
}

function toPrice(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
}

async function run() {
    const [games, users] = await Promise.all([
        fetch(`${FIREBASE_DB}/games.json`).then(r => r.json()),
        fetch(`${FIREBASE_DB}/users.json`).then(r => r.json()).catch(() => ({}))
    ]);

    // ---- GAMES ----
    const gameRows = [];
    let i = 0;

    for (const [id, g] of Object.entries(games || {})) {
        if (!g || typeof g !== 'object') continue;

        const slug = id.replace(/[^a-zA-Z0-9_-]/g, '_');

        const img = await resolveImage(g.img, `games/${slug}-thumb`);
        const reviewImg = await resolveImage(g.reviewImg, `games/${slug}-review`);

        gameRows.push({
            id,
            name: g.name || id,
            developer: g.developer || null,
            dev_uid: g.devUid || g.dev_uid || null,
            category: g.category || null,
            platforms: g.platforms || null,
            size: g.size || null,
            price: toPrice(g.price),
            link: g.link || null,
            img,
            review_img: reviewImg,
            review_text: g.reviewText || null,
            custom_html: g.customHtml || null,
            custom_css: g.customCss || null
        });

        console.log(`[${++i}] ${id}`);
    }

    for (let k = 0; k < gameRows.length; k += 50) {
        await upsert('games', gameRows.slice(k, k + 50));
    }

    // ---- PROFILES (avatar base64 -> storage) ----
    const profileRows = [];

    for (const [uid, u] of Object.entries(users || {})) {
        if (!u || typeof u !== 'object') continue;

        const avatar = await resolveImage(u.avatar, `avatars/${uid}`);

        profileRows.push({
            uid,
            display_name: u.displayName || null,
            avatar
        });
    }

    for (let k = 0; k < profileRows.length; k += 50) {
        await upsert('profiles', profileRows.slice(k, k + 50));
    }

    console.log(`\nXong: ${gameRows.length} games, ${profileRows.length} profiles.`);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
