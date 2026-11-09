"use client";
import {BookingAddOns} from './booking';
import {readSharedGoods,mutateSharedGoods} from '@/server/actions/shared-goods';
import type {ComponentProps} from 'react';
export function SharedGoodsPanel(props:Omit<ComponentProps<typeof BookingAddOns>,'read'|'mutate'|'shared'>){return <BookingAddOns {...props} shared read={readSharedGoods} mutate={mutateSharedGoods}/>;}
