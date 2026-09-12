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

// Logic Trang Chi Tiết
if (id) {
    document.getElementById('detailView').style.display = 'block';
    fetch(`${dbUrl}/games.json`).then(r => r.json()).then(allGames => {
        const data = allGames ? allGames[id] : null;
        if (data) {
            document.getElementById('gName').innerText = data.name;
            document.getElementById('gSize').innerText = `SIZE: ${data.size || 'N/A'}`;
            document.getElementById('gThumb').src = data.img || 'https://via.placeholder.com/400x220?text=No+Image';
            document.getElementById('gLink').href = `${urlWebNhiemVu}/?id=${id}`;

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
// Logic Trang Chủ
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

// Hàm cập nhật danh sách game (Tìm kiếm & sắp xếp)
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

    if (sortMethod === 'az') {
        filteredArray.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMethod === 'new') {
        filteredArray.reverse();
    }

    if (filteredArray.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:#555; padding: 20px;">NO GAMES FOUND</div>`;
        return;
    }

    // Vòng lặp render Game
    filteredArray.forEach((game, index) => {
        let priceHtml = '';
        if (game.price) {
            priceHtml = `<div style="margin-bottom: 8px;">
                            <span class="fake-price">${formatPrice(game.price)}</span>
                            <span class="free-badge">FREE</span>
                         </div>`;
        }

        htmlContent += `
            <div class="game-card">
                <span class="card-badge">VERIFIED</span>
                <div>
                    <img src="${game.img || 'https://via.placeholder.com/300x180'}">
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
