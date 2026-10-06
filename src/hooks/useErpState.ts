import { useEffect, useMemo, useState } from 'react';
import type { CartItem, Customer, Expense, Module, Payable, Product, PurchaseItem, Receivable, SaleRecord } from '../domain/types';
import { loadJson, saveJson, loadNumber, saveNumber } from '../utils/storage';
import { applyPurchaseToInventory, applySaleToInventory } from '../services/inventoryService';
import { buildSaleRecord, createReceivableFromSale } from '../services/salesService';
import { createPayableFromPurchase } from '../services/purchaseService';

const initialProducts: Product[] = [
  { id: 1, code: '750100000001', name: 'Eutirox 50 mcg', category: 'Medicamentos', laboratory: 'Merck', presentation: 'Caja x 50 tabletas', cost: 250, retail: 330, wholesale: 310, stock: 18, minStock: 8, lot: 'EUT-2607', expiry: '2027-07-31', supplier: 'Distribuidora Nacional' },
  { id: 2, code: '750100000002', name: 'Neurobión 25,000', category: 'Vitaminas', laboratory: 'Merck', presentation: 'Ampolla', cost: 205, retail: 265, wholesale: 245, stock: 6, minStock: 10, lot: 'NEU-2610', expiry: '2027-10-31', supplier: 'Droguería Central' },
  { id: 3, code: '750100000003', name: 'Calcio 1,500 mg + D3', category: 'Vitaminas', laboratory: 'Genérico', presentation: 'Frasco', cost: 335.65, retail: 449, wholesale: 420, stock: 14, minStock: 6, lot: 'CAL-2608', expiry: '2028-01-31', supplier: 'Distribuidora Nacional' },
  { id: 4, code: '750100000004', name: 'Alevian Duo', category: 'Medicamentos', laboratory: 'Asofarma', presentation: 'Caja', cost: 1275, retail: 2550, wholesale: 2200, stock: 3, minStock: 3, lot: 'ALE-2605', expiry: '2027-05-31', supplier: 'Droguería Central' },
];

export function useErpState() {
  const [active, setActive] = useState<Module>('dashboard');
  const [customers,setCustomers]=useState<Customer[]>(()=>loadJson<Customer[]>('difarmas_customers',[]));
  const [products, setProducts] = useState<Product[]>(() => loadJson<Product[]>('difarmas_products',initialProducts));
  const [search, setSearch] = useState('');
  const [monthlyGoal, setMonthlyGoal] = useState(() => loadNumber('difarmas_monthly_goal',100000));
  const [fixedExpenses, setFixedExpenses] = useState(() => loadNumber('difarmas_fixed_expenses',25000));
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleType, setSaleType] = useState<'minorista'|'mayorista'>('minorista');
  const [payment, setPayment] = useState<'Efectivo'|'Transferencia'|'Crédito'>('Efectivo');
  const [saleSearch, setSaleSearch] = useState('');
  const [purchaseCart, setPurchaseCart] = useState<PurchaseItem[]>([]);
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseSupplier, setPurchaseSupplier] = useState('');
  const [sales, setSales] = useState<SaleRecord[]>(()=>loadJson<SaleRecord[]>('difarmas_sales',[]));
  const [expenses, setExpenses] = useState<Expense[]>(()=>loadJson<Expense[]>('difarmas_expenses',[]));
  const [receivables, setReceivables] = useState<Receivable[]>(()=>loadJson<Receivable[]>('difarmas_receivables',[]));
  const [payables, setPayables] = useState<Payable[]>(()=>loadJson<Payable[]>('difarmas_payables',[]));

  useEffect(()=>{saveJson('difarmas_customers',customers)},[customers]);
  useEffect(()=>{saveJson('difarmas_products',products)},[products]);
  useEffect(()=>{saveNumber('difarmas_monthly_goal',monthlyGoal)},[monthlyGoal]);
  useEffect(()=>{saveNumber('difarmas_fixed_expenses',fixedExpenses)},[fixedExpenses]);
  useEffect(()=>{saveJson('difarmas_sales',sales)},[sales]);
  useEffect(()=>{saveJson('difarmas_expenses',expenses)},[expenses]);
  useEffect(()=>{saveJson('difarmas_receivables',receivables)},[receivables]);
  useEffect(()=>{saveJson('difarmas_payables',payables)},[payables]);

  const filtered=useMemo(()=>products.filter(p=>[p.code,p.name,p.category,p.laboratory].join(' ').toLowerCase().includes(search.toLowerCase())),[products,search]);

  const recordSale=(sold:CartItem[],customer='',dueDate='')=>{
    const sale=buildSaleRecord(sold,payment,saleType,customer,dueDate);
    setProducts(current=>applySaleToInventory(current,sold));
    setSales(current=>[...current,sale]);
    if(payment==='Crédito') setReceivables(current=>[...current,createReceivableFromSale(sale,customer,dueDate)]);
  };

  const saveProduct=(product:Product)=>{
    setProducts(current=>editing?current.map(p=>p.id===product.id?product:p):[...current,{...product,id:Date.now()}]);
    setEditing(null); setShowForm(false);
  };

  const receivePurchase=(items:PurchaseItem[],paymentMethod:string,dueDate:string)=>{
    setProducts(current=>applyPurchaseToInventory(current,items,purchaseSupplier));
    if(paymentMethod==='Crédito') setPayables(current=>[...current,createPayableFromPurchase(items,purchaseSupplier,dueDate)]);
  };

  return {active,setActive,customers,setCustomers,products,setProducts,search,setSearch,monthlyGoal,setMonthlyGoal,fixedExpenses,setFixedExpenses,showForm,setShowForm,editing,setEditing,cart,setCart,saleType,setSaleType,payment,setPayment,saleSearch,setSaleSearch,purchaseCart,setPurchaseCart,purchaseSearch,setPurchaseSearch,purchaseSupplier,setPurchaseSupplier,sales,setSales,expenses,setExpenses,receivables,setReceivables,payables,setPayables,filtered,recordSale,saveProduct,receivePurchase};
}
