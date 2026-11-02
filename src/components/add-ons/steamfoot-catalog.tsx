'use client';
import {AddOnCatalog} from './catalog';
import {saveSteamfootAddOnCatalog} from '@/server/actions/steamfoot-add-ons';
import type {ComponentProps} from 'react';
export function SteamfootAddOnCatalog(props:Omit<ComponentProps<typeof AddOnCatalog>,'module'|'save'>){return <AddOnCatalog {...props} module="STEAMFOOT" save={saveSteamfootAddOnCatalog}/>;}
