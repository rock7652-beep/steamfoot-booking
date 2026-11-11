// Local synthetic preview only. Serve an explicit allowlist, with no backend.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('./preview/',import.meta.url);
const files={'/':['index.html','text/html; charset=utf-8'],'/dashboard/courses':['index.html','text/html; charset=utf-8'],'/fixture.js':['fixture.js','text/javascript'],'/fixture.css':['fixture.css','text/css']};
createServer(async(req,res)=>{const file=files[new URL(req.url,'http://localhost').pathname];if(!file){res.writeHead(404);res.end();return;}try{const body=await readFile(fileURLToPath(new URL(file[0],root)));res.writeHead(200,{'content-type':file[1],'cache-control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end();}}).listen(5207,'0.0.0.0',()=>console.log('Synthetic preview http://localhost:5207'));
