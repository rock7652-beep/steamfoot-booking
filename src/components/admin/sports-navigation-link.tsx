"use client";
import Link from "next/link";
import {useState,type ComponentProps} from "react";
/** Preview navigation retains the shell; prefetch only after user intent, not all sidebar pages. */
export function SportsNavigationLink({onMouseEnter,onFocus,onTouchStart,...props}:ComponentProps<typeof Link>){
 const [intent,setIntent]=useState(false);
 return <Link {...props} prefetch={intent} onMouseEnter={e=>{setIntent(true);onMouseEnter?.(e);}} onFocus={e=>{setIntent(true);onFocus?.(e);}} onTouchStart={e=>{setIntent(true);onTouchStart?.(e);}}/>;
}
