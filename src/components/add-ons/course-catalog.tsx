'use client';
import {AddOnCatalog} from './catalog';
import {saveCourseAddOnCatalog} from '@/server/actions/course-add-ons';
import type {ComponentProps} from 'react';
export function CourseAddOnCatalog(props:Omit<ComponentProps<typeof AddOnCatalog>,'save'>){return <AddOnCatalog {...props} save={saveCourseAddOnCatalog}/>;}
