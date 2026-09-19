const dbUrl = "https://sf2g-bf285-default-rtdb.firebaseio.com";
const urlWebNhiemVu = "https://nhap-code.vercel.app";
const isVi = (navigator.language || '').toLowerCase().includes('vi');

let allGamesData = {};
const id = new URLSearchParams(window.location.search).get('id');
const userPage = new URLSearchParams(window.location.search).get('user');

function formatPrice(price) { /* Giữ nguyên[cite: 3] */
    if (!price) return '';
    let formattedNumber = Number(price).toLocaleString('en-US');
    return isVi ? formattedNumber + ' VNĐ' : '$' + formattedNumber;
}

function trackUserPreference(category) { /* Giữ nguyên[cite: 3] */
    if (!category) return;
    let userPrefs = JSON.parse(localStorage.getItem('userCategoryPrefs')) || {};
    let tags = category.split(',').map(t => t.trim());
    tags.forEach(t => {
        userPrefs[t] = (userPrefs[t] || 0) + 1;
    });
    localStorage.setItem('userCategoryPrefs', JSON.stringify(userPrefs));
}

function getUserPreferences() { /* Giữ nguyên[cite: 3] */
    return JSON.parse(localStorage.getItem('userCategoryPrefs')) || {};
}

// 1. CHỈ TẢI BẢN NHẸ DÀNH CHO TRANG CHỦ (META)
async function fetchGamesMeta() {
    if (Object.keys(allGamesData).length > 0) return allGamesData;
    
    let cached = sessionStorage.getItem('cachedGamesMeta');
    if (cached) {
        try {
            allGamesData = JSON.parse(cached);
            return allGamesData;
        } catch(e) {
            console.error("Cache bị lỗi, tải lại từ đầu:", e);
        }
    }
    
    try {
        // TẢI TỪ NHÁNH NHẸ (Bạn cần cập nhật hàm upload để lưu thêm nhánh này)
        const res = await fetch(`${dbUrl}/games_meta.json`); 
        allGamesData = await res.json() || {};
    } catch (e) {
        console.error("Lỗi tải data từ Firebase:", e);
        allGamesData = {};
        return allGamesData;
    }

    try {
        sessionStorage.setItem('cachedGamesMeta', JSON.stringify(allGamesData));
    } catch (e) {
        console.warn("Lỗi lưu cache meta.");
    }
    
    return allGamesData;
}

// 2. HÀM TẢI DỮ LIỆU NẶNG KHI VÀO TRANG CHI TIẾT
async function fetchGameDetailData(gameId) {
    try {
        // Chỉ tải cục data khổng lồ của đúng 1 game
        const res = await fetch(`${dbUrl}/games/${gameId}.json`);
        return await res.json();
    } catch (e) {
        console.error("Lỗi tải chi tiết game:", e);
        return null;
    }
}

async function init() {
    // Luôn tải list meta (nhẹ) để dùng[cite: 3]
    const allGamesMeta = await fetchGamesMeta();

    if (id) {
        document.getElementById('detailView').style.display = 'block';
        let data = allGamesMeta ? allGamesMeta[id] : null;
        
        if (data) {
            // GỌI THÊM DATA NẶNG VÀ GỘP VÀO DATA NHẸ
            const heavyData = await fetchGameDetailData(id);
            if (heavyData) {
                data = { ...data, ...heavyData };
            }

            trackUserPreference(data.category);

            document.getElementById('gName').innerText = data.name;
            document.getElementById('gDevDetail').innerHTML = `A game by <span style="color:#fff; font-weight:bold; cursor:pointer; text-decoration:underline;" onclick="window.location.href='/?user=${encodeURIComponent(data.developer || 'Unknown Studio')}'">${data.developer || 'Unknown Studio'}</span>`;
            document.getElementById('gSize').innerText = `SIZE: ${data.size || 'N/A'}`;
            document.getElementById('gThumb').src = data.img || 'https://via.placeholder.com/600x280?text=No+Image';
            document.getElementById('gLink').href = `${urlWebNhiemVu}/?id=${id}`;

            if (data.platforms) {
                let platHtml = data.platforms.split(',').map(p => `<span class="plat-badge">${p.trim()}</span>`).join('');
                document.getElementById('gPlatformsDetail').innerHTML = platHtml;
            }

            if (data.category) {
                const catEl = document.getElementById('gCategoryDetail');
                catEl.innerText = data.category.split(',')[0];
                catEl.style.display = 'inline-block';
            }

            if (data.price) {
                document.getElementById('gPriceContainer').style.display = 'block';
                document.getElementById('gFakePrice').innerText = formatPrice(data.price);
            }

            // Dữ liệu nặng: HTML
            const devContentEl = document.getElementById('customDevContent');
            if (data.customHtml && data.customHtml.trim() !== '') {
                if (typeof DOMPurify !== 'undefined') {
                    devContentEl.innerHTML = DOMPurify.sanitize(data.customHtml, {
                        ADD_TAGS: ["iframe"],
                        ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "src", "style"]
                    });
                } else {
                    devContentEl.innerHTML = data.customHtml;
                }
                devContentEl.style.display = 'block';
            } else {
                devContentEl.style.display = 'none';
            }

            // Dữ liệu nặng: CSS
            const existingStyle = document.getElementById('devCustomCss');
            if (existingStyle) existingStyle.remove();
            
            if (data.customCss && data.customCss.trim() !== '') {
                const styleEl = document.createElement('style');
                styleEl.id = 'devCustomCss';
                styleEl.innerHTML = data.customCss; 
                document.head.appendChild(styleEl);
            }

            document.getElementById('shareBtn').onclick = () => {
                navigator.clipboard.writeText(window.location.href);
                alert(isVi ? "Đã copy link!" : "Link copied!");
            };

            // Dữ liệu nặng: Review Base64
            if (data.reviewText || data.reviewImg) {
                document.getElementById('reviewSec').style.display = 'block';
                document.getElementById('rText').innerText = data.reviewText || '';
                if (data.reviewImg) {
                    const rImg = document.getElementById('rImg');
                    rImg.src = data.reviewImg;
                    rImg.style.display = 'block';
                }
            }

            // Render lại list gợi ý dựa trên bộ Meta nhẹ
            const recGrid = document.getElementById('recGrid');
            let count = 0;
            let recHtml = '';
            for (let gId in allGamesMeta) {
                if (gId !== id && count < 4) {
                    recHtml += `
                        <a href="?id=${gId}" class="rec-card">
                            <img src="${allGamesMeta[gId].img || 'https://via.placeholder.com/150x80'}">
                            <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${allGamesMeta[gId].name}</div>
                        </a>
                    `;
                    count++;
                }
            }
            recGrid.innerHTML = recHtml;
        } else {
            document.getElementById('detailView').innerHTML = `<div style="text-align:center; padding:50px;">GAME NOT FOUND</div>`;
        }
    } else if (userPage) {
        document.getElementById('listView').style.display = 'block';
        document.getElementById('loader').style.display = 'none';
        
        const grid = document.getElementById('gameGrid');
        grid.insertAdjacentHTML('beforebegin', `<h2 style="text-transform: uppercase; margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 10px;">GAMES BY: <span style="color: #00e676;">${userPage}</span></h2>`);
        
        updateGrid(userPage.toLowerCase());
    } else {
        document.getElementById('listView').style.display = 'block';
        document.getElementById('loader').style.display = 'none';
        updateGrid();

        document.getElementById('searchInput').addEventListener('input', () => updateGrid());
        document.getElementById('sortSelect').addEventListener('change', () => updateGrid());
    }
}

// ... Giữ nguyên hàm updateGrid ...[cite: 3]
