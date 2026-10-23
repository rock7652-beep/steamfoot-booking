/** A sync warning confirms the write, but requires visible reconciliation. */
export const SETTINGS_SYNC_WARNING = "已儲存；其他頁面更新失敗，輸入已保留，請重新整理核對，勿重複送出。";

export function canCloseConfirmedSettingsSave(
  result: { syncWarning?: boolean },
  showWarning: (message: string) => void,
) {
  if (result.syncWarning) {
    showWarning(SETTINGS_SYNC_WARNING);
    return false;
  }
  return true;
}
