import { useEffect, useMemo, useRef, useState } from 'react';
import type { CartItem, CashClosure, CashMovement, Customer, ErpSettings, Expense, InventoryMovement, Module, Payable, PaymentTransaction, Product, PurchaseCostHistoryEntry, PurchaseItem, PurchaseRecord, Receivable, SaleRecord, Supplier, MissingProductRequest, SupplierReturnRecord, SaleAdjustmentRecord } from '../domain/types';
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

const initialSettings:ErpSettings={businessName:'DIFARMÁS',businessSubtitle:'Farmacia y distribución de medicamentos',rtn:'',phone:'',address:'',email:'',primaryColor:'#168568',currency:'HNL',templates:[
{id:'factura',name:'Factura de venta',title:'FACTURA',subtitle:'COMPROBANTE DE VENTA',footer:'Gracias por su compra. ¡En DIFARMÁS estamos para servirle!',paperSize:'A4',showLogo:true,showTaxLines:true,showSignatures:false,customFields:['Cliente','Método de pago']},
{id:'orden_compra',name:'Orden de compra',title:'ORDEN DE COMPRA',subtitle:'Solicitud de mercancía a proveedor',footer:'Favor confirmar disponibilidad, precios y fecha de entrega.',paperSize:'A4',showLogo:true,showTaxLines:true,showSignatures:true,customFields:['Proveedor','Fecha requerida','Condiciones de pago']},
{id:'nota_debito',name:'Nota de débito',title:'NOTA DE DÉBITO',subtitle:'Ajuste de saldo por cobrar/pagar',footer:'Conserve este documento para sus registros contables.',paperSize:'A4',showLogo:true,showTaxLines:true,showSignatures:true,customFields:['Documento relacionado','Motivo','Monto del ajuste']},
{id:'nota_credito',name:'Nota de crédito',title:'NOTA DE CRÉDITO',subtitle:'Ajuste, devolución o descuento',footer:'Conserve este documento para sus registros contables.',paperSize:'A4',showLogo:true,showTaxLines:true,showSignatures:true,customFields:['Documento relacionado','Motivo','Monto del ajuste']},
{id:'orden_entrega',name:'Orden de entrega',title:'ORDEN DE ENTREGA',subtitle:'Preparación y entrega de mercancía',footer:'Verifique cantidades y estado de los productos al recibir.',paperSize:'A4',showLogo:true,showTaxLines:false,showSignatures:true,customFields:['Cliente','Dirección de entrega','Recibido por']}
],users:[],
currencies:[
{code:'HNL',name:'Lempira hondureño',symbol:'L',exchangeRate:1,active:true},
{code:'USD',name:'Dólar estadounidense',symbol:'$',exchangeRate:26,active:true}
],
paymentMethods:[
{id:'cash',name:'Efectivo',kind:'cash',active:true,requiresReference:false},
{id:'transfer',name:'Transferencia bancaria',kind:'other',active:true,requiresReference:true},
{id:'credit',name:'Crédito',kind:'credit',active:true,requiresReference:false},
{id:'card',name:'Tarjeta',kind:'other',active:true,requiresReference:true}
],
billingInfo:{cai:'',authorizedRangeStart:'',authorizedRangeEnd:'',authorizationExpiry:'',establishmentCode:'',emissionPoint:'',documentTypeCode:'01',isvRate:15,fiscalLegend:'Documento interno. Configure la autorización fiscal vigente del SAR antes de emitir comprobantes fiscales.'}
};

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
  const [payment, setPayment] = useState<string>('Efectivo');
  const [saleSearch, setSaleSearch] = useState('');
  const [purchaseCart, setPurchaseCart] = useState<PurchaseItem[]>([]);
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseSupplier, setPurchaseSupplier] = useState('');
  const [sales, setSales] = useState<SaleRecord[]>(()=>loadJson<SaleRecord[]>('difarmas_sales',[]));
  const [purchases, setPurchases] = useState<PurchaseRecord[]>(()=>loadJson<PurchaseRecord[]>('difarmas_purchases',[]));
  const [purchaseCostHistory, setPurchaseCostHistory] = useState<PurchaseCostHistoryEntry[]>(()=>loadJson<PurchaseCostHistoryEntry[]>('difarmas_purchase_cost_history',[]));
  const [settings,setSettings] = useState<ErpSettings>(()=>loadJson<ErpSettings>('difarmas_settings',initialSettings));
  const [expenses, setExpenses] = useState<Expense[]>(()=>loadJson<Expense[]>('difarmas_expenses',[]));
  const [receivables, setReceivables] = useState<Receivable[]>(()=>loadJson<Receivable[]>('difarmas_receivables',[]));
  const [payables, setPayables] = useState<Payable[]>(()=>loadJson<Payable[]>('difarmas_payables',[]));
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>(()=>loadJson<InventoryMovement[]>('difarmas_inventory_movements',[]));
  const [cashClosures, setCashClosures] = useState<CashClosure[]>(()=>loadJson<CashClosure[]>('difarmas_cash_closures',[]));
  const [cashMovements, setCashMovements] = useState<CashMovement[]>(()=>loadJson<CashMovement[]>('difarmas_cash_movements',[]));
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransaction[]>(()=>loadJson<PaymentTransaction[]>('difarmas_payment_transactions',[]));
  const [missingProductRequests, setMissingProductRequests] = useState<MissingProductRequest[]>(()=>loadJson<MissingProductRequest[]>('difarmas_missing_product_requests',[]));
  const [supplierReturns, setSupplierReturns] = useState<SupplierReturnRecord[]>(()=>loadJson<SupplierReturnRecord[]>('difarmas_supplier_returns',[]));
  const [saleAdjustments, setSaleAdjustments] = useState<SaleAdjustmentRecord[]>(()=>loadJson<SaleAdjustmentRecord[]>('difarmas_sale_adjustments',[]));
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
  useEffect(()=>{saveJson('difarmas_purchase_cost_history',purchaseCostHistory)},[purchaseCostHistory]);
  useEffect(()=>{saveJson('difarmas_settings',settings)},[settings]);
  useEffect(()=>{saveJson('difarmas_expenses',expenses)},[expenses]);
  useEffect(()=>{saveJson('difarmas_receivables',receivables)},[receivables]);
  useEffect(()=>{saveJson('difarmas_payables',payables)},[payables]);
  useEffect(()=>{saveJson('difarmas_inventory_movements',inventoryMovements)},[inventoryMovements]);
  useEffect(()=>{saveJson('difarmas_cash_closures',cashClosures)},[cashClosures]);
  useEffect(()=>{saveJson('difarmas_cash_movements',cashMovements)},[cashMovements]);
  useEffect(()=>{saveJson('difarmas_payment_transactions',paymentTransactions)},[paymentTransactions]);
  useEffect(()=>{saveJson('difarmas_missing_product_requests',missingProductRequests)},[missingProductRequests]);
  useEffect(()=>{saveJson('difarmas_supplier_returns',supplierReturns)},[supplierReturns]);
  useEffect(()=>{saveJson('difarmas_sale_adjustments',saleAdjustments)},[saleAdjustments]);

  const snapshot = useMemo<ErpSnapshot>(() => ({
    customers, suppliers, products, sales, purchases, purchaseCostHistory, settings, expenses, receivables, payables,
    inventoryMovements, monthlyGoal, fixedExpenses, cashClosures, cashMovements, paymentTransactions, missingProductRequests, supplierReturns, saleAdjustments,
  }), [customers, suppliers, products, sales, purchases, purchaseCostHistory, settings, expenses, receivables, payables, inventoryMovements, monthlyGoal, fixedExpenses, cashClosures, cashMovements, paymentTransactions, missingProductRequests, supplierReturns, saleAdjustments]);

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
      setPurchaseCostHistory([]);
      setSettings(initialSettings);
      setExpenses([]);
      setReceivables([]);
      setPayables([]);
      setInventoryMovements([]);
      setCashClosures([]);
      setCashMovements([]);
      setPaymentTransactions([]);
      setMissingProductRequests([]);
      setSupplierReturns([]);
      setSaleAdjustments([]);
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
        setPurchaseCostHistory(remote.purchaseCostHistory ?? []);
        setSettings(remote.settings ?? initialSettings);
        setExpenses(remote.expenses);
        setReceivables(remote.receivables);
        setPayables(remote.payables);
        setInventoryMovements(remote.inventoryMovements);
        if (remote.cashClosures !== undefined) setCashClosures(remote.cashClosures);
        if (remote.cashMovements !== undefined) setCashMovements(remote.cashMovements);
        if (remote.paymentTransactions !== undefined) setPaymentTransactions(remote.paymentTransactions);
        setMissingProductRequests(remote.missingProductRequests ?? []);
        setSupplierReturns(remote.supplierReturns ?? []);
        setSaleAdjustments(remote.saleAdjustments ?? []);
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

  const recordMissingProduct=(request:Omit<MissingProductRequest,'id'|'requestedAt'|'status'>):boolean=>{
    const name=request.name.trim();
    if(!name||!Number.isFinite(request.quantity)||request.quantity<1)return false;
    setMissingProductRequests(current=>[{...request,name,id:Date.now(),requestedAt:new Date().toISOString(),status:'Pendiente'},...current]);
    return true;
  };

  const recordSale=(sold:CartItem[],customer='',dueDate='',customerRtn=''):boolean=>{
    if (saleInProgress.current) return false;
    if (!sold.length || sold.some(item => !Number.isFinite(item.qty) || item.qty <= 0)) return false;
    if (((settings.paymentMethods??[]).find(method=>method.name===payment)?.kind==='credit'||payment==='Crédito') && (!customer.trim() || !dueDate.trim())) return false;
    if (sold.some(item => !products.some(p => p.id === item.id && p.stock >= item.qty))) return false;
    let updated: Product[];
    try { updated = applySaleToInventory(products,sold); } catch { return false; }
    saleInProgress.current=true;
    const sale:SaleRecord={...buildSaleRecord(sold,payment,saleType,customer,dueDate),customer:customer.trim()||undefined,customerRtn:customerRtn.trim()||undefined};
    setProducts(updated);
    setInventoryMovements(current=>[...current,...createInventoryMovementsForSale(products,sold,sale.id)]);
    setSales(current=>[...current,sale]);
    if((settings.paymentMethods??[]).find(method=>method.name===payment)?.kind==='credit'||payment==='Crédito') setReceivables(current=>[...current,createReceivableFromSale(sale,customer,dueDate)]);
    return true;
  };

  const recordSupplierDispatch=(record:SupplierReturnRecord):boolean=>{
    if(!record.items.length)return false;
    if(record.items.some(item=>!Number.isInteger(item.quantity)||item.quantity<=0||!products.some(p=>p.id===item.productId&&p.stock>=item.quantity)))return false;
    const updated=products.map(product=>{
      const item=record.items.find(line=>line.productId===product.id);
      return item?{...product,stock:product.stock-item.quantity}:product;
    });
    const movements:InventoryMovement[]=record.items.flatMap(item=>{
      const product=products.find(p=>p.id===item.productId);
      if(!product)return [];
      return [{id:Date.now()+item.productId,productId:item.productId,productName:item.productName,type:'Ajuste' as const,quantity:item.quantity,stockBefore:product.stock,stockAfter:product.stock-item.quantity,unitCost:item.unitCost,referenceId:record.id,date:new Date().toISOString(),note:'Devolución enviada al proveedor: '+record.reason}];
    });
    setProducts(updated);
    setInventoryMovements(current=>[...current,...movements]);
    return true;
  };

  const recordSaleAdjustment=(adjustment:SaleAdjustmentRecord):boolean=>{
    if(saleAdjustments.some(item=>item.id===adjustment.id)||!sales.some(sale=>sale.id===adjustment.saleId)||!adjustment.items.length||!Number.isFinite(adjustment.amount)||adjustment.amount<=0)return false;
    if(adjustment.items.some(item=>!Number.isInteger(item.quantity)||item.quantity<=0||!Number.isFinite(item.unitPrice)||item.unitPrice<0))return false;
    const adjustedItems=saleAdjustments.filter(item=>item.saleId===adjustment.saleId&&item.type!=='Anulación').flatMap(item=>item.items);
    for(const line of adjustment.items){
      const sold=sales.find(sale=>sale.id===adjustment.saleId)?.items?.find(item=>item.productId===line.productId);
      const already=adjustedItems.filter(item=>item.productId===line.productId).reduce((sum,item)=>sum+item.quantity,0);
      if(!sold||already+line.quantity>sold.qty)return false;
    }
    if(adjustment.type==='Anulación'&&saleAdjustments.some(item=>item.saleId===adjustment.saleId&&item.type==='Anulación'))return false;
    let updated=products;
    const movements:InventoryMovement[]=[];
    for(const line of adjustment.items){
      if(!line.returnToStock)continue;
      const product=updated.find(p=>p.id===line.productId);
      if(!product)return false;
      movements.push({id:Date.now()+line.productId,productId:line.productId,productName:line.productName,type:'Ajuste',quantity:line.quantity,stockBefore:product.stock,stockAfter:product.stock+line.quantity,unitCost:line.unitCost,referenceId:adjustment.id,date:new Date().toISOString(),note:'Devolución de venta '+adjustment.invoiceNumber});
      updated=updated.map(p=>p.id===line.productId?{...p,stock:p.stock+line.quantity}:p);
    }
    setProducts(updated);
    setInventoryMovements(current=>[...current,...movements]);
    if(adjustment.paymentMethod.toLowerCase().includes('efectivo')){
      setCashMovements(current=>[{id:adjustment.id,type:'Salida',description:'Reembolso por '+adjustment.type+' '+adjustment.invoiceNumber,amount:adjustment.amount,category:'Devoluciones de ventas',date:new Date().toISOString()},...current]);
    }
    setSaleAdjustments(current=>[adjustment,...current]);
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
    const receivedAt = new Date().toISOString();
    setPurchases(current=>[{id:referenceId,supplier:purchaseSupplier,total,paymentMethod:paymentMethod as 'Efectivo'|'Transferencia'|'Crédito',date:receivedAt},...current]);
    setPurchaseCostHistory(current=>[
      ...items.map((item,index):PurchaseCostHistoryEntry=>({id:referenceId+index,purchaseId:referenceId,productId:item.id,productCode:item.code,productName:item.name,supplier:purchaseSupplier.trim(),unitCost:item.unitCost,quantity:item.qty,date:receivedAt})),
      ...current,
    ]);
    if(paymentMethod==='Crédito') setPayables(current=>[...current,createPayableFromPurchase(items,purchaseSupplier,dueDate)]);
    return true;
  };

  return {active,setActive,customers,setCustomers,suppliers,setSuppliers,products,setProducts,search,setSearch,monthlyGoal,setMonthlyGoal,fixedExpenses,setFixedExpenses,settings,setSettings,showForm,setShowForm,editing,setEditing,cart,setCart,saleType,setSaleType,payment,setPayment,saleSearch,setSaleSearch,purchaseCart,setPurchaseCart,purchaseSearch,setPurchaseSearch,purchaseSupplier,setPurchaseSupplier,sales,setSales,purchases,purchaseCostHistory,expenses,setExpenses,receivables,setReceivables,payables,setPayables,inventoryMovements,cashClosures,setCashClosures,cashMovements,setCashMovements,paymentTransactions,setPaymentTransactions,missingProductRequests,setMissingProductRequests,supplierReturns,setSupplierReturns,saleAdjustments,setSaleAdjustments,recordSupplierDispatch,recordSaleAdjustment,recordMissingProduct,filtered,recordSale,saveProduct,receivePurchase,syncStatus,syncError};
}