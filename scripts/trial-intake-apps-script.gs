// Paste into this Sheet's Extensions > Apps Script. No invitation links or tokens are stored here.
const INTAKE_SHEET_ID = '1EANSmhtID5pPWj8_OSUvcH-1TprClsCheFDPeW9td5k';
const INTAKE_TAB = '體驗申請';
const INTAKE_RECIPIENT = 'steambutler500@gmail.com';
const INTAKE_HEADERS = ['申請編號','申請時間','更新時間','店家名稱','使用類型','聯絡人','電話','Email','Google 地圖','官方 LINE ID','好友連結','待補資料','處理狀態','備註','資料版本','已通知版本'];

function setupIntake() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('INTAKE_SECRET')) props.setProperty('INTAKE_SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  const sheet = SpreadsheetApp.openById(INTAKE_SHEET_ID).getSheetByName(INTAKE_TAB);
  if (!sheet) throw new Error('找不到體驗申請工作表');
  sheet.getRange(1, 1, 1, 16).setValues([INTAKE_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange('G:H').setNumberFormat('@');
  sheet.getRange('B:C').setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange('A1:P1').setBackground('#315F4D').setFontColor('#ffffff').setFontWeight('bold');
  if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), 16).createFilter();
  SpreadsheetApp.openById(INTAKE_SHEET_ID).setSpreadsheetTimeZone('Asia/Taipei');
  // Authorize sending once; no message is sent by setup.
  MailApp.getRemainingDailyQuota();
  console.log('設定完成。請在「專案設定 → 指令碼屬性」查看 INTAKE_SECRET，僅填入網站環境設定，勿貼在聊天或申請頁。');
}

function intakeReply(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
function intakeText(value) {
  // Prevent spreadsheet formula injection, including leading control/whitespace.
  return /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? "'" + value : value;
}
function doPost(e) {
  let lock;
  try {
    if (!e || !e.postData || e.postData.contents.length > 16000) return intakeReply({ok:false});
    const input = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('INTAKE_SECRET');
    if (!secret || secret.length < 32 || input.secret !== secret) return intakeReply({ok:false});
    const a = input.application;
    if (!a || !/^[a-f0-9-]{36}$/.test(a.id) || !Number.isSafeInteger(a.revision) || a.revision < 1) return intakeReply({ok:false});
    const fields = ['createdAt','updatedAt','storeName','industry','contactName','phone','email','mapsUrl','lineId','friendUrl','missing','status'];
    if (fields.some(k => typeof a[k] !== 'string' || a[k].length > 2500) || !a.storeName || !a.contactName || !a.email) return intakeReply({ok:false});
    const created = new Date(a.createdAt), updated = new Date(a.updatedAt);
    if (isNaN(created.getTime()) || isNaN(updated.getTime())) return intakeReply({ok:false});
    if (typeof input.hqUrl !== 'string' || !/^https:\/\/[a-z0-9.-]+\/hq\/dashboard\/trial-applications\?application=[a-f0-9-]{36}$/.test(input.hqUrl)) return intakeReply({ok:false});
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return intakeReply({ok:false});
    const sheet = SpreadsheetApp.openById(INTAKE_SHEET_ID).getSheetByName(INTAKE_TAB);
    if (!sheet || sheet.getRange(1,1,1,16).getValues()[0].join('|') !== INTAKE_HEADERS.join('|')) return intakeReply({ok:false});
    const last = sheet.getLastRow();
    const rows = last > 1 ? sheet.getRange(2,1,last-1,16).getValues() : [];
    const index = rows.findIndex(row => row[0] === a.id);
    const rowNumber = index < 0 ? last + 1 : index + 2;
    const previous = index < 0 ? [] : rows[index];
    // Stale requests must not overwrite newer supplements or send outdated mail.
    if (Number(previous[14]) > a.revision) return intakeReply({ok:true,id:a.id,revision:a.revision,sheet:'SAVED',mail:Number(previous[15]) >= a.revision ? 'SENT' : 'PENDING'});
    const values = [a.id,created,updated,a.storeName,a.industry,a.contactName,a.phone,a.email,a.mapsUrl,a.lineId,a.friendUrl,a.missing || '已提供，待人工確認',previous[12] || a.status,previous[13] || '',a.revision,Number(previous[15]) || 0];
    sheet.getRange(rowNumber,1,1,16).setValues([values.map(v => typeof v === 'string' ? intakeText(v) : v)]);
    SpreadsheetApp.flush();
    if (Number(previous[15]) < a.revision || index < 0) {
      if (MailApp.getRemainingDailyQuota() < 1) return intakeReply({ok:false,id:a.id,revision:a.revision,sheet:'SAVED',mail:'FAILED'});
      MailApp.sendEmail({
        to: INTAKE_RECIPIENT,
        name: '蒸管家',
        subject: '蒸管家｜' + (a.revision > 1 ? '補件通知' : '新的體驗版申請') + '｜' + a.storeName.replace(/[\r\n]/g,' '),
        body: '店家：' + a.storeName + '\n類型：' + a.industry + '\n聯絡人：' + a.contactName + '\n電話：' + a.phone + '\nEmail：' + a.email + '\n\n待補資料：\n' + (a.missing || '已提供申請所需資料，待人工確認授權') + '\n\n申請總表：https://docs.google.com/spreadsheets/d/' + INTAKE_SHEET_ID + '/edit\n總部資料：' + input.hqUrl,
      });
      sheet.getRange(rowNumber,16).setValue(a.revision);
      SpreadsheetApp.flush();
    }
    return intakeReply({ok:true,id:a.id,revision:a.revision,sheet:'SAVED',mail:'SENT'});
  } catch (_) {
    // Never return payloads or authorization material in error responses.
    return intakeReply({ok:false});
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}
