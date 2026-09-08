/** Replace the bound Apps Script, then update the EXISTING Web App deployment. */
const SPREADSHEET_ID = '1VHUCglOH0jRpWbdVAnIw39UVe7ULbag33JHs1Bw7oG4';
const SHEET_NAME = '門市健檢回覆';
const NOTIFY_EMAIL = 'rock7652@gmail.com';

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function escapeHtml(value) {
  return String(value == null || value === '' ? '—' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function joined(value) { return Array.isArray(value) ? value.join('、') : (value || ''); }

function buildNotification(data) {
  const trial = data.contactWay === '申請體驗帳號';
  const title = trial ? '新的體驗帳號申請' : '新的門市健檢';
  const fields = [
    ['店家名稱', data.storeName], ['聯絡人', data.contactName],
    ['LINE ID', data.lineId], ['聯絡電話', data.phone],
    ['主要需求', joined(data.needs)], ['希望了解方式', data.contactWay],
    ['方便聯繫的時段', data.time], ['其他需求', data.otherNeed],
    ['店家類型', data.industry], ['門市數', data.storeCount], ['員工數', data.staffCount],
    ['會員／顧客數', data.members], ['是否使用系統', data.hasSystem],
    ['目前系統', data.systemName], ['想更換的原因', joined(data.replaceReason)],
    ['來源平台', data.source || 'direct'], ['活動', data.campaign],
    ['網站位置', data.content], ['使用裝置', data.device]
  ];
  const rows = fields.map(function (field) {
    return '<tr><td style="padding:16px 0;border-bottom:1px solid #e2e8e3;word-break:break-word;overflow-wrap:anywhere">'
      + '<div style="font-size:14px;color:#64736c;margin-bottom:6px">' + escapeHtml(field[0]) + '</div>'
      + '<div style="font-size:17px;color:#153f33;line-height:1.7">' + escapeHtml(field[1]) + '</div></td></tr>';
  }).join('');
  const url = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit';
  return {
    subject: '【蒸管家】' + title + '｜' + String(data.storeName || '未填店名').replace(/[\r\n]/g, ' '),
    body: title + '\n\n' + fields.map(function (field) { return field[0] + '：' + (field[1] || '—'); }).join('\n') + '\n\n開啟申請名單：' + url,
    htmlBody: '<!doctype html><html lang="zh-Hant"><body style="margin:0;background:#faf8f2;font-family:Arial,sans-serif">'
      + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:16px">'
      + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;table-layout:fixed;background:#ffffff">'
      + '<tr><td style="padding:24px;background:#153f33;border-bottom:3px solid #c4a45c;color:#ffffff">'
      + '<div style="font-size:14px;margin-bottom:8px">蒸管家</div><h1 style="font-size:24px;line-height:1.5;margin:0">' + title + '</h1></td></tr>'
      + '<tr><td style="padding:8px 24px 24px"><p style="font-size:16px;line-height:1.7;color:#64736c">資料已保存，請依店家需求安排聯繫。</p>'
      + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed">' + rows + '</table>'
      + '<p style="margin:24px 0 0"><a href="' + url + '" style="display:inline-block;padding:14px 20px;background:#153f33;color:#ffffff;font-size:16px;text-decoration:none;border-radius:8px">開啟申請名單</a></p>'
      + '</td></tr></table></td></tr></table></body></html>'
  };
}

function doPost(e) {
  let lock;
  let saved = false;
  let requestId = '';
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 24000) throw new Error('Invalid body');
    const data = JSON.parse(raw);
    if (!data.storeName || !data.contactName || !data.industry || !(data.phone || data.lineId)
      || !Array.isArray(data.needs) || data.needs.length < 1 || data.needs.length > 3) throw new Error('Invalid input');
    requestId = data.requestId || Utilities.getUuid();
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error('Invalid request ID');
    // Hash the submitted content so reusing an ID cannot silently discard changed data.
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw).map(function (byte) { return ('0' + (byte & 255).toString(16)).slice(-2); }).join('');
    lock = LockService.getScriptLock();
    lock.waitLock(20000);
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Missing sheet');
    if (sheet.getMaxColumns() < 30) sheet.insertColumnsAfter(sheet.getMaxColumns(), 30 - sheet.getMaxColumns());
    const header = sheet.getRange(1, 28, 1, 3);
    const existingHeaders = header.getValues()[0];
    const expectedHeaders = ['申請識別碼', '通知狀態', '申請內容指紋'];
    if (existingHeaders.some(function (value, index) { return value && value !== expectedHeaders[index]; })) throw new Error('Column conflict');
    header.setValues([expectedHeaders]);
    const lastRow = sheet.getLastRow();
    const match = lastRow > 1 ? sheet.getRange(2, 28, lastRow - 1, 1).createTextFinder(requestId).matchEntireCell(true).findNext() : null;
    let row;
    if (match) {
      row = match.getRow();
      if (sheet.getRange(row, 30).getValue() !== digest) throw new Error('Request conflict');
    } else {
      // Preserve all 27 existing columns and neutralize spreadsheet formulas in free text.
      const values = [new Date(), data.storeName, data.contactName, data.industry, data.storeCount,
        data.staffCount, data.members, data.hasSystem, data.systemName, joined(data.replaceReason),
        joined(data.needs), data.otherNeed, data.contactWay, data.time, data.phone, data.source || 'direct',
        '待聯繫', '', data.lineId, data.source || 'direct', data.medium, data.campaign, data.content,
        data.landing || 'v1', data.pageUrl, data.referrer, data.device, requestId, '待寄送', digest];
      sheet.appendRow(values.map(function (value) {
        if (value instanceof Date) return value;
        const text = String(value == null ? '' : value);
        return /^[=+@-]/.test(text) ? "'" + text : text;
      }));
      row = sheet.getLastRow();
    }
    SpreadsheetApp.flush();
    if (sheet.getRange(row, 28).getValue() !== requestId || sheet.getRange(row, 30).getValue() !== digest) throw new Error('Save not verified');
    saved = true;
    const statusCell = sheet.getRange(row, 29);
    if (statusCell.getValue() !== '已寄送') {
      try {
        const notification = buildNotification(data);
        MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: notification.subject, body: notification.body, htmlBody: notification.htmlBody });
        statusCell.setValue('已寄送');
        SpreadsheetApp.flush();
      } catch (mailError) {
        statusCell.setValue('寄送失敗，請人工確認');
        SpreadsheetApp.flush();
        console.error('Store check saved; notification requires review');
        return jsonResponse({ version: 2, ok: true, saved: true, requestId: requestId, notification: 'failed' });
      }
    }
    return jsonResponse({ version: 2, ok: true, saved: true, requestId: requestId, notification: 'sent' });
  } catch (error) {
    console.error('Store check request needs review');
    return jsonResponse({ version: 2, ok: saved, saved: saved, requestId: requestId, notification: 'failed' });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function doGet() {
  return jsonResponse({ ok: true, version: 2, service: 'Steam Butler Store Check' });
}
