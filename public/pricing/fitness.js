(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('fitnessForm'), button = $('submitBtn'), error = $('error'), status = $('submitStatus');
  const key = 'steam-butler-fitness-intake-v2';
  const legacyKey = 'steam-butler-fitness-intake-v1';
  const unknown = '還不確定，想先聊聊';
  const noContact = '目前暫不考慮';
  const categories = [
    ['student', '學員預約與上課', ['預約、改期都靠訊息，回覆很花時間', '學員常問剩幾堂、什麼時候到期', '臨時取消、沒到或補課，不好處理', '其他學員相關困擾']],
    ['coach', '教練排課與點名', ['排課、調課、找代課很花時間', '點名、請假紀錄容易漏掉', '教練上課堂數、鐘點費不好核對', '其他教練相關困擾']],
    ['operations', '店務與收款', ['預約、扣堂、收款要重複登記', '教室、器材或教練時段容易撞期', '學員資料、繳費紀錄散在不同地方', '想換系統，但擔心學員資料、剩餘堂數和預約不好搬過來', '各店資料分散，想看整體狀況得分別查詢或整理', '其他店務相關困擾']],
    ['business', '顧客關係維護', ['學員很久沒來，常常沒有及時發現', '方案快到期、堂數快用完，容易漏掉提醒與關心', '體驗後的回訪與關心，常常漏掉跟進', '經營數據要花大把時間自己整理', '其他學員關係或經營分析困擾']],
  ];
  const options = {
    classModes: ['團課，每堂自由預約', '固定班級，每週固定上課', '私人課，一對一或小班', '其他上課方式', '尚未確定'],
    management: ['LINE／社群訊息', '紙本／手寫', 'Excel／Google 試算表', '管理系統', '其他方式', '尚未確定'],
  };
  const otherFields = [];
  function choice(parent, name, value, type = 'checkbox') {
    const label = document.createElement('label'); label.className = 'choice';
    const input = document.createElement('input');
    input.type = type; input.name = name; input.value = value;
    label.append(input, document.createTextNode(value)); parent.append(label);
    return input;
  }
  function other(input, name, labelText) {
    const box = document.createElement('div'); box.className = 'other-detail'; box.id = name + 'Field'; box.hidden = true;
    const label = document.createElement('label'); label.htmlFor = name; label.textContent = labelText;
    const text = document.createElement('input'); text.id = name; text.name = name; text.maxLength = 120; text.disabled = true;
    box.append(label, text); input.parentElement.after(box);
    input.setAttribute('aria-controls', box.id);
    otherFields.push({input, box, text});
  }
  for (const [id, title, items] of categories) {
    const group = document.createElement('div'); group.className = 'pain-group';
    const heading = document.createElement('h3'); heading.textContent = title; group.append(heading);
    const grid = document.createElement('div'); grid.className = 'choices'; group.append(grid); $('needs').append(group);
    for (const value of items) {
      const input = choice(grid, 'needs', value);
      if (value.startsWith('其他')) other(input, id + 'Other', '請簡單說明：' + title);
    }
  }
  choice($('uncertainChoice'), 'needs', unknown);
  for (const [name, items] of Object.entries(options)) {
    for (const value of items) {
      const input = choice($(name), name, value);
      if (value.startsWith('其他')) other(input, name + 'Other', value + '：請填寫');
    }
  }
  const sections = [...form.querySelectorAll('[data-step]')];
  let step = 0, locked = false, requestId;
  function selected(name) { return [...form.querySelectorAll('[name="' + name + '"]:checked')].map(i => i.value); }
  function read(storageKey = key) { try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { return null; } }
  function save(state) { try { sessionStorage.setItem(key, JSON.stringify(state)); } catch {} }
  function values() {
    const data = Object.fromEntries(new FormData(form));
    for (const name of ['needs', ...Object.keys(options)]) data[name] = selected(name);
    // Hidden "Other" text remains in a local draft, but is never serialized unless selected.
    for (const {text} of otherFields) data[text.name] = text.value;
    data.priorityNeed = selected('priorityNeed')[0] || (data.needs.length === 1 && data.needs[0] !== unknown ? data.needs[0] : '');
    return data;
  }
  function draft() { if (!locked) save({state: 'draft', step, data: values()}); }
  function clearError() {
    error.hidden = true;
    form.querySelectorAll('[aria-describedby]').forEach(field => {
      const ids = field.getAttribute('aria-describedby').split(' ').filter(id => id !== 'error');
      if (ids.length) field.setAttribute('aria-describedby', ids.join(' ')); else field.removeAttribute('aria-describedby');
    });
  }
  function showStep(index, focus = true) {
    step = index; clearError();
    sections.forEach((section, i) => { section.hidden = i !== step; });
    document.querySelectorAll('.progress li').forEach((li, i) => {
      if (i === step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    if (focus) { const h = sections[step].querySelector('h2'); h.focus({preventScroll: true}); h.scrollIntoView({block: 'start'}); }
  }
  function showError(message, target) {
    if (target) {
      const section = target.closest('[data-step]');
      if (section && section.hidden) showStep(Number(section.dataset.step), false);
    }
    error.textContent = message; error.hidden = false;
    if (target) {
      const group = target.closest('.other-detail, .field, fieldset') || target.parentElement;
      group.after(error);
      const ids = new Set((target.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)); ids.add('error');
      target.setAttribute('aria-describedby', [...ids].join(' '));
      target.focus({preventScroll: true}); error.scrollIntoView({block: 'center'});
    } else { status.after(error); error.focus(); }
    return false;
  }
  function sync() {
    for (const {input, box, text} of otherFields) {
      box.hidden = !input.checked; text.disabled = !input.checked; text.required = input.checked;
      input.setAttribute('aria-expanded', String(input.checked));
    }
    const needs = selected('needs'), prior = selected('priorityNeed')[0];
    $('needsStatus').textContent = needs.includes(unknown) ? '已選「還不確定」，可直接進入下一步'
      : '已選 ' + needs.length + ' 項';
    $('priorityNeeds').replaceChildren();
    $('priorityField').hidden = needs.length < 2 || needs.includes(unknown);
    if (!$('priorityField').hidden) for (const value of needs) {
      const input = choice($('priorityNeeds'), 'priorityNeed', value, 'radio'); input.checked = value === prior;
    }
    const hasSystem = selected('management').includes('管理系統');
    $('systemField').hidden = !hasSystem; $('systemName').disabled = !hasSystem;
    const way = $('contactWay').value, contact = Boolean(way && way !== noContact);
    $('contactFields').hidden = !contact; $('noContactNote').hidden = way !== noContact;
    for (const id of ['contactName', 'phone', 'lineId']) {
      $(id).disabled = !contact;
      // Do not retain contact information after the applicant opts out.
      if (way === noContact) $(id).value = '';
    }
    $('contactName').required = contact;
  }
  function restore(data) {
    for (const field of form.elements) {
      if (!field.name) continue;
      if (field.type === 'checkbox') field.checked = Array.isArray(data[field.name]) && data[field.name].includes(field.value);
      else if (typeof data[field.name] === 'string') field.value = data[field.name];
    }
    sync();
    const prior = [...form.querySelectorAll('[name="priorityNeed"]')].find(i => i.value === data.priorityNeed);
    if (prior) prior.checked = true;
  }
  function validate(index) {
    clearError();
    const data = values();
    if (index === 0) {
      if (!$('storeName').value.trim()) return showError('請填寫教室／品牌名稱。', $('storeName'));
      if (!data.needs.length) return showError('請勾選遇到的困擾，或選「還不確定，想先聊聊」。', form.querySelector('[name="needs"]'));
      if (data.needs.includes(unknown) && data.needs.length !== 1) return showError('「還不確定」不能與其他困擾同選。', form.querySelector('[name="needs"]'));
      if (data.needs.length > 1 && !data.priorityNeed) return showError('請選出最想先解決的一件事。', form.querySelector('[name="priorityNeed"]'));
    }
    if (index === 1) {
      if (!data.storeCount) return showError('請選擇目前的店／教室據點數。', $('storeCount'));
      for (const [name, title] of [['classModes', '上課方式'], ['management', '管理方式']]) {
        if (!data[name].length) return showError('請選擇' + title + '，尚未決定可選「尚未確定」。', form.querySelector('[name="' + name + '"]'));
      }
    }
    if (index === 2) {
      if (!data.contactWay) return showError('請選擇希望我們怎麼協助你。', $('contactWay'));
      if (data.contactWay !== noContact) {
        if (!($('contactName').value.trim())) return showError('請填寫你的稱呼。', $('contactName'));
        if (!$('phone').value.trim() && !$('lineId').value.trim()) return showError('LINE ID／聯絡電話至少填一項。', $('lineId'));
      }
    }
    for (const field of sections[index].querySelectorAll('input, select')) {
      if (field.disabled) continue;
      if (field.required && !field.value.trim()) return showError('請簡單填寫這項內容。', field);
      if (!field.checkValidity()) return showError('請確認這個欄位的內容與字數。', field);
    }
    return true;
  }
  function serialized(name, data) {
    return data[name].map(value => {
      const item = otherFields.find(entry => entry.input.name === name && entry.input.value === value);
      return item ? value + '：' + item.text.value.trim() : value;
    }).join('、');
  }
  function payload(data) {
    const primary = data.priorityNeed || '';
    const supplement = otherFields.filter(entry => entry.input.name === 'needs' && entry.input.checked)
      .map(entry => entry.input.value + '：' + entry.text.value.trim()).join('；');
    const lines = [
      ['最優先改善', primary || '尚未確定'],
      // Keep priority and category-specific Other answers visible in the existing Sheets view.
      ['目前流程與困擾', ['最優先：' + (primary || '尚未確定'), supplement].filter(Boolean).join('；')],
      ['空間與分店補充', '據點數：' + data.storeCount],
      ['上課方式', serialized('classModes', data)],
      ['管理與資料來源', serialized('management', data)],
      ['聯繫意願', data.contactWay === noContact ? '只分享需求，不需聯絡' : data.contactWay],
    ];
    const otherNeed = ['【運動教室需求與體驗意願】', ...lines.filter(([, value]) => value).map(([label, value]) => label + '：' + value)].join('\n');
    return {
      requestId, formVersion: 'fitness-v2', storeName: data.storeName.trim(), storeCount: data.storeCount,
      contactName: (data.contactName || '').trim(), phone: (data.phone || '').trim(), lineId: (data.lineId || '').trim(),
      industry: '運動教室／健身／瑜伽', hasSystem: data.management.includes('管理系統') ? '有' : data.management.includes('尚未確定') ? '尚未確定' : '沒有',
      systemName: data.systemName || '', needs: data.needs, priorityNeed: primary, replaceReason: [], otherNeed,
      contactWay: data.contactWay, source: 'fitness-intake', medium: 'referral', campaign: 'fitness-trial', landing: 'fitness-v2',
      pageUrl: location.origin + location.pathname, device: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'iOS' : /Android/i.test(navigator.userAgent) ? 'Android' : 'Desktop',
    };
  }
  function setLocked(value) {
    locked = value;
    // Prevent editing or back-navigation while a save is pending/uncertain.
    for (const control of form.querySelectorAll('input, select, button')) control.disabled = value;
    if (!value) sync();
  }
  function uncertain() {
    setLocked(true); button.textContent = '請先確認送出結果'; status.textContent = '';
    showError('目前無法確認資料是否已保存，請不要重複送出。請透過官方 LINE 提供教室名稱，讓我們協助確認。');
  }
  function configureLineHandoff(data) {
    const box = document.getElementById('lineHandoff');
    box.hidden = data.contactWay === '目前暫不考慮';
    if (box.hidden) return;
    const trial = data.contactWay === '申請體驗帳號';
    const phone = data.contactWay === '希望電話聯繫';
    const name = typeof data.storeName === 'string' ? data.storeName.trim() : '';
    const message = (trial ? '我已申請體驗' : '我已填寫需求表單') + '，店名：' + (name || '（請填寫店名）');
    const link = document.getElementById('lineHandoffLink');
    link.href = 'https://line.me/R/oaMessage/%40329rmywc/?' + encodeURIComponent(message);
    link.textContent = trial ? '回 LINE，確認體驗申請' : '回 LINE，接續聊需求';
    document.getElementById('lineHandoffHint').textContent = phone
      ? '我們會依您留下的電話聯繫；若想先用 LINE 留言，也可以傳送店名，方便我們核對資料。'
      : '請回到官方 LINE 傳送店名，方便我們核對資料並接續協助，不用重新填表。';
    const field = document.getElementById('lineHandoffMessage');
    field.value = message;
    document.getElementById('lineHandoffCopy').onclick = async () => {
      const status = document.getElementById('lineHandoffCopyStatus');
      try {
        await navigator.clipboard.writeText(message);
        status.textContent = '已複製，請到官方 LINE 貼上並送出。';
      } catch {
        field.focus(); field.select();
        status.textContent = '請長按或使用鍵盤複製已選取的文字，再到官方 LINE 貼上並送出。';
      }
    };
  }
  function success(data) {
    locked = true; form.hidden = true; document.querySelector('.progress').hidden = true;
    $('success').hidden = false;
    $('successText').textContent = data.contactWay === noContact
      ? '謝謝你分享教室需求。我們已保存回覆，不會主動聯絡或開通體驗。'
      : data.contactWay === '申請體驗帳號'
        ? '需求與體驗意願已保存，接下來確認適合的功能及開通安排；現在尚未開始計算體驗期間。'
        : '需求已保存，接下來依你的選擇安排示範或進一步了解需求。';
    configureLineHandoff(data);
    $('receiptId').textContent = '回覆編號：' + data.requestId;
    $('success').focus();
  }
  form.addEventListener('input', draft);
  form.addEventListener('change', event => {
    if (locked) return;
    const input = event.target;
    if (input.type === 'checkbox' && input.checked) {
      const exclusive = input.name === 'needs' ? unknown : '尚未確定';
      const peers = [...form.querySelectorAll('[name="' + input.name + '"]')];
      if (input.value === exclusive) peers.forEach(peer => { if (peer !== input) peer.checked = false; });
      else peers.forEach(peer => { if (peer.value === exclusive) peer.checked = false; });
    }
    sync(); draft();
  });
  form.querySelectorAll('[data-next]').forEach(control => control.addEventListener('click', () => {
    if (!locked && validate(step)) { showStep(step + 1); draft(); }
  }));
  form.querySelectorAll('[data-back]').forEach(control => control.addEventListener('click', () => {
    if (!locked) { showStep(step - 1); draft(); }
  }));
  sync(); setLocked(false);
  const previous = read();
  const legacy = read(legacyKey);
  // Honor unresolved/saved legacy submissions, but do not silently reinterpret old questionnaire answers.
  const resume = previous || (legacy && ['pending', 'saved'].includes(legacy.state) ? legacy : null);
  if (resume && resume.data && typeof resume.data === 'object') {
    if (resume.state === 'saved' && resume.data.requestId) success(resume.data);
    else {
      if (previous) restore(previous.data);
      else if (resume.data.storeName) $('storeName').value = resume.data.storeName;
      showStep(Number.isInteger(resume.step) && resume.step >= 0 && resume.step <= 2 ? resume.step : 0, false);
      if (resume.state === 'pending' && resume.requestId) { requestId = resume.requestId; uncertain(); }
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (locked) return;
    if (step < 2) { if (validate(step)) { showStep(step + 1); draft(); } return; }
    for (let index = 0; index < 3; index++) if (!validate(index)) return;
    const data = values();
    requestId ||= crypto.randomUUID();
    const body = payload(data);
    if (body.otherNeed.length > 2000) { showError('補充內容較長，請縮短後再送出。'); return; }
    save({state: 'pending', step, requestId, data});
    setLocked(true); button.textContent = '正在送出…'; form.setAttribute('aria-busy', 'true');
    status.textContent = '正在確認資料是否保存，請稍候。';
    try {
      const response = await fetch('/pricing/submit', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(65000)});
      const result = await response.json();
      if ((response.status === 400 && result.code === 'INVALID_INPUT') || (response.status === 503 && result.code === 'RECEIVER_UPDATE_REQUIRED')) {
        setLocked(false); button.textContent = '送出需求'; status.textContent = '';
        save({state: 'draft', step, data}); requestId = undefined;
        showError(result.code === 'RECEIVER_UPDATE_REQUIRED'
          ? '表單正在更新，這次尚未送出，填寫內容已保留。請稍後再試，或聯繫官方 LINE。'
          : '請確認必填欄位與文字長度後，再送出一次。'); return;
      }
      if (!response.ok || result.ok !== true || result.saved !== true || result.requestId !== requestId) throw new Error('Unconfirmed');
      const receipt = {requestId, contactWay: data.contactWay, storeName: data.storeName}; save({state: 'saved', data: receipt}); success(receipt);
    } catch { uncertain(); }
    finally { form.removeAttribute('aria-busy'); }
  });
})();
