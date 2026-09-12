const dbUrl = "https://sf2g-bf285-default-rtdb.firebaseio.com";
const urlWebNhiemVu = "https://nhap-code.vercel.app";
const isVi = (navigator.language || '').toLowerCase().includes('vi');

let allGamesData = {};

const id = new URLSearchParams(window.location.search).get('id');

// Hàm xử lý hiển thị giá tiền tệ
function formatPrice(price) {
    if (!price) return '';
    let formattedNumber = Number(price).toLocaleString('en-US');
    
    if (isVi) {
        return formattedNumber + ' VNĐ';
    } else {
        return '$' + formattedNumber;
    }
}

// ---------------------------------------------------
// [HỆ THỐNG QUẢN LÝ LƯỢT CLICK THỂ LOẠI]
// ---------------------------------------------------

// 1. Hàm lưu lại sở thích khi user xem 1 game
function trackUserPreference(category) {
    if (!category) return;
    
    // Lấy dữ liệu cũ từ trình duyệt, nếu chưa có thì tạo object trống {}
    let userPrefs = JSON.parse(localStorage.getItem('userCategoryPrefs')) || {};
    
    // Cộng 1 điểm cho thể loại vừa click
    userPrefs[category] = (userPrefs[category] || 0) + 1;
    
    // Lưu ngược lại vào trình duyệt
    localStorage.setItem('userCategoryPrefs', JSON.stringify(userPrefs));
}

// 2. Hàm lấy điểm sở thích của user để dùng lúc sắp xếp
function getUserPreferences() {
    return JSON.parse(localStorage.getItem('userCategoryPrefs')) || {};
}


// ---------------------------------------------------
// LOGIC TRANG CHI TIẾT (KHI CÓ ID)
// ---------------------------------------------------
if (id) {
    document.getElementById('detailView').style.display = 'block';
    fetch(`${dbUrl}/games.json`).then(r => r.json()).then(allGames => {
        const data = allGames ? allGames[id] : null;
        if (data) {
            // --> TRACKING: Theo dõi sở thích người dùng khi họ vào xem game này
            trackUserPreference(data.category);

            document.getElementById('gName').innerText = data.name;
            document.getElementById('gSize').innerText = `SIZE: ${data.size || 'N/A'}`;
            document.getElementById('gThumb').src = data.img || 'https://via.placeholder.com/400x220?text=No+Image';
            document.getElementById('gLink').href = `${urlWebNhiemVu}/?id=${id}`;

            // Hiện thể loại ở trang chi tiết nếu có
            if (data.category) {
                const catEl = document.getElementById('gCategoryDetail');
                catEl.innerText = data.category;
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

            if(data.reviewText || data.reviewImg) {
                document.getElementById('reviewSec').style.display = 'block';
                document.getElementById('rText').innerText = data.reviewText || '';
                if(data.reviewImg) {
                    const rImg = document.getElementById('rImg');
                    rImg.src = data.reviewImg;
                    rImg.style.display = 'block';
                }
            }

            const recGrid = document.getElementById('recGrid');
            let count = 0;
            for (let gId in allGames) {
                if (gId !== id && count < 3) {
                    recGrid.innerHTML += `
                        <a href="?id=${gId}" class="rec-card">
                            <img src="${allGames[gId].img || 'https://via.placeholder.com/150x80'}">
                            <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${allGames[gId].name}</div>
                        </a>
                    `;
                    count++;
                }
            }
        }
    });
} 
// ---------------------------------------------------
// LOGIC TRANG CHỦ (DANH SÁCH GAME)
// ---------------------------------------------------
else {
    document.getElementById('listView').style.display = 'block';
    
    fetch(`${dbUrl}/games.json`).then(r => r.json()).then(data => {
        document.getElementById('loader').style.display = 'none';
        allGamesData = data;
        updateGrid();
    });

    document.getElementById('searchInput').addEventListener('input', updateGrid);
    document.getElementById('sortSelect').addEventListener('change', updateGrid);
}

// Hàm cập nhật danh sách game (Tìm kiếm & Sắp xếp)
function updateGrid() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const sortMethod = document.getElementById('sortSelect').value;
    const grid = document.getElementById('gameGrid');
    
    // Xóa rỗng HTML nội dung cũ
    let htmlContent = '';

    let filteredArray = [];
    for (let gameId in allGamesData) {
        const game = allGamesData[gameId];
        if (game.name.toLowerCase().includes(query)) {
            filteredArray.push({ id: gameId, ...game });
        }
    }

    // XỬ LÝ CÁC KIỂU SẮP XẾP
    if (sortMethod === 'az') {
        filteredArray.sort((a, b) => a.name.localeCompare(b.name));
    } 
    else if (sortMethod === 'new') {
        filteredArray.reverse(); // Mặc định Firebase bốc từ cũ đến mới, reverse để ra mới nhất
    } 
    else if (sortMethod === 'recommended') {
        // SẮP XẾP THEO SỞ THÍCH NGƯỜI DÙNG (Thuật toán For You)
        const userPrefs = getUserPreferences();
        
        filteredArray.sort((a, b) => {
            // Lấy điểm của game A và game B, nếu không có điểm thì mặc định là 0
            let scoreA = userPrefs[a.category] || 0;
            let scoreB = userPrefs[b.category] || 0;
            
            // Xếp giảm dần (đưa điểm cao lên đầu)
            return scoreB - scoreA; 
        });
    }

    if (filteredArray.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:#555; padding: 20px;">NO GAMES FOUND</div>`;
        return;
    }

    // Vòng lặp render Game ra màn hình
    filteredArray.forEach((game, index) => {
        let priceHtml = '';
        if (game.price) {
            priceHtml = `<div style="margin-bottom: 8px;">
                            <span class="fake-price">${formatPrice(game.price)}</span>
                            <span class="free-badge">FREE</span>
                         </div>`;
        }

        // Hiện thể loại nếu game có dữ liệu thể loại
        let categoryHtml = game.category ? `<span class="category-tag">${game.category}</span>` : '';

        htmlContent += `
            <div class="game-card">
                <span class="card-badge">VERIFIED</span>
                <div>
                    <img src="${game.img || 'https://via.placeholder.com/300x180'}">
                    ${categoryHtml}
                    <h3 style="font-size:15px; margin:5px 0; letter-spacing:0.5px;">${game.name}</h3>
                    ${priceHtml}
                    <p style="color:#888; font-size:12px; margin-bottom:12px;">${game.size||'N/A'}</p>
                </div>
                <a href="?id=${game.id}" class="btn">${isVi ? 'XEM CHI TIẾT' : 'VIEW DETAIL'}</a>
            </div>
        `;

        // CHÈN GẠCH NGANG SAU MỖI 3 GAME (Chỉ chèn nếu chưa phải game cuối cùng)
        if ((index + 1) % 3 === 0 && index !== filteredArray.length - 1) {
            htmlContent += `<div class="row-divider"></div>`;
        }
    });

    // Gán 1 lần vào lưới (Chạy mượt hơn)
    grid.innerHTML = htmlContent;
}
