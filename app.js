const dbUrl = "https://sf2g-bf285-default-rtdb.firebaseio.com";
const urlWebNhiemVu = "https://nhap-code.vercel.app";
const isVi = (navigator.language || '').toLowerCase().includes('vi');

let allGamesData = {};
const id = new URLSearchParams(window.location.search).get('id');

function formatPrice(price) {
    if (!price) return '';
    let formattedNumber = Number(price).toLocaleString('en-US');
    return isVi ? formattedNumber + ' VNĐ' : '$' + formattedNumber;
}

function trackUserPreference(category) {
    if (!category) return;
    let userPrefs = JSON.parse(localStorage.getItem('userCategoryPrefs')) || {};
    // Parse tags if multiple (e.g. "Horror, 2D")
    let tags = category.split(',').map(t => t.trim());
    tags.forEach(t => {
        userPrefs[t] = (userPrefs[t] || 0) + 1;
    });
    localStorage.setItem('userCategoryPrefs', JSON.stringify(userPrefs));
}

function getUserPreferences() {
    return JSON.parse(localStorage.getItem('userCategoryPrefs')) || {};
}

async function fetchAllGames() {
    if (Object.keys(allGamesData).length > 0) return allGamesData;
    let cached = sessionStorage.getItem('cachedGames');
    if (cached) {
        allGamesData = JSON.parse(cached);
        return allGamesData;
    }
    try {
        const res = await fetch(`${dbUrl}/games.json`);
        allGamesData = await res.json() || {};
        sessionStorage.setItem('cachedGames', JSON.stringify(allGamesData));
    } catch (e) {
        console.error("Lỗi tải data:", e);
        allGamesData = {};
    }
    return allGamesData;
}

async function init() {
    const allGames = await fetchAllGames();

    if (id) {
        document.getElementById('detailView').style.display = 'block';
        const data = allGames ? allGames[id] : null;
        
        if (data) {
            trackUserPreference(data.category);

            document.getElementById('gName').innerText = data.name;
            // Render Developer
            document.getElementById('gDevDetail').innerHTML = `A game by <span style="color:#fff; font-weight:bold;">${data.developer || 'Unknown Studio'}</span>`;
            
            document.getElementById('gSize').innerText = `SIZE: ${data.size || 'N/A'}`;
            document.getElementById('gThumb').src = data.img || 'https://via.placeholder.com/600x280?text=No+Image';
            document.getElementById('gLink').href = `${urlWebNhiemVu}/?id=${id}`;

            // Render Platforms in Detail
            if (data.platforms) {
                let platHtml = data.platforms.split(',').map(p => `<span class="plat-badge">${p.trim()}</span>`).join('');
                document.getElementById('gPlatformsDetail').innerHTML = platHtml;
            }

            // Render Categories
            if (data.category) {
                const catEl = document.getElementById('gCategoryDetail');
                catEl.innerText = data.category.split(',')[0]; // Hiện tag chính thôi
                catEl.style.display = 'inline-block';
            }

            if (data.price) {
                document.getElementById('gPriceContainer').style.display = 'block';
                document.getElementById('gFakePrice').innerText = formatPrice(data.price);
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
            for (let gId in allGames) {
                if (gId !== id && count < 4) {
                    recHtml += `
                        <a href="?id=${gId}" class="rec-card">
                            <img src="${allGames[gId].img || 'https://via.placeholder.com/150x80'}">
                            <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${allGames[gId].name}</div>
                        </a>
                    `;
                    count++;
                }
            }
            recGrid.innerHTML = recHtml;
        } else {
            document.getElementById('detailView').innerHTML = `<div style="text-align:center; padding:50px;">GAME NOT FOUND</div>`;
        }
    } else {
        document.getElementById('listView').style.display = 'block';
        document.getElementById('loader').style.display = 'none';
        updateGrid();

        document.getElementById('searchInput').addEventListener('input', updateGrid);
        document.getElementById('sortSelect').addEventListener('change', updateGrid);
    }
}

function updateGrid() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const sortMethod = document.getElementById('sortSelect').value;
    const grid = document.getElementById('gameGrid');
    
    let filteredArray = [];
    for (let gameId in allGamesData) {
        const game = allGamesData[gameId];
        // Tìm theo tên game HOẶC tên dev
        let devName = game.developer ? game.developer.toLowerCase() : '';
        if (game && game.name && (game.name.toLowerCase().includes(query) || devName.includes(query))) {
            filteredArray.push({ id: gameId, ...game });
        }
    }

    if (sortMethod === 'az') {
        filteredArray.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMethod === 'new') {
        filteredArray.reverse(); // Đảo mảng để cái mới nhất lên đầu
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

        htmlContent += `
            <div class="game-card">
                <span class="card-badge">VERIFIED</span>
                <div style="flex-grow: 1;">
                    <img src="${game.img || 'https://via.placeholder.com/300x180'}">
                    ${platformsHtml}
                    <h3 class="game-title">${game.name}</h3>
                    <p class="dev-name">${game.developer || 'Unknown'}</p>
                    ${categoryHtml}
                    ${priceHtml}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top: 15px;">
                    <p style="color:#888; font-size:11px; margin:0;">${game.size||'N/A'}</p>
                    <a href="?id=${game.id}" class="btn" style="padding: 8px 15px;">VIEW</a>
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
