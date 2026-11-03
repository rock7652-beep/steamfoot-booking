"use client";
import {useFeaturePresentation} from '@/components/feature-presentation';
import {FEATURES} from '@/lib/feature-flags';
import type {ComponentProps} from 'react';
import {AddOnFields,AddOnChoices} from '../add-ons/fields';
export function BeautyAddOnFields(props:Omit<ComponentProps<typeof AddOnFields>,'module'|'imageBasePath'>){const state=useFeaturePresentation(FEATURES.BEAUTY_SERVICE_ADD_ONS);return <AddOnFields {...props} hideAddOns={state!=='ENABLED'} module="BEAUTY" imageBasePath="/api/beauty/service-images"/>;}
export function BeautyAddOnChoices(props:Omit<ComponentProps<typeof AddOnChoices>,'module'|'imageBasePath'>){return <AddOnChoices {...props} module="BEAUTY" imageBasePath="/api/beauty/service-images"/>;}
