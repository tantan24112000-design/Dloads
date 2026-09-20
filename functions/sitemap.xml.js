là file này á hả -- // functions/sitemap.xml.js
// Trả về sitemap.xml động từ Supabase.
// Google đọc file này để biết có bao nhiêu game cần index.

const SUPABASE_URL      = 'https://djcdgqofyzjtgxijzsgq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5rLqcMcK5xyuJfj4j8MSSw_obYu5sdM';

export async function onRequestGet(context) {
    const { env, request } = context;
    const key = env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

    const url = new URL(request.url);
    const siteUrl = `${url.protocol}//${url.host}`;

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/games?select=id,created_at&order=created_at.desc&limit=1000`,
        { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } }
    );

    const games = res.ok ? await res.json() : [];

    const urls = games.map(g => `
  <url>
    <loc>${siteUrl}/game/${encodeURIComponent(g.id)}</loc>
    <lastmod>${g.created_at ? g.created_at.split('T')[0] : new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>${urls}
</urlset>`;

    return new Response(xml, {
        headers: {
            'content-type': 'application/xml; charset=UTF-8',
            'cache-control': 'public, max-age=3600'
        }
    });
}
