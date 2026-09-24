/* DLOADS FX — chạy độc lập, không đụng app.js */
(function () {
    'use strict';
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fine = window.matchMedia && matchMedia('(pointer: fine)').matches;

    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }

    ready(function () {
        var body = document.body;

        // Thanh tiến trình cuộn
        var bar = document.createElement('div');
        bar.id = 'fxProgress';
        body.appendChild(bar);
        function onScroll() {
            var h = document.documentElement, max = h.scrollHeight - h.clientHeight;
            bar.style.transform = 'scaleX(' + (max > 0 ? h.scrollTop / max : 0) + ')';
        }
        addEventListener('scroll', onScroll, { passive: true });
        onScroll();

        // Đèn xanh đuổi theo chuột
        if (fine && !reduce) {
            var glow = document.createElement('div');
            glow.id = 'fxCursor';
            body.appendChild(glow);
            var tx = innerWidth / 2, ty = innerHeight / 3, cx = tx, cy = ty;
            addEventListener('pointermove', function (e) { tx = e.clientX; ty = e.clientY; }, { passive: true });
            (function loop() {
                cx += (tx - cx) * 0.12;
                cy += (ty - cy) * 0.12;
                glow.style.transform = 'translate3d(' + (cx - 210) + 'px,' + (cy - 210) + 'px,0)';
                requestAnimationFrame(loop);
            })();
        }

        // Card: xuất hiện lần lượt + tilt 3D + đèn theo chuột
        var grid = document.getElementById('gameGrid');
        if (grid) {
            var stagger = function () {
                var i = 0;
                grid.querySelectorAll('.game-card').forEach(function (c) {
                    c.style.setProperty('--i', Math.min(i++, 14));
                });
            };
            stagger();
            new MutationObserver(stagger).observe(grid, { childList: true });

            if (fine && !reduce) {
                var last = null;
                var reset = function (c) {
                    c.style.removeProperty('--rx');
                    c.style.removeProperty('--ry');
                };
                grid.addEventListener('pointermove', function (e) {
                    var c = e.target.closest('.game-card');
                    if (last && last !== c) reset(last);
                    last = c;
                    if (!c) return;
                    var r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
                    c.style.setProperty('--mx', x + 'px');
                    c.style.setProperty('--my', y + 'px');
                    c.style.setProperty('--rx', ((y / r.height - 0.5) * -7).toFixed(2) + 'deg');
                    c.style.setProperty('--ry', ((x / r.width - 0.5) * 7).toFixed(2) + 'deg');
                });
                grid.addEventListener('pointerleave', function () {
                    if (last) { reset(last); last = null; }
                });
            }
        }

        // Trang chi tiết: các khối hiện dần khi cuộn tới
        if ('IntersectionObserver' in window) {
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
                });
            }, { threshold: 0.12 });
            document.querySelectorAll('.review-box, .comment-section, .recommend-sec').forEach(function (el) {
                el.classList.add('fx-reveal');
                io.observe(el);
            });
        }

        // Ripple khi bấm nút
        document.addEventListener('pointerdown', function (e) {
            if (reduce) return;
            var t = e.target.closest('.btn, .nav-link, .comment-post-btn, .btn-icon, .btn-back');
            if (!t) return;
            var r = t.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2, d = document.createElement('span');
            d.className = 'fx-ripple';
            d.style.width = d.style.height = s + 'px';
            d.style.left = (e.clientX - r.left - s / 2) + 'px';
            d.style.top = (e.clientY - r.top - s / 2) + 'px';
            t.appendChild(d);
            setTimeout(function () { d.remove(); }, 650);
        });
    });
})();
