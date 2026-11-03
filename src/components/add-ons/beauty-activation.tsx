"use client";
import {AddOnCatalog} from './catalog';
import {saveBeautyAddOnActivation} from '@/server/actions/beauty-add-on-activation';
export function BeautyAddOnActivation(props:{storeId:string;revision:number;enabled:boolean;subjects:import('@/lib/add-ons').AddOnTeachingSubject[];serviceAddOnsAvailable:boolean;groups:import('@/lib/add-ons').AddOnGroup[]}){return <AddOnCatalog {...props} module="BEAUTY" sharedOnly showServiceAddOnLink={props.serviceAddOnsAvailable} save={saveBeautyAddOnActivation}/>;}
