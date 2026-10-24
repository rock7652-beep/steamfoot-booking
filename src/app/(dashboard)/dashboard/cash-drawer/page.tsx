import CashDrawerContent,{type CashDrawerContentProps} from "./cash-drawer-page-content";
export default function CashDrawerPage(props:Pick<CashDrawerContentProps,"searchParams">){return <CashDrawerContent {...props}/>;}
