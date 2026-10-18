export function sportsMoveFeedback(error:string){
 if(/原課已異動|已被更新/.test(error))return {title:"課程已被其他操作更新",hint:"返回原課核對最新安排，再重新剪下；本次輸入保留。",review:true};
 if(/出席|曠課|扣抵|收款|授課費|鐘點/.test(error))return {title:"這堂課目前無法移動",hint:"請到原課核對尚未解除的紀錄；更正完成後再剪下。",review:true};
 if(/衝突|已有|占用|固定時段/.test(error))return {title:"這個時段無法貼上",hint:"請調整時間、空間或教練，再次確認。",review:false};
 if(/營業|授課時間|開放|休息|休假/.test(error))return {title:"超出可安排時間",hint:"請核對空間營業及教練授課時間，或選擇其他時段。",review:false};
 return {title:"尚未完成貼上",hint:"輸入與剪下狀態已保留，可修改安排或返回選擇時段。",review:false};
}
