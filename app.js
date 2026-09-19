const dbUrl = "https://sf2g-bf285-default-rtdb.firebaseio.com";
const urlWebNhiemVu = "https://nhap-code.vercel.app";
const isVi = (navigator.language || '').toLowerCase().includes('vi');

let allGamesData = {};
const id = new URLSearchParams(window.location.search).get('id');
const userPage = new URLSearchParams(window.location.search).get('user');

function formatPrice(price) { 
    if (!price) return '';
    let formattedNumber = Number(price).toLocaleString('en-US');
    return isVi ? formattedNumber + ' VNĐ' : '$' + formattedNumber;
}

function trackUserPreference(category) { 
    if (!category) return;
    let userPrefs = JSON.parse(localStorage.getItem('userCategoryPrefs')) || {};
    let tags = category.split(',').map(t => t.trim());
    tags.forEach(t => {
        userPrefs[t] = (userPrefs[t] || 0) + 1;
    });
    localStorage.setItem('userCategoryPrefs', JSON.stringify(userPrefs));
}

function getUserPreferences() { 
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
        const res = await fetch(`${dbUrl}/games.json`); 
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
        const res = await fetch(`${dbUrl}/games/${gameId}.json`);
        return await res.json();
    } catch (e) {
        console.error("Lỗi tải chi tiết game:", e);
        return null;
    }
}

async function init() {
    const allGamesMeta = await fetchGamesMeta();

    if (id) {
        document.getElementById('detailView').style.display = 'block';
        let data = allGamesMeta ? allGamesMeta[id] : null;
        
        if (data) {
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

            if (data.reviewText || data.reviewImg) {
                document.getElementById('reviewSec').style.display = 'block';
                document.getElementById('rText').innerText = data.reviewText || '';
                if (data.reviewImg) {
                    const rImg = document.getElementById('rImg');
                    rImg.src = data.reviewImg;
                    rImg.style.display = 'block';
                }
            }

            const recGrid = document.getElementById('recGrid');
            let count = 0;
            let recHtml = '';
            for (let gId in allGamesMeta) {
                if (gId !== id && count < 4) {
                    recHtml += `
                        <a href="?id=${gId}" class="rec-card" onclick="document.getElementById('globalSpinner').style.display='flex'">
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
        
        const grid = document.getElementById('gameGrid');
        grid.insertAdjacentHTML('beforebegin', `<h2 style="text-transform: uppercase; margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 10px;">GAMES BY: <span style="color: #00e676;">${userPage}</span></h2>`);
        
        updateGrid(userPage.toLowerCase());
    } else {
        document.getElementById('listView').style.display = 'block';
        updateGrid();

        document.getElementById('searchInput').addEventListener('input', () => updateGrid());
        document.getElementById('sortSelect').addEventListener('change', () => updateGrid());
    }

    // Tắt vòng xoay sau khi tải xong toàn bộ
    const spinner = document.getElementById('globalSpinner');
    if (spinner) {
        spinner.style.display = 'none';
    }
}

function updateGrid(targetUser = null) {
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    const sortMethod = sortSelect ? sortSelect.value : 'new';
    const grid = document.getElementById('gameGrid');
    
    let filteredArray = [];
    for (let gameId in allGamesData) {
        const game = allGamesData[gameId];
        let devName = game.developer ? game.developer.toLowerCase() : '';
        
        if (targetUser) {
            if (devName === targetUser) {
                filteredArray.push({ id: gameId, ...game });
            }
        } else {
            if (game && game.name && (game.name.toLowerCase().includes(query) || devName.includes(query))) {
                filteredArray.push({ id: gameId, ...game });
            }
        }
    }

    if (sortMethod === 'az') {
        filteredArray.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMethod === 'new') {
        filteredArray.reverse();
    } else if (sortMethod === 'recommended') {
        const userPrefs = getUserPreferences();
        filteredArray.sort((a, b) => {
            let catA = a.category ? a.category.split(',')[0].trim() : '';
            let catB = b.category ? b.category.split(',')[0].trim() : '';
            let scoreA = userPrefs[catA] || 0;
            let scoreB = userPrefs[catB] || 0;
            return scoreB - scoreA;
        });
    }

    if (filteredArray.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:#555; padding: 20px;">NO GAMES FOUND</div>`;
        return;
    }

    let htmlContent = '';
    filteredArray.forEach((game, index) => {
        let priceHtml = '';
        if (game.price) {
            priceHtml = `<div style="margin-bottom: 8px;">
                            <span class="fake-price">${formatPrice(game.price)}</span>
                            <span class="free-badge">FREE</span>
                         </div>`;
        }

        let categoryHtml = game.category ? `<span class="category-tag">${game.category.split(',')[0]}</span>` : '';
        
        let platformsHtml = '';
        if (game.platforms) {
            platformsHtml = `<div class="platforms">` + 
                game.platforms.split(',').map(p => `<span class="plat-badge">${p.trim()}</span>`).join('') + 
                `</div>`;
        }

        let reviewPanelHtml = '';
        if (game.reviewText || game.reviewImg) {
            let revTitle = isVi ? '⭐ Nổi bật / Review' : '⭐ Featured / Review';
            let imgHtml = game.reviewImg ? `<img class="rev-img" src="${game.reviewImg}" alt="Review">` : '';
            let textHtml = game.reviewText ? `<p class="review-panel-text">${game.reviewText}</p>` : '';
            
            reviewPanelHtml = `
                <div class="review-panel">
                    <div class="review-panel-title">${revTitle}</div>
                    ${imgHtml}
                    ${textHtml}
                </div>
            `;
        }

        htmlContent += `
            <div class="game-card">
                ${reviewPanelHtml}
                <span class="card-badge">VERIFIED</span>
                <div style="flex-grow: 1;">
                    <img src="${game.img || 'https://via.placeholder.com/300x180'}">
                    ${platformsHtml}
                    <h3 class="game-title">${game.name}</h3>
                    <p class="dev-name" style="cursor:pointer; text-decoration:underline;" onclick="window.location.href='/?user=${encodeURIComponent(game.developer || 'Unknown')}'">${game.developer || 'Unknown'}</p>
                    ${categoryHtml}
                    ${priceHtml}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top: 15px;">
                    <p style="color:#888; font-size:11px; margin:0;">${game.size||'N/A'}</p>
                    <a href="?id=${game.id}" class="btn" style="padding: 8px 15px;" onclick="document.getElementById('globalSpinner').style.display='flex'">VIEW</a>
                </div>
            </div>
        `;

        if ((index + 1) % 3 === 0 && index !== filteredArray.length - 1) {
            htmlContent += `<div class="row-divider"></div>`;
        }
    });

    grid.innerHTML = htmlContent;
}

init();
