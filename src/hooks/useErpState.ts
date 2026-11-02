import { useEffect, useMemo, useRef, useState } from 'react';
import type { CartItem, CashClosure, CashMovement, Customer, ErpSettings, Expense, InventoryMovement, Module, Payable, PaymentTransaction, Product, PurchaseCostHistoryEntry, PurchaseItem, PurchaseRecord, Receivable, SaleRecord, Supplier, MissingProductRequest, SupplierReturnRecord, SaleAdjustmentRecord, QuoteRecord, StandardInvoiceDetails } from '../domain/types';
import { loadJson, saveJson, loadNumber, saveNumber } from '../utils/storage';
import { applyPurchaseToInventory, applySaleToInventory } from '../services/inventoryService';
import { buildSaleRecord, createReceivableFromSale } from '../services/salesService';
import { createPayableFromPurchase } from '../services/purchaseService';
import { createInventoryMovementsForPurchase, createInventoryMovementsForSale } from '../services/inventoryMovementService';
import { loadErpSnapshot, saveErpSnapshot, saveQuotesForUser, type ErpSnapshot } from '../services/remoteErpState';
import { ensureCustomerCodes } from '../services/customerCodeService';

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

function loadUserJson<T>(userId: string, key: string, fallback: T): T {
  // Do not hydrate a new account with another account's browser cache, even
  // for the first render before the account-change effect has run.
  const owner = localStorage.getItem('difarmas_owner_user_id');
  if (owner && owner !== userId) return fallback;
  return loadJson<T>(key, fallback);
}

function loadUserNumber(userId: string, key: string, fallback: number): number {
  const owner = localStorage.getItem('difarmas_owner_user_id');
  if (owner && owner !== userId) return fallback;
  return loadNumber(key, fallback);
}

export function useErpState(userId: string) {
  const [active, setActive] = useState<Module>('dashboard');
  const [customers,setCustomersRaw]=useState<Customer[]>(()=>ensureCustomerCodes(loadUserJson<Customer[]>(userId,'difarmas_customers',[])));
  const setCustomers=(value:Customer[]|((current:Customer[])=>Customer[]))=>setCustomersRaw(current=>ensureCustomerCodes(typeof value==='function'?value(current):value,current));
  const [quotes,setQuotes]=useState<QuoteRecord[]>(()=>loadUserJson<QuoteRecord[]>(userId,'difarmas_quotes',[]));
  const [suppliers,setSuppliers]=useState<Supplier[]>(()=>loadUserJson<Supplier[]>(userId,'difarmas_suppliers',[]));
  const [products, setProducts] = useState<Product[]>(() => loadUserJson<Product[]>(userId,'difarmas_products',initialProducts));
  const [search, setSearch] = useState('');
  const [monthlyGoal, setMonthlyGoal] = useState(() => loadUserNumber(userId,'difarmas_monthly_goal',100000));
  const [fixedExpenses, setFixedExpenses] = useState(() => loadUserNumber(userId,'difarmas_fixed_expenses',25000));
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleType, setSaleType] = useState<'minorista'|'mayorista'>('minorista');
  const [payment, setPayment] = useState<string>('Efectivo');
  const [saleSearch, setSaleSearch] = useState('');
  const [purchaseCart, setPurchaseCart] = useState<PurchaseItem[]>([]);
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseSupplier, setPurchaseSupplier] = useState('');
  const [sales, setSales] = useState<SaleRecord[]>(()=>loadUserJson<SaleRecord[]>(userId,'difarmas_sales',[]));
  const lastSaleId = useRef(0);
  const nextSaleId = () => {
    const highestStoredId = sales.reduce((highest,sale)=>Math.max(highest,Number(sale.id)||0),0);
    const nextId = Math.max(Date.now(),highestStoredId,lastSaleId.current)+1;
    lastSaleId.current=nextId;
    return nextId;
  };
  const [purchases, setPurchases] = useState<PurchaseRecord[]>(()=>loadUserJson<PurchaseRecord[]>(userId,'difarmas_purchases',[]));
  const [purchaseCostHistory, setPurchaseCostHistory] = useState<PurchaseCostHistoryEntry[]>(()=>loadUserJson<PurchaseCostHistoryEntry[]>(userId,'difarmas_purchase_cost_history',[]));
  const lastPurchaseId = useRef(0);
  const nextPurchaseId = () => {
    const highestStoredId = purchases.reduce((highest,purchase)=>Math.max(highest,Number(purchase.id)||0),0);
    const nextId = Math.max(Date.now(),highestStoredId,lastPurchaseId.current)+1;
    lastPurchaseId.current=nextId;
    return nextId;
  };
  const lastPurchaseCostHistoryId = useRef(0);
  const nextPurchaseCostHistoryId = () => {
    const highestStoredId = purchaseCostHistory.reduce((highest,entry)=>Math.max(highest,Number(entry.id)||0),0);
    const nextId = Math.max(Date.now(),highestStoredId,lastPurchaseCostHistoryId.current)+1;
    lastPurchaseCostHistoryId.current=nextId;
    return nextId;
  };
  const [settings,setSettings] = useState<ErpSettings>(()=>loadUserJson<ErpSettings>(userId,'difarmas_settings',initialSettings));
  const [expenses, setExpenses] = useState<Expense[]>(()=>loadUserJson<Expense[]>(userId,'difarmas_expenses',[]));
  const [receivables, setReceivables] = useState<Receivable[]>(()=>loadUserJson<Receivable[]>(userId,'difarmas_receivables',[]));
  const [payables, setPayables] = useState<Payable[]>(()=>loadUserJson<Payable[]>(userId,'difarmas_payables',[]));
  const lastPayableId = useRef(0);
  const nextPayableId = () => {
    const highestStoredId = payables.reduce((highest,payable)=>Math.max(highest,Number(payable.id)||0),0);
    const nextId = Math.max(Date.now(),highestStoredId,lastPayableId.current)+1;
    lastPayableId.current=nextId;
    return nextId;
  };
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>(()=>loadUserJson<InventoryMovement[]>(userId,'difarmas_inventory_movements',[]));
  const lastInventoryMovementId = useRef(0);
  const nextInventoryMovementId = () => {
    const highestStoredId = inventoryMovements.reduce((highest,movement)=>Math.max(highest,Number(movement.id)||0),0);
    const nextId = Math.max(Date.now(),highestStoredId,lastInventoryMovementId.current)+1;
    lastInventoryMovementId.current=nextId;
    return nextId;
  };
  const [cashClosures, setCashClosures] = useState<CashClosure[]>(()=>loadUserJson<CashClosure[]>(userId,'difarmas_cash_closures',[]));
  const [cashMovements, setCashMovements] = useState<CashMovement[]>(()=>loadUserJson<CashMovement[]>(userId,'difarmas_cash_movements',[]));
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransaction[]>(()=>loadUserJson<PaymentTransaction[]>(userId,'difarmas_payment_transactions',[]));
  const [missingProductRequests, setMissingProductRequests] = useState<MissingProductRequest[]>(()=>loadUserJson<MissingProductRequest[]>(userId,'difarmas_missing_product_requests',[]));
  const lastMissingProductRequestId = useRef(0);
  const nextMissingProductRequestId = () => {
    const highestStoredId = missingProductRequests.reduce((highest,request)=>Math.max(highest,Number(request.id)||0),0);
    const nextId = Math.max(Date.now(),highestStoredId,lastMissingProductRequestId.current)+1;
    lastMissingProductRequestId.current=nextId;
    return nextId;
  };
  const lastProductId = useRef(0);
  const nextProductId = () => {
    const highestStoredId = products.reduce((highest,product)=>Math.max(highest,Number(product.id)||0),0);
    const nextId = Math.max(Date.now(),highestStoredId,lastProductId.current)+1;
    lastProductId.current=nextId;
    return nextId;
  };
  const [supplierReturns, setSupplierReturns] = useState<SupplierReturnRecord[]>(()=>loadUserJson<SupplierReturnRecord[]>(userId,'difarmas_supplier_returns',[]));
  const [saleAdjustments, setSaleAdjustments] = useState<SaleAdjustmentRecord[]>(()=>loadUserJson<SaleAdjustmentRecord[]>(userId,'difarmas_sale_adjustments',[]));
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'loading'|'saving'|'synced'|'error'>('loading');
  const [syncError, setSyncError] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const saleInProgress = useRef(false);
  const purchaseInProgress = useRef(false);
  const supplierDispatchInProgress = useRef<Set<number>>(new Set());
  const supplierReturnResolutionInProgress = useRef<Set<number>>(new Set());

  useEffect(()=>{saleInProgress.current=false},[sales]);
  useEffect(()=>{purchaseInProgress.current=false},[purchases]);

  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_customers',customers)},[remoteReady,customers]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_quotes',quotes)},[remoteReady,quotes]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_suppliers',suppliers)},[remoteReady,suppliers]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_products',products)},[remoteReady,products]);
  useEffect(()=>{if(!remoteReady)return;saveNumber('difarmas_monthly_goal',monthlyGoal)},[remoteReady,monthlyGoal]);
  useEffect(()=>{if(!remoteReady)return;saveNumber('difarmas_fixed_expenses',fixedExpenses)},[remoteReady,fixedExpenses]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_sales',sales)},[remoteReady,sales]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_purchases',purchases)},[remoteReady,purchases]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_purchase_cost_history',purchaseCostHistory)},[remoteReady,purchaseCostHistory]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_settings',settings)},[remoteReady,settings]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_expenses',expenses)},[remoteReady,expenses]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_receivables',receivables)},[remoteReady,receivables]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_payables',payables)},[remoteReady,payables]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_inventory_movements',inventoryMovements)},[remoteReady,inventoryMovements]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_cash_closures',cashClosures)},[remoteReady,cashClosures]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_cash_movements',cashMovements)},[remoteReady,cashMovements]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_payment_transactions',paymentTransactions)},[remoteReady,paymentTransactions]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_missing_product_requests',missingProductRequests)},[remoteReady,missingProductRequests]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_supplier_returns',supplierReturns)},[remoteReady,supplierReturns]);
  useEffect(()=>{if(!remoteReady)return;saveJson('difarmas_sale_adjustments',saleAdjustments)},[remoteReady,saleAdjustments]);

  const snapshot = useMemo<ErpSnapshot>(() => ({
    customers, quotes, suppliers, products, sales, purchases, purchaseCostHistory, settings, expenses, receivables, payables,
    inventoryMovements, monthlyGoal, fixedExpenses, cashClosures, cashMovements, paymentTransactions, missingProductRequests, supplierReturns, saleAdjustments,
  }), [customers, quotes, suppliers, products, sales, purchases, purchaseCostHistory, settings, expenses, receivables, payables, inventoryMovements, monthlyGoal, fixedExpenses, cashClosures, cashMovements, paymentTransactions, missingProductRequests, supplierReturns, saleAdjustments]);

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
      setQuotes([]);
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
        setQuotes(remote.quotes ?? []);
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
      if (autoSaveTimerRef.current === timer) autoSaveTimerRef.current = null;
      saveErpSnapshot(userId, snapshot)
        .then(() => { setSyncStatus('synced'); setSyncError(null); })
        .catch((error: unknown) => {
          setSyncStatus('error');
          setSyncError(error instanceof Error ? error.message : 'No se pudieron guardar los datos en Supabase.');
        });
    }, 500);
    autoSaveTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autoSaveTimerRef.current === timer) autoSaveTimerRef.current = null;
    };
  }, [remoteReady, userId, snapshot]);

  const saveQuotes = async (nextQuotes: QuoteRecord[]): Promise<void> => {
    if (!remoteReady) throw new Error('El sistema todavía está sincronizando los datos. Espera a que termine e inténtalo de nuevo.');
    // Cancel a delayed autosave captured before this edit. Any save already
    // queued completes first; the quote update then merges only the quotes field.
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setSyncStatus('saving');
    setSyncError(null);
    try {
      await saveQuotesForUser(userId, nextQuotes, snapshot);
      setQuotes(nextQuotes);
      setSyncStatus('synced');
      setSyncError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la cotización en Supabase.';
      setSyncStatus('error');
      setSyncError(message);
      throw new Error(message);
    }
  };

  const filtered=useMemo(()=>products.filter(p=>[p.code,p.name,p.category,p.laboratory].join(' ').toLowerCase().includes(search.toLowerCase())),[products,search]);

  const recordMissingProduct=(request:Omit<MissingProductRequest,'id'|'requestedAt'|'status'>):boolean=>{
    const name=request.name.trim();
    if(!name||!Number.isFinite(request.quantity)||request.quantity<1)return false;
    setMissingProductRequests(current=>[{...request,name,id:nextMissingProductRequestId(),requestedAt:new Date().toISOString(),status:'Pendiente'},...current]);
    return true;
  };

  const recordSale=(sold:CartItem[],customer='',dueDate='',customerRtn='',invoiceNumber='',invoiceDetails?:StandardInvoiceDetails):boolean=>{
    if (saleInProgress.current) return false;
    if (!sold.length || sold.some(item => !Number.isFinite(item.qty) || item.qty <= 0)) return false;
    if (((settings.paymentMethods??[]).find(method=>method.name===payment)?.kind==='credit'||payment==='Crédito') && (!customer.trim() || !dueDate.trim())) return false;
    const normalizedInvoiceNumber=invoiceNumber.trim().toLocaleLowerCase();
    if(invoiceDetails&&normalizedInvoiceNumber&&sales.some(sale=>sale.type==='factura_estandar'&&sale.invoiceNumber?.trim().toLocaleLowerCase()===normalizedInvoiceNumber))return false;
    const requestedQuantities=new Map<number,number>();sold.forEach(item=>requestedQuantities.set(item.id,(requestedQuantities.get(item.id)??0)+item.qty));
    if ([...requestedQuantities.entries()].some(([id,qty])=>!products.some(p=>p.id===id&&p.stock>=qty))) return false;
    let updated: Product[];
    try { updated = applySaleToInventory(products,sold); } catch { return false; }
    saleInProgress.current=true;
    const recordDate=invoiceDetails?.invoiceDate ? new Date(invoiceDetails.invoiceDate+'T12:00:00') : new Date();
    const base=buildSaleRecord(sold,payment,invoiceDetails?'factura_estandar':saleType,customer,dueDate,recordDate,nextSaleId());
    const items=invoiceDetails ? (base.items??[]).map(line=>{
      const d=invoiceDetails.lines.find(row=>row.productId===line.productId);
      if(!d)return line;
      const net=d.netTotal;
      return {...line,unit:d.unit,baseUnitPrice:line.unitPrice,unitPrice:line.qty?net/line.qty:line.unitPrice,revenue:net,profit:net-line.cost,discountPercent:d.discountPercent,taxPercent:d.taxPercent,discountAmount:d.discountAmount,taxAmount:d.taxAmount,lineTotal:d.lineTotal};
    }) : base.items;
    const sale:SaleRecord={
      ...base,
      type:invoiceDetails?'factura_estandar':base.type,
      invoiceNumber,
      customer:customer.trim()||undefined,
      customerRtn:customerRtn.trim()||undefined,
      items,
      total:invoiceDetails?invoiceDetails.lines.reduce((sum,row)=>sum+row.lineTotal,0):base.total,
      profit:items?.reduce((sum,line)=>sum+line.profit,0)??base.profit,
      customerAddress:invoiceDetails?.customerAddress||undefined,
      customerPhone:invoiceDetails?.customerPhone||undefined,
      terms:invoiceDetails?.terms||undefined,
      priceList:invoiceDetails?.priceList||undefined,
      seller:invoiceDetails?.seller||undefined,
      invoiceDate:invoiceDetails?.invoiceDate||undefined,
      maxDate:invoiceDetails?.maxDate||undefined,
      notes:invoiceDetails?.notes||undefined,
      discountTotal:invoiceDetails?.discountTotal,
      taxTotal:invoiceDetails?.taxTotal,
      dueDate:payment==='Crédito'||((settings.paymentMethods??[]).find(method=>method.name===payment)?.kind==='credit')?dueDate:undefined
    };
    setProducts(updated);
    setInventoryMovements(current=>[...current,...createInventoryMovementsForSale(products,sold,sale.id,nextInventoryMovementId)]);
    setSales(current=>[...current,sale]);
    if((settings.paymentMethods??[]).find(method=>method.name===payment)?.kind==='credit'||payment==='Crédito') setReceivables(current=>[...current,createReceivableFromSale(sale,customer,dueDate)]);
    return true;
  };

  const updateStandardInvoice=(invoiceId:number,sold:CartItem[],customer='',customerRtn='',details?:StandardInvoiceDetails):boolean=>{
    const original=sales.find(sale=>sale.id===invoiceId);
    if(!original||original.type!=='factura_estandar'||!sold.length||sold.some(item=>!Number.isFinite(item.qty)||item.qty<=0||!Number.isFinite(item.price)||item.price<0))return false;
    const oldQty=new Map<number,number>();
    (original.items??[]).forEach(line=>oldQty.set(line.productId,(oldQty.get(line.productId)??0)+line.qty));
    const newQty=new Map<number,number>();
    sold.forEach(item=>newQty.set(item.id,(newQty.get(item.id)??0)+item.qty));
    for(const item of sold){const product=products.find(p=>p.id===item.id);if(!product||product.stock+(oldQty.get(item.id)??0)<(newQty.get(item.id)??0))return false;}
    const updatedProducts=products.map(product=>{const before=oldQty.get(product.id)??0;const after=newQty.get(product.id)??0;return before===after?product:{...product,stock:product.stock+before-after};});
    const movements:InventoryMovement[]=[];
    for(const product of products){const before=oldQty.get(product.id)??0;const after=newQty.get(product.id)??0;if(before===after)continue;movements.push({id:nextInventoryMovementId(),productId:product.id,productName:product.name,type:'Ajuste',quantity:Math.abs(after-before),stockBefore:product.stock,stockAfter:product.stock+before-after,unitCost:product.cost,referenceId:invoiceId,date:new Date().toISOString(),note:'Corrección de detalle de factura estándar '+(original.invoiceNumber??invoiceId)});}
    const items=sold.map(item=>{
      const d=details?.lines.find(row=>row.productId===item.id);
      const net=d?.netTotal??item.price*item.qty;
      const cost=item.cost*item.qty;
      return {productId:item.id,productName:item.name,category:item.category,laboratory:item.laboratory,qty:item.qty,unitCost:item.cost,unitPrice:details&&item.qty?net/item.qty:item.price,revenue:net,cost,profit:net-cost,...(d?{unit:d.unit,baseUnitPrice:item.price,discountPercent:d.discountPercent,taxPercent:d.taxPercent,discountAmount:d.discountAmount,taxAmount:d.taxAmount,lineTotal:d.lineTotal}:{})};
    });
    const updatedSale:SaleRecord={
      ...original,
      customer:customer.trim()||undefined,
      customerRtn:customerRtn.trim()||undefined,
      items,
      total:details?details.lines.reduce((sum,line)=>sum+line.lineTotal,0):items.reduce((sum,line)=>sum+line.revenue,0),
      cost:items.reduce((sum,line)=>sum+line.cost,0),
      profit:items.reduce((sum,line)=>sum+line.profit,0),
      customerAddress:details?.customerAddress||undefined,
      customerPhone:details?.customerPhone||undefined,
      terms:details?.terms||original.terms,
      priceList:details?.priceList||original.priceList,
      seller:details?.seller||original.seller,
      invoiceDate:details?.invoiceDate||original.invoiceDate,
      maxDate:details?.maxDate||original.maxDate,
      notes:details?.notes||undefined,
      discountTotal:details?.discountTotal,
      taxTotal:details?.taxTotal,
      dueDate:details?.maxDate&&((settings.paymentMethods??[]).find(method=>method.name===original.payment)?.kind==='credit'||original.payment==='Crédito')?details.maxDate:original.dueDate
    };
    const existingReceivable=receivables.find(item=>item.saleId===invoiceId);
    if(existingReceivable&&updatedSale.total<existingReceivable.paid)return false;
    setProducts(updatedProducts);
    setInventoryMovements(current=>[...current,...movements]);
    setSales(current=>current.map(sale=>sale.id===invoiceId?updatedSale:sale));
    if(existingReceivable)setReceivables(current=>current.map(item=>item.saleId===invoiceId?{...item,total:updatedSale.total,customer:updatedSale.customer||item.customer,dueDate:updatedSale.dueDate||item.dueDate}:item));
    return true;
  };

  const recordSupplierDispatch=(record:SupplierReturnRecord):boolean=>{
    const dispatchNote='Devolución enviada al proveedor: ';
    if(supplierDispatchInProgress.current.has(record.id)||inventoryMovements.some(movement=>movement.referenceId===record.id&&movement.note?.startsWith(dispatchNote)))return false;
    if(!record.items.length||record.items.some(item=>!Number.isInteger(item.quantity)||item.quantity<=0||!Number.isFinite(item.unitCost)||item.unitCost<0))return false;
    const quantitiesByProduct=new Map<number,number>();
    record.items.forEach(item=>quantitiesByProduct.set(item.productId,(quantitiesByProduct.get(item.productId)??0)+item.quantity));
    if([...quantitiesByProduct].some(([productId,quantity])=>!products.some(product=>product.id===productId&&product.stock>=quantity)))return false;
    const updated=products.map(product=>{
      const quantity=quantitiesByProduct.get(product.id)??0;
      return quantity?{...product,stock:product.stock-quantity}:product;
    });
    const movementDate=new Date().toISOString();
    const movements:InventoryMovement[]=[...quantitiesByProduct].flatMap(([productId,quantity])=>{
      const product=products.find(item=>item.id===productId);
      if(!product)return [];
      const matchingItems=record.items.filter(item=>item.productId===productId);
      const totalCost=matchingItems.reduce((sum,item)=>sum+item.quantity*item.unitCost,0);
      const unitCost=totalCost/quantity;
      return [{id:nextInventoryMovementId(),productId,productName:matchingItems[0]?.productName??product.name,type:'Ajuste' as const,quantity,stockBefore:product.stock,stockAfter:product.stock-quantity,unitCost,referenceId:record.id,date:movementDate,note:'Devolución enviada al proveedor: '+record.reason}];
    });
    supplierDispatchInProgress.current.add(record.id);
    setProducts(updated);
    setInventoryMovements(current=>[...current,...movements]);
    return true;
  };

  const resolveSupplierReturn=(record:SupplierReturnRecord,status:SupplierReturnRecord['status']):boolean=>{
    if(supplierReturnResolutionInProgress.current.has(record.id))return false;
    supplierReturnResolutionInProgress.current.add(record.id);
    try {
    const current=supplierReturns.find(item=>item.id===record.id);
    if(!current||current.status!=='Enviado al proveedor'||record.status!=='Enviado al proveedor')return false;
    if(status==='Rechazado') { setSupplierReturns(rows=>rows.map(row=>row.id===record.id?{...row,status}:row)); return true; }
    if(status==='Nota de crédito recibida') {
      const ref=record.purchaseReference.trim().toLowerCase();
      const purchase=purchases.find(item=>item.supplier.trim().toLowerCase()===record.supplier.trim().toLowerCase()&&!!ref&&(String(item.id)===ref||(item.invoiceNumber??'').trim().toLowerCase()===ref));
      if(!purchase)return false;
      const payable=payables.find(item=>item.supplier.trim().toLowerCase()===record.supplier.trim().toLowerCase()&&(item.purchaseId===purchase.id||((item.invoiceNumber??'').trim().toLowerCase()===(purchase.invoiceNumber??'').trim().toLowerCase()&&!!purchase.invoiceNumber)));
      if(!payable||record.totalCost<=0||payable.total-payable.paid<=0)return false;
      const outstanding=payable.total-payable.paid;
      // Do not silently discard any credit-note value that exceeds this invoice's outstanding balance.
      if(record.totalCost>outstanding)return false;
      const reduction=record.totalCost;
      setPayables(rows=>rows.map(item=>item.id===payable.id?{...item,total:Math.max(item.paid,item.total-reduction)}:item));
      setSupplierReturns(rows=>rows.map(row=>row.id===record.id?{...row,status}:row));
      return true;
    }
    if(status==='Cambio recibido') {
      const quantities=new Map<number,number>();record.items.forEach(item=>quantities.set(item.productId,(quantities.get(item.productId)??0)+item.quantity));
      if([...quantities.keys()].some(id=>!products.some(product=>product.id===id)))return false;
      const date=new Date().toISOString();
      const movements:InventoryMovement[]=[...quantities].map(([productId,quantity])=>{const product=products.find(item=>item.id===productId)!;const lines=record.items.filter(item=>item.productId===productId);const cost=lines.reduce((sum,item)=>sum+item.quantity*item.unitCost,0)/quantity;return {id:nextInventoryMovementId(),productId,productName:product.name,type:'Compra' as const,quantity,stockBefore:product.stock,stockAfter:product.stock+quantity,unitCost:cost,referenceId:record.id,date,note:'Reposición por cambio recibido de proveedor'};});
      setProducts(rows=>rows.map(product=>{
        const quantity=quantities.get(product.id)??0;
        if(!quantity)return product;
        const lines=record.items.filter(item=>item.productId===product.id);
        const receivedCost=lines.reduce((sum,item)=>sum+item.quantity*item.unitCost,0);
        const newStock=product.stock+quantity;
        const weightedCost=newStock>0?(product.stock*product.cost+receivedCost)/newStock:product.cost;
        return {...product,stock:newStock,cost:weightedCost};
      }));
      setInventoryMovements(rows=>[...rows,...movements]);
      setSupplierReturns(rows=>rows.map(row=>row.id===record.id?{...row,status}:row));
      return true;
    }
    return false;
    } finally {
      supplierReturnResolutionInProgress.current.delete(record.id);
    }
  };

  const recordSaleAdjustment=(adjustment:SaleAdjustmentRecord):boolean=>{
    if(saleAdjustments.some(item=>item.id===adjustment.id)||!sales.some(sale=>sale.id===adjustment.saleId)||!adjustment.items.length||!Number.isFinite(adjustment.amount)||adjustment.amount<=0)return false;
    if(adjustment.items.some(item=>!Number.isInteger(item.quantity)||item.quantity<=0||!Number.isFinite(item.unitPrice)||item.unitPrice<0||!Number.isFinite(item.unitCost)||item.unitCost<0))return false;
    const originalSale=sales.find(sale=>sale.id===adjustment.saleId);
    if(!originalSale)return false;
    const calculatedAmount=adjustment.items.reduce((sum,item)=>sum+item.unitPrice*item.quantity,0);
    const alreadyAdjustedAmount=saleAdjustments.filter(item=>item.saleId===adjustment.saleId&&item.type!=='Anulación').reduce((sum,item)=>sum+item.amount,0);
    if(!Number.isFinite(calculatedAmount)||Math.abs(calculatedAmount-adjustment.amount)>0.01||adjustment.amount>Math.max(0,originalSale.total-alreadyAdjustedAmount)+0.01)return false;
    const soldQuantities=new Map<number,number>();
    (originalSale.items??[]).forEach(line=>soldQuantities.set(line.productId,(soldQuantities.get(line.productId)??0)+line.qty));
    const adjustedItems=saleAdjustments.filter(item=>item.saleId===adjustment.saleId&&item.type!=='Anulación').flatMap(item=>item.items);
    const alreadyAdjusted=new Map<number,number>();
    adjustedItems.forEach(item=>alreadyAdjusted.set(item.productId,(alreadyAdjusted.get(item.productId)??0)+item.quantity));
    const requestedInThisAdjustment=new Map<number,number>();
    adjustment.items.forEach(item=>requestedInThisAdjustment.set(item.productId,(requestedInThisAdjustment.get(item.productId)??0)+item.quantity));
    for(const [productId,quantity] of requestedInThisAdjustment){
      const soldQuantity=soldQuantities.get(productId)??0;
      const already=alreadyAdjusted.get(productId)??0;
      if(!soldQuantity||already+quantity>soldQuantity)return false;
    }
    if(adjustment.type==='Anulación'&&saleAdjustments.some(item=>item.saleId===adjustment.saleId&&item.type==='Anulación'))return false;
    const returnedByProduct=new Map<number,SaleAdjustmentRecord['items']>();
    adjustment.items.filter(line=>line.returnToStock).forEach(line=>{
      returnedByProduct.set(line.productId,[...(returnedByProduct.get(line.productId)??[]),line]);
    });
    for(const productId of returnedByProduct.keys()){
      if(!products.some(product=>product.id===productId))return false;
    }
    const movementDate=new Date().toISOString();
    const movements:InventoryMovement[]=[...returnedByProduct].map(([productId,lines])=>{
      const product=products.find(item=>item.id===productId)!;
      const quantity=lines.reduce((sum,line)=>sum+line.quantity,0);
      const totalCost=lines.reduce((sum,line)=>sum+line.quantity*line.unitCost,0);
      return {id:nextInventoryMovementId(),productId,productName:lines[0]?.productName??product.name,type:'Ajuste' as const,quantity,stockBefore:product.stock,stockAfter:product.stock+quantity,unitCost:quantity?totalCost/quantity:0,referenceId:adjustment.id,date:movementDate,note:'Devolución de venta '+adjustment.invoiceNumber};
    });
    const returnedQuantities=new Map(movements.map(movement=>[movement.productId,movement.quantity]));
    const updated=products.map(product=>{
      const quantity=returnedQuantities.get(product.id)??0;
      return quantity?{...product,stock:product.stock+quantity}:product;
    });
    const receivable=receivables.find(item=>item.saleId===adjustment.saleId);
    // Una devolución de una venta a crédito reduce primero el saldo pendiente.
    // No se reduce el importe ya abonado ni se registra un reembolso en efectivo
    // automáticamente: ese movimiento requiere un pago real por separado.
    const creditReduction=receivable
      ? Math.min(adjustment.amount,Math.max(0,receivable.total-receivable.paid))
      : 0;
    setProducts(updated);
    setInventoryMovements(current=>[...current,...movements]);
    if(receivable&&creditReduction>0){
      setReceivables(current=>current.map(item=>item.saleId===adjustment.saleId
        ? {...item,total:Math.max(item.paid,item.total-creditReduction)}
        : item));
    }
    if(adjustment.paymentMethod.toLowerCase().includes('efectivo')){
      setCashMovements(current=>[{id:adjustment.id,type:'Salida',description:'Reembolso por '+adjustment.type+' '+adjustment.invoiceNumber,amount:adjustment.amount,category:'Devoluciones de ventas',date:new Date().toISOString()},...current]);
    }
    setSaleAdjustments(current=>[adjustment,...current]);
    return true;
  };

  const saveProduct=(product:Product):Product|null=>{
    if (!product.name.trim() || [product.cost,product.retail,product.wholesale,product.stock,product.minStock].some(v=>!Number.isFinite(v)||v<0)) return null;
    let saved:Product;
    if (editing) {
      const previous = products.find(p=>p.id===editing.id);
      saved = {...product,id:editing.id};
      setProducts(current=>current.map(p=>p.id===editing.id?saved:p));
      if (previous && previous.stock !== saved.stock) {
        const difference = saved.stock - previous.stock;
        setInventoryMovements(current=>[...current,{id:nextInventoryMovementId(),productId:saved.id,productName:saved.name,type:'Ajuste',quantity:Math.abs(difference),stockBefore:previous.stock,stockAfter:saved.stock,unitCost:saved.cost,date:new Date().toISOString(),note:difference>0?'Ajuste de entrada manual':'Ajuste de salida manual'}]);
      }
    } else {
      saved = {...product,id:nextProductId()};
      setProducts(current=>[...current,saved]);
    }
    setEditing(null); setShowForm(false);
    return saved;
  };

  const deleteProduct=(id:number)=>{ setProducts(current=>current.filter(product=>product.id!==id)); };

  const receivePurchase=(items:PurchaseItem[],paymentMethod:string,dueDate:string,invoiceNumber='',invoiceDate='',notes='',enteredTotal?:number,paymentTerms='Contado - Efectivo'):boolean=>{
    if (purchaseInProgress.current) return false;
    if (!items.length || items.some(item => !Number.isFinite(item.qty) || item.qty <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0)) return false;
    const supplierKey=purchaseSupplier.trim().toLocaleLowerCase();
    const invoiceKey=invoiceNumber.trim().toLocaleLowerCase();
    if(invoiceKey && purchases.some(p=>p.supplier.trim().toLocaleLowerCase()===supplierKey && String(p.invoiceNumber??'').trim().toLocaleLowerCase()===invoiceKey)) return false;
    let updated: Product[];
    try { updated = applyPurchaseToInventory(products,items,purchaseSupplier); } catch { return false; }
    purchaseInProgress.current=true;
    const referenceId = nextPurchaseId();
    setProducts(updated);
    setInventoryMovements(current=>[...current,...createInventoryMovementsForPurchase(products,items,referenceId,nextInventoryMovementId)]);
    const calculatedTotal=items.reduce((sum,item)=>sum+item.qty*item.unitCost,0);
    const total=typeof enteredTotal==='number'&&Number.isFinite(enteredTotal)&&enteredTotal>=0?enteredTotal:calculatedTotal;
    const receivedAt = new Date().toISOString();
    setPurchases(current=>[{id:referenceId,supplier:purchaseSupplier,total,paymentMethod:paymentMethod as 'Efectivo'|'Transferencia'|'Crédito',date:receivedAt,invoiceNumber,invoiceDate,notes,paymentTerms,dueDate:paymentMethod==='Crédito'?dueDate:undefined},...current]);
    setPurchaseCostHistory(current=>[
      ...items.map((item):PurchaseCostHistoryEntry=>({id:nextPurchaseCostHistoryId(),purchaseId:referenceId,productId:item.id,productCode:item.code,productName:item.name,supplier:purchaseSupplier.trim(),unitCost:item.unitCost,quantity:item.qty,date:receivedAt})),
      ...current,
    ]);
    if(paymentMethod==='Crédito'){const payable=createPayableFromPurchase(items,purchaseSupplier,dueDate,new Date(),referenceId,invoiceNumber,nextPayableId());setPayables(current=>[...current,{...payable,total}]);}
    return true;
  };

  return {active,setActive,customers,setCustomers,quotes,setQuotes,saveQuotes,suppliers,setSuppliers,products,setProducts,search,setSearch,monthlyGoal,setMonthlyGoal,fixedExpenses,setFixedExpenses,settings,setSettings,showForm,setShowForm,editing,setEditing,cart,setCart,saleType,setSaleType,payment,setPayment,saleSearch,setSaleSearch,purchaseCart,setPurchaseCart,purchaseSearch,setPurchaseSearch,purchaseSupplier,setPurchaseSupplier,sales,setSales,purchases,purchaseCostHistory,expenses,setExpenses,receivables,setReceivables,payables,setPayables,inventoryMovements,cashClosures,setCashClosures,cashMovements,setCashMovements,paymentTransactions,setPaymentTransactions,missingProductRequests,setMissingProductRequests,supplierReturns,setSupplierReturns,saleAdjustments,setSaleAdjustments,recordSupplierDispatch,resolveSupplierReturn,recordSaleAdjustment,recordMissingProduct,filtered,recordSale,updateStandardInvoice,saveProduct,deleteProduct,receivePurchase,syncStatus,syncError};
}