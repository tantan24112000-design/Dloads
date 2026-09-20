// functions/game/[id].js
// Cloudflare Pages Function.
// URL thật để share/SEO: https://dloads.xxx/game/<id>
//
// - Bot (Googlebot, facebookexternalhit, Twitterbot, Discordbot...) -> trả HTML
//   server-rendered đầy đủ title/meta/OG/JSON-LD cho ĐÚNG game đó.
// - User thật -> redirect 302 sang /?id=<id> (app SPA hiện tại của mày),
//   không đổi UX của user, chỉ bot mới thấy bản HTML tĩnh.

const SUPABASE_URL = 'https://djcdgqofyzjtgxijzsgq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5rLqcMcK5xyuJfj4j8MSSw_obYu5sdM';

const BOT_UA_REGEX =
    /bot|crawl|spider|slurp|facebookexternalhit|twitterbot|discordbot|telegrambot|whatsapp|linkedinbot|pinterest|embedly|quora link preview|showyoubot|outbrain|vkshare|w3c_validator/i;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function stripHtml(value) {
    return String(value ?? '').replace(/<[^>]*>/g, '').trim();
}

async function fetchGame(id, env) {
    const key = env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/games?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } }
    );

    if (!res.ok) return null;

    const rows = await res.json();
    return rows && rows[0] ? rows[0] : null;
}

function renderGameHtml(game, siteUrl, gameUrl) {
    const name = escapeHtml(game.name || 'Game');
    const developer = escapeHtml(game.developer || 'Unknown');
    const size = escapeHtml(game.size || '');
    const platforms = escapeHtml(game.platforms || '');
    const category = escapeHtml(game.category || '');
    const img = game.img ? escapeHtml(game.img) : `${siteUrl}/logo3.png`;

    const rawDesc = game.review_text
        ? stripHtml(game.review_text)
        : `Tải ${game.name} miễn phí - ${developer}. Dung lượng ${game.size || 'N/A'}, hỗ trợ ${game.platforms || 'nhiều nền tảng'}.`;

    const desc = escapeHtml(rawDesc.slice(0, 155));

    const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'VideoGame',
        name: game.name || '',
        description: rawDesc,
        image: game.img || undefined,
        applicationCategory: game.category || undefined,
        operatingSystem: game.platforms || undefined,
        author: { '@type': 'Person', name: game.developer || 'Unknown' },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
    });

    return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Tải ${name} Miễn Phí - ${developer} | Dloads</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${gameUrl}">

<meta property="og:type" content="website">
<meta property="og:title" content="Tải ${name} Miễn Phí">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${gameUrl}">
<meta property="og:site_name" content="Dloads">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Tải ${name} Miễn Phí">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${img}">

<script type="application/ld+json">${jsonLd}</script>

<meta name="robots" content="index, follow">
<meta http-equiv="refresh" content="0; url=/?id=${encodeURIComponent(game.id)}">
<style>
    body { background:#000; color:#fff; font-family:sans-serif; padding:40px; max-width:700px; margin:0 auto; }
    img { max-width:100%; border:1px solid #333; margin:15px 0; }
    a { color:#00e676; }
    .tag { display:inline-block; border:1px solid #444; padding:3px 8px; font-size:12px; margin-right:6px; color:#aaa; }
</style>
</head>
<body>
    <h1>${name}</h1>
    <p>Phát triển bởi <b>${developer}</b></p>
    ${category ? `<span class="tag">${category}</span>` : ''}
    ${platforms ? `<span class="tag">${platforms}</span>` : ''}
    ${size ? `<span class="tag">${size}</span>` : ''}
    <img src="${img}" alt="${name}">
    <p>${desc}</p>
    <p><a href="/?id=${encodeURIComponent(game.id)}">Xem trang game / Tải xuống →</a></p>
</body>
</html>`;
}

export async function onRequestGet(context) {
    const { params, request, env } = context;
    const id = params.id;

    if (!id) return new Response('Missing id', { status: 400 });

    const ua = request.headers.get('user-agent') || '';
    const isBot = BOT_UA_REGEX.test(ua);

    const url = new URL(request.url);
    const siteUrl = `${url.protocol}//${url.host}`;
    const gameUrl = `${siteUrl}/game/${encodeURIComponent(id)}`;

    if (!isBot) {
        // User thật -> vào thẳng app SPA hiện tại, giữ nguyên UX.
        return Response.redirect(`${siteUrl}/?id=${encodeURIComponent(id)}`, 302);
    }

    const game = await fetchGame(id, env);

    if (!game) {
        return new Response('Game not found', { status: 404 });
    }

    return new Response(renderGameHtml(game, siteUrl, gameUrl), {
        headers: {
            'content-type': 'text/html; charset=UTF-8',
            'cache-control': 'public, max-age=3600'
        }
    });
}
