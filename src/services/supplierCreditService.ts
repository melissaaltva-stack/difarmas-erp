import type { SupplierCredit } from '../domain/types';

const toCents=(value:number)=>Math.round(value*100);
const fromCents=(value:number)=>value/100;

export function appendSupplierCreditOnce(credits:SupplierCredit[],credit:SupplierCredit):SupplierCredit[]{
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
  if(!supplier.trim()||!Number.isInteger(purchaseId)||purchaseId<=0||!Number.isFinite(invoiceTotal)||invoiceTotal<0)throw new RangeError('Los datos para aplicar el crédito del proveedor no son válidos.');
  let remainingCents=toCents(invoiceTotal);
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
