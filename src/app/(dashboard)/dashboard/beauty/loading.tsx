import {LoadingStatus} from "@/components/loading-status";

/** Neutral shared feedback; do not show the dashboard home layout while opening Beauty tabs. */
export default function Loading(){return <div data-beauty-loading className="min-w-0 py-3"><LoadingStatus/></div>;}
