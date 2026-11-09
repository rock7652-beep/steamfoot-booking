import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
const here=(s:string)=>fileURLToPath(new URL(s,import.meta.url));
export default defineConfig({root:here('./'),plugins:[react()],css:{postcss:{plugins:[tailwind()]}},resolve:{alias:[{find:'@/components/dashboard-link',replacement:here('./navigation.tsx')},{find:'@/components/customer-labels',replacement:here('./labels.tsx')},{find:/^@\/components\/desktop$/,replacement:here('./desktop.ts')},{find:'@',replacement:here('../../../src')}]},server:{host:'127.0.0.1',port:4198,strictPort:true,fs:{allow:[here('../../../')]}}});
