// Quản lý lưu trữ và theo dõi sở thích thể loại của người dùng dựa trên localStorage

const TRACKER_KEY = 'userCategoryPrefs';

// 1. Hàm ghi nhận khi user click vào xem chi tiết game
function trackUserPreference(category) {
    if (!category) return;
    
    let userPrefs = JSON.parse(localStorage.getItem(TRACKER_KEY)) || {};
    
    // Cộng dồn 1 điểm cho thể loại được click
    userPrefs[category] = (userPrefs[category] || 0) + 1;
    
    localStorage.setItem(TRACKER_KEY, JSON.stringify(userPrefs));
}

// 2. Hàm lấy điểm số sở thích của các thể loại
function getUserPreferences() {
    return JSON.parse(localStorage.getItem(TRACKER_KEY)) || {};
}

// 3. Hàm sắp xếp mảng game dựa trên sở thích cá nhân (Thuật toán "For You")
function sortGamesByPreference(gamesArray) {
    const userPrefs = getUserPreferences();
    
    return gamesArray.sort((a, b) => {
        let scoreA = userPrefs[a.category] || 0;
        let scoreB = userPrefs[b.category] || 0;
        
        // Đưa thể loại có điểm cao lên đầu
        return scoreB - scoreA; 
    });
}
