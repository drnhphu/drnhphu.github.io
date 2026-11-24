// Khung Hiệu Quả sub-site: language switch, intro video, team cards, guide table of contents, contact email.
(function () {
    var KEY = 'khq-lang';

    function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
    function store(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode: ignore */ } }

    // Elements that cannot be duplicated (option text, placeholders, titles) carry data-vi / data-en.
    function applyAttrs(lang) {
        document.querySelectorAll('[data-vi][data-en]').forEach(function (el) { el.textContent = el.getAttribute('data-' + lang); });
        document.querySelectorAll('[data-ph-vi]').forEach(function (el) { el.setAttribute('placeholder', el.getAttribute('data-ph-' + lang)); });
        document.querySelectorAll('[data-aria-vi]').forEach(function (el) { el.setAttribute('aria-label', el.getAttribute('data-aria-' + lang)); });
        var t = document.documentElement.getAttribute('data-title-' + lang);
        if (t) document.title = t;
    }

    window.setSiteLanguage = function (lang) {
        if (lang !== 'vi' && lang !== 'en') lang = 'vi';
        document.documentElement.setAttribute('lang', lang);
        var vi = document.getElementById('btn-lang-vi'), en = document.getElementById('btn-lang-en');
        if (vi) { vi.classList.toggle('active', lang === 'vi'); vi.setAttribute('aria-pressed', lang === 'vi'); }
        if (en) { en.classList.toggle('active', lang === 'en'); en.setAttribute('aria-pressed', lang === 'en'); }
        applyAttrs(lang);
        store(lang);
        document.dispatchEvent(new CustomEvent('khq:lang', { detail: lang }));
    };
    window.khqLang = function () { return document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'vi'; };

    // Intro video, one block per language ([data-khq-video][lang]): one play button over the poster,
    // native controls once it plays; chapter list and transcript timestamps seek and follow playback.
    // Without JS the <video> keeps its native controls and the play button stays hidden (CSS).
    function setupVideo(box) {
        var v = box.querySelector('video');
        if (!v) return;
        var frame = box.querySelector('.video-frame') || v;
        var btn = box.querySelector('[data-video-play]');
        var groups = [].slice.call(box.querySelectorAll('[data-marks]')).map(function (g) { return [].slice.call(g.querySelectorAll('[data-seek]')); });
        box.classList.add('js');
        v.controls = false;

        function play() {
            var p = v.play();
            if (p && p.catch) p.catch(function () { v.controls = true; });
        }
        function seek(t) {
            if (v.readyState >= 1) { v.currentTime = t; return; }
            v.addEventListener('loadedmetadata', function once() { v.removeEventListener('loadedmetadata', once); v.currentTime = t; });
        }
        if (btn) btn.addEventListener('click', play);
        v.addEventListener('click', function () { if (!v.controls) play(); });
        v.addEventListener('play', function () { box.classList.add('is-playing'); v.controls = true; });

        box.querySelectorAll('[data-seek]').forEach(function (b) {
            b.addEventListener('click', function () {
                seek(parseFloat(b.getAttribute('data-seek')) || 0);
                play();
                var r = frame.getBoundingClientRect();
                if (r.top < 0 || r.bottom > window.innerHeight) frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
        // Each group (chapters, transcript) marks its latest mark at or before the playhead
        v.addEventListener('timeupdate', function () {
            var t = v.currentTime + 0.2;
            groups.forEach(function (marks) {
                var cur = null, best = -1;
                marks.forEach(function (b) { var s = parseFloat(b.getAttribute('data-seek')); if (s <= t && s >= best) { best = s; cur = b; } });
                marks.forEach(function (b) {
                    var on = b === cur, host = b.closest('[data-mark-host]');
                    b.classList.toggle('is-active', on);
                    if (host) host.classList.toggle('is-active', on);
                    if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
                });
            });
        });
    }
    function initVideo() {
        document.querySelectorAll('[data-khq-video]').forEach(setupVideo);
        // Switching language hides one video; stop it so its sound does not carry on unseen
        document.addEventListener('khq:lang', function () {
            document.querySelectorAll('[data-khq-video] video').forEach(function (v) { if (!v.offsetParent && !v.paused) v.pause(); });
        });
    }

    // Team cards from window.KHQ_TEAM (assets/doi-ngu.js)
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function card(m) {
        var photo = m.photo ? '<img src="' + esc(m.photo) + '" alt="' + esc(m.name_vi) + '" class="w-16 h-16 rounded-full object-cover border border-gray-200 shrink-0" loading="lazy">'
            : '<div class="w-16 h-16 rounded-full bg-blue-50 text-primary flex items-center justify-center text-xl font-bold shrink-0" aria-hidden="true">' + esc((m.name_vi || '?').trim().split(/\s+/).pop().charAt(0)) + '</div>';
        return '<div class="flex gap-4 bg-white p-5 rounded-xl border border-gray-100 shadow-sm">' + photo +
            '<div class="min-w-0"><h4 class="font-bold text-dark"><span lang="vi">' + esc(m.name_vi) + '</span><span lang="en">' + esc(m.name_en || m.name_vi) + '</span></h4>' +
            '<p class="text-sm text-primary font-medium mb-1"><span lang="vi">' + esc(m.role_vi) + '</span><span lang="en">' + esc(m.role_en || m.role_vi) + '</span></p>' +
            '<p class="text-sm text-gray-600 leading-relaxed"><span lang="vi">' + esc(m.bio_vi) + '</span><span lang="en">' + esc(m.bio_en || m.bio_vi) + '</span></p></div></div>';
    }
    function initTeam() {
        var team = window.KHQ_TEAM || [];
        document.querySelectorAll('[data-team-group]').forEach(function (box) {
            var g = box.getAttribute('data-team-group');
            var list = team.filter(function (m) { return m.group === g; });
            var empty = box.parentElement.querySelector('[data-team-empty]');
            if (!list.length) { if (empty) empty.hidden = false; return; }
            if (empty) empty.hidden = true;
            box.innerHTML = list.map(card).join('');
        });
    }

    // Guide: highlight the section in view
    function initToc() {
        var links = document.querySelectorAll('.toc a[href^="#"]');
        if (!links.length || !('IntersectionObserver' in window)) return;
        var map = {};
        links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting && map[e.target.id]) {
                    links.forEach(function (a) { a.classList.remove('active'); });
                    map[e.target.id].classList.add('active');
                }
            });
        }, { rootMargin: '-30% 0px -60% 0px' });
        Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
    }

    function init() {
        var q = null;
        try { q = new URLSearchParams(location.search).get('lang'); } catch (e) { /* old browser */ }
        setSiteLanguage(q || stored() || document.documentElement.getAttribute('lang') || 'vi');
        initVideo(); initTeam(); initToc();
        // Contact email from config, shown as text wherever [data-khq-email] appears
        var mail = (window.KHQ_CONFIG && window.KHQ_CONFIG.email) || 'drnhphu@gmail.com';
        document.querySelectorAll('[data-khq-email]').forEach(function (el) { el.textContent = mail; if (el.tagName === 'A') el.setAttribute('href', 'mailto:' + mail); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
