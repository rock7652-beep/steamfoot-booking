import ts from 'typescript';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const records=[], routers=[], getForms=[], pages=[], loading=[];
function walk(dir) {
 for(const entry of readdirSync(dir,{withFileTypes:true})) {
  const file=path.join(dir,entry.name);if(entry.isDirectory()){if(entry.name!=='__tests__')walk(file);continue;}
  if(!/\.(?:ts|tsx)$/.test(file))continue;
  if(entry.name==='page.tsx')pages.push(file);if(entry.name==='loading.tsx')loading.push(file);
  const text=readFileSync(file,'utf8'),source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const line=node=>source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;
  function visit(node){
   if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)&&node.importClause?.namedBindings&&ts.isNamedImports(node.importClause.namedBindings)){
    for(const binding of node.importClause.namedBindings.elements)if((binding.propertyName??binding.name).text==='useRouter')routers.push({file,line:line(node),module:node.moduleSpecifier.text});
   }
   if(ts.isCallExpression(node)){
    const expression=node.expression.getText(source);let category;
    if(/(?:^|\.)router\.(push|replace|refresh|prefetch|back|forward)$/.test(expression))category=expression.endsWith('refresh')?'authoritative-server-reconciliation':'scoped-client-navigation';
    else if(/(?:window\.)?location\.(assign|replace|reload)$/.test(expression))category='document-or-security-boundary';
    else if(/(?:window\.)?history\.(pushState|replaceState)$/.test(expression))category='local-url-state';
    else if(expression==='redirect')category='server-redirect-boundary';
    if(category)records.push({file,line:line(node),operation:expression,category});
   }
   if(ts.isJsxOpeningElement(node)&&node.tagName.getText(source)==='form'){
    const attr=node.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(source)==='method');
    if(attr?.initializer&&ts.isStringLiteral(attr.initializer)&&attr.initializer.text.toLowerCase()==='get')getForms.push({file,line:line(node)});
   }
   ts.forEachChild(node,visit);
  }visit(source);
 }
}
walk('src');
const summary={pages:pages.length,loadingBoundaries:loading.length,navigationCalls:records.length,stableRouterConsumers:routers.filter(r=>r.module==='@/components/use-stable-router').length,nativeRouterBoundary:routers.filter(r=>r.module==='next/navigation').map(r=>r.file),nativeGetFormsOutsideWrapper:getForms.filter(r=>r.file!=="src/components/query-form.tsx").length};
const result={date:'2026-10-14',verification:'Static source inventory; not authenticated business acceptance.',summary,routers,nativeGetForms:getForms,navigation:records,pages,loadingBoundaries:loading};
writeFileSync('docs/performance/navigation-inventory-20261014.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(summary));
