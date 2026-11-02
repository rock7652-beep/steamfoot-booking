/** A duration variant is a separate service; a repeated duration label is not. */
export function beautyServiceIdentity(name:string,duration:number){
 return name.normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase().replace(new RegExp(`${duration}(?:分鐘|分)?$`),'');
}
