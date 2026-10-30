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

export function useErpState(userId: string) {
  const [active, setActive] = useState<Module>('dashboard');
  const [customers,setCustomersRaw]=useState<Customer[]>(()=>ensureCustomerCodes(loadJson<Customer[]>('difarmas_customers',[])));
  const setCustomers=(value:Customer[]|((current:Customer[])=>Customer[]))=>setCustomersRaw(current=>ensureCustomerCodes(typeof value==='function'?value(current):value,current));
  const [quotes,setQuotes]=useState<QuoteRecord[]>(()=>loadJson<QuoteRecord[]>('difarmas_quotes',[]));
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
  const autoSaveTimerRef = useRef<number | null>(null);
  const saleInProgress = useRef(false);
  const purchaseInProgress = useRef(false);
  const invoiceUpdateInProgress = useRef(false);

  useEffect(()=>{saleInProgress.current=false},[sales]);
  useEffect(()=>{invoiceUpdateInProgress.current=false},[sales]);
  useEffect(()=>{purchaseInProgress.current=false},[purchases]);

  useEffect(()=>{saveJson('difarmas_customers',customers)},[customers]);
  useEffect(()=>{saveJson('difarmas_quotes',quotes)},[quotes]);
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
    setMissingProductRequests(current=>[{...request,name,id:Date.now(),requestedAt:new Date().toISOString(),status:'Pendiente'},...current]);
    return true;
  };

  const recordSale=(sold:CartItem[],customer='',dueDate='',customerRtn='',invoiceNumber='',invoiceDetails?:StandardInvoiceDetails):boolean=>{
    if (saleInProgress.current) return false;
    if (!sold.length || sold.some(item => !Number.isFinite(item.qty) || item.qty <= 0)) return false;
    if (((settings.paymentMethods??[]).find(method=>method.name===payment)?.kind==='credit'||payment==='Crédito') && (!customer.trim() || !dueDate.trim())) return false;
    const requestedQuantities=new Map<number,number>();sold.forEach(item=>requestedQuantities.set(item.id,(requestedQuantities.get(item.id)??0)+item.qty));
    if ([...requestedQuantities.entries()].some(([id,qty])=>!products.some(p=>p.id===id&&p.stock>=qty))) return false;
    let updated: Product[];
    try { updated = applySaleToInventory(products,sold); } catch { return false; }
    saleInProgress.current=true;
    const recordDate=invoiceDetails?.invoiceDate ? new Date(invoiceDetails.invoiceDate+'T12:00:00') : new Date();
    const base=buildSaleRecord(sold,payment,invoiceDetails?'factura_estandar':saleType,customer,dueDate,recordDate);
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
    setInventoryMovements(current=>[...current,...createInventoryMovementsForSale(products,sold,sale.id)]);
    setSales(current=>[...current,sale]);
    if((settings.paymentMethods??[]).find(method=>method.name===payment)?.kind==='credit'||payment==='Crédito') setReceivables(current=>[...current,createReceivableFromSale(sale,customer,dueDate)]);
    return true;
  };

  const updateStandardInvoice=(invoiceId:number,sold:CartItem[],customer='',customerRtn='',details?:StandardInvoiceDetails):boolean=>{
    if(invoiceUpdateInProgress.current)return false;
    const original=sales.find(sale=>sale.id===invoiceId);
    if(!original||original.type!=='factura_estandar'||!sold.length||sold.some(item=>!Number.isFinite(item.qty)||item.qty<=0||!Number.isFinite(item.price)||item.price<0))return false;
    const oldQty=new Map<number,number>();
    (original.items??[]).forEach(line=>oldQty.set(line.productId,(oldQty.get(line.productId)??0)+line.qty));
    const newQty=new Map<number,number>();
    sold.forEach(item=>newQty.set(item.id,(newQty.get(item.id)??0)+item.qty));
    for(const item of sold){const product=products.find(p=>p.id===item.id);if(!product||product.stock+(oldQty.get(item.id)??0)<(newQty.get(item.id)??0))return false;}
    const updatedProducts=products.map(product=>{const before=oldQty.get(product.id)??0;const after=newQty.get(product.id)??0;return before===after?product:{...product,stock:product.stock+before-after};});
    const movements:InventoryMovement[]=[];
    for(const product of products){const before=oldQty.get(product.id)??0;const after=newQty.get(product.id)??0;if(before===after)continue;movements.push({id:Date.now()+product.id,productId:product.id,productName:product.name,type:'Ajuste',quantity:Math.abs(after-before),stockBefore:product.stock,stockAfter:product.stock+before-after,unitCost:product.cost,referenceId:invoiceId,date:new Date().toISOString(),note:'Corrección de detalle de factura estándar '+(original.invoiceNumber??invoiceId)});}
    const items=sold.map(item=>{
      const d=details?.lines.find(row=>row.productId===item.id);
      const net=d?.netTotal??item.price*item.qty;
      const cost=item.cost*item.qty;
      return {productId:item.id,productName:item.name,category:item.category,laboratory:item.laboratory,qty:item.qty,unitCost:item.cost,unitPrice:details&&item.qty?net/item.qty:item.price,revenue:net,cost,profit:net-cost,...(d?{unit:d.unit,baseUnitPrice:item.price,discountPercent:d.discountPercent,taxPercent:d.taxPercent,discountAmount:d.discountAmount,taxAmount:d.taxAmount,lineTotal:d.lineTotal}:{})};
    });
    const updatedTotal=details?details.lines.reduce((sum,line)=>sum+line.lineTotal,0):items.reduce((sum,line)=>sum+line.revenue,0);
    const linkedReceivable=receivables.find(account=>account.saleId===invoiceId);
    // Never allow an invoice edit to reduce the document below amounts already collected.
    if(linkedReceivable&&(!Number.isFinite(updatedTotal)||updatedTotal<linkedReceivable.paid))return false;
    const updatedSale:SaleRecord={
      ...original,
      customer:customer.trim()||undefined,
      customerRtn:customerRtn.trim()||undefined,
      items,
      total:updatedTotal,
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
      dueDate:details?.maxDate&&original.payment==='Crédito'?details.maxDate:original.dueDate
    };
    invoiceUpdateInProgress.current=true;
    setProducts(updatedProducts);
    setInventoryMovements(current=>[...current,...movements]);
    setSales(current=>current.map(sale=>sale.id===invoiceId?updatedSale:sale));
    if(linkedReceivable){
      setReceivables(current=>current.map(account=>account.saleId===invoiceId?{...account,total:updatedTotal,dueDate:updatedSale.dueDate||account.dueDate}:account));
    }
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
    const linkedReceivable=receivables.find(account=>account.saleId===adjustment.saleId);
    // A credit-sale return reduces the outstanding balance; it is not a cash refund.
    // Reject amounts above the unpaid balance so collected money is never silently erased.
    if(linkedReceivable&&adjustment.amount>Math.max(0,linkedReceivable.total-linkedReceivable.paid))return false;
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
    if(linkedReceivable){
      setReceivables(current=>current.map(account=>account.saleId===adjustment.saleId
        ?{...account,total:Math.max(account.paid,account.total-adjustment.amount)}
        :account));
    }else if(adjustment.paymentMethod.toLowerCase().includes('efectivo')){
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
        setInventoryMovements(current=>[...current,{id:Date.now(),productId:saved.id,productName:saved.name,type:'Ajuste',quantity:Math.abs(difference),stockBefore:previous.stock,stockAfter:saved.stock,unitCost:saved.cost,date:new Date().toISOString(),note:difference>0?'Ajuste de entrada manual':'Ajuste de salida manual'}]);
      }
    } else {
      saved = {...product,id:product.id||Date.now()};
      setProducts(current=>[...current,saved]);
    }
    setEditing(null); setShowForm(false);
    return saved;
  };

  const deleteProduct=(id:number)=>{ setProducts(current=>current.filter(product=>product.id!==id)); };

  const receivePurchase=(items:PurchaseItem[],paymentMethod:string,dueDate:string,invoiceNumber='',invoiceDate='',notes='',enteredTotal?:number,paymentTerms='Contado - Efectivo'):boolean=>{
    if (purchaseInProgress.current) return false;
    if (!items.length || items.some(item => !Number.isFinite(item.qty) || item.qty <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0)) return false;
    let updated: Product[];
    try { updated = applyPurchaseToInventory(products,items,purchaseSupplier); } catch { return false; }
    purchaseInProgress.current=true;
    const referenceId = Date.now();
    setProducts(updated);
    setInventoryMovements(current=>[...current,...createInventoryMovementsForPurchase(products,items,referenceId)]);
    const calculatedTotal=items.reduce((sum,item)=>sum+item.qty*item.unitCost,0);
    const total=typeof enteredTotal==='number'&&Number.isFinite(enteredTotal)&&enteredTotal>=0?enteredTotal:calculatedTotal;
    const receivedAt = new Date().toISOString();
    setPurchases(current=>[{id:referenceId,supplier:purchaseSupplier,total,paymentMethod:paymentMethod as 'Efectivo'|'Transferencia'|'Crédito',date:receivedAt,invoiceNumber,invoiceDate,notes,paymentTerms,dueDate:paymentMethod==='Crédito'?dueDate:undefined},...current]);
    setPurchaseCostHistory(current=>[
      ...items.map((item,index):PurchaseCostHistoryEntry=>({id:referenceId+index,purchaseId:referenceId,productId:item.id,productCode:item.code,productName:item.name,supplier:purchaseSupplier.trim(),unitCost:item.unitCost,quantity:item.qty,date:receivedAt})),
      ...current,
    ]);
    if(paymentMethod==='Crédito'){const payable=createPayableFromPurchase(items,purchaseSupplier,dueDate);setPayables(current=>[...current,{...payable,total}]);}
    return true;
  };

  return {active,setActive,customers,setCustomers,quotes,setQuotes,saveQuotes,suppliers,setSuppliers,products,setProducts,search,setSearch,monthlyGoal,setMonthlyGoal,fixedExpenses,setFixedExpenses,settings,setSettings,showForm,setShowForm,editing,setEditing,cart,setCart,saleType,setSaleType,payment,setPayment,saleSearch,setSaleSearch,purchaseCart,setPurchaseCart,purchaseSearch,setPurchaseSearch,purchaseSupplier,setPurchaseSupplier,sales,setSales,purchases,purchaseCostHistory,expenses,setExpenses,receivables,setReceivables,payables,setPayables,inventoryMovements,cashClosures,setCashClosures,cashMovements,setCashMovements,paymentTransactions,setPaymentTransactions,missingProductRequests,setMissingProductRequests,supplierReturns,setSupplierReturns,saleAdjustments,setSaleAdjustments,recordSupplierDispatch,recordSaleAdjustment,recordMissingProduct,filtered,recordSale,updateStandardInvoice,saveProduct,deleteProduct,receivePurchase,syncStatus,syncError};
}