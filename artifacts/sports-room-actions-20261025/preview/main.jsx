import React from 'react';
import {createRoot} from 'react-dom/client';
import {CourseWorkspace} from '@/app/(dashboard)/dashboard/courses/workspace';
import '@/app/globals.css';
const ro=new URLSearchParams(location.search).has('readonly');
const room={id:'room',name:'A 長名稱教室・瑜珈與舞蹈共用空間',category:'舞蹈',isActive:true,capacity:10,details:'',equipment:'',location:'',uses:[],rentalEnabled:false,rentalHourlyRate:null};
const props={storeId:'fixture',selectedDate:'2026-10-25',today:'2026-10-25',nowIso:'2026-10-25T10:00:00Z',calendarDays:{},rooms:[room],templates:[],sessions:[],cancelledBookings:[],coaches:[],canCreate:!ro,canEdit:!ro,canDelete:!ro,sportsNative:true,businessProfile:'FITNESS',view:'rooms',staffAvailability:[],staffAvailabilityExceptions:[]};
createRoot(document.getElementById('root')).render(<div style={{display:'flex',width:'100%',minHeight:'100vh'}}><aside style={{flex:'0 0 220px',background:'#f2f2f2',padding:16}}>後台側欄</aside><main style={{flex:'1 1 0%',minWidth:0,padding:'12px 24px'}}><div className="course-workspace mx-auto flex w-full min-w-0 max-w-[1440px] flex-col gap-1"><h1>空間管理</h1><CourseWorkspace {...props}/></div></main></div>);
