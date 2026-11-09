import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
const here=(s:string)=>fileURLToPath(new URL(s,import.meta.url));
export default defineConfig({root:here('./'),plugins:[react()],css:{postcss:{plugins:[tailwind()]}},resolve:{alias:[{find:'@/server/actions/course-slot-matches',replacement:here('./slot-matches.ts')},{find:'@/components/dashboard-link',replacement:here('./navigation.tsx')},{find:'next/navigation',replacement:here('./navigation.tsx')},{find:'@',replacement:here('../../../src')}]},server:{host:'127.0.0.1',port:4200,strictPort:true,fs:{allow:[here('../../../')]}}});
