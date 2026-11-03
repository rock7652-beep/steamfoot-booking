import {NextResponse} from 'next/server';
import {addonsPrisma as prisma} from '@/lib/addons-db';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[a-zA-Z0-9-]{1,100}$/.test(id))return new NextResponse(null,{status:404});
 const full=new URL(request.url).searchParams.get("size")==="full";
 const enabled:string[]=[];
 if(process.env.STEAMFOOT_ADD_ONS_ENABLED==='1')enabled.push('STEAMFOOT');
 if(process.env.COURSE_ADD_ONS_ENABLED==='1')enabled.push('FITNESS','MUSIC');
 if(process.env.BEAUTY_MODULE_ENABLED==='1')enabled.push('BEAUTY');
 if(!enabled.length)return new NextResponse(null,{status:404});
 const where={id,module:{in:enabled}};
 const body=full?(await prisma.serviceAddOnImage.findFirst({where,select:{content:true}}))?.content:(await prisma.serviceAddOnImage.findFirst({where,select:{thumbnail:true}}))?.thumbnail;
 if(!body)return new NextResponse(null,{status:404});
 // Service images are explicitly public; immutable IDs prevent stale replacements.
 return new NextResponse(new Uint8Array(body!),{headers:{'Content-Type':'image/webp','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
}
