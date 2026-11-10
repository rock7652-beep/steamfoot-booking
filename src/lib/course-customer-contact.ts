/** Back-office contact display only. Never use contactPhone to resolve login or LINE identity. */
export function courseCustomerPhone(person: {phone?:string|null;contactPhone?:string|null}|null|undefined) {
  return person?.phone || person?.contactPhone || '';
}
export function courseCustomerContact<T extends {phone:string;contactPhone?:string|null}>(person:T):Omit<T,'contactPhone'>&{phone:string;sharedContactPhone?:boolean} {
  const {contactPhone,...rest}=person;
  return {...rest,phone:person.phone||contactPhone||'',...(!person.phone&&contactPhone?{sharedContactPhone:true}:{})};
}
export function courseCustomerPhoneFields(phone:string,sharedContactPhone:boolean) {
  return sharedContactPhone ? {phone:'',contactPhone:phone} : {phone,contactPhone:null};
}
