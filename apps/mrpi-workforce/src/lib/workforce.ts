import type { AttendanceStatus, PayType, PaymentMethod } from '../types/domain'

export const attendanceOptions:Array<{value:AttendanceStatus;label:string;short:string}>=[{value:'present',label:'Hadir',short:'H'},{value:'half_day',label:'Separuh hari',short:'½'},{value:'absent',label:'Tidak hadir',short:'X'}]
export const paymentMethods:Array<{value:PaymentMethod;label:string}>=[{value:'cash',label:'Tunai'},{value:'bank_transfer',label:'Pindahan bank'},{value:'cheque',label:'Cek'},{value:'other',label:'Lain-lain'}]
export function payTypeLabel(value:PayType){return value==='daily'?'Gaji hari':'Kontrak'}
export function attendanceLabel(value:AttendanceStatus){return attendanceOptions.find((item)=>item.value===value)?.label??value}
export function attendanceUnits(value:AttendanceStatus){return value==='present'?1:value==='half_day'?0.5:0}
export function calculateDailyWage(status:AttendanceStatus,rate:number,overtimeHours:number,overtimeRate:number){return Math.round((attendanceUnits(status)*rate+overtimeHours*overtimeRate)*100)/100}
export function outstandingAttendanceWage(wageAmount:number,paidWageAmount:number){return Math.max(0,Math.round((wageAmount-paidWageAmount)*100)/100)}
export function formatMoney(value:number|string|null|undefined){return `RM ${Number(value??0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2})}`}
export function formatDate(value:string){const [year=1970,month=1,day=1]=value.slice(0,10).split('-').map(Number);return new Intl.DateTimeFormat('ms-MY',{day:'numeric',month:'short',year:'numeric'}).format(new Date(year,month-1,day))}
export function localDateISO(date=new Date()){const year=date.getFullYear();const month=String(date.getMonth()+1).padStart(2,'0');const day=String(date.getDate()).padStart(2,'0');return `${year}-${month}-${day}`}
export function previousDateISO(value:string){const [year,month,day]=value.split('-').map(Number);const date=new Date(year??1970,(month??1)-1,day??1);date.setDate(date.getDate()-1);return localDateISO(date)}
export function monthStart(value:string){return `${value.slice(0,7)}-01`}
