import { describe, expect, it } from 'vitest';
import type { SupplierCredit } from '../domain/types';
import { applySupplierCreditsToPurchase, splitSupplierCreditNote } from './supplierCreditService';

const credit=(overrides:Partial<SupplierCredit>={}):SupplierCredit=>({
  id:1,supplier:'Droguería Central',sourceReturnId:10,sourcePurchaseId:20,sourceReference:'FC-20',
  amount:100,remainingBalance:100,createdAt:'2026-11-02T10:00:00.000Z',applications:[],...overrides,
});

describe('supplier credit ledger',()=>{
  it('applies a credit note to the open payable and keeps only the excess as supplier credit',()=>{
    expect(splitSupplierCreditNote(125,80)).toEqual({reduction:80,creditRemainder:45});
  });

  it('stores the full credit when the original cash purchase has no payable',()=>{
    expect(splitSupplierCreditNote(75,0)).toEqual({reduction:0,creditRemainder:75});
  });

  it('does not create a remainder when the open payable covers the note',()=>{
    expect(splitSupplierCreditNote(60,100)).toEqual({reduction:60,creditRemainder:0});
  });

  it('rejects invalid amounts and balances',()=>{
    expect(()=>splitSupplierCreditNote(0,20)).toThrow(RangeError);
    expect(()=>splitSupplierCreditNote(20,-1)).toThrow(RangeError);
  });

  it('applies available credits in order to future credit purchases and records each application',()=>{
    const first=credit({id:1,remainingBalance:30});
    const second=credit({id:2,remainingBalance:50});
    const otherSupplier=credit({id:3,supplier:'Otro proveedor',remainingBalance:500});
    const result=applySupplierCreditsToPurchase([first,second,otherSupplier],'  DROGUERÍA CENTRAL ',40,'FC-40',60,'2026-11-02T12:00:00.000Z');
    expect(result.remainingPayable).toBe(0);
    expect(result.appliedTotal).toBe(60);
    expect(result.credits[0].remainingBalance).toBe(0);
    expect(result.credits[0].applications[0]).toMatchObject({purchaseId:40,invoiceNumber:'FC-40',amount:30});
    expect(result.credits[1].remainingBalance).toBe(20);
    expect(result.credits[1].applications[0].amount).toBe(30);
    expect(result.credits[2]).toEqual(otherSupplier);
  });

  it('preserves the unused balance when a future invoice is smaller than the credit',()=>{
    const result=applySupplierCreditsToPurchase([credit({remainingBalance:90})],'Droguería Central',41,'FC-41',25,'2026-11-02T12:00:00.000Z');
    expect(result.remainingPayable).toBe(0);
    expect(result.appliedTotal).toBe(25);
    expect(result.credits[0].remainingBalance).toBe(65);
  });

  it('does not apply credits from a different supplier',()=>{
    const result=applySupplierCreditsToPurchase([credit({supplier:'Proveedor B'})],'Droguería Central',42,'FC-42',40,'2026-11-02T12:00:00.000Z');
    expect(result.remainingPayable).toBe(40);
    expect(result.appliedTotal).toBe(0);
  });
});
