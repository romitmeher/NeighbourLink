export class ApiError extends Error {
  constructor(public status:number, message:string){super(message)}
}
export async function api(path:string,method='GET',body?:any):Promise<any>{
  const form = body instanceof FormData
  const response = await fetch('/api'+path,{method,credentials:'same-origin',
    headers:{'X-Requested-With':'XMLHttpRequest',...(!form && body!==undefined?{'Content-Type':'application/json'}:{})},
    body:body===undefined?undefined:form?body:JSON.stringify(body)})
  if (!response.ok){
    const data = await response.json().catch(()=>({}))
    const message = Array.isArray(data.detail)?data.detail.map((i:any)=>i.loc.slice(1).join(' ')+' '+i.msg).join('. '):data.detail
    throw new ApiError(response.status,typeof message==='string'?message:'Could not complete the request. Please retry.')
  }
  return response.status===204?null:response.json()
}
export const money=(paise:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(paise/100)
export function timeIST(value:string){const date=new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value)?value:value+'Z');return date.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})+' IST'}
