import {LoadingStatus} from '@/components/loading-status';
/** Neutral shared loading state: never flash a legacy personnel card layout. */
export default function Loading(){return <div className="p-4"><LoadingStatus>讀取人員清單…</LoadingStatus></div>;}
