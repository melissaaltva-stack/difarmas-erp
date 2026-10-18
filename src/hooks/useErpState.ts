import { useEffect, useMemo, useRef, useState } from 'react';
import type { CartItem, CashClosure, CashMovement, Customer, Expense, InventoryMovement, Module, Payable, PaymentTransaction, Product, PurchaseItem, PurchaseRecord, Receivable, SaleRecord, Supplier } from '../domain/types';
import { loadJson, saveJson, loadNumber, saveNumber } from '../utils/storage';
import { applyPurchaseToInventory, applySaleToInventory } from '../services/inventoryService';
import { buildSaleRecord, createReceivableFromSale } from '../services/salesService';
import { createPayableFromPurchase } from '../services/purchaseService';
import { createInventoryMovementsForPurchase, createInventoryMovementsForSale } from '../services/inventoryMovementService';
import { loadErpSnapshot, saveErpSnapshot, type ErpSnapshot } from '../services/remoteErpState';

const initialProducts: Product[] = [
  { id: 1, code: '750100000001', name: 'Eutirox 50 mcg', category: 'Medicamentos', laboratory: 'Merck', presentation: 'Caja x 50 tabletas', cost: 250, retail: 330, wholesale: 310, stock: 18, minStock: 8, lot: 'EUT-2607', expiry: '2027-07-31', supplier: 'Distribuidora Nacional' },
  { id: 2, code: '750100000002', name: 'Neurobión 25,000', category: 'Vitaminas', laboratory: 'Merck', presentation: 'Ampolla', cost: 205, retail: 265, wholesale: 245, stock: 6, minStock: 10, lot: 'NEU-2610', expiry: '2027-10-31', supplier: 'Droguería Central' },
  { id: 3, code: '750100000003', name: 'Calcio 1,500 mg + D3', category: 'Vitaminas', laboratory: 'Genérico', presentation: 'Frasco', cost: 335.65, retail: 449, wholesale: 420, stock: 14, minStock: 6, lot: 'CAL-2608', expiry: '2028-01-31', supplier: 'Distribuidora Nacional' },
  { id: 4, code: '750100000004', name: 'Alevian Duo', category: 'Medicamentos', laboratory: 'Asofarma', presentation: 'Caja', cost: 1275, retail: 2550, wholesale: 2200, stock: 3, minStock: 3, lot: 'ALE-2605', expiry: '2027-05-31', supplier: 'Droguería Central' },
];

export function useErpState(userId: string) {
  const [active, setActive] = useState<Module>('dashboard');
  const [customers,setCustomers]=useState<Customer[]>(()=>loadJson<Customer[]>('difarmas_customers',[]));
  const [suppliers,setSuppliers]=useState<Supplier[]>(()=>loadJson<Supplier[]>('difarmas_suppliers',[]));
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
  const [purchases, setPurchases] = useState<PurchaseRecord[]>(()=>loadJson<PurchaseRecord[]>('difarmas_purchases',[]));
  const [expenses, setExpenses] = useState<Expense[]>(()=>loadJson<Expense[]>('difarmas_expenses',[]));
  const [receivables, setReceivables] = useState<Receivable[]>(()=>loadJson<Receivable[]>('difarmas_receivables',[]));
  const [payables, setPayables] = useState<Payable[]>(()=>loadJson<Payable[]>('difarmas_payables',[]));
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>(()=>loadJson<InventoryMovement[]>('difarmas_inventory_movements',[]));
  const [cashClosures, setCashClosures] = useState<CashClosure[]>(()=>loadJson<CashClosure[]>('difarmas_cash_closures',[]));
  const [cashMovements, setCashMovements] = useState<CashMovement[]>(()=>loadJson<CashMovement[]>('difarmas_cash_movements',[]));
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransaction[]>(()=>loadJson<PaymentTransaction[]>('difarmas_payment_transactions',[]));
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'loading'|'saving'|'synced'|'error'>('loading');
  const [syncError, setSyncError] = useState<string | null>(null);
  const saleInProgress = useRef(false);
  const purchaseInProgress = useRef(false);

  useEffect(()=>{saleInProgress.current=false},[sales]);
  useEffect(()=>{purchaseInProgress.current=false},[purchases]);

  useEffect(()=>{saveJson('difarmas_customers',customers)},[customers]);
  useEffect(()=>{saveJson('difarmas_suppliers',suppliers)},[suppliers]);
  useEffect(()=>{saveJson('difarmas_products',products)},[products]);
  useEffect(()=>{saveNumber('difarmas_monthly_goal',monthlyGoal)},[monthlyGoal]);
  useEffect(()=>{saveNumber('difarmas_fixed_expenses',fixedExpenses)},[fixedExpenses]);
  useEffect(()=>{saveJson('difarmas_sales',sales)},[sales]);
  useEffect(()=>{saveJson('difarmas_purchases',purchases)},[purchases]);
  useEffect(()=>{saveJson('difarmas_expenses',expenses)},[expenses]);
  useEffect(()=>{saveJson('difarmas_receivables',receivables)},[receivables]);
  useEffect(()=>{saveJson('difarmas_payables',payables)},[payables]);
  useEffect(()=>{saveJson('difarmas_inventory_movements',inventoryMovements)},[inventoryMovements]);
  useEffect(()=>{saveJson('difarmas_cash_closures',cashClosures)},[cashClosures]);
  useEffect(()=>{saveJson('difarmas_cash_movements',cashMovements)},[cashMovements]);
  useEffect(()=>{saveJson('difarmas_payment_transactions',paymentTransactions)},[paymentTransactions]);

  const snapshot = useMemo<ErpSnapshot>(() => ({
    customers, suppliers, products, sales, purchases, expenses, receivables, payables,
    inventoryMovements, monthlyGoal, fixedExpenses, cashClosures, cashMovements, paymentTransactions,
  }), [customers, suppliers, products, sales, purchases, expenses, receivables, payables, inventoryMovements, monthlyGoal, fixedExpenses, cashClosures, cashMovements, paymentTransactions]);

  // Load the signed-in user's snapshot before allowing remote writes. A first login
  // seeds the cloud record from this browser's existing local data.
  useEffect(() => {
    let activeRequest = true;
    setRemoteReady(false);
    setSyncStatus('loading');
    setSyncError(null);

    // localStorage is shared by all accounts in this browser. Never seed one
    // account from another account's local cache.
    const previousOwner = localStorage.getItem('difarmas_owner_user_id');
    const accountChanged = Boolean(previousOwner && previousOwner !== userId);
    if (accountChanged) {
      setCustomers([]);
      setSuppliers([]);
      setProducts(initialProducts);
      setSales([]);
      setPurchases([]);
      setExpenses([]);
      setReceivables([]);
      setPayables([]);
      setInventoryMovements([]);
      setCashClosures([]);
      setCashMovements([]);
      setPaymentTransactions([]);
      setMonthlyGoal(100000);
      setFixedExpenses(25000);
    }

    loadErpSnapshot(userId).then(remote => {
      if (!activeRequest) return;
      if (remote) {
        setCustomers(remote.customers);
        setSuppliers(remote.suppliers ?? []);
        setProducts(remote.products);
        setSales(remote.sales);
        setPurchases(remote.purchases);
        setExpenses(remote.expenses);
        setReceivables(remote.receivables);
        setPayables(remote.payables);
        setInventoryMovements(remote.inventoryMovements);
        if (remote.cashClosures !== undefined) setCashClosures(remote.cashClosures);
        if (remote.cashMovements !== undefined) setCashMovements(remote.cashMovements);
        if (remote.paymentTransactions !== undefined) setPaymentTransactions(remote.paymentTransactions);
        setMonthlyGoal(remote.monthlyGoal);
        setFixedExpenses(remote.fixedExpenses);
      }
      localStorage.setItem('difarmas_owner_user_id', userId);
      setRemoteReady(true);
      setSyncStatus('saving');
      setSyncError(null);
    }).catch((error: unknown) => {
      if (!activeRequest) return;
      // Fail closed for cloud writes: never overwrite a remote record if it could
      // not be read. The local app remains visible but clearly reports the error.
      setSyncStatus('error');
      setSyncError(error instanceof Error ? error.message : 'No se pudieron leer los datos de Supabase. Verifica la conexión y la configuración.');
    });
    return () => { activeRequest = false; };
  }, [userId]);

  useEffect(() => {
    if (!remoteReady) return;
    setSyncStatus('saving');
    setSyncError(null);
    const timer = window.setTimeout(() => {
      saveErpSnapshot(userId, snapshot)
        .then(() => { setSyncStatus('synced'); setSyncError(null); })
        .catch((error: unknown) => {
          setSyncStatus('error');
          setSyncError(error instanceof Error ? error.message : 'No se pudieron guardar los datos en Supabase.');
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [remoteReady, userId, snapshot]);

  const filtered=useMemo(()=>products.filter(p=>[p.code,p.name,p.category,p.laboratory].join(' ').toLowerCase().includes(search.toLowerCase())),[products,search]);

  const recordSale=(sold:CartItem[],customer='',dueDate=''):boolean=>{
    if (saleInProgress.current) return false;
    if (!sold.length || sold.some(item => !Number.isFinite(item.qty) || item.qty <= 0)) return false;
    if (payment === 'Crédito' && (!customer.trim() || !dueDate.trim())) return false;
    if (sold.some(item => !products.some(p => p.id === item.id && p.stock >= item.qty))) return false;
    let updated: Product[];
    try { updated = applySaleToInventory(products,sold); } catch { return false; }
    saleInProgress.current=true;
    const sale=buildSaleRecord(sold,payment,saleType,customer,dueDate);
    setProducts(updated);
    setInventoryMovements(current=>[...current,...createInventoryMovementsForSale(products,sold,sale.id)]);
    setSales(current=>[...current,sale]);
    if(payment==='Crédito') setReceivables(current=>[...current,createReceivableFromSale(sale,customer,dueDate)]);
    return true;
  };

  const saveProduct=(product:Product)=>{
    if (!product.name.trim() || [product.cost,product.retail,product.wholesale,product.stock,product.minStock].some(v=>!Number.isFinite(v)||v<0)) return;
    if (editing) {
      const previous = products.find(p=>p.id===editing.id);
      const saved = {...product,id:editing.id};
      setProducts(current=>current.map(p=>p.id===editing.id?saved:p));
      if (previous && previous.stock !== saved.stock) {
        const difference = saved.stock - previous.stock;
        setInventoryMovements(current=>[...current,{id:Date.now(),productId:saved.id,productName:saved.name,type:'Ajuste',quantity:Math.abs(difference),stockBefore:previous.stock,stockAfter:saved.stock,unitCost:saved.cost,date:new Date().toISOString(),note:difference>0?'Ajuste de entrada manual':'Ajuste de salida manual'}]);
      }
    } else {
      setProducts(current=>[...current,{...product,id:Date.now()}]);
    }
    setEditing(null); setShowForm(false);
  };

  const receivePurchase=(items:PurchaseItem[],paymentMethod:string,dueDate:string):boolean=>{
    if (purchaseInProgress.current) return false;
    if (!items.length || items.some(item => !Number.isFinite(item.qty) || item.qty <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0)) return false;
    let updated: Product[];
    try { updated = applyPurchaseToInventory(products,items,purchaseSupplier); } catch { return false; }
    purchaseInProgress.current=true;
    const referenceId = Date.now();
    setProducts(updated);
    setInventoryMovements(current=>[...current,...createInventoryMovementsForPurchase(products,items,referenceId)]);
    const total=items.reduce((sum,item)=>sum+item.qty*item.unitCost,0);
    setPurchases(current=>[{id:referenceId,supplier:purchaseSupplier,total,paymentMethod:paymentMethod as 'Efectivo'|'Transferencia'|'Crédito',date:new Date().toISOString()},...current]);
    if(paymentMethod==='Crédito') setPayables(current=>[...current,createPayableFromPurchase(items,purchaseSupplier,dueDate)]);
    return true;
  };

  return {active,setActive,customers,setCustomers,suppliers,setSuppliers,products,setProducts,search,setSearch,monthlyGoal,setMonthlyGoal,fixedExpenses,setFixedExpenses,showForm,setShowForm,editing,setEditing,cart,setCart,saleType,setSaleType,payment,setPayment,saleSearch,setSaleSearch,purchaseCart,setPurchaseCart,purchaseSearch,setPurchaseSearch,purchaseSupplier,setPurchaseSupplier,sales,setSales,purchases,expenses,setExpenses,receivables,setReceivables,payables,setPayables,inventoryMovements,cashClosures,setCashClosures,cashMovements,setCashMovements,paymentTransactions,setPaymentTransactions,filtered,recordSale,saveProduct,receivePurchase,syncStatus,syncError};
}
