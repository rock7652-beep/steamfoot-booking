(() => {
  'use strict';
  const form = document.getElementById('fitnessForm');
  const button = document.getElementById('submitBtn');
  const error = document.getElementById('error');
  const status = document.getElementById('submitStatus');
  const key = 'steam-butler-fitness-intake-v1';
  const options = {
    classModes: ['團課自由預約', '固定期課／班級', '私人課／一對一', '其他上課方式'],
    planTypes: ['點數方案', '堂數卡', '月費／訂閱', '整期收費', '單堂付費', '其他收費方式'],
    management: ['LINE 訊息', '紙本／手寫', 'Excel／試算表', '其他管理系統'],
    needs: ['排課與空間安排', '學員自主預約', '剩餘點數／堂數', '點名與請假', '上課提醒', '收款與對帳', '資料導入', '其他問題'],
  };
  for (const [name, values] of Object.entries(options)) {
    for (const value of values) {
      const label = document.createElement('label');
      label.className = 'choice';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.name = name; input.value = value;
      label.append(input, document.createTextNode(value));
      document.getElementById(name).append(label);
    }
  }
  let locked = false;
  let requestId;
  button.disabled = false;
  function read() { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } }
  function save(value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} }
  function values() {
    const fd = new FormData(form);
    const data = Object.fromEntries(fd);
    for (const name of Object.keys(options)) data[name] = fd.getAll(name);
    return data;
  }
  function restore(data) {
    for (const field of form.elements) {
      if (!field.name) continue;
      const value = data[field.name];
      if (field.type === 'checkbox') field.checked = Array.isArray(value) && value.includes(field.value);
      else if (typeof value === 'string') field.value = value;
    }
  }
  function showError(message, focusTarget) {
    error.textContent = message; error.hidden = false;
    // Keep the explanation beside the field when mobile focus scrolls the page.
    if (focusTarget) {
      const group = focusTarget.closest('fieldset, .field');
      group.after(error);
      const descriptions = new Set((focusTarget.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
      descriptions.add(error.id);
      focusTarget.setAttribute('aria-describedby', [...descriptions].join(' '));
      focusTarget.focus({preventScroll: true});
      error.scrollIntoView({block: 'center'});
    } else {
      status.after(error);
      error.focus();
    }
  }
  function uncertain() {
    locked = true; button.disabled = true; button.textContent = '請先確認送出結果';
    status.textContent = '';
    showError('目前無法確認資料是否已保存，請不要重複送出。填寫內容仍保留在本頁，請透過下方官方 LINE 提供教室名稱，讓我們協助確認。');
  }
  function success(data) {
    locked = true; form.hidden = true;
    const view = document.getElementById('success'); view.hidden = false;
    document.getElementById('successText').textContent = data.contactWay === '目前暫不考慮'
      ? '謝謝您分享教室的實際需求。我們已保存您的回覆，不會為您安排體驗或主動推進申請。'
      : data.contactWay === '申請體驗帳號'
        ? '需求與體驗意願已保存。蒸管家會聯繫您確認適合的功能及開通安排；現在尚未開始計算體驗期間。'
        : '需求已保存。蒸管家會依您選擇的方式，聯繫安排示範或進一步了解需求。';
    document.getElementById('receiptId').textContent = '回覆編號：' + data.requestId;
    view.focus(); window.scrollTo({top: 0, behavior: 'smooth'});
  }
  form.addEventListener('input', () => { if (!locked) save({state: 'draft', data: values()}); });
  form.addEventListener('change', (event) => {
    if (event.target.name === 'needs') {
      const selected = form.querySelectorAll('[name="needs"]:checked');
      if (selected.length > 3) event.target.checked = false;
      document.getElementById('needsStatus').textContent = selected.length > 3
        ? '最多選 3 項，請先取消一項再選。' : '已選 ' + selected.length + '／3 項';
    }
    if (!locked) save({state: 'draft', data: values()});
  });
  const previous = read();
  if (previous && previous.data && typeof previous.data === 'object') {
    restore(previous.data);
    if (previous.state === 'saved' && previous.data.requestId) success(previous.data);
    if (previous.state === 'pending' && previous.requestId) { requestId = previous.requestId; uncertain(); }
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (locked) return;
    error.hidden = true;
    form.querySelectorAll('[aria-describedby]').forEach(field => {
      const ids = field.getAttribute('aria-describedby').split(' ').filter(id => id !== error.id);
      if (ids.length) field.setAttribute('aria-describedby', ids.join(' '));
      else field.removeAttribute('aria-describedby');
    });
    const data = values();
    for (const [name, message] of [['classModes', '請至少選一種上課方式。'], ['planTypes', '請至少選一種收費方式。'], ['management', '請至少選一種目前管理方式。'], ['needs', '請選 1～3 項最想改善的事情。']]) {
      if (!data[name].length || (name === 'needs' && data[name].length > 3)) {
        showError(message, form.querySelector('[name="' + name + '"]')); return;
      }
    }
    for (const name of ['storeName', 'contactName', 'phone', 'lineId']) data[name] = data[name].trim();
    if (!data.storeName || !data.contactName) { showError('請填寫教室名稱與您的稱呼。'); return; }
    if (!data.phone && !data.lineId) { showError('LINE ID 與電話至少填一項。', form.elements.lineId); return; }
    const noteFields = [
      ['所在縣市', data.city], ['課程', data.courseNames], ['上課方式', data.classModes.join('、')],
      ['收費方式', data.planTypes.join('、')], ['期限與扣點', data.planDetails], ['上課空間', data.spaces],
      ['空間與分店補充', data.spaceDetails], ['每週堂數', data.weekly], ['管理與資料來源', data.management.join('、')],
      ['目前流程與困擾', data.painDetails], ['預約取消期限', data.bookingDeadline], ['未到處理', data.absence], ['停課規則', data.cancelClass],
    ];
    const otherNeed = ['【運動教室需求與體驗意願】', ...noteFields.filter(([, value]) => value).map(([label, value]) => label + '：' + value)].join('\n');
    if (otherNeed.length > 2000) { showError('補充內容較長，請縮短後再送出。'); return; }
    requestId ||= crypto.randomUUID();
    const payload = {
      requestId, storeName: data.storeName, contactName: data.contactName,
      industry: '運動教室／健身／瑜伽', staffCount: data.staffCount, members: data.members,
      hasSystem: data.management.includes('其他管理系統') ? '有' : '沒有',
      systemName: data.systemName, needs: data.needs, replaceReason: [], otherNeed,
      contactWay: data.contactWay, phone: data.phone, lineId: data.lineId, time: data.time,
      source: 'fitness-intake', medium: 'referral', campaign: 'fitness-trial', landing: 'fitness-v1',
      pageUrl: location.origin + location.pathname, device: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'iOS' : /Android/i.test(navigator.userAgent) ? 'Android' : 'Desktop',
    };
    locked = true; button.disabled = true; button.textContent = '正在送出…';
    form.setAttribute('aria-busy', 'true'); status.textContent = '正在確認資料是否保存，請稍候。';
    save({state: 'pending', requestId, data});
    try {
      const response = await fetch('/pricing/submit', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload), signal: AbortSignal.timeout(65000)});
      const result = await response.json();
      if (response.status === 400 && result.code === 'INVALID_INPUT') {
        locked = false; button.disabled = false; button.textContent = '送出需求與意願'; status.textContent = '';
        save({state: 'draft', data}); showError('請確認必填欄位與文字長度後，再送出一次。'); return;
      }
      if (!response.ok || result.ok !== true || result.saved !== true || result.requestId !== requestId) throw new Error('Unconfirmed');
      const receipt = {requestId, contactWay: data.contactWay};
      save({state: 'saved', data: receipt}); success(receipt);
    } catch { uncertain(); }
    finally { form.removeAttribute('aria-busy'); }
  });
})();
