import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {X509Certificate} from 'node:crypto';
// Public Supabase CA, downloaded over HTTPS from its official distribution.
// https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
export const BEAUTY_SUPABASE_CA_FINGERPRINT='80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';
export function beautyProductionCaPath(){return join(process.cwd(),'scripts','certs','supabase-root-2021.crt');}
export function verifyBeautyProductionCa(){
 const certificate=new X509Certificate(readFileSync(beautyProductionCaPath()));
 if(!certificate.ca||certificate.fingerprint256!==BEAUTY_SUPABASE_CA_FINGERPRINT)throw Error('Beauty production CA mismatch');
 return certificate;
}
