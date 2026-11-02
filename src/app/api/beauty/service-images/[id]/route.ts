import {NextResponse} from 'next/server';
import {beautyPrisma} from '@/lib/beauty-db';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[a-zA-Z0-9-]{1,100}$/.test(id))return new NextResponse(null,{status:404});
 const full=new URL(request.url).searchParams.get("size")==="full";
 const body=full
  ? (await beautyPrisma.beautyServiceImage.findUnique({where:{id},select:{content:true}}))?.content
  : (await beautyPrisma.beautyServiceImage.findUnique({where:{id},select:{thumbnail:true}}))?.thumbnail;
 if(!body)return new NextResponse(null,{status:404});
 // Service images are explicitly public; immutable IDs prevent stale replacements.
 return new NextResponse(new Uint8Array(body!),{headers:{'Content-Type':'image/webp','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
}
