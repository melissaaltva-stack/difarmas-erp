import type { SupplierCredit } from '../domain/types';

const MAX_CENTS = Number.MAX_SAFE_INTEGER;
const toCents=(value:number)=>{
  if(!Number.isFinite(value)||Math.abs(value)>MAX_CENTS/100)throw new RangeError('El importe excede el rango monetario seguro.');
  const cents=Math.round(value*100);
  if(!Number.isSafeInteger(cents))throw new RangeError('El importe excede el rango monetario seguro.');
  return cents;
};
const fromCents=(value:number)=>value/100;

function isValidCredit(credit:SupplierCredit):boolean{
  return !!credit&&typeof credit.supplier==='string'&&credit.supplier.trim().length>0
    &&Number.isFinite(credit.remainingBalance)&&credit.remainingBalance>=0
    &&Number.isSafeInteger(toCents(credit.remainingBalance))
    &&Array.isArray(credit.applications);
}

export function appendSupplierCreditOnce(credits:SupplierCredit[],credit:SupplierCredit):SupplierCredit[]{
  if(!Array.isArray(credits)||!credit||!Number.isInteger(credit.sourceReturnId)||credit.sourceReturnId<=0)throw new RangeError('El crédito del proveedor no es válido.');
  return credits.some(existing=>existing.sourceReturnId===credit.sourceReturnId)?credits:[...credits,credit];
}

export function splitSupplierCreditNote(amount:number,outstanding:number):{reduction:number;creditRemainder:number}{
  if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(outstanding)||outstanding<0)throw new RangeError('El importe de la nota de crédito o el saldo pendiente no es válido.');
  const noteCents=toCents(amount);
  const outstandingCents=toCents(outstanding);
  const reductionCents=Math.min(noteCents,outstandingCents);
  return {reduction:fromCents(reductionCents),creditRemainder:fromCents(noteCents-reductionCents)};
}

export function applySupplierCreditsToPurchase(credits:SupplierCredit[],supplier:string,purchaseId:number,invoiceNumber:string,invoiceTotal:number,date:string):{credits:SupplierCredit[];remainingPayable:number;appliedTotal:number}{
  if(!Array.isArray(credits)||typeof supplier!=='string'||!supplier.trim()||!Number.isInteger(purchaseId)||purchaseId<=0||!Number.isFinite(invoiceTotal)||invoiceTotal<0)throw new RangeError('Los datos para aplicar el crédito del proveedor no son válidos.');
  const remainingInvoiceCents=toCents(invoiceTotal);
  credits.forEach(credit=>{if(!isValidCredit(credit))throw new RangeError('El saldo o historial de un crédito de proveedor no es válido.');});
  let remainingCents=remainingInvoiceCents;
  const target=supplier.trim().toLocaleLowerCase();
  let appliedTotalCents=0;
  const updated=credits.map(credit=>{
    if(credit.supplier.trim().toLocaleLowerCase()!==target||credit.remainingBalance<=0||remainingCents<=0)return credit;
    const availableCents=toCents(credit.remainingBalance);
    const appliedCents=Math.min(remainingCents,availableCents);
    if(appliedCents<=0)return credit;
    remainingCents-=appliedCents;
    appliedTotalCents+=appliedCents;
    return {...credit,remainingBalance:fromCents(availableCents-appliedCents),applications:[...credit.applications,{purchaseId,invoiceNumber:invoiceNumber||undefined,amount:fromCents(appliedCents),date}]};
  });
  return {credits:updated,remainingPayable:fromCents(remainingCents),appliedTotal:fromCents(appliedTotalCents)};
}
