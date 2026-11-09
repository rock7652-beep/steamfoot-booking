"use client";

/** Both teaching modules share the choice and seat summary, not charge rules. */
export function CourseFixedLearnersToggle({checked,onChange,count,capacity,disabled=false}:{checked:boolean;onChange:(checked:boolean)=>void;count:number;capacity:number;disabled?:boolean}) {
  return <div className="col-span-full min-w-0 space-y-1">
    <label className="flex min-h-11 w-fit items-center gap-2">
      <input aria-label="同時安排固定學員" type="checkbox" checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)}/>
      同時安排固定學員
    </label>
    {checked&&<p role="status" className={count>capacity?"text-red-700":"text-earth-600"}>
      總名額 {capacity} 人 · 固定學員 {count} 人 · {count>capacity?"固定學員超過總名額":`剩餘 ${Math.max(0,capacity-count)} 人可自由選課`}
    </p>}
  </div>;
}
