export function sportsMoveFeedback(error:string,service=false){
 if(/原課已異動|已被更新/.test(error))return {title:service?"預約已被其他操作更新":"課程已被其他操作更新",hint:service?"返回原預約核對最新安排，再重新剪下；本次輸入保留。":"返回原課核對最新安排，再重新剪下；本次輸入保留。",review:true};
 if(/出席|曠課|扣抵|收款|授課費|鐘點/.test(error))return {title:service?"這筆預約目前無法移動":"這堂課目前無法移動",hint:service?"請到原預約核對尚未解除的紀錄；更正完成後再剪下。":"請到原課核對尚未解除的紀錄；更正完成後再剪下。",review:true};
 if(/衝突|已有|占用|固定時段/.test(error))return {title:"這個時段無法貼上",hint:service?"請調整時間、位置或技師，再次確認。":"請調整時間、空間或教練，再次確認。",review:false};
 if(/營業|授課時間|開放|休息|休假/.test(error))return {title:"超出可安排時間",hint:service?"請核對店家營業及技師服務時間，或選擇其他時段。":"請核對空間營業及教練授課時間，或選擇其他時段。",review:false};
 return {title:"尚未完成貼上",hint:"輸入與剪下狀態已保留，可修改安排或返回選擇時段。",review:false};
}
