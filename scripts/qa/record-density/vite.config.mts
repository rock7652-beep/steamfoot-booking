import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
const here=(s:string)=>fileURLToPath(new URL(s,import.meta.url));
const source=process.env.DENSITY_SOURCE_ROOT??here('../../../src');
export default defineConfig({root:here('./'),plugins:[react()],css:{postcss:{plugins:[tailwind()]}},resolve:{alias:[{find:'@/components/dashboard-link',replacement:here('./navigation.tsx')},{find:'next/navigation',replacement:here('./navigation.tsx')},{find:/^@\/components\/desktop$/,replacement:here('./desktop.ts')},...['@/components/feature-presentation','@/app/(dashboard)/dashboard/settings/customer-labels/label-manager','@/server/actions/customer-labels','@/lib/customer-label-reader','@/server/actions/course-slot-matches','@/server/actions/staff-monthly-adjustment','@/server/actions/course-monthly-settlement','@/server/actions/course-fee-payment'].map(find=>({find,replacement:here('./adapters.tsx')})),{find:'@',replacement:source}]},server:{host:'127.0.0.1',port:4201,strictPort:true,fs:{allow:[here('../../../'),source]}}});
