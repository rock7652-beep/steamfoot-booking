'use client';
import {SharedGoodsPanel} from './shared-goods-panel';
import {BookingAddOns} from './booking';
import {readSteamfootParticipantAddOns,mutateSteamfootParticipantAddOns} from '@/server/actions/steamfoot-add-ons';
import type {ComponentProps} from 'react';
export function SteamfootParticipantAddOns({sharedGoods=false,...props}:{sharedGoods?:boolean}&Omit<ComponentProps<typeof BookingAddOns>,'module'|'read'|'mutate'>){return <><BookingAddOns {...props} module="STEAMFOOT" read={readSteamfootParticipantAddOns} mutate={mutateSteamfootParticipantAddOns}/>{sharedGoods&&<SharedGoodsPanel {...props} module="STEAMFOOT"/>}</>;}
