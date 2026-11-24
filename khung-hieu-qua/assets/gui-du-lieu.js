// Trang Gửi dữ liệu: tải phiếu đã điền lên backend (Google Apps Script) kèm mã hồ sơ và email đã đăng ký.
(function () {
    'use strict';
    var CFG = window.KHQ_CONFIG || {};
    var MAX = (CFG.maxUploadMB || 10) * 1024 * 1024;
    var CODE_RE = /^KHQ-\d{6}-[A-Z0-9]{4}$/;
    function t(vi, en) { return (window.khqLang && window.khqLang() === 'en') ? en : vi; }
    function $(id) { return document.getElementById(id); }

    function init() {
        var form = $('up-form'); if (!form) return;
        if (!CFG.endpoint) { form.classList.add('hidden'); $('up-manual').classList.remove('hidden'); return; }
        try { var q = new URLSearchParams(location.search).get('ma'); if (q) $('up-code').value = q.toUpperCase(); } catch (e) { /* ignore */ }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var err = $('up-err'); err.hidden = true;
            var code = $('up-code').value.trim().toUpperCase(), email = $('up-email').value.trim(), file = $('up-file').files[0];
            var ok = true;
            function mark(id, bad) { $(id).parentElement.classList.toggle('invalid', bad); if (bad) ok = false; }
            mark('up-code', !CODE_RE.test(code));
            mark('up-email', !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email));
            mark('up-file', !file || file.size > MAX || !/\.(xlsx|xls|csv)$/i.test(file.name));
            var ack = $('up-ack'); ack.parentElement.classList.toggle('req-missing', !ack.checked); if (!ack.checked) ok = false;
            if (!ok) { err.textContent = t('Kiểm tra lại các ô đánh dấu đỏ.', 'Check the fields marked in red.'); err.hidden = false; return; }

            var btn = $('up-btn'), st = $('up-status');
            btn.disabled = true; st.hidden = false; st.textContent = t('Đang đọc file…', 'Reading the file…');
            var rd = new FileReader();
            rd.onerror = function () { fail('read'); };
            rd.onload = function () {
                var b64 = String(rd.result).split(',')[1] || '';
                st.textContent = t('Đang gửi…', 'Uploading…');
                var body = { action: 'upload', lang: t('vi', 'en'), code: code, email: email, fileName: file.name, mimeType: file.type || '', size: file.size, data: b64,
                             note: $('up-note').value.trim(), hp: $('up-hp').value, clientTime: new Date().toISOString() };
                var ctrl = window.AbortController ? new AbortController() : null;
                var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 120000);
                fetch(CFG.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', signal: ctrl ? ctrl.signal : undefined })
                    .then(function (r) { return r.json(); })
                    .then(function (j) {
                        clearTimeout(timer);
                        if (j && j.ok) {
                            form.classList.add('hidden'); $('up-done').classList.remove('hidden');
                            $('up-done-code').textContent = code; $('up-done-code-en').textContent = code;
                            $('up-done').scrollIntoView({ behavior: 'smooth', block: 'center' });
                            return;
                        }
                        fail(j && j.error);
                    })
                    .catch(function () { clearTimeout(timer); fail('network'); });
            };
            rd.readAsDataURL(file);

            function fail(code) {
                btn.disabled = false; st.hidden = true;
                err.textContent = code === 'not_found' ? t('Mã hồ sơ và email không khớp với hồ sơ đã đăng ký.', 'The case code and email do not match a registration.')
                    : code === 'too_large' ? t('File lớn hơn 10 MB.', 'The file is larger than 10 MB.')
                    : code === 'bad_type' ? t('Chỉ nhận file .xlsx, .xls hoặc .csv.', 'Only .xlsx, .xls or .csv files are accepted.')
                    : code === 'agreement_required' ? t('Hồ sơ này có dữ liệu gắn với từng người, nên cần ký thoả thuận xử lý dữ liệu trước khi gửi file. TS. Nguyễn Hoàng Phú sẽ liên hệ; sau khi ký, bạn tải lên lại tại đây.', 'This case contains person-level data, so a data processing agreement must be signed before the file is sent. Dr. Hoang-Phu Nguyen will contact you; once signed, upload again here.')
                    : code === 'rate_limited' ? t('Hồ sơ này đã gửi nhiều file trong hôm nay. Vui lòng thử lại ngày mai hoặc gửi qua email.', 'This case has sent many files today. Try again tomorrow or send by email.')
                    : t('Chưa gửi được file. Thử lại, hoặc trả lời email gửi phiếu và đính kèm file.', 'The file could not be sent. Try again, or reply to the template email with the file attached.');
                err.hidden = false;
            }
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
