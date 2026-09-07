const dbUrl = "https://sf2g-bf285-default-rtdb.firebaseio.com";
const urlWebNhiemVu = "https://nhap-code.vercel.app/"; // BẮT BUỘC CÓ https://

// 1. Nhận diện ngôn ngữ trình duyệt của người dùng
const userLang = navigator.language || navigator.userLanguage;
const isVi = userLang.toLowerCase().includes('vi');

// 2. Bộ từ điển đa ngôn ngữ (Tiếng Việt & Tiếng Anh)
const i18n = {
    vi: {
        title: "DLOADS - KHO GAME",
        loading: "Đang tải danh sách...",
        empty: "Chưa có game nào trong kho.",
        size: "Dung lượng:",
        select: "CHỌN GAME",
        back: "← QUAY LẠI",
        download: "TẢI GAME NGAY",
        notFound: "Không tìm thấy game!",
        error: "Lỗi tải dữ liệu!"
    },
    en: {
        title: "DLOADS",
        loading: "Loading games...",
        empty: "No games available.",
        size: "Size:",
        select: "SELECT GAME",
        back: "← BACK",
        download: "DOWNLOAD NOW",
        notFound: "Game not found!",
        error: "Data load error!"
    }
};

// Chọn ngôn ngữ tương ứng (Nếu không phải tiếng Việt thì mặc định xài tiếng Anh)
const lang = isVi ? i18n.vi : i18n.en;

// 3. Gán chữ tương ứng vào giao diện
document.getElementById('t_mainTitle').innerText = lang.title;
document.getElementById('t_loading').innerText = lang.loading;
document.getElementById('t_backBtn').innerText = lang.back;
document.getElementById('t_downloadBtn').innerText = lang.download;

// 4. Kiểm tra URL xem người dùng có truyền tham số `?id=...` hay không
const urlParams = new URLSearchParams(window.location.search);
const id = urlParams.get('id');

// 5. Điều hướng hiển thị màn hình (Xem chi tiết HOẶC Xem danh sách)
if (id) {
    // === TRƯỜNG HỢP 1: Có ID -> Hiển thị Màn hình Chi tiết Game ===
    document.getElementById('detailView').style.display = 'block';
    
    // Gọi API Firebase lấy dữ liệu của riêng game đó
    fetch(`${dbUrl}/games/${id}.json`)
        .then(res => res.json())
        .then(data => {
            if (data) {
                document.getElementById('gName').innerText = data.name;
                document.getElementById('gSize').innerText = `${lang.size} ${data.size || 'N/A'}`;
                document.getElementById('gThumb').src = data.img || 'https://via.placeholder.com/400x220?text=No+Image';
                
                // Gán link tải dẫn sang web làm nhiệm vụ kèm ID game
                document.getElementById('gLink').href = `${urlWebNhiemVu}/?id=${id}`;
            } else {
                document.getElementById('gName').innerText = lang.notFound;
            }
        })
        .catch(() => document.getElementById('gName').innerText = lang.error);

} else {
    // === TRƯỜNG HỢP 2: Không có ID -> Hiển thị Màn hình Danh sách Game ===
    document.getElementById('listView').style.display = 'block';
    
    // Gọi API Firebase lấy toàn bộ danh sách game
    fetch(`${dbUrl}/games.json`)
        .then(res => res.json())
        .then(data => {
            const grid = document.getElementById('gameGrid');
            grid.innerHTML = ''; // Xóa chữ "Loading..."
            
            if (!data) {
                grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center;">${lang.empty}</p>`;
                return;
            }
            
            // Lặp qua từng game trong Database và vẽ thẻ HTML
            for (const gameId in data) {
                const game = data[gameId];
                grid.innerHTML += `
                    <div class="game-card">
                        <div>
                            <img src="${game.img || 'https://via.placeholder.com/300x180?text=No+Image'}" alt="${game.name}">
                            <h3>${game.name}</h3>
                            <p>${lang.size} ${game.size || 'N/A'}</p>
                        </div>
                        <a href="?id=${gameId}" class="btn">${lang.select}</a>
                    </div>
                `;
            }
        })
        .catch(() => document.getElementById('gameGrid').innerHTML = `<p style="text-align: center;">${lang.error}</p>`);
}
