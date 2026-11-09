'use client';
import {SharedGoodsPanel} from './shared-goods-panel';
import {BookingAddOns} from './booking';
import {readCourseBookingAddOns,mutateCourseBookingAddOns} from '@/server/actions/course-add-ons';
import type {ComponentProps} from 'react';
export function CourseBookingAddOns({sharedGoods=false,...props}:{sharedGoods?:boolean}&Omit<ComponentProps<typeof BookingAddOns>,'read'|'mutate'>){return <><BookingAddOns {...props} read={readCourseBookingAddOns} mutate={mutateCourseBookingAddOns}/>{sharedGoods&&<SharedGoodsPanel {...props}/>}</>;}
