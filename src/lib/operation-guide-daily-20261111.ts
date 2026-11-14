import type {OperationGuide} from './operation-guide-types';
export const dailyOperationGuides20261111:OperationGuide[]=[{
 id:'C180',category:'customers',title:'兄弟姊妹共用電話，如何核對同電話學員集中查看？',
 summary:'不同孩子各自建檔、各自保留方案與紀錄；集中查看須另核對本人及本店登入身分。',
 answer:'在學員資料的同電話學員查看核對聯絡人；有待確認申請先核對本人與同碼，再批准。電話相同不會自動取得其他學員權限。',
 path:'顧客管理 → 學員詳情 → 同電話學員查看',keywords:'家長 兄弟姊妹 共用電話 聯絡電話 同電話學員查看 確認碼 允許集中查看 停止集中查看',
 steps:['以每位孩子姓名與聯絡電話建檔；搜尋同號時依姓名選正確學員，不合併或建立假家長顧客。','開啟同電話學員查看，核對本店、聯絡人、學員及身分衝突提示。若有電話綁定待確認，先核對本人與相同確認碼，再按「已核對本人與確認碼，允許查看」。','已有本店登入身分時，核對聯絡人後可按「已核對聯絡人，允許集中查看」；重新讀取確認狀態與人數，需要撤銷則用「停止集中查看」。'],
 important:'須有顧客修改權限且為 ADMIN／OWNER／MANAGER，並在本人可管理範圍；不替既有身分衝突強制授權。集中查看只授予展示，不授予其他學員預約、付款、健康或資料修改權限。',
 details:['聯絡專用學員不等於獨立登入帳號；各自學員 ID、方案、出席及扣堂不合併。已有獨立帳號、Google 或 LINE 身分的其他學員不能僅憑電話被接管。','改號、登入身分或同組資格異動後須重新核對；停止查看保留各人原資料及交易。失敗先重新讀取原申請，不重建學員或繞過衝突。','本題只教店家後台核對；不提供會員前台逐頁教學，也不代表登入身分與本店通知已同時連結。'],
 success:'集中查看狀態、人數與已核對的本店學員一致，沒有合併資料、跨店授權或新增交易。',
 modules:['course'],permission:'customer.update',additionalPermissions:['customer.read'],feature:null,kind:'howto',verification:'source-reviewed',
 sources:['src/components/admin/course-phone-view-panel.tsx','src/server/actions/course-phone-view.ts','src/server/services/course-phone-view.ts','src/server/services/course-phone-login.ts']
}];
