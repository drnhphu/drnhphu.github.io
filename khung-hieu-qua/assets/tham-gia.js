// Trang Tham gia: khung trò chuyện theo kịch bản để chọn đầu vào, đầu ra, điều kiện; xin đồng ý; gửi yêu cầu nhận phiếu.
// Không có gì được gửi đi cho tới khi người dùng bấm Gửi ở bước Liên hệ.
(function () {
    'use strict';
    var CFG = window.KHQ_CONFIG || {};
    var IND = window.KHQ_INDUSTRIES || {};
    var ORDER = window.KHQ_INDUSTRY_ORDER || Object.keys(IND);
    var MAIL = CFG.email || 'drnhphu@gmail.com';
    var VERSION = CFG.consentVersion || '1.0', VDATE = CFG.consentDate || '22/11/2026';

    function lang() { return window.khqLang ? window.khqLang() : 'vi'; }
    function t(vi, en) { return lang() === 'en' ? en : vi; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

    var A = {};            // answers by step id
    var cur = 0;           // index of the step being asked
    var reached = false;   // has the user reached the review step once
    var result = null;     // after sending: { mode: 'auto', code, email } or { mode: 'manual' }

    var BRACKETS = [
        { v: 'lt18', vi: 'Dưới 18', en: 'Fewer than 18', lo: 1, hi: 17 },
        { v: '18-35', vi: 'Từ 18 đến 35', en: '18 to 35', lo: 18, hi: 35 },
        { v: '36-99', vi: 'Từ 36 đến 99', en: '36 to 99', lo: 36, hi: 99 },
        { v: '100+', vi: 'Từ 100 trở lên', en: '100 or more', lo: 100, hi: Infinity },
        { v: 'unknown', vi: 'Chưa rõ', en: 'Not sure yet', lo: null, hi: null }
    ];
    var PERIODS = [['month', 'Tháng', 'Month'], ['quarter', 'Quý', 'Quarter'], ['year', 'Năm', 'Year'], ['season', 'Vụ mùa', 'Crop season'], ['other', 'Khác', 'Other']];
    var GOALS = [['weak', 'Tìm đơn vị yếu và việc cần cải thiện', 'Find weak units and what to fix'],
                 ['replicate', 'Nhân rộng cách làm của đơn vị tốt', 'Replicate what the best units do'],
                 ['allocate', 'Phân bổ lại nguồn lực, ngân sách', 'Reallocate resources or budget'],
                 ['reward', 'Đánh giá, khen thưởng quản lý đơn vị', 'Assess or reward unit managers'],
                 ['network', 'Quyết định mở thêm hoặc đóng bớt đơn vị', 'Decide where to open or close units']];
    var ORIENT = [['out', 'Tăng kết quả, giữ nguyên nguồn lực', 'Raise results with the same resources', 'Ví dụ: tăng doanh thu với cùng mặt bằng và nhân sự.', 'For example: more revenue from the same space and staff.'],
                  ['in', 'Giảm nguồn lực, giữ nguyên kết quả', 'Use fewer resources for the same results', 'Ví dụ: giảm chi phí mà không giảm doanh thu.', 'For example: lower costs without losing revenue.'],
                  ['both', 'Cả hai', 'Both', '', ''],
                  ['unsure', 'Chưa rõ, nhờ chuyên gia đề xuất', 'Not sure, let the expert suggest', '', '']];
    var ROLE = {
        inputs: { vi: 'Đầu vào', en: 'Inputs' },
        outputs: { vi: 'Đầu ra', en: 'Outputs' },
        conds: { vi: 'Điều kiện', en: 'Conditions' }
    };

    function ind() { return IND[A.industry] || null; }
    function unitWord() {
        var i = ind(); if (!i) return t('đơn vị', 'unit');
        if (A.industry === 'custom' && A.unitName) return A.unitName;
        return t(i.unit_vi, i.unit_en);
    }
    function bracket() { for (var i = 0; i < BRACKETS.length; i++) if (BRACKETS[i].v === A.units) return BRACKETS[i]; return null; }
    function label(arr) { return lang() === 'en' ? arr[1] : arr[0]; }
    function counts() {
        var m = A.inputs ? A.inputs.use.length + A.inputs.extra.length : 0;
        var s = A.outputs ? A.outputs.use.length + A.outputs.extra.length : 0;
        var k = A.conds ? A.conds.use.length + A.conds.extra.length : 0;
        return { m: m, s: s, k: k, need: Math.max(m * s, 3 * (m + s)) };
    }
    function nIn(n) { return n + (n === 1 ? ' input' : ' inputs'); }
    function nOut(n) { return n + (n === 1 ? ' output' : ' outputs'); }

    // ---------------------------------------------------------------- widgets
    function optionButtons(opts, selected, onPick) {
        var box = el('div', 'grid gap-2 ' + (opts.length > 4 ? 'sm:grid-cols-2' : ''));
        opts.forEach(function (o) {
            var b = el('button', 'text-left px-4 py-3 rounded-lg border transition flex gap-3 items-start ' +
                (selected === o.v ? 'border-primary bg-blue-50 ring-1 ring-primary' : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'));
            b.type = 'button';
            b.innerHTML = (o.icon ? '<i class="fa-solid ' + o.icon + ' text-primary mt-1 w-4 shrink-0"></i>' : '') +
                '<span class="min-w-0"><span class="block font-semibold text-dark">' + esc(o.label) + '</span>' +
                (o.sub ? '<span class="block text-sm text-gray-600 mt-0.5">' + esc(o.sub) + '</span>' : '') + '</span>';
            b.addEventListener('click', function () { onPick(o.v); });
            box.appendChild(b);
        });
        return box;
    }
    function continueBtn(text) {
        var b = el('button', 'mt-4 px-6 py-2.5 bg-primary text-white rounded-md font-medium hover:bg-blue-800 transition shadow-sm inline-flex items-center gap-2');
        b.type = 'button'; b.innerHTML = esc(text || t('Tiếp tục', 'Continue')) + ' <i class="fa-solid fa-arrow-right text-sm"></i>';
        return b;
    }
    function errLine() { var e = el('p', 'text-sm text-red-700 mt-3'); e.hidden = true; e.setAttribute('role', 'alert'); return e; }

    // Checklist of recommended indicators plus free additions
    function indicatorPicker(role, hint) {
        var i = ind(); var rec = i ? i[role] : [];
        var prev = A[role] || { use: rec.map(function (r) { return r[0]; }), extra: [] };
        var use = prev.use.slice(), extra = prev.extra.slice();
        var box = el('div');
        if (rec.length) {
            var list = el('div', 'grid gap-2');
            rec.forEach(function (r) {
                var lab = el('label', 'check');
                var cb = el('input'); cb.type = 'checkbox'; cb.checked = use.indexOf(r[0]) >= 0;
                cb.addEventListener('change', function () {
                    var k = use.indexOf(r[0]); if (cb.checked && k < 0) use.push(r[0]); if (!cb.checked && k >= 0) use.splice(k, 1);
                });
                lab.appendChild(cb);
                lab.appendChild(el('span', 'min-w-0', '<span class="block font-medium text-dark">' + esc(lang() === 'en' ? r[1] : r[0]) + '</span>' +
                    '<span class="block text-sm text-gray-600">' + esc(lang() === 'en' ? r[3] : r[2]) + '</span>' +
                    (lang() === 'en' ? '<span class="block text-xs text-gray-400 mt-0.5">Template column: ' + esc(r[0]) + '</span>' : '')));
                list.appendChild(lab);
            });
            box.appendChild(list);
        }
        var addWrap = el('div', 'mt-4');
        addWrap.appendChild(el('div', 'text-sm font-semibold text-dark mb-1', esc(rec.length ? t('Thêm chỉ số khác', 'Add another indicator') : t('Tên từng chỉ số', 'Name each indicator'))));
        if (hint) addWrap.appendChild(el('p', 'text-sm text-gray-600 mb-2', esc(hint)));
        var row = el('div', 'flex gap-2');
        var inp = el('input', 'flex-1 min-w-0 border border-gray-300 rounded-md px-3 py-2 text-sm'); inp.type = 'text'; inp.maxLength = 80;
        inp.setAttribute('placeholder', role === 'conds' ? t('Ví dụ: Có camera giám sát', 'For example: Has CCTV') : role === 'inputs' ? t('Ví dụ: Số giờ máy chạy (giờ)', 'For example: Machine hours (hours)') : t('Ví dụ: Số khách quay lại', 'For example: Returning customers'));
        inp.setAttribute('aria-label', t('Tên chỉ số thêm', 'Extra indicator name'));
        var add = el('button', 'px-4 py-2 border border-gray-300 rounded-md text-sm font-medium bg-white hover:bg-gray-50'); add.type = 'button'; add.textContent = t('Thêm', 'Add');
        row.appendChild(inp); row.appendChild(add); addWrap.appendChild(row);
        var chips = el('div', 'flex flex-wrap gap-2 mt-3'); addWrap.appendChild(chips);
        function drawChips() {
            chips.innerHTML = '';
            extra.forEach(function (x, n) {
                var c = el('span', 'inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-primary text-sm border border-blue-100', esc(x) + ' ');
                var rm = el('button', 'text-primary/70 hover:text-red-700', '<i class="fa-solid fa-xmark"></i>'); rm.type = 'button';
                rm.setAttribute('aria-label', t('Bỏ ', 'Remove ') + x);
                rm.addEventListener('click', function () { extra.splice(n, 1); drawChips(); });
                c.appendChild(rm); chips.appendChild(c);
            });
        }
        function doAdd() {
            var v = inp.value.replace(/\s+/g, ' ').trim(); if (!v) return;
            var all = rec.map(function (r) { return r[0].toLowerCase(); }).concat(extra.map(function (x) { return x.toLowerCase(); }));
            if (all.indexOf(v.toLowerCase()) < 0 && extra.length < 10) extra.push(v);
            inp.value = ''; drawChips(); inp.focus();
        }
        add.addEventListener('click', doAdd);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
        drawChips();
        box.appendChild(addWrap);
        var err = errLine(); var go = continueBtn();
        go.addEventListener('click', function () {
            if (inp.value.trim()) doAdd();
            var n = use.length + extra.length;
            if (role !== 'conds' && n < 1) { err.textContent = role === 'inputs' ? t('Cần ít nhất một đầu vào.', 'At least one input is needed.') : t('Cần ít nhất một đầu ra.', 'At least one output is needed.'); err.hidden = false; return; }
            var keep = rec.map(function (r) { return r[0]; }).filter(function (x) { return use.indexOf(x) >= 0; });
            var missing = rec.map(function (r) { return r[0]; }).filter(function (x) { return use.indexOf(x) < 0; });
            answer(role, { use: keep, missing: missing, extra: extra.slice() });
        });
        box.appendChild(err); box.appendChild(go);
        return box;
    }

    function listText(v) {
        if (!v) return '';
        var names = v.use.map(function (x) { return displayName(x); }).concat(v.extra);
        return names.length ? names.join(', ') : t('Không có', 'None');
    }
    function displayName(vi) {
        if (lang() !== 'en') return vi;
        var i = ind(); if (!i) return vi;
        var all = i.inputs.concat(i.outputs, i.conds);
        for (var k = 0; k < all.length; k++) if (all[k][0] === vi) return all[k][1];
        return vi;
    }

    // ---------------------------------------------------------------- steps
    var STEPS = [
        { id: 'intro',
          ask: function () { return t('<p>Xin chào. Trợ lý này sẽ hỏi vài câu, mất khoảng 5 phút, để chọn đúng các chỉ số <b>đầu vào</b> (nguồn lực mỗi đơn vị dùng) và <b>đầu ra</b> (kết quả mỗi đơn vị tạo ra) cho doanh nghiệp của bạn. Bạn chưa cần nhập số liệu nào.</p><p class="mt-2">Cuối cuộc trò chuyện, sau khi bạn đồng ý với các cam kết bảo mật, phiếu dữ liệu đúng ngành sẽ được gửi về email của bạn. Trang này không gửi đi thông tin nào cho tới khi bạn bấm Gửi ở bước cuối.</p>',
                                     '<p>Hello. This assistant asks a few questions, about 5 minutes, to pick the right <b>input</b> indicators (resources each unit uses) and <b>output</b> indicators (results each unit produces) for your company. You do not need any figures yet.</p><p class="mt-2">At the end, once you accept the privacy commitments, the data template for your sector is sent to your email. Nothing you enter here is sent anywhere until you press Send at the last step.</p>'); },
          widget: function () { var b = continueBtn(t('Bắt đầu', 'Start')); b.classList.remove('mt-4'); b.addEventListener('click', function () { answer('intro', true); }); return b; },
          say: function () { return t('Bắt đầu', 'Start'); } },

        { id: 'industry',
          ask: function () { return t('Doanh nghiệp muốn so sánh loại đơn vị nào? Mỗi dòng trong bảng dữ liệu sẽ là một đơn vị; các đơn vị phải cùng loại và làm cùng một việc.',
                                     'Which kind of unit do you want to compare? Each row of the data table will be one unit; units must be of the same kind and do the same job.'); },
          widget: function () {
              return optionButtons(ORDER.map(function (k) { var i = IND[k]; return { v: k, label: t(i.vi, i.en), sub: t(i.about_vi, i.about_en), icon: i.icon }; }),
                  A.industry || preset, function (v) { answer('industry', v); });
          },
          say: function () { var i = ind(); return i ? t(i.vi, i.en) : ''; } },

        { id: 'unitName', when: function () { return A.industry === 'custom'; },
          ask: function () { return t('Đơn vị của doanh nghiệp là gì? Ví dụ: nhà máy, dự án, tổ bảo trì, kho hàng.', 'What are your units? For example: plants, projects, maintenance teams, warehouses.'); },
          widget: function () {
              var box = el('div'); var inp = el('input', 'w-full border border-gray-300 rounded-md px-3 py-2'); inp.type = 'text'; inp.maxLength = 60; inp.value = A.unitName || '';
              inp.setAttribute('placeholder', t('Ví dụ: nhà máy', 'For example: plant')); inp.setAttribute('aria-label', t('Loại đơn vị', 'Kind of unit'));
              var err = errLine(); var go = continueBtn();
              function ok() { var v = inp.value.trim(); if (!v) { err.textContent = t('Ghi loại đơn vị trước khi tiếp tục.', 'Enter the kind of unit to continue.'); err.hidden = false; return; } answer('unitName', v); }
              go.addEventListener('click', ok); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok(); });
              box.appendChild(inp); box.appendChild(err); box.appendChild(go); return box;
          },
          say: function () { return A.unitName; } },

        { id: 'units',
          ask: function () { return t('Doanh nghiệp có khoảng bao nhiêu ' + esc(unitWord()) + ' có số liệu trong cùng một kỳ? Khung Hiệu Quả so sánh các đơn vị với nhau nên cần đủ số đơn vị: với 3 đầu vào và 3 đầu ra cần tối thiểu 18.',
                                     'Roughly how many ' + esc(unitWord()) + ' units have data for the same period? The Efficiency Framework compares units with each other, so it needs enough of them: 3 inputs and 3 outputs need at least 18.'); },
          widget: function () { return optionButtons(BRACKETS.map(function (b) { return { v: b.v, label: t(b.vi, b.en) }; }), A.units, function (v) { answer('units', v); }); },
          say: function () { var b = bracket(); return b ? t(b.vi, b.en) : ''; } },

        { id: 'small', when: function () { return A.units === 'lt18'; },
          ask: function () { return t('Dưới 18 đơn vị thì nhiều đơn vị sẽ cùng đạt điểm tối đa và kết quả khó phân biệt. Doanh nghiệp chọn hướng nào?',
                                     'With fewer than 18 units, many of them reach the top score and results are hard to tell apart. Which way do you prefer?'); },
          widget: function () {
              return optionButtons([
                  { v: 'monthly', label: t('Dùng số liệu theo tháng', 'Use monthly data'), sub: t('Mỗi đơn vị trong mỗi tháng là một dòng. Kết quả cần đọc thận trọng hơn vì các dòng của cùng một đơn vị không độc lập với nhau.', 'Each unit in each month is one row. Results need more care because rows from the same unit are not independent.') },
                  { v: 'fewer', label: t('Bớt chỉ số', 'Use fewer indicators'), sub: t('Dùng 2 đầu vào và 1 đến 2 đầu ra để hạ mức tối thiểu xuống 9 đến 12 đơn vị.', 'Use 2 inputs and 1 or 2 outputs, which lowers the minimum to 9 to 12 units.') },
                  { v: 'talk', label: t('Trao đổi với chuyên gia trước', 'Talk to the expert first'), sub: t('Vẫn nhận phiếu; TS. Nguyễn Hoàng Phú sẽ liên hệ để chọn cách làm.', 'You still get the template; Dr. Hoang-Phu Nguyen will contact you to choose an approach.') }
              ], A.small, function (v) { answer('small', v); });
          },
          say: function () { return { monthly: t('Dùng số liệu theo tháng', 'Use monthly data'), fewer: t('Bớt chỉ số', 'Use fewer indicators'), talk: t('Trao đổi với chuyên gia trước', 'Talk to the expert first') }[A.small] || ''; } },

        { id: 'period',
          ask: function () { return t('Số liệu sẽ lấy theo kỳ nào? Mọi ' + esc(unitWord()) + ' phải dùng cùng một kỳ.', 'Which period will the data cover? Every unit must use the same period.'); },
          widget: function () {
              var box = el('div'); var sel = A.period ? A.period.type : null;
              var pills = el('div', 'flex flex-wrap gap-2');
              function draw() {
                  pills.innerHTML = '';
                  PERIODS.forEach(function (p) {
                      var b = el('button', 'px-4 py-2 rounded-full border text-sm font-medium transition ' + (sel === p[0] ? 'border-primary bg-primary text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300'));
                      b.type = 'button'; b.textContent = t(p[1], p[2]); b.setAttribute('aria-pressed', sel === p[0]);
                      b.addEventListener('click', function () { sel = p[0]; err.hidden = true; draw(); });
                      pills.appendChild(b);
                  });
              }
              var inp = el('input', 'mt-3 w-full border border-gray-300 rounded-md px-3 py-2 text-sm'); inp.type = 'text'; inp.maxLength = 80; inp.value = A.period ? A.period.text : '';
              inp.setAttribute('placeholder', t('Kỳ cụ thể (không bắt buộc), ví dụ: Quý 3/2026', 'Exact period (optional), for example: Q3 2026'));
              inp.setAttribute('aria-label', t('Kỳ cụ thể', 'Exact period'));
              var err = errLine(); var go = continueBtn();
              go.addEventListener('click', function () { if (!sel) { err.textContent = t('Chọn một kỳ.', 'Choose a period.'); err.hidden = false; return; } answer('period', { type: sel, text: inp.value.trim() }); });
              draw(); box.appendChild(pills); box.appendChild(inp); box.appendChild(err); box.appendChild(go); return box;
          },
          say: function () { if (!A.period) return ''; var p = PERIODS.filter(function (x) { return x[0] === A.period.type; })[0]; return t(p[1], p[2]) + (A.period.text ? ' · ' + A.period.text : ''); } },

        { id: 'inputs',
          ask: function () { return t('<b>Đầu vào</b> là nguồn lực mỗi ' + esc(unitWord()) + ' dùng: người, tiền, diện tích, hàng hoá. ' + (A.industry === 'custom' ? 'Ghi tên từng nguồn lực doanh nghiệp có số liệu, kèm đơn vị đo.' : 'Doanh nghiệp có số liệu nào dưới đây cho từng ' + esc(unitWord()) + '? Bỏ chọn chỉ số không có số liệu.'),
                                     '<b>Inputs</b> are the resources each unit uses: people, money, space, goods. ' + (A.industry === 'custom' ? 'Name each resource you have figures for, with its unit of measure.' : 'Which of these do you have figures for? Untick any you do not have.')); },
          widget: function () { return indicatorPicker('inputs', t('Ngành của bạn đo nguồn lực theo cách khác thì thêm ở đây, kèm đơn vị đo trong ngoặc. Tiền ghi theo đồng.', 'If your business measures resources differently, add them here with the unit in brackets. Money in VND.')); },
          say: function () { return listText(A.inputs); } },

        { id: 'outputs',
          ask: function () { return t('<b>Đầu ra</b> là kết quả mỗi ' + esc(unitWord()) + ' tạo ra, số càng lớn càng tốt: doanh thu, sản lượng, số khách. ' + (A.industry === 'custom' ? 'Ghi tên từng kết quả, kèm đơn vị đo.' : 'Doanh nghiệp có số liệu nào dưới đây?'),
                                     '<b>Outputs</b> are the results each unit produces, where more is better: revenue, volume, customers. ' + (A.industry === 'custom' ? 'Name each result with its unit of measure.' : 'Which of these do you have figures for?')); },
          widget: function () { return indicatorPicker('outputs', t('Chỉ số càng thấp càng tốt (khiếu nại, hàng huỷ) không đưa vào đây; ghi ở phần ghi chú phía sau nếu muốn theo dõi.', 'Indicators where lower is better (complaints, waste) do not go here; mention them in the notes later if you want them tracked.')); },
          say: function () { return listText(A.outputs); } },

        { id: 'conds',
          ask: function () { return t('<b>Điều kiện</b> là bối cảnh và cách làm của từng ' + esc(unitWord()) + ', ghi Có hoặc Không: vị trí, hợp đồng, đào tạo, công cụ quản lý. Phần này trả lời câu hỏi vì sao đơn vị này hiệu quả hơn đơn vị kia. Chọn các điều kiện doanh nghiệp ghi nhận được.',
                                     '<b>Conditions</b> describe each unit’s context and practices, recorded as Yes or No: location, contracts, training, management tools. They answer why one unit does better than another. Tick the ones you can record.'); },
          widget: function () { return indicatorPicker('conds', t('Thêm điều kiện riêng mà bạn cho là ảnh hưởng tới kết quả. Nên giữ tổng số điều kiện từ 6 trở xuống.', 'Add conditions you believe affect results. Keep the total to 6 or fewer if you can.')); },
          say: function () { return listText(A.conds); } },

        { id: 'goals',
          ask: function () { return t('Doanh nghiệp muốn dùng kết quả để làm gì? Chọn một hoặc nhiều.', 'What will you use the results for? Choose one or more.'); },
          widget: function () {
              var box = el('div'); var picked = (A.goals && A.goals.list) ? A.goals.list.slice() : [];
              var list = el('div', 'grid gap-2');
              GOALS.forEach(function (g) {
                  var lab = el('label', 'check'); var cb = el('input'); cb.type = 'checkbox'; cb.checked = picked.indexOf(g[0]) >= 0;
                  cb.addEventListener('change', function () { var k = picked.indexOf(g[0]); if (cb.checked && k < 0) picked.push(g[0]); if (!cb.checked && k >= 0) picked.splice(k, 1); });
                  lab.appendChild(cb); lab.appendChild(el('span', 'font-medium text-dark', esc(t(g[1], g[2])))); list.appendChild(lab);
              });
              var note = el('textarea', 'mt-3 w-full border border-gray-300 rounded-md px-3 py-2 text-sm'); note.rows = 3; note.maxLength = 800; note.value = (A.goals && A.goals.note) || '';
              note.setAttribute('placeholder', t('Ghi chú cho nhóm phân tích (không bắt buộc): bối cảnh, chỉ số muốn theo dõi thêm, câu hỏi cụ thể', 'Notes for the analysis team (optional): context, extra indicators to track, specific questions'));
              note.setAttribute('aria-label', t('Ghi chú', 'Notes'));
              var err = errLine(); var go = continueBtn();
              go.addEventListener('click', function () {
                  if (!picked.length && !note.value.trim()) { err.textContent = t('Chọn ít nhất một mục đích, hoặc ghi mục đích của bạn vào ô ghi chú.', 'Choose at least one purpose, or write yours in the notes.'); err.hidden = false; return; }
                  answer('goals', { list: GOALS.map(function (g) { return g[0]; }).filter(function (x) { return picked.indexOf(x) >= 0; }), note: note.value.trim() });
              });
              box.appendChild(list); box.appendChild(note); box.appendChild(err); box.appendChild(go); return box;
          },
          say: function () {
              if (!A.goals) return '';
              var g = A.goals.list.map(function (x) { var r = GOALS.filter(function (y) { return y[0] === x; })[0]; return t(r[1], r[2]); });
              return (g.join('; ') || t('Mục đích khác', 'Other purpose')) + (A.goals.note ? ' · ' + t('có ghi chú', 'with notes') : '');
          } },

        { id: 'orient',
          ask: function () { return t('Khi một ' + esc(unitWord()) + ' chưa hiệu quả, doanh nghiệp muốn cải thiện theo hướng nào?', 'When a unit falls short, which way do you want it to improve?'); },
          widget: function () { return optionButtons(ORIENT.map(function (o) { return { v: o[0], label: t(o[1], o[2]), sub: t(o[3], o[4]) }; }), A.orient, function (v) { answer('orient', v); }); },
          say: function () { var o = ORIENT.filter(function (x) { return x[0] === A.orient; })[0]; return o ? t(o[1], o[2]) : ''; } },

        { id: 'personal',
          ask: function () { return t('Mỗi dòng dữ liệu có gắn với một người hoặc một hộ cụ thể không? Câu hỏi này cần cho phần pháp lý: dữ liệu về từng người (kể cả khi chỉ ghi mã) là dữ liệu cá nhân theo Luật Bảo vệ dữ liệu cá nhân.',
                                     'Does each row describe a specific person or household? This matters legally: data about individuals (even under codes) is personal data under Vietnam\u2019s Personal Data Protection Law.'); },
          widget: function () {
              return optionButtons([
                  { v: 'yes', label: t('Có, mỗi dòng là một người hoặc một hộ', 'Yes, each row is a person or household'), sub: t('Ví dụ: nhân viên kinh doanh, hộ trồng, thương lái hay đại lý là cá nhân, cộng tác viên.', 'For example: salespeople, farm households, individual traders or agents, freelancers.') },
                  { v: 'no', label: t('Không, mỗi dòng là một cơ sở hay một sự kiện', 'No, each row is a site or an event'), sub: t('Ví dụ: cửa hàng, chi nhánh, trạm y tế, khoa, phiên livestream.', 'For example: stores, branches, clinics, faculties, livestream sessions.') }
              ], A.personal || (A.industry === 'sales' || A.industry === 'farm' ? 'yes' : null), function (v) { answer('personal', v); });
          },
          say: function () { return A.personal === 'yes' ? t('Có, mỗi dòng là một người hoặc một hộ', 'Yes, each row is a person or household') : A.personal === 'no' ? t('Không, mỗi dòng là một cơ sở hay một sự kiện', 'No, each row is a site or an event') : ''; } },

        { id: 'review',
          ask: function () { return t('Đây là bộ chỉ số sẽ dùng. Kiểm tra lại trước khi sang bước đồng ý.', 'Here is the indicator set. Check it before moving on to consent.'); },
          widget: function () {
              reached = true;
              var c = counts(), b = bracket(), i = ind();
              var box = el('div');
              var rows = [
                  ['industry', t('Loại đơn vị', 'Unit type'), (i ? t(i.vi, i.en) : '') + (A.industry === 'custom' && A.unitName ? ' · ' + A.unitName : '')],
                  ['units', t('Số đơn vị', 'Number of units'), b ? t(b.vi, b.en) : ''],
                  ['period', t('Kỳ dữ liệu', 'Period'), STEPS[idx('period')].say()],
                  ['inputs', t('Đầu vào', 'Inputs') + ' (' + c.m + ')', listText(A.inputs)],
                  ['outputs', t('Đầu ra', 'Outputs') + ' (' + c.s + ')', listText(A.outputs)],
                  ['conds', t('Điều kiện', 'Conditions') + ' (' + c.k + ')', listText(A.conds)],
                  ['goals', t('Mục đích', 'Purpose'), STEPS[idx('goals')].say()],
                  ['orient', t('Hướng cải thiện', 'Improvement direction'), STEPS[idx('orient')].say()],
                  ['personal', t('Dữ liệu từng người', 'Person-level data'), A.personal === 'yes' ? t('Có', 'Yes') : t('Không', 'No')]
              ];
              var tbl = el('div', 'divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white');
              rows.forEach(function (r) {
                  var line = el('div', 'flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 px-4 py-3');
                  line.appendChild(el('div', 'sm:w-40 shrink-0 text-sm font-semibold text-gray-500', esc(r[1])));
                  line.appendChild(el('div', 'flex-1 min-w-0 text-sm text-dark', esc(r[2])));
                  var ed = el('button', 'self-start text-sm text-primary hover:underline underline-offset-2'); ed.type = 'button'; ed.textContent = t('Sửa', 'Edit');
                  ed.addEventListener('click', function () { goTo(r[0]); });
                  line.appendChild(ed); tbl.appendChild(line);
              });
              box.appendChild(tbl);
              // Sample-size and design checks, same rule as the tool: n >= max(m*s, 3(m+s)), ideally twice that
              var notes = [];
              if (b && b.lo != null) {
                  if (b.hi < c.need) notes.push(['warn', t('Với ' + c.m + ' đầu vào và ' + c.s + ' đầu ra cần tối thiểu ' + c.need + ' đơn vị, nhiều hơn số doanh nghiệp đang có. Nên bớt chỉ số, hoặc chọn dùng số liệu theo tháng.', nIn(c.m) + ' and ' + nOut(c.s) + ' need at least ' + c.need + ' units, more than you have. Drop some indicators, or use monthly data.')]);
                  else if (b.lo < 2 * c.need) notes.push(['info', t('Với ' + c.m + ' đầu vào và ' + c.s + ' đầu ra cần tối thiểu ' + c.need + ' đơn vị, nên có từ ' + (2 * c.need) + ' trở lên để kết quả phân biệt tốt.', nIn(c.m) + ' and ' + nOut(c.s) + ' need at least ' + c.need + ' units; ' + (2 * c.need) + ' or more separates units well.')]);
                  else notes.push(['ok', t('Số đơn vị đủ cho ' + c.m + ' đầu vào và ' + c.s + ' đầu ra (tối thiểu ' + c.need + ').', 'Enough units for ' + nIn(c.m) + ' and ' + nOut(c.s) + ' (minimum ' + c.need + ').')]);
              } else if (b) notes.push(['info', t('Với bộ chỉ số này cần tối thiểu ' + c.need + ' đơn vị có số liệu.', 'This indicator set needs at least ' + c.need + ' units with data.')]);
              var nExtra = (A.inputs ? A.inputs.extra.length : 0) + (A.outputs ? A.outputs.extra.length : 0) + (A.conds ? A.conds.extra.length : 0);
              if (nExtra) notes.push(['info', t('Có ' + nExtra + ' chỉ số ngoài bộ khuyến nghị. Thêm các chỉ số này thành cột bên phải cột Ghi chú trong phiếu; chuyên gia sẽ xem xét trước khi đưa vào chấm điểm.', nExtra + (nExtra === 1 ? ' indicator is' : ' indicators are') + ' outside the recommended set. Add ' + (nExtra === 1 ? 'it' : 'them') + ' as columns to the right of the Notes column; the expert reviews them before scoring.')]);
              var nMiss = (A.inputs ? A.inputs.missing.length : 0) + (A.outputs ? A.outputs.missing.length : 0) + (A.conds ? A.conds.missing.length : 0);
              if (nMiss) notes.push(['info', t('Cột khuyến nghị không có số liệu: để trống cả cột trong phiếu, không xoá cột.', 'Recommended columns without data: leave the whole column empty, do not delete it.')]);
              if (A.personal === 'yes') notes.push(['warn', t('Dữ liệu gắn với từng người: doanh nghiệp cần có căn cứ hợp pháp để chia sẻ (ví dụ sự đồng ý của nhân viên hoặc hộ trồng), và hai bên ký thoả thuận xử lý dữ liệu trước khi gửi file.', 'Person-level data: your company needs a lawful basis to share it (for example the consent of the staff or farmers), and both sides sign a data processing agreement before the file is sent.')]);
              if (!c.k) notes.push(['warn', t('Chưa có điều kiện nào: kết quả sẽ có điểm hiệu quả nhưng chưa có công thức thành công.', 'No conditions yet: you will get efficiency scores but no success recipes.')]);
              else if (c.k > 6) notes.push(['info', t(c.k + ' điều kiện là khá nhiều; chuyên gia có thể đề nghị giữ 6 điều kiện quan trọng nhất.', c.k + ' conditions is a lot; the expert may suggest keeping the 6 most important.')]);
              var nb = el('div', 'grid gap-2 mt-4');
              notes.forEach(function (n) {
                  var cls = n[0] === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-900' : n[0] === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-blue-50 border-blue-100 text-blue-900';
                  var ic = n[0] === 'warn' ? 'fa-triangle-exclamation' : n[0] === 'ok' ? 'fa-circle-check' : 'fa-circle-info';
                  nb.appendChild(el('div', 'flex gap-3 text-sm border rounded-lg px-4 py-3 ' + cls, '<i class="fa-solid ' + ic + ' mt-0.5"></i><span>' + esc(n[1]) + '</span>'));
              });
              box.appendChild(nb);
              var go = continueBtn(t('Đúng, sang bước đồng ý', 'Looks right, go to consent'));
              go.addEventListener('click', function () { answer('review', true); });
              box.appendChild(go); return box;
          },
          say: function () { return t('Bộ chỉ số đã đúng', 'The indicator set is right'); } },

        { id: 'consent',
          ask: function () { return t('Trước khi nhận phiếu, hãy đọc <a href="#cam-ket" class="text-primary underline underline-offset-2">thông báo xử lý dữ liệu và các cam kết</a> (phiên bản ' + VERSION + ', ' + VDATE + ') ở cuối trang, rồi chọn từng mục bạn đồng ý. Tóm tắt: dữ liệu dùng để phân tích cho doanh nghiệp; file lưu theo mã hồ sơ, không theo tên; lưu trên dịch vụ Google, máy chủ có thể ở ngoài Việt Nam; lưu trữ lâu dài và xoá ngay khi doanh nghiệp yêu cầu; không bán, không chuyển cho bên thứ ba; mỗi mục đích khác cần một lần đồng ý riêng.',
                                     'Before receiving the template, read <a href="#cam-ket" class="text-primary underline underline-offset-2">the data processing notice and commitments</a> (version ' + VERSION + ', ' + VDATE + ') at the bottom of this page, then tick each item you agree to. In short: data is used to analyse your units; files are stored under a case code, not your name; storage uses Google services whose servers may be outside Vietnam; data is kept long term and deleted as soon as you ask; nothing is sold or passed to third parties; every other purpose needs its own consent.'); },
          widget: function () {
              var box = el('div'); var prev = A.consent || {};
              var items = [
                  ['authority', true, t('Tôi có thẩm quyền chia sẻ dữ liệu hoạt động của các đơn vị này thay mặt doanh nghiệp.', 'I am authorised to share operating data on these units on behalf of the company.')],
                  ['commitments', true, t('Tôi đã đọc thông báo xử lý dữ liệu và các cam kết, phiên bản ' + VERSION + '.', 'I have read the data processing notice and commitments, version ' + VERSION + '.')],
                  ['dataUse', true, t('Tôi đồng ý cung cấp dữ liệu và cho phép TS. Nguyễn Hoàng Phú cùng nhóm phân tích xử lý dữ liệu này và thông tin liên hệ của tôi để phân tích hiệu quả các đơn vị và gửi kết quả, kể cả lưu trữ và gửi email qua dịch vụ Google có máy chủ có thể đặt ngoài Việt Nam.', 'I agree to provide the data and allow Dr. Hoang-Phu Nguyen and the analysis team to process it, and my contact details, to analyse our units and deliver the results, including storage and email through Google services whose servers may be outside Vietnam.')]
              ];
              if (A.personal === 'yes') items.push(['personalBasis', true, t('Dữ liệu gắn với từng người: doanh nghiệp đã có căn cứ hợp pháp để chia sẻ dữ liệu này (ví dụ sự đồng ý của người lao động hoặc hộ trồng), và đồng ý ký thoả thuận xử lý dữ liệu trước khi gửi file.', 'Person-level data: our company has a lawful basis to share these data (for example the consent of the staff or farmers) and agrees to sign a data processing agreement before sending the file.')]);
              items.push(['marketing', false, t('Không bắt buộc: tôi đồng ý nhận thông tin giới thiệu dịch vụ tư vấn liên quan tới kết quả qua email hoặc điện thoại, và có thể từ chối bất kỳ lúc nào.', 'Optional: I agree to receive information about consulting services related to the results by email or phone, and can opt out at any time.')]);
              items.push(['research', false, t('Không bắt buộc: tôi đồng ý cho dùng dữ liệu đã ẩn danh hoàn toàn, ở dạng tổng hợp, cho nghiên cứu khoa học và giảng dạy.', 'Optional: I allow fully anonymised, aggregated data to be used for research and teaching.')]);
              var state = {}; var list = el('div', 'grid gap-2'); var labs = {};
              items.forEach(function (it) {
                  state[it[0]] = !!prev[it[0]];
                  var lab = el('label', 'check' + (it[1] ? '' : ' bg-gray-50')); var cb = el('input'); cb.type = 'checkbox'; cb.checked = state[it[0]];
                  cb.addEventListener('change', function () { state[it[0]] = cb.checked; lab.classList.remove('req-missing'); upd(); });
                  lab.appendChild(cb); lab.appendChild(el('span', 'text-sm text-dark leading-relaxed', (it[1] ? '<span class="text-red-700 font-bold" aria-hidden="true">* </span>' : '') + esc(it[2])));
                  labs[it[0]] = lab; list.appendChild(lab);
              });
              var go = continueBtn(t('Xác nhận đồng ý', 'Confirm consent'));
              function upd() { go.disabled = !(state.authority && state.commitments && state.dataUse && (A.personal !== 'yes' || state.personalBasis)); }
              go.addEventListener('click', function () {
                  if (go.disabled) return;
                  answer('consent', { authority: true, commitments: true, dataUse: true, personalBasis: A.personal === 'yes' ? true : false,
                                      marketing: !!state.marketing, research: !!state.research, at: new Date().toISOString() });
              });
              upd(); box.appendChild(list);
              box.appendChild(el('p', 'text-xs text-gray-500 mt-2', esc(t('Ô có dấu * là bắt buộc. Hai ô không bắt buộc là hai mục đích riêng, không chọn vẫn tham gia bình thường.', 'Items marked * are required. The two optional boxes are separate purposes; you can take part without them.'))));
              box.appendChild(go); return box;
          },
          say: function () {
              if (!A.consent) return '';
              var extra = [];
              if (A.consent.marketing) extra.push(t('nhận giới thiệu dịch vụ', 'service information'));
              if (A.consent.research) extra.push(t('dùng ẩn danh cho nghiên cứu, giảng dạy', 'anonymised research and teaching use'));
              return t('Tôi đồng ý (phiên bản ' + VERSION + ')', 'I agree (version ' + VERSION + ')') + (extra.length ? t(', kể cả ', ', including ') + extra.join(t(' và ', ' and ')) : '');
          } },

        { id: 'contact',
          ask: function () { return t('Phiếu sẽ được gửi tới email bạn nhập dưới đây, kèm bản sao các mục bạn vừa đồng ý. Thông tin liên hệ được lưu riêng, dùng để liên lạc và gửi kết quả' + (A.consent && A.consent.marketing ? ', và giới thiệu dịch vụ tư vấn như bạn đã đồng ý' : '') + '; trong file dữ liệu, doanh nghiệp chỉ được nhận diện bằng mã hồ sơ.',
                                     'The template will be sent to the email below, with a copy of what you just agreed to. Contact details are stored separately and used to reach you and deliver the results' + (A.consent && A.consent.marketing ? ', and to share consulting information as you agreed' : '') + '; in the data file your company is identified only by a case code.'); },
          widget: function () {
              var c = A.contact || {};
              var form = el('form', 'grid gap-4 sm:grid-cols-2'); form.noValidate = true;
              var fields = [
                  ['name', t('Họ và tên', 'Full name'), 'text', true, 'name'],
                  ['role', t('Chức vụ', 'Job title'), 'text', true, 'organization-title'],
                  ['email', t('Email công việc', 'Work email'), 'email', true, 'email'],
                  ['company', t('Tên doanh nghiệp', 'Company name'), 'text', true, 'organization'],
                  ['phone', t('Số điện thoại (không bắt buộc)', 'Phone (optional)'), 'tel', false, 'tel']
              ];
              var inputs = {};
              fields.forEach(function (f) {
                  var w = el('div', 'field' + (f[0] === 'phone' ? ' sm:col-span-2' : ''));
                  var id = 'c-' + f[0];
                  w.appendChild(el('label', '', esc(f[1]) + (f[3] ? ' <span class="text-red-700" aria-hidden="true">*</span>' : ''))).setAttribute('for', id);
                  var inp = el('input'); inp.id = id; inp.type = f[2]; inp.maxLength = f[0] === 'email' ? 120 : 150; inp.value = c[f[0]] || ''; inp.autocomplete = f[4]; if (f[3]) inp.required = true;
                  w.appendChild(inp);
                  w.appendChild(el('div', 'err', esc(f[0] === 'email' ? t('Nhập một địa chỉ email hợp lệ.', 'Enter a valid email address.') : t('Không được để trống.', 'This field is required.'))));
                  inputs[f[0]] = inp; form.appendChild(w);
              });
              // honeypot: hidden from people, bots tend to fill it
              var hp = el('div', '', '<label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label>');
              hp.style.cssText = 'position:absolute;left:-5000px;width:1px;height:1px;overflow:hidden'; hp.setAttribute('aria-hidden', 'true');
              form.appendChild(hp);
              var foot = el('div', 'sm:col-span-2');
              var err = errLine(); var go = continueBtn(t('Gửi và nhận phiếu qua email', 'Send and get the template by email')); go.type = 'submit';
              var status = el('p', 'text-sm text-gray-600 mt-3'); status.hidden = true; status.setAttribute('aria-live', 'polite');
              foot.appendChild(err); foot.appendChild(go); foot.appendChild(status); form.appendChild(foot);
              form.addEventListener('submit', function (e) {
                  e.preventDefault(); err.hidden = true;
                  var ok = true, v = {};
                  Object.keys(inputs).forEach(function (k) {
                      var val = inputs[k].value.replace(/\s+/g, ' ').trim(); v[k] = val;
                      var bad = (inputs[k].required && !val) || (k === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val));
                      inputs[k].parentElement.classList.toggle('invalid', bad); if (bad) ok = false;
                  });
                  if (!ok) { err.textContent = t('Kiểm tra lại các ô đánh dấu đỏ.', 'Check the fields marked in red.'); err.hidden = false; return; }
                  A.contact = v;
                  send(hp.querySelector('input').value, go, status, err);
              });
              return form;
          },
          say: function () { return A.contact ? A.contact.name + ' · ' + A.contact.email : ''; } },

        { id: 'done',
          ask: function () {
              if (!result) return '';
              var i = ind();
              if (result.mode === 'auto') {
                  return t('<p><b>Đã gửi.</b> Phiếu dữ liệu và tóm tắt bộ chỉ số đã được gửi tới <b>' + esc(result.email) + '</b>. Mã hồ sơ của doanh nghiệp: <b class="step-no">' + esc(result.code) + '</b>. Không thấy email sau vài phút thì kiểm tra mục Spam hoặc Quảng cáo.</p>' + (A.personal === 'yes' ? '<p class="mt-2"><b>Lưu ý:</b> vì mỗi dòng gắn với một người hoặc một hộ, vui lòng chưa gửi file cho tới khi hai bên ký thoả thuận xử lý dữ liệu. TS. Nguyễn Hoàng Phú sẽ liên hệ.</p>' : ''),
                           '<p><b>Sent.</b> The data template and the indicator summary have been sent to <b>' + esc(result.email) + '</b>. Your case code: <b class="step-no">' + esc(result.code) + '</b>. If the email has not arrived within a few minutes, check your spam or promotions folder.</p>' + (A.personal === 'yes' ? '<p class="mt-2"><b>Note:</b> because each row describes a person or household, please do not send the file until both sides have signed a data processing agreement. Dr. Hoang-Phu Nguyen will contact you.</p>' : '')) + nextSteps(result.code);
              }
              return t('<p>Hệ thống gửi email tự động đang tạm dừng, nên bạn nhận phiếu ngay tại đây. Hãy gửi bản ghi đồng ý dưới đây tới <b>' + esc(MAIL) + '</b> để nhóm phân tích nhận được và cấp mã hồ sơ.</p>',
                       '<p>Automatic email is paused, so you can get the template right here. Please send the consent record below to <b>' + esc(MAIL) + '</b> so the team receives it and issues your case code.</p>') + nextSteps(null);
          },
          widget: function () {
              if (!result || result.mode === 'auto') return null;
              var i = ind(); var box = el('div', 'grid gap-3');
              var row = el('div', 'flex flex-col sm:flex-row gap-3');
              var dl = el('a', 'px-5 py-2.5 bg-primary text-white rounded-md font-medium hover:bg-blue-800 transition inline-flex items-center gap-2 justify-center', '<i class="fa-solid fa-file-arrow-down"></i> ' + esc(t('Tải phiếu dữ liệu', 'Download the template')));
              dl.href = 'mau/' + i.file; dl.setAttribute('download', '');
              var rec = record();
              var ml = el('a', 'px-5 py-2.5 bg-white text-primary border border-primary rounded-md font-medium hover:bg-blue-50 transition inline-flex items-center gap-2 justify-center', '<i class="fa-solid fa-envelope"></i> ' + esc(t('Mở email soạn sẵn', 'Open a pre-filled email')));
              ml.href = 'mailto:' + MAIL + '?subject=' + encodeURIComponent(t('[Khung Hiệu Quả] Đồng ý tham gia', '[Efficiency Framework] Consent to take part') + ': ' + A.contact.company) + '&body=' + encodeURIComponent(rec);
              row.appendChild(dl); row.appendChild(ml); box.appendChild(row);
              var pre = el('pre', 'record bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-72 overflow-auto'); pre.textContent = rec;
              var cp = el('button', 'self-start text-sm text-primary hover:underline underline-offset-2'); cp.type = 'button'; cp.textContent = t('Sao chép bản ghi đồng ý', 'Copy the consent record');
              cp.addEventListener('click', function () { copyText(rec, cp); });
              box.appendChild(pre); box.appendChild(cp); return box;
          },
          say: null }
    ];

    function nextSteps(code) {
        var up = 'gui-du-lieu.html' + (code ? '?ma=' + encodeURIComponent(code) : '');
        return t('<p class="mt-3 font-semibold">Việc tiếp theo</p><ol class="list-decimal pl-5 mt-1 space-y-1"><li>Điền phiếu ở trang DAT, mỗi dòng một đơn vị, dùng mã thay cho tên.</li><li>Mở trang Kiểm tra trong phiếu, sửa tới khi mọi dòng ghi "Đạt".</li><li>Gửi file: tải lên ở trang <a class="text-primary underline underline-offset-2" href="' + up + '">Gửi dữ liệu</a>' + (code ? ' với mã hồ sơ trên' : '') + ', hoặc trả lời email kèm file.</li></ol>',
                 '<p class="mt-3 font-semibold">Next steps</p><ol class="list-decimal pl-5 mt-1 space-y-1"><li>Fill in the DAT sheet, one unit per row, using codes instead of names.</li><li>Open the Check sheet in the file and fix it until every row says "Đạt".</li><li>Send the file: upload it on the <a class="text-primary underline underline-offset-2" href="' + up + '">Send data</a> page' + (code ? ' with the case code above' : '') + ', or reply to the email with the file attached.</li></ol>');
    }

    function copyText(txt, btn) {
        var done = function () { var o = btn.textContent; btn.textContent = t('Đã sao chép', 'Copied'); setTimeout(function () { btn.textContent = o; }, 1800); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallback(); });
        else fallback();
        function fallback() { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { /* user can select the text */ } document.body.removeChild(ta); }
    }

    // ---------------------------------------------------------------- payload and record
    function payload(hp) {
        var i = ind();
        return {
            action: 'register', lang: lang(), consentVersion: VERSION, consentDate: VDATE, consent: A.consent, contact: A.contact,
            industry: A.industry, industryLabel: i ? i.vi : '', unitName: A.unitName || '', units: A.units, small: A.small || '', personalUnits: A.personal === 'yes' ? 'yes' : 'no',
            period: A.period, inputs: A.inputs, outputs: A.outputs, conds: A.conds, goals: A.goals, orient: A.orient,
            page: location.origin + location.pathname, clientTime: new Date().toISOString(), hp: hp || ''
        };
    }
    function record() {
        var i = ind(), b = bracket(), p = STEPS[idx('period')].say();
        var L = [];
        L.push(t('BẢN GHI ĐỒNG Ý THAM GIA KHUNG HIỆU QUẢ', 'KHUNG HIỆU QUẢ CONSENT RECORD'));
        L.push(t('Thời điểm', 'Time') + ': ' + (A.consent ? A.consent.at : new Date().toISOString()));
        L.push(t('Phiên bản cam kết', 'Commitments version') + ': ' + VERSION + ' (' + VDATE + ')');
        L.push(t('Doanh nghiệp', 'Company') + ': ' + A.contact.company);
        L.push(t('Người liên hệ', 'Contact') + ': ' + A.contact.name + ', ' + A.contact.role + ', ' + A.contact.email + (A.contact.phone ? ', ' + A.contact.phone : ''));
        L.push('');
        L.push(t('Xác nhận', 'Confirmations') + ':');
        L.push('[x] ' + t('Có thẩm quyền chia sẻ dữ liệu thay mặt doanh nghiệp', 'Authorised to share the data on behalf of the company'));
        L.push('[x] ' + t('Đã đọc thông báo xử lý dữ liệu và các cam kết', 'Has read the data processing notice and commitments'));
        L.push('[x] ' + t('Đồng ý cung cấp dữ liệu và cho phép xử lý để phân tích hiệu quả các đơn vị và gửi kết quả, kể cả lưu trữ và gửi email qua dịch vụ Google có máy chủ có thể đặt ngoài Việt Nam', 'Agrees to provide the data and allow its processing to analyse the units and deliver the results, including storage and email via Google services whose servers may be outside Vietnam'));
        if (A.personal === 'yes') L.push('[x] ' + t('Dữ liệu gắn với từng người: đã có căn cứ hợp pháp để chia sẻ, đồng ý ký thoả thuận xử lý dữ liệu trước khi gửi file', 'Person-level data: lawful basis to share confirmed; agrees to sign a data processing agreement before sending'));
        L.push((A.consent && A.consent.marketing ? '[x] ' : '[ ] ') + t('Đồng ý nhận thông tin giới thiệu dịch vụ tư vấn (không bắt buộc)', 'Agrees to receive consulting service information (optional)'));
        L.push((A.consent && A.consent.research ? '[x] ' : '[ ] ') + t('Đồng ý dùng dữ liệu đã ẩn danh cho nghiên cứu và giảng dạy (không bắt buộc)', 'Allows anonymised use for research and teaching (optional)'));
        L.push('');
        L.push(t('Loại đơn vị', 'Unit type') + ': ' + (i ? i.vi : '') + (A.unitName ? ' (' + A.unitName + ')' : ''));
        L.push(t('Số đơn vị', 'Number of units') + ': ' + (b ? b.vi : '') + (A.small ? ' · ' + STEPS[idx('small')].say() : ''));
        L.push(t('Kỳ dữ liệu', 'Period') + ': ' + p);
        ['inputs', 'outputs', 'conds'].forEach(function (r) {
            var v = A[r]; if (!v) return;
            L.push(t(ROLE[r].vi, ROLE[r].en) + ': ' + (v.use.concat(v.extra).join('; ') || t('không có', 'none')));
            if (v.extra.length) L.push('  ' + t('Chỉ số thêm', 'Added') + ': ' + v.extra.join('; '));
            if (v.missing.length) L.push('  ' + t('Không có số liệu', 'No data') + ': ' + v.missing.join('; '));
        });
        L.push(t('Mục đích', 'Purpose') + ': ' + STEPS[idx('goals')].say());
        if (A.goals && A.goals.note) L.push(t('Ghi chú', 'Notes') + ': ' + A.goals.note);
        L.push(t('Hướng cải thiện', 'Improvement direction') + ': ' + STEPS[idx('orient')].say());
        return L.join('\n');
    }

    function send(hp, btn, status, err) {
        if (!CFG.endpoint) { result = { mode: 'manual' }; cur = idx('done'); render(); return; }
        btn.disabled = true; status.hidden = false; status.textContent = t('Đang gửi…', 'Sending…');
        var ctrl = window.AbortController ? new AbortController() : null;
        var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 45000);
        fetch(CFG.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload(hp)), redirect: 'follow', signal: ctrl ? ctrl.signal : undefined })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                clearTimeout(timer);
                if (j && j.ok) { result = { mode: 'auto', code: j.code, email: A.contact.email }; cur = idx('done'); render(); return; }
                fail(j && j.error);
            })
            .catch(function () { clearTimeout(timer); fail('network'); });
        function fail(code) {
            btn.disabled = false; status.hidden = true;
            var msg = code === 'rate_limited' ? t('Email này vừa gửi nhiều yêu cầu. Vui lòng thử lại sau một giờ.', 'This email has sent several requests recently. Please try again in an hour.')
                : code === 'invalid' ? t('Một số thông tin chưa hợp lệ. Kiểm tra lại các ô và thử lại.', 'Some details are not valid. Check the fields and try again.')
                : t('Chưa gửi được yêu cầu. Bạn có thể thử lại, hoặc nhận phiếu ngay theo cách thủ công.', 'The request could not be sent. Try again, or get the template manually now.');
            err.innerHTML = esc(msg) + ' ';
            var alt = el('button', 'underline underline-offset-2 font-medium'); alt.type = 'button'; alt.textContent = t('Nhận phiếu thủ công', 'Get it manually');
            alt.addEventListener('click', function () { result = { mode: 'manual' }; cur = idx('done'); render(); });
            err.appendChild(alt); err.hidden = false;
        }
    }

    // ---------------------------------------------------------------- flow
    var preset = null;
    function idx(id) { for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return i; return -1; }
    function active(i) { var s = STEPS[i]; return !s.when || s.when(); }
    function nextIndex(from) {
        for (var j = from + 1; j < STEPS.length; j++) {
            if (!active(j)) continue;
            var id = STEPS[j].id;
            // after an edit, skip steps that already have an answer and go back to the review
            if (!reached || A[id] === undefined || id === 'review' || id === 'consent' || id === 'contact' || id === 'done') return j;
        }
        return STEPS.length - 1;
    }
    function answer(id, v) {
        if (id === 'industry' && A.industry && A.industry !== v) { delete A.inputs; delete A.outputs; delete A.conds; delete A.unitName; }
        if (id === 'units' && v !== 'lt18') delete A.small;
        A[id] = v;
        if (result) return;
        cur = nextIndex(idx(id)); render(true);
    }
    function goTo(id) { if (result) return; cur = idx(id); render(true); }

    function render(scroll) {
        var log = document.getElementById('chat-log'); if (!log) return;
        log.innerHTML = '';
        var last = null;
        for (var i = 0; i < STEPS.length; i++) {
            if (!active(i)) continue;
            var s = STEPS[i];
            if (i < cur) {
                bubbleBot(log, s.ask());
                if (s.say) bubbleUser(log, s.say());
            } else if (i === cur) {
                last = bubbleBot(log, s.ask());
                var w = s.widget ? s.widget() : null;
                if (w) { var pane = el('div', 'ml-11 sm:ml-12 mt-3 mb-2'); pane.appendChild(w); log.appendChild(pane); }
                break;
            }
        }
        var total = STEPS.filter(function (s, k) { return active(k); }).length - 1;
        var done = STEPS.filter(function (s, k) { return active(k) && k < cur; }).length;
        var bar = document.getElementById('chat-progress'); if (bar) bar.style.width = Math.round(100 * Math.min(done, total) / total) + '%';
        var restart = document.getElementById('chat-restart'); if (restart) restart.hidden = cur === 0 || !!result;
        if (scroll && last) { last.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
    function bubbleBot(log, html) {
        var row = el('div', 'flex gap-3 items-start scroll-mt-36');
        row.appendChild(el('div', 'w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold', 'KHQ'));
        row.appendChild(el('div', 'min-w-0 max-w-[46rem] bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 text-[0.95rem] leading-relaxed text-gray-800 shadow-sm', html));
        log.appendChild(row); return row;
    }
    function bubbleUser(log, text) {
        var row = el('div', 'flex justify-end');
        row.appendChild(el('div', 'max-w-[85%] bg-primary text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-[0.95rem] leading-relaxed break-words', esc(text)));
        log.appendChild(row);
    }

    function init() {
        try { var q = new URLSearchParams(location.search).get('nganh'); if (q && IND[q]) preset = q; } catch (e) { /* ignore */ }
        var rs = document.getElementById('chat-restart');
        if (rs) rs.addEventListener('click', function () { A = {}; cur = 0; reached = false; result = null; render(true); });
        document.addEventListener('khq:lang', function () { render(false); });
        render(false);
        window.__khqChat = { state: function () { return { A: A, cur: cur, step: STEPS[cur].id, result: result }; }, record: function () { return A.contact ? record() : ''; } };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
