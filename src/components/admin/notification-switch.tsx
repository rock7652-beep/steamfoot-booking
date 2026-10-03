'use client';
import type { InputHTMLAttributes } from 'react';
export const notificationSwitchClass='h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-earth-300 p-1 transition-colors before:block before:h-5 before:w-5 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:bg-primary-600 checked:before:translate-x-5 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600';
export function NotificationSwitch(props:Omit<InputHTMLAttributes<HTMLInputElement>,'type'|'role'>){return <input {...props} type="checkbox" role="switch" className={`${notificationSwitchClass} ${props.className??''}`}/>;}
