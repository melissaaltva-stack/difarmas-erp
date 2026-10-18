import { describe, expect, it } from 'vitest';
import { isExpiryAtLeastSixMonths, sixMonthExpiryThreshold, earlierExpiryAlternatives } from './expiryService';
import type { Product } from '../domain/types';

const product=(overrides:Partial<Product>):Product=>({id:1,code:'A',name:'Producto A',activeIngredients:['paracetamol'],category:'Medicamentos',laboratory:'Lab',presentation:'Caja',cost:10,retail:20,wholesale:18,stock:5,minStock:1,lot:'L1',expiry:'2027-12-31',supplier:'Proveedor',...overrides});

describe('expiry safeguards',()=>{
  it('calculates a six-month calendar threshold',()=>{
    expect(sixMonthExpiryThreshold(new Date(2026,9,17))).toBe('2027-04-17');
    expect(sixMonthExpiryThreshold(new Date(2026,7,31))).toBe('2027-02-28');
  });
  it('rejects dates under six months and accepts the exact threshold',()=>{
    const now=new Date(2026,9,17);
    expect(isExpiryAtLeastSixMonths('2027-04-16',now)).toBe(false);
    expect(isExpiryAtLeastSixMonths('2027-04-17',now)).toBe(true);
    expect(isExpiryAtLeastSixMonths('',now)).toBe(false);
  });
  it('recommends an in-stock product with the same active ingredient and earlier expiry',()=>{
    const later=product({id:1,name:'Marca B',expiry:'2027-12-31'});
    const earlier=product({id:2,name:'Genérico A',expiry:'2027-08-01',activeIngredients:['Paracetamól'],stock:3});
    expect(earlierExpiryAlternatives(later,[later,earlier]).map(p=>p.id)).toEqual([2]);
  });
});
