import { useEffect, useMemo, useRef, useState } from 'react';
import type { CartItem, CashClosure, CashMovement, CashOpeningBalance, Customer, ErpSettings, Expense, InventoryMovement, Module, Payable, PaymentTransaction, Product, PurchaseCostHistoryEntry, PurchaseItem, PurchaseRecord, PurchaseLogisticsRecord, Receivable, SaleRecord, OrderRecord, Supplier, MissingProductRequest, SupplierReturnRecord, SaleAdjustmentRecord, QuoteRecord, StandardInvoiceDetails, AccountingAccount, AccountingEntry, HrEmployee, HrAttendanceRecord, HrLeaveRequest, InventoryLot, LotKardexMovement, LotAllocation } from '../domain/types';
import { loadJson as loadStoredJson, saveJson as saveStoredJson, loadNumber as loadStoredNumber, saveNumber as saveStoredNumber } from '../utils/storage';
import { applyPurchaseToInventory, applySaleToInventory } from '../services/inventoryService';
import { buildSaleRecord, createReceivableFromSale } from '../services/salesService';
import { createPayableFromPurchase } from '../services/purchaseService';
import { createInventoryMovementsForPurchase, createInventoryMovementsForSale } from '../services/inventoryMovementService';
import { loadErpSnapshot, saveErpSnapshot, saveQuotesForUser, type ErpSnapshot } from '../services/remoteErpState';
import { ensureCustomerCodes } from '../services/customerCodeService';
import { canWriteSnapshot, guardSnapshotSetter } from '../services/snapshotWriteGuard';

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

const demoProducts: Product[] = [
  ...initialProducts,
  { id: 5, code: '750100000005', name: 'Paracetamol 500 mg', category: 'Medicamentos', laboratory: 'Genfar', presentation: 'Caja x 20 tabletas', cost: 28, retail: 45, wholesale: 39, stock: 65, minStock: 15, lot: 'PAR-2611', expiry: '2028-06-30', supplier: 'Droguería Central' },
  { id: 6, code: '750100000006', name: 'Omeprazol 20 mg', category: 'Medicamentos', laboratory: 'MK', presentation: 'Caja x 30 cápsulas', cost: 42, retail: 68, wholesale: 59, stock: 42, minStock: 12, lot: 'OME-2609', expiry: '2028-03-31', supplier: 'Distribuidora Nacional' },
  { id: 7, code: '750100000007', name: 'Vitamina C 1 g', category: 'Vitaminas', laboratory: 'Genérico', presentation: 'Tubo x 10 tabletas', cost: 38, retail: 60, wholesale: 52, stock: 28, minStock: 10, lot: 'VIC-2610', expiry: '2027-12-31', supplier: 'Droguería Central' },
  { id: 8, code: '750100000008', name: 'Alcohol 70%', category: 'Cuidado personal', laboratory: 'Farma', presentation: 'Frasco x 500 ml', cost: 32, retail: 52, wholesale: 45, stock: 31, minStock: 8, lot: 'ALC-2608', expiry: '2028-08-31', supplier: 'Suministros Médicos' },
  { id: 9, code: '750100000009', name: 'Suero oral', category: 'Bienestar', laboratory: 'Electrolit', presentation: 'Frasco 625 ml', cost: 24, retail: 38, wholesale: 33, stock: 50, minStock: 12, lot: 'SUE-2610', expiry: '2027-10-31', supplier: 'Distribuidora Nacional' },
  { id: 10, code: '750100000010', name: 'Acetaminofén jarabe', category: 'Medicamentos', laboratory: 'Genérico', presentation: 'Frasco 120 ml', cost: 36, retail: 58, wholesale: 50, stock: 19, minStock: 6, lot: 'ACE-2607', expiry: '2027-07-31', supplier: 'Suministros Médicos' },
];
const demoCustomers: Customer[] = [
  { id: 1, code: 'CLI-0001', name: 'María López', phone: '9999-1001', creditLimit: 1500, active: true, notes: 'Cliente de demostración', address: 'San Pedro Sula' },
  { id: 2, code: 'CLI-0002', name: 'Clínica Santa Elena', phone: '9999-1002', creditLimit: 8000, active: true, notes: 'Cliente institucional de prueba', address: 'San Pedro Sula' },
  { id: 3, code: 'CLI-0003', name: 'Carlos Martínez', phone: '9999-1003', creditLimit: 2500, active: true, notes: 'Cliente de demostración', address: 'Choloma' },
];
const demoSuppliers: Supplier[] = [
  { id: 1, name: 'Distribuidora Nacional', contact: 'Ana Reyes', phone: '2550-1001', email: 'ventas@demo-farmi.local', rtn: '', address: 'San Pedro Sula', paymentTerms: '30 días', notes: 'Proveedor ficticio', active: true },
  { id: 2, name: 'Droguería Central', contact: 'Luis Gómez', phone: '2550-1002', email: 'pedidos@demo-farmi.local', rtn: '', address: 'San Pedro Sula', paymentTerms: 'Contado', notes: 'Proveedor ficticio', active: true },
  { id: 3, name: 'Suministros Médicos', contact: 'Elena Cruz', phone: '2550-1003', email: 'contacto@demo-farmi.local', rtn: '', address: 'La Lima', paymentTerms: '15 días', notes: 'Proveedor ficticio', active: true },
];
const demoSettings: ErpSettings = { ...initialSettings, businessName: 'FARMI · EMPRESA DE PRUEBA', businessSubtitle: 'Datos ficticios para capacitación', rtn: '', phone: '', address: 'Empresa de demostración · Honduras', email: '' };

export function useErpState(userId: string, demoMode = false) {
  const [active, setActive] = useState<Module>('dashboard');
  const scopedKey = (key: string) => demoMode ? `farmi_demo_${key}` : key;
  const loadJson = <T,>(key: string, fallback: T): T => {
    const demoFallback = demoMode
      ? key === 'difarmas_products' ? demoProducts as unknown as T
      : key === 'difarmas_customers' ? demoCustomers as unknown as T
      : key === 'difarmas_suppliers' ? demoSuppliers as unknown as T
      : key === 'difarmas_settings' ? demoSettings as unknown as T
      : fallback
      : fallback;
    return loadStoredJson<T>(scopedKey(key), demoFallback);
  };
  const saveJson = <T,>(key: string, value: T) => saveStoredJson(scopedKey(key), value);
  const loadNumber = (key: string, fallback: number) => loadStoredNumber(scopedKey(key), fallback);
  const saveNumber = (key: string, value: number) => saveStoredNumber(scopedKey(key), value);

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
  const [accountingAccounts,setAccountingAccounts]=useState<AccountingAccount[]>(()=>loadJson<AccountingAccount[]>('farmi_accounting_accounts',[]));
  const [accountingEntries,setAccountingEntries]=useState<AccountingEntry[]>(()=>loadJson<AccountingEntry[]>('farmi_accounting_entries',[]));
  const [hrEmployees,setHrEmployeesRaw]=useState<HrEmployee[]>(()=>loadJson<HrEmployee[]>('farmi_hr_employees',[]));
  const [hrAttendance,setHrAttendanceRaw]=useState<HrAttendanceRecord[]>(()=>loadJson<HrAttendanceRecord[]>('farmi_hr_attendance',[]));
  const [hrLeaveRequests,setHrLeaveRequestsRaw]=useState<HrLeaveRequest[]>(()=>loadJson<HrLeaveRequest[]>('farmi_hr_leave_requests',[]));
  const [orders,setOrders]=useState<OrderRecord[]>(()=>loadJson<OrderRecord[]>('difarmas_orders',[]));
  const lastOrderId=useRef(0);
  const nextOrderId=()=>{const highest=orders.reduce((max,order)=>Math.max(max,Number(order.id)||0),0);const id=Math.max(Date.now(),highest,lastOrderId.current)+1;lastOrderId.current=id;return id;};
  const lastSaleId = useRef(0);
  const nextSaleId = () => {
    const highestStoredId = sales.reduce((highest,sale)=>Math.max(highest,Number(sale.id)||0),0);
    const nextId = Math.max(Date.now(),highestStoredId,lastSaleId.current)+1;
    lastSaleId.current=nextId;
    return nextId;
  };
  const [purchases, setPurchases] = useState<PurchaseRecord[]>(()=>loadJson<PurchaseRecord[]>('difarmas_purchases',[]));
  const [purchaseLogistics,setPurchaseLogistics]=useState<PurchaseLogisticsRecord[]>(()=>loadJson<PurchaseLogisticsRecord[]>('difarmas_purchase_logistics',[]));
  const [purchaseCostHistory, setPurchaseCostHistory] = useState<PurchaseCostHistoryEntry[]>(()=>loadJson<PurchaseCostHistoryEntry[]>('difarmas_purchase_cost_history',[]));
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
  const [settings,setSettings] = useState<ErpSettings>(()=>loadJson<ErpSettings>('difarmas_settings',initialSettings));
  const [expenses, setExpenses] = useState<Expense[]>(()=>loadJson<Expense[]>('difarmas_expenses',[]));
  const [receivables, setReceivables] = useState<Receivable[]>(()=>loadJson<Receivable[]>('difarmas_receivables',[]));
  const [payables, setPayables] = useState<Payable[]>(()=>loadJson<Payable[]>('difarmas_payables',[]));
  const lastPayableId = useRef(0);
  const nextPayableId = () => {
    const highestStoredId = payables.reduce((highest,payable)=>Math.max(highest,Number(payable.id)||0),0);
    const nextId = Math.max(Date.now(),highestStoredId,lastPayableId.current)+1;
    lastPayableId.current=nextId;
    return nextId;
  };
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>(()=>loadJson<InventoryMovement[]>('difarmas_inventory_movements',[]));
  const [inventoryLots,setInventoryLots]=useState<InventoryLot[]>(()=>loadJson<InventoryLot[]>('farmi_inventory_lots',[]));
  const [lotKardex,setLotKardex]=useState<LotKardexMovement[]>(()=>loadJson<LotKardexMovement[]>('farmi_lot_kardex',[]));
  const [fefoProductIds,setFefoProductIds]=useState<number[]>(()=>loadJson<number[]>('farmi_fefo_product_ids',[]));
  const lastInventoryMovementId = useRef(0);
  const nextInventoryMovementId = () => {
    const highestStoredId = inventoryMovements.reduce((highest,movement)=>Math.max(highest,Number(movement.id)||0),0);
    const nextId = Math.max(Date.now(),highestStoredId,lastInventoryMovementId.current)+1;
    lastInventoryMovementId.current=nextId;
    return nextId;
  };
  const [cashClosures, setCashClosures] = useState<CashClosure[]>(()=>loadJson<CashClosure[]>('difarmas_cash_closures',[]));
  const [cashMovements, setCashMovements] = useState<CashMovement[]>(()=>loadJson<CashMovement[]>('difarmas_cash_movements',[]));
  const [cashOpenings, setCashOpenings] = useState<CashOpeningBalance[]>(()=>loadJson<CashOpeningBalance[]>('difarmas_cash_openings',[]));
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransaction[]>(()=>loadJson<PaymentTransaction[]>('difarmas_payment_transactions',[]));
  const [missingProductRequests, setMissingProductRequests] = useState<MissingProductRequest[]>(()=>loadJson<MissingProductRequest[]>('difarmas_missing_product_requests',[]));
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
  const [supplierReturns, setSupplierReturns] = useState<SupplierReturnRecord[]>(()=>loadJson<SupplierReturnRecord[]>('difarmas_supplier_returns',[]));
  const [saleAdjustments, setSaleAdjustments] = useState<SaleAdjustmentRecord[]>(()=>loadJson<SaleAdjustmentRecord[]>('difarmas_sale_adjustments',[]));
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'loading'|'saving'|'synced'|'error'>('loading');
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncStateRef = useRef<{remoteReady:boolean;syncStatus:'loading'|'saving'|'synced'|'error'}>({remoteReady:false,syncStatus:'loading'});
  syncStateRef.current = {remoteReady, syncStatus};
  const canWriteSnapshotNow = () => canWriteSnapshot(syncStateRef.current.remoteReady, syncStateRef.current.syncStatus);
  const autoSaveTimerRef = useRef<number | null>(null);
  const saleInProgress = useRef(false);
  const orderSaveInProgress=useRef(false);
  const orderMutationInProgress=useRef<Set<number>>(new Set());
  const purchaseInProgress = useRef(false);
  const logisticsReceiptInProgress=useRef(new Set<string>());
  const supplierDispatchInProgress = useRef<Set<number>>(new Set());
  const supplierReturnResolutionInProgress = useRef<Set<number>>(new Set());

  useEffect(()=>{saleInProgress.current=false},[sales]);
  useEffect(()=>{orderSaveInProgress.current=false;orderMutationInProgress.current.clear();},[orders]);
  useEffect(()=>{purchaseInProgress.current=false},[purchases]);
  useEffect(()=>{logisticsReceiptInProgress.current.clear()},[purchaseLogistics]);

  useEffect(()=>{saveJson('difarmas_customers',customers)},[customers]);
  useEffect(()=>{saveJson('difarmas_quotes',quotes)},[quotes]);
  useEffect(()=>{saveJson('difarmas_suppliers',suppliers)},[suppliers]);
  useEffect(()=>{saveJson('difarmas_products',products)},[products]);
  useEffect(()=>{saveNumber('difarmas_monthly_goal',monthlyGoal)},[monthlyGoal]);
  useEffect(()=>{saveNumber('difarmas_fixed_expenses',fixedExpenses)},[fixedExpenses]);
  useEffect(()=>{saveJson('difarmas_sales',sales)},[sales]);
  useEffect(()=>{saveJson('farmi_accounting_accounts',accountingAccounts)},[accountingAccounts]);
  useEffect(()=>{saveJson('farmi_accounting_entries',accountingEntries)},[accountingEntries]);
  useEffect(()=>{saveJson('farmi_hr_employees',hrEmployees)},[hrEmployees]);
  useEffect(()=>{saveJson('farmi_hr_attendance',hrAttendance)},[hrAttendance]);
  useEffect(()=>{saveJson('farmi_hr_leave_requests',hrLeaveRequests)},[hrLeaveRequests]);
  useEffect(()=>{saveJson('difarmas_orders',orders)},[orders]);
  useEffect(()=>{saveJson('difarmas_purchases',purchases)},[purchases]);
  useEffect(()=>{saveJson('difarmas_purchase_logistics',purchaseLogistics)},[purchaseLogistics]);
  useEffect(()=>{saveJson('difarmas_purchase_cost_history',purchaseCostHistory)},[purchaseCostHistory]);
  useEffect(()=>{saveJson('difarmas_settings',settings)},[settings]);
  useEffect(()=>{saveJson('difarmas_expenses',expenses)},[expenses]);
  useEffect(()=>{saveJson('difarmas_receivables',receivables)},[receivables]);
  useEffect(()=>{saveJson('difarmas_payables',payables)},[payables]);
  useEffect(()=>{saveJson('difarmas_inventory_movements',inventoryMovements)},[inventoryMovements]);
  useEffect(()=>{saveJson('farmi_inventory_lots',inventoryLots)},[inventoryLots]);
  useEffect(()=>{saveJson('farmi_lot_kardex',lotKardex)},[lotKardex]);
  useEffect(()=>{saveJson('farmi_fefo_product_ids',fefoProductIds)},[fefoProductIds]);
  useEffect(()=>{saveJson('difarmas_cash_closures',cashClosures)},[cashClosures]);
  useEffect(()=>{saveJson('difarmas_cash_movements',cashMovements)},[cashMovements]);
  useEffect(()=>{saveJson('difarmas_cash_openings',cashOpenings)},[cashOpenings]);
  useEffect(()=>{saveJson('difarmas_payment_transactions',paymentTransactions)},[paymentTransactions]);
  useEffect(()=>{saveJson('difarmas_missing_product_requests',missingProductRequests)},[missingProductRequests]);
  useEffect(()=>{saveJson('difarmas_supplier_returns',supplierReturns)},[supplierReturns]);
  useEffect(()=>{saveJson('difarmas_sale_adjustments',saleAdjustments)},[saleAdjustments]);

  const snapshot = useMemo<ErpSnapshot>(() => ({
    customers, quotes, suppliers, products, sales, orders, purchases, purchaseLogistics, purchaseCostHistory, settings, expenses, receivables, payables,
    inventoryMovements, inventoryLots, lotKardex, fefoProductIds, monthlyGoal, fixedExpenses, cashClosures, cashMovements, cashOpenings, paymentTransactions, missingProductRequests, supplierReturns, saleAdjustments, accountingAccounts, accountingEntries, hrEmployees, hrAttendance, hrLeaveRequests,
  }), [customers, quotes, suppliers, products, sales, purchases, purchaseCostHistory, settings, expenses, receivables, payables, inventoryMovements, inventoryLots, lotKardex, fefoProductIds, monthlyGoal, fixedExpenses, cashClosures, cashMovements, cashOpenings, paymentTransactions, missingProductRequests, supplierReturns, saleAdjustments, orders, purchaseLogistics, accountingAccounts, accountingEntries, hrEmployees, hrAttendance, hrLeaveRequests]);

  // Load the signed-in user's snapshot before allowing remote writes. A first login
  // seeds the cloud record from this browser's existing local data.
  useEffect(() => {
    if (demoMode) { setRemoteReady(true); setSyncStatus('synced'); setSyncError(null); return; }
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
      setAccountingAccounts([]);
      setAccountingEntries([]);
      setHrEmployeesRaw([]);
      setHrAttendanceRaw([]);
      setHrLeaveRequestsRaw([]);
      setOrders([]);
      setPurchases([]);
      setPurchaseLogistics([]);
      setPurchaseCostHistory([]);
      setSettings(initialSettings);
      setExpenses([]);
      setReceivables([]);
      setPayables([]);
      setInventoryMovements([]);
      setInventoryLots([]);setLotKardex([]);setFefoProductIds([]);
      setCashClosures([]);
      setCashMovements([]);
      setCashOpenings([]);
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
        setAccountingAccounts(remote.accountingAccounts ?? []);
        setAccountingEntries(remote.accountingEntries ?? []);
        setHrEmployeesRaw(remote.hrEmployees ?? []);
        setHrAttendanceRaw(remote.hrAttendance ?? []);
        setHrLeaveRequestsRaw(remote.hrLeaveRequests ?? []);
        setOrders(remote.orders ?? []);
        setPurchases(remote.purchases);
        setPurchaseLogistics(remote.purchaseLogistics ?? []);
        setPurchaseCostHistory(remote.purchaseCostHistory ?? []);
        setSettings(remote.settings ?? initialSettings);
        setExpenses(remote.expenses);
        setReceivables(remote.receivables);
        setPayables(remote.payables);
        setInventoryMovements(remote.inventoryMovements);
        setInventoryLots(remote.inventoryLots??[]);setLotKardex(remote.lotKardex??[]);setFefoProductIds(remote.fefoProductIds??[]);
        if (remote.cashClosures !== undefined) setCashClosures(remote.cashClosures);
        if (remote.cashMovements !== undefined) setCashMovements(remote.cashMovements);
        if (remote.cashOpenings !== undefined) setCashOpenings(remote.cashOpenings);
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
  }, [userId, demoMode]);

  useEffect(() => {
    if (!remoteReady || demoMode) return;
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
  }, [remoteReady, userId, snapshot, demoMode]);

  const saveQuotes = async (nextQuotes: QuoteRecord[]): Promise<void> => {
    if (demoMode) { setQuotes(nextQuotes); return; }
    if (!canWriteSnapshot(remoteReady, syncStatus)) throw new Error('El sistema no está sincronizado. Espera a que termine la sincronización e inténtalo de nuevo.');
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
    if (!canWriteSnapshot(remoteReady, syncStatus)) return false;
    const name=request.name.trim();
    if(!name||!Number.isFinite(request.quantity)||request.quantity<1)return false;
    setMissingProductRequests(current=>[{...request,name,id:nextMissingProductRequestId(),requestedAt:new Date().toISOString(),status:'Pendiente'},...current]);
    return true;
  };


  const baseQuantityOf=(item:Pick<CartItem,'qty'|'baseUnitsPerSale'>)=>item.qty*(item.baseUnitsPerSale??1);
  const validBaseMultiplier=(value:number|undefined)=>value===undefined||(Number.isInteger(value)&&value>0&&value<=1000000);
  const validUnitInventoryProduct=(product:Product)=>!product.unitInventoryEnabled||(product.itemType==='Producto'&&!!product.baseUnitName?.trim()&&Number.isInteger(product.stock)&&Number.isInteger(product.minStock)&&!!product.unitPresentations?.length&&product.unitPresentations.every(option=>option.name.trim()&&option.name.trim().toLocaleLowerCase()!==product.baseUnitName!.trim().toLocaleLowerCase()&&Number.isInteger(option.unitsPerPresentation)&&option.unitsPerPresentation>1&&Number.isFinite(option.retailPrice)&&option.retailPrice>0&&Number.isFinite(option.wholesalePrice)&&option.wholesalePrice>0)&&new Set(product.unitPresentations.map(option=>option.name.trim().toLocaleLowerCase())).size===product.unitPresentations.length);
  const allocateFefo=(sourceLots:InventoryLot[],productId:number,quantity:number,reference:string,type:'Venta'|'Reserva'|'Devolución a proveedor',includeExpired=false):{lots:InventoryLot[];allocations:LotAllocation[];movements:LotKardexMovement[]}|null=>{
    let remaining=quantity;const allocations:LotAllocation[]=[];const movements:LotKardexMovement[]=[];
    const eligible=sourceLots.filter(lot=>lot.productId===productId&&lot.quantityRemaining>0&&(includeExpired||lot.expiry>=new Date().toISOString().slice(0,10))).sort((a,b)=>a.expiry.localeCompare(b.expiry)||a.receivedAt.localeCompare(b.receivedAt));
    let next=sourceLots;
    for(const lot of eligible){if(remaining<=0)break;const take=Math.min(remaining,lot.quantityRemaining);if(take<=0)continue;
      next=next.map(item=>item.id===lot.id?{...item,quantityRemaining:item.quantityRemaining-take}:item);
      allocations.push({lotId:lot.id,lotCode:lot.lotCode,expiry:lot.expiry,quantity:take,unitCost:lot.unitCost});
      movements.push({id:crypto.randomUUID(),lotId:lot.id,productId,productName:products.find(p=>p.id===productId)?.name??'',lotCode:lot.lotCode,expiry:lot.expiry,type,quantity:take,stockBefore:lot.quantityRemaining,stockAfter:lot.quantityRemaining-take,unitCost:lot.unitCost,reference,date:new Date().toISOString()});
      remaining-=take;
    }
    return remaining===0?{lots:next,allocations,movements}:null;
  };
  const releaseLotAllocations=(sourceLots:InventoryLot[],allocations:LotAllocation[],reference:string):{lots:InventoryLot[];movements:LotKardexMovement[]}=>{
    let next=sourceLots;const movements:LotKardexMovement[]=[];const date=new Date().toISOString();
    for(const allocation of allocations){const lot=next.find(item=>item.id===allocation.lotId);if(!lot)continue;next=next.map(item=>item.id===lot.id?{...item,quantityRemaining:item.quantityRemaining+allocation.quantity}:item);movements.push({id:crypto.randomUUID(),lotId:lot.id,productId:lot.productId,productName:products.find(p=>p.id===lot.productId)?.name??'',lotCode:lot.lotCode,expiry:lot.expiry,type:'Liberación',quantity:allocation.quantity,stockBefore:lot.quantityRemaining,stockAfter:lot.quantityRemaining+allocation.quantity,unitCost:lot.unitCost,reference,date,note:'Liberación de reserva'});}
    return {lots:next,movements};
  };
  const registerOpeningLot=(productId:number,lotCode:string,expiry:string,quantity:number,unitCost:number,supplier=''):boolean=>{
    if(!canWriteSnapshot(remoteReady,syncStatus)||fefoProductIds.includes(productId))return false;
    const product=products.find(item=>item.id===productId);if(!product||!lotCode.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||!Number.isInteger(quantity)||quantity<=0||!Number.isFinite(unitCost)||unitCost<0)return false;
    const already=inventoryLots.filter(lot=>lot.productId===productId&&lot.opening).reduce((sum,lot)=>sum+lot.quantityReceived,0);
    if(already+quantity>product.stock)return false;
    const date=new Date().toISOString(),id=crypto.randomUUID();
    const lot:InventoryLot={id,productId,lotCode:lotCode.trim(),expiry,receivedAt:date,supplier:supplier.trim(),unitCost,quantityReceived:quantity,quantityRemaining:quantity,sourceReference:'APERTURA',opening:true};
    setInventoryLots(current=>[...current,lot]);
    setLotKardex(current=>[...current,{id:crypto.randomUUID(),lotId:id,productId,productName:product.name,lotCode:lot.lotCode,expiry,type:'Apertura',quantity,stockBefore:0,stockAfter:quantity,unitCost,reference:'APERTURA',date,note:'Carga inicial conciliada manualmente'}]);
    return true;
  };
  const activateFefo=(productId:number):boolean=>{
    if(!canWriteSnapshot(remoteReady,syncStatus)||fefoProductIds.includes(productId))return false;
    const product=products.find(item=>item.id===productId);if(!product||orders.some(order=>order.status==='Pendiente'&&order.items.some(item=>item.id===productId)))return false;
    const opening=inventoryLots.filter(lot=>lot.productId===productId&&lot.opening);
    if(opening.reduce((sum,lot)=>sum+lot.quantityRemaining,0)!==product.stock||opening.length===0)return false;
    setFefoProductIds(current=>[...current,productId]);return true;
  };
  const adjustInventoryLot=(lotId:string,delta:number,note:string):boolean=>{
    if(!canWriteSnapshot(remoteReady,syncStatus)||!Number.isInteger(delta)||delta===0||!note.trim())return false;
    const lot=inventoryLots.find(item=>item.id===lotId);if(!lot)return false;
    const product=products.find(item=>item.id===lot.productId);if(!product||lot.quantityRemaining+delta<0||product.stock+delta<0)return false;
    const date=new Date().toISOString();const nextBalance=lot.quantityRemaining+delta;
    setInventoryLots(current=>current.map(item=>item.id===lotId?{...item,quantityRemaining:nextBalance,quantityReceived:item.quantityReceived+(delta>0?delta:0)}:item));
    setProducts(current=>current.map(item=>item.id===product.id?{...item,stock:item.stock+delta}:item));
    setLotKardex(current=>[...current,{id:crypto.randomUUID(),lotId,productId:lot.productId,productName:product.name,lotCode:lot.lotCode,expiry:lot.expiry,type:'Ajuste',quantity:Math.abs(delta),stockBefore:lot.quantityRemaining,stockAfter:nextBalance,unitCost:lot.unitCost,reference:'AJUSTE MANUAL',date,note:note.trim()}]);
    setInventoryMovements(current=>[...current,{id:nextInventoryMovementId(),productId:product.id,productName:product.name,type:'Ajuste',quantity:Math.abs(delta),stockBefore:product.stock,stockAfter:product.stock+delta,unitCost:lot.unitCost,date,note:note.trim()+' · Lote '+lot.lotCode}]);
    return true;
  };

  const fractionInventoryProduct=(sourceId:number,packageQuantity:number,unitsPerPackage:number,presentationName:string,unitsPerPresentation:number,baseUnitName:string):boolean=>{
    if(!canWriteSnapshot(remoteReady,syncStatus)||fefoProductIds.includes(sourceId))return false;
    const source=products.find(item=>item.id===sourceId);
    if(!source||source.itemType==='Servicio'||!Number.isInteger(packageQuantity)||packageQuantity<1||packageQuantity>source.stock||!Number.isInteger(unitsPerPackage)||unitsPerPackage<1||!Number.isInteger(unitsPerPresentation)||unitsPerPresentation<1||!presentationName.trim()||!baseUnitName.trim())return false;
    const totalBaseUnits=packageQuantity*unitsPerPackage;
    if(!Number.isSafeInteger(totalBaseUnits)||totalBaseUnits%unitsPerPresentation!==0)return false;
    const outputQuantity=totalBaseUnits/unitsPerPresentation;
    const childUnitCost=source.cost/unitsPerPackage*unitsPerPresentation;
    if(!Number.isFinite(childUnitCost)||childUnitCost<0||!Number.isSafeInteger(outputQuantity)||outputQuantity<1)return false;
    const date=new Date().toISOString();
    const childExpiry=source.expiry||'';
    const childLot=source.lot||'';
    const fractionedName=source.name+' — '+presentationName.trim()+' x '+unitsPerPresentation+' '+baseUnitName.trim();
    const child=products.find(item=>item.fractionParentId===source.id&&item.fractionUnitsPerPresentation===unitsPerPresentation&&item.fractionPresentationName?.toLowerCase()===presentationName.trim().toLowerCase()&&item.expiry===childExpiry&&item.lot===childLot);
    let updated:Product[];
    let childStockBefore=0;
    let childStockAfter=outputQuantity;
    let childId:number;
    let childCost=childUnitCost;
    if(child){
      childStockBefore=child.stock;
      childStockAfter=child.stock+outputQuantity;
      childCost=childStockAfter>0?((child.stock*child.cost)+(outputQuantity*childUnitCost))/childStockAfter:childUnitCost;
      const nextRetail=childCost/(1-0.4);
      const nextWholesale=childCost/(1-0.2);
      updated=products.map(item=>item.id===source.id?{...item,stock:item.stock-packageQuantity}:item.id===child.id?{...item,name:fractionedName,presentation:presentationName.trim()+' x '+unitsPerPresentation+' '+baseUnitName.trim(),stock:childStockAfter,cost:childCost,retail:nextRetail,wholesale:nextWholesale}:item);
      childId=child.id;
    }else{
      childId=nextProductId();
      const newChild:Product={
        ...source,id:childId,code:`FR-${source.id}-${unitsPerPresentation}-${Date.now().toString(36).toUpperCase()}`,
        name:fractionedName,presentation:presentationName.trim()+' x '+unitsPerPresentation+' '+baseUnitName.trim(),
        cost:childUnitCost,retail:childUnitCost/(1-0.4),wholesale:childUnitCost/(1-0.2),stock:outputQuantity,minStock:0,
        unitInventoryEnabled:false,unitPresentations:[],fractionParentId:source.id,fractionUnitsPerPresentation:unitsPerPresentation,
        fractionPresentationName:presentationName.trim(),fractionBaseUnitName:baseUnitName.trim(),
      };
      updated=[...products.map(item=>item.id===source.id?{...item,stock:item.stock-packageQuantity}:item),newChild];
    }
    const sourceMovement:InventoryMovement={id:nextInventoryMovementId(),productId:source.id,productName:source.name,type:'Ajuste',quantity:packageQuantity,stockBefore:source.stock,stockAfter:source.stock-packageQuantity,unitCost:source.cost,date,note:`Fraccionamiento: ${totalBaseUnits} ${baseUnitName} convertidos en ${outputQuantity} ${presentationName.trim()} x ${unitsPerPresentation}. Producto generado: ${fractionedName}.`};
    const childMovement:InventoryMovement={id:nextInventoryMovementId(),productId:childId,productName:fractionedName,type:'Ajuste',quantity:outputQuantity,stockBefore:childStockBefore,stockAfter:childStockAfter,unitCost:childCost,date,note:`Ingreso por fraccionamiento desde ${source.presentation} · producto original #${source.id}.`};
    setProducts(updated);
    setInventoryMovements(current=>[...current,sourceMovement,childMovement]);
    return true;
  };

  const saveOrder=(items:CartItem[],customer='',customerRtn='',total=0):number|null=>{
    if(orderSaveInProgress.current)return null;
    if(!canWriteSnapshot(remoteReady,syncStatus)||!items.length||items.some(item=>!Number.isInteger(item.qty)||item.qty<1||!Number.isFinite(item.price)||item.price<0))return null;
    if(items.some(item=>!validBaseMultiplier(item.baseUnitsPerSale)))return null;
    const quantities=new Map<number,number>();items.forEach(item=>quantities.set(item.id,(quantities.get(item.id)??0)+baseQuantityOf(item)));
    if([...quantities].some(([id,qty])=>!products.some(product=>product.id===id&&product.stock>=qty)))return null;
    let workingLots=inventoryLots;const orderAllocations:LotAllocation[]=[];const lotMovements:LotKardexMovement[]=[];
    for(const [productId,qty] of quantities){if(!fefoProductIds.includes(productId))continue;const allocated=allocateFefo(workingLots,productId,qty,'PEDIDO-PENDIENTE','Reserva');if(!allocated)return null;workingLots=allocated.lots;orderAllocations.push(...allocated.allocations);lotMovements.push(...allocated.movements);}
    const id=nextOrderId(),date=new Date().toISOString();
    const updated=products.map(product=>{const qty=quantities.get(product.id)??0;return qty?{...product,stock:product.stock-qty}:product;});
    const movements:InventoryMovement[]=[...quantities].map(([productId,quantity])=>{const product=products.find(item=>item.id===productId)!;return {id:nextInventoryMovementId(),productId,productName:product.name,type:'Ajuste',quantity,stockBefore:product.stock,stockAfter:product.stock-quantity,unitCost:product.cost,referenceId:id,date,note:'Reserva de pedido '+id};});
    const order:OrderRecord={id,number:'PED-'+String(id).slice(-8),date,updatedAt:date,status:'Pendiente',customer:customer.trim()||undefined,customerRtn:customerRtn.trim()||undefined,total,items:items.map(item=>({...item})),lotAllocations:orderAllocations};
    lotMovements.forEach(movement=>movement.reference=order.number);
    orderSaveInProgress.current=true;
    setProducts(updated);setInventoryMovements(current=>[...current,...movements]);if(orderAllocations.length){setInventoryLots(workingLots);setLotKardex(current=>[...current,...lotMovements]);}setOrders(current=>[order,...current]);
    return id;
  };
  const updateOrder=(orderId:number,items:CartItem[],customer='',customerRtn='',total=0):boolean=>{
    if(orderMutationInProgress.current.has(orderId))return false;
    if(!canWriteSnapshot(remoteReady,syncStatus)||!items.length||items.some(item=>!Number.isInteger(item.qty)||item.qty<1||!Number.isFinite(item.price)||item.price<0))return false;
    const order=orders.find(item=>item.id===orderId&&item.status==='Pendiente');if(!order)return false;
    const before=new Map<number,number>(),after=new Map<number,number>();
    if(items.some(item=>!validBaseMultiplier(item.baseUnitsPerSale)))return false;
    order.items.forEach(item=>before.set(item.id,(before.get(item.id)??0)+baseQuantityOf(item)));items.forEach(item=>after.set(item.id,(after.get(item.id)??0)+baseQuantityOf(item)));
    for(const productId of new Set([...before.keys(),...after.keys()])){const product=products.find(item=>item.id===productId);if(!product||product.stock+(before.get(productId)??0)<(after.get(productId)??0))return false;}
    const updated=products.map(product=>{const delta=(before.get(product.id)??0)-(after.get(product.id)??0);return delta?{...product,stock:product.stock+delta}:product;});
    let workingLots=inventoryLots;const nextAllocations:LotAllocation[]=[];const lotMovements:LotKardexMovement[]=[];
    const released=releaseLotAllocations(workingLots,order.lotAllocations??[],'PED-'+order.number);workingLots=released.lots;lotMovements.push(...released.movements);
    for(const [productId,qty] of after){if(!fefoProductIds.includes(productId))continue;const allocated=allocateFefo(workingLots,productId,qty,'PED-'+order.number,'Reserva');if(!allocated)return false;workingLots=allocated.lots;nextAllocations.push(...allocated.allocations);lotMovements.push(...allocated.movements);}
    const date=new Date().toISOString();
    const movements:InventoryMovement[]=[...new Set([...before.keys(),...after.keys()])].flatMap(productId=>{const oldQty=before.get(productId)??0,newQty=after.get(productId)??0,delta=newQty-oldQty;if(!delta)return [];const product=products.find(item=>item.id===productId)!;return [{id:nextInventoryMovementId(),productId,productName:product.name,type:'Ajuste' as const,quantity:Math.abs(delta),stockBefore:product.stock,stockAfter:product.stock-delta,unitCost:product.cost,referenceId:orderId,date,note:'Actualización de reserva del pedido '+order.number}];});
    orderMutationInProgress.current.add(orderId);
    setProducts(updated);setInventoryMovements(current=>[...current,...movements]);if(lotMovements.length){setInventoryLots(workingLots);setLotKardex(current=>[...current,...lotMovements]);}setOrders(current=>current.map(item=>item.id===orderId?{...item,items:items.map(line=>({...line})),lotAllocations:nextAllocations,customer:customer.trim()||undefined,customerRtn:customerRtn.trim()||undefined,total,updatedAt:date}:item));return true;
  };
  const deleteOrder=(orderId:number):boolean=>{
    if(orderMutationInProgress.current.has(orderId))return false;
    if(!canWriteSnapshot(remoteReady,syncStatus))return false;
    const order=orders.find(item=>item.id===orderId&&item.status==='Pendiente');if(!order)return false;
    const quantities=new Map<number,number>();order.items.forEach(item=>quantities.set(item.id,(quantities.get(item.id)??0)+baseQuantityOf(item)));
    if([...quantities.keys()].some(id=>!products.some(product=>product.id===id)))return false;
    const date=new Date().toISOString();
    const released=releaseLotAllocations(inventoryLots,order.lotAllocations??[],'PED-'+order.number);
    const updated=products.map(product=>{const qty=quantities.get(product.id)??0;return qty?{...product,stock:product.stock+qty}:product;});
    const movements:InventoryMovement[]=[...quantities].map(([productId,quantity])=>{const product=products.find(item=>item.id===productId)!;return {id:nextInventoryMovementId(),productId,productName:product.name,type:'Ajuste',quantity,stockBefore:product.stock,stockAfter:product.stock+quantity,unitCost:product.cost,referenceId:orderId,date,note:'Liberación de reserva por eliminación del pedido '+order.number};});
    orderMutationInProgress.current.add(orderId);
    setProducts(updated);setInventoryMovements(current=>[...current,...movements]);if((order.lotAllocations??[]).length){setInventoryLots(released.lots);setLotKardex(current=>[...current,...released.movements]);}setOrders(current=>current.filter(item=>item.id!==orderId));return true;
  };

  const recordSale=(sold:CartItem[],customer='',dueDate='',customerRtn='',invoiceNumber='',invoiceDetails?:StandardInvoiceDetails):boolean=>{
    if (!canWriteSnapshot(remoteReady, syncStatus) || saleInProgress.current) return false;
    if (!sold.length || sold.some(item => !Number.isInteger(item.qty) || item.qty <= 0 || !validBaseMultiplier(item.baseUnitsPerSale))) return false;
    if (((settings.paymentMethods??[]).find(method=>method.name===payment)?.kind==='credit'||payment==='Crédito') && (!customer.trim() || !dueDate.trim())) return false;
    const normalizedInvoiceNumber=invoiceNumber.trim().toLocaleLowerCase();
    if(invoiceDetails&&normalizedInvoiceNumber&&sales.some(sale=>sale.type==='factura_estandar'&&sale.invoiceNumber?.trim().toLocaleLowerCase()===normalizedInvoiceNumber))return false;
    const requestedQuantities=new Map<number,number>();sold.forEach(item=>requestedQuantities.set(item.id,(requestedQuantities.get(item.id)??0)+baseQuantityOf(item)));
    const sourceOrder=invoiceDetails?.orderId?orders.find(order=>order.id===invoiceDetails.orderId&&order.status==='Pendiente'):undefined;
    if(invoiceDetails?.orderId&&!sourceOrder)return false;
    if(sourceOrder){const reserved=new Map<number,number>();sourceOrder.items.forEach(item=>reserved.set(item.id,(reserved.get(item.id)??0)+baseQuantityOf(item)));if([...requestedQuantities].some(([id,qty])=>qty>(reserved.get(id)??0))||[...reserved].some(([id,qty])=>qty!==(requestedQuantities.get(id)??0)))return false;}
    else if ([...requestedQuantities.entries()].some(([id,qty])=>!products.some(p=>p.id===id&&p.stock>=qty))) return false;
    let updated: Product[]=products;let saleLots=inventoryLots;const saleLotMovements:LotKardexMovement[]=[];const saleLotAllocations:LotAllocation[]=[];
    if(!sourceOrder){try { updated = applySaleToInventory(products,[...requestedQuantities].map(([id,qty])=>{const product=products.find(item=>item.id===id)!;return {...product,qty,price:product.retail,cost:product.cost};})); } catch { return false; }
      for(const [productId,qty] of requestedQuantities){if(!fefoProductIds.includes(productId))continue;const allocated=allocateFefo(saleLots,productId,qty,invoiceNumber||'VENTA','Venta');if(!allocated)return false;saleLots=allocated.lots;saleLotMovements.push(...allocated.movements);saleLotAllocations.push(...allocated.allocations);}
    }
    saleInProgress.current=true;
    const recordDate=invoiceDetails?.invoiceDate ? new Date(invoiceDetails.invoiceDate+'T12:00:00') : new Date();
    const base=buildSaleRecord(sold,payment,invoiceDetails?'factura_estandar':saleType,customer,dueDate,recordDate,nextSaleId());
    const items=invoiceDetails ? (base.items??[]).map(line=>{
      const d=invoiceDetails.lines.find(row=>row.productId===line.productId);
      if(!d)return line;
      const net=d.netTotal;
      return {...line,unit:d.unit,baseUnitsPerSale:d.baseUnitsPerSale??line.baseUnitsPerSale??1,baseUnitPrice:line.unitPrice,unitPrice:line.qty?net/line.qty:line.unitPrice,revenue:net,profit:net-line.cost,discountPercent:d.discountPercent,taxPercent:d.taxPercent,discountAmount:d.discountAmount,taxAmount:d.taxAmount,lineTotal:d.lineTotal};
    }) : base.items;
    const sale:SaleRecord={
      ...base,
      type:invoiceDetails?'factura_estandar':base.type,
      invoiceNumber,
      customer:customer.trim()||undefined,
      customerRtn:customerRtn.trim()||undefined,
      items,
      lotAllocations:sourceOrder?.lotAllocations??saleLotAllocations,
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
    if(!sourceOrder){setProducts(updated);setInventoryMovements(current=>[...current,...createInventoryMovementsForSale(products,[...requestedQuantities].map(([id,qty])=>({id,qty})),sale.id,nextInventoryMovementId)]);if(saleLotMovements.length){setInventoryLots(saleLots);setLotKardex(current=>[...current,...saleLotMovements.map(m=>({...m,reference:invoiceNumber||String(sale.id)}))]);}}
    else setOrders(current=>current.map(order=>order.id===sourceOrder.id?{...order,status:'Facturado',invoiceId:sale.id,updatedAt:new Date().toISOString()}:order));
    setSales(current=>[...current,sale]);
    if((settings.paymentMethods??[]).find(method=>method.name===payment)?.kind==='credit'||payment==='Crédito') setReceivables(current=>[...current,createReceivableFromSale(sale,customer,dueDate)]);
    return true;
  };

  const updateStandardInvoice=(invoiceId:number,sold:CartItem[],customer='',customerRtn='',details?:StandardInvoiceDetails):boolean=>{
    if (!canWriteSnapshot(remoteReady, syncStatus)) return false;
    const original=sales.find(sale=>sale.id===invoiceId);
    if(!original||original.type!=='factura_estandar'||!sold.length||sold.some(item=>!Number.isInteger(item.qty)||item.qty<=0||!Number.isFinite(item.price)||item.price<0))return false;
    if((original.items??[]).some(line=>products.some(product=>product.id===line.productId&&product.unitInventoryEnabled&&line.baseUnitsPerSale===undefined)))return false;
    const oldQty=new Map<number,number>();
    (original.items??[]).forEach(line=>oldQty.set(line.productId,(oldQty.get(line.productId)??0)+line.qty*(line.baseUnitsPerSale??1)));
    const newQty=new Map<number,number>();
    if(sold.some(item=>!validBaseMultiplier(item.baseUnitsPerSale)))return false;
    sold.forEach(item=>newQty.set(item.id,(newQty.get(item.id)??0)+baseQuantityOf(item)));
    for(const item of sold){const product=products.find(p=>p.id===item.id);if(!product||product.stock+(oldQty.get(item.id)??0)<(newQty.get(item.id)??0))return false;}
    if([...newQty.keys()].some(id=>fefoProductIds.includes(id))&&!original.lotAllocations?.length)return false;
    let updatedLots=inventoryLots;const revisedAllocations:LotAllocation[]=[];const lotMovements:LotKardexMovement[]=[];
    const released=releaseLotAllocations(updatedLots,original.lotAllocations??[],'FACTURA-'+(original.invoiceNumber??invoiceId));updatedLots=released.lots;lotMovements.push(...released.movements);
    for(const [productId,qty] of newQty){if(!fefoProductIds.includes(productId))continue;const allocated=allocateFefo(updatedLots,productId,qty,'FACTURA-'+(original.invoiceNumber??invoiceId),'Venta');if(!allocated)return false;updatedLots=allocated.lots;revisedAllocations.push(...allocated.allocations);lotMovements.push(...allocated.movements);}
    const updatedProducts=products.map(product=>{const before=oldQty.get(product.id)??0;const after=newQty.get(product.id)??0;return before===after?product:{...product,stock:product.stock+before-after};});
    const movements:InventoryMovement[]=[];
    for(const product of products){const before=oldQty.get(product.id)??0;const after=newQty.get(product.id)??0;if(before===after)continue;movements.push({id:nextInventoryMovementId(),productId:product.id,productName:product.name,type:'Ajuste',quantity:Math.abs(after-before),stockBefore:product.stock,stockAfter:product.stock+before-after,unitCost:product.cost,referenceId:invoiceId,date:new Date().toISOString(),note:'Corrección de detalle de factura estándar '+(original.invoiceNumber??invoiceId)});}
    const items=sold.map(item=>{
      const d=details?.lines.find(row=>row.productId===item.id);
      const net=d?.netTotal??item.price*item.qty;
      const cost=item.cost*item.qty;
      return {productId:item.id,productName:item.name,category:item.category,laboratory:item.laboratory,qty:item.qty,unitCost:item.cost,unitPrice:details&&item.qty?net/item.qty:item.price,revenue:net,cost,profit:net-cost,...(d?{unit:d.unit,baseUnitsPerSale:d.baseUnitsPerSale??item.baseUnitsPerSale??1,baseUnitPrice:item.price,discountPercent:d.discountPercent,taxPercent:d.taxPercent,discountAmount:d.discountAmount,taxAmount:d.taxAmount,lineTotal:d.lineTotal}:{})};
    });
    const updatedSale:SaleRecord={
      ...original,
      lotAllocations:revisedAllocations,
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
    if(lotMovements.length){setInventoryLots(updatedLots);setLotKardex(current=>[...current,...lotMovements]);}
    setInventoryMovements(current=>[...current,...movements]);
    setSales(current=>current.map(sale=>sale.id===invoiceId?updatedSale:sale));
    if(existingReceivable)setReceivables(current=>current.map(item=>item.saleId===invoiceId?{...item,total:updatedSale.total,customer:updatedSale.customer||item.customer,dueDate:updatedSale.dueDate||item.dueDate}:item));
    return true;
  };

  const recordSupplierDispatch=(record:SupplierReturnRecord):boolean=>{
    if(!canWriteSnapshot(remoteReady, syncStatus))return false;
    const dispatchNote='Devolución enviada al proveedor: ';
    if(supplierDispatchInProgress.current.has(record.id)||inventoryMovements.some(movement=>movement.referenceId===record.id&&movement.note?.startsWith(dispatchNote)))return false;
    if(!record.items.length||record.items.some(item=>!Number.isInteger(item.quantity)||item.quantity<=0||!Number.isFinite(item.unitCost)||item.unitCost<0))return false;
    const quantitiesByProduct=new Map<number,number>();
    record.items.forEach(item=>quantitiesByProduct.set(item.productId,(quantitiesByProduct.get(item.productId)??0)+item.quantity));
    if([...quantitiesByProduct].some(([productId,quantity])=>!products.some(product=>product.id===productId&&product.stock>=quantity)))return false;
    let workingLots=inventoryLots;const supplierLotMovements:LotKardexMovement[]=[];
    for(const [productId,quantity] of quantitiesByProduct){if(!fefoProductIds.includes(productId))continue;const allocated=allocateFefo(workingLots,productId,quantity,'DEV-PROV-'+record.id,'Devolución a proveedor',true);if(!allocated)return false;workingLots=allocated.lots;supplierLotMovements.push(...allocated.movements);}
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
    if(supplierLotMovements.length){setInventoryLots(workingLots);setLotKardex(current=>[...current,...supplierLotMovements]);}
    return true;
  };

  const resolveSupplierReturn=(record:SupplierReturnRecord,status:SupplierReturnRecord['status']):boolean=>{
    if(!canWriteSnapshot(remoteReady, syncStatus))return false;
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
      if(record.items.some(item=>fefoProductIds.includes(item.productId)))return false;
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
    if(!canWriteSnapshot(remoteReady, syncStatus))return false;
    if(saleAdjustments.some(item=>item.id===adjustment.id)||!sales.some(sale=>sale.id===adjustment.saleId)||!adjustment.items.length||!Number.isFinite(adjustment.amount)||adjustment.amount<=0)return false;
    if(adjustment.items.some(item=>!Number.isInteger(item.quantity)||item.quantity<=0||!Number.isFinite(item.unitPrice)||item.unitPrice<0||!Number.isFinite(item.unitCost)||item.unitCost<0))return false;
    const originalSale=sales.find(sale=>sale.id===adjustment.saleId);
    if(!originalSale)return false;
    const calculatedAmount=adjustment.items.reduce((sum,item)=>sum+item.unitPrice*item.quantity,0);
    const alreadyAdjustedAmount=saleAdjustments.filter(item=>item.saleId===adjustment.saleId&&item.type!=='Anulación').reduce((sum,item)=>sum+item.amount,0);
    if(!Number.isFinite(calculatedAmount)||Math.abs(calculatedAmount-adjustment.amount)>0.01||adjustment.amount>Math.max(0,originalSale.total-alreadyAdjustedAmount)+0.01)return false;
    const soldQuantities=new Map<number,number>();
    (originalSale.items??[]).forEach(line=>soldQuantities.set(line.productId,(soldQuantities.get(line.productId)??0)+line.qty*(line.baseUnitsPerSale??1)));
    const adjustedItems=saleAdjustments.filter(item=>item.saleId===adjustment.saleId&&item.type!=='Anulación').flatMap(item=>item.items);
    const alreadyAdjusted=new Map<number,number>();
    adjustedItems.forEach(item=>alreadyAdjusted.set(item.productId,(alreadyAdjusted.get(item.productId)??0)+item.quantity*(item.baseUnitsPerSale??1)));
    if(adjustment.items.some(item=>!validBaseMultiplier(item.baseUnitsPerSale)))return false;
    if(adjustment.items.some(line=>line.returnToStock&&products.some(product=>product.id===line.productId&&product.unitInventoryEnabled)&&(originalSale.items??[]).some(soldLine=>soldLine.productId===line.productId&&soldLine.baseUnitsPerSale===undefined)))return false;
    const requestedInThisAdjustment=new Map<number,number>();
    adjustment.items.forEach(item=>requestedInThisAdjustment.set(item.productId,(requestedInThisAdjustment.get(item.productId)??0)+item.quantity*(item.baseUnitsPerSale??1)));
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
    const movementDate=new Date().toISOString();let returnedLots=inventoryLots;const lotReturnMovements:LotKardexMovement[]=[];
    const previousReturned=new Map<string,number>();
    saleAdjustments.filter(record=>record.saleId===adjustment.saleId).flatMap(record=>record.items).forEach(item=>(item.lotAllocations??[]).forEach(allocation=>previousReturned.set(allocation.lotId,(previousReturned.get(allocation.lotId)??0)+allocation.quantity)));
    const lotAdjustedItems=adjustment.items.map(line=>{
      if(!line.returnToStock||!fefoProductIds.includes(line.productId))return line;
      if(!originalSale.lotAllocations?.length)return null;
      let remaining=line.quantity*(line.baseUnitsPerSale??1);const allocations:LotAllocation[]=[];
      for(const soldAllocation of originalSale.lotAllocations.filter(allocation=>allocation.lotId&&inventoryLots.some(lot=>lot.id===allocation.lotId&&lot.productId===line.productId))){
        const already=previousReturned.get(soldAllocation.lotId)??0;const available=Math.max(0,soldAllocation.quantity-already);const take=Math.min(remaining,available);if(!take)continue;
        const lot=returnedLots.find(item=>item.id===soldAllocation.lotId);if(!lot)continue;
        returnedLots=returnedLots.map(item=>item.id===lot.id?{...item,quantityRemaining:item.quantityRemaining+take}:item);
        allocations.push({...soldAllocation,quantity:take});previousReturned.set(soldAllocation.lotId,already+take);
        lotReturnMovements.push({id:crypto.randomUUID(),lotId:lot.id,productId:line.productId,productName:line.productName,lotCode:lot.lotCode,expiry:lot.expiry,type:'Devolución',quantity:take,stockBefore:lot.quantityRemaining,stockAfter:lot.quantityRemaining+take,unitCost:lot.unitCost,reference:adjustment.invoiceNumber,date:movementDate,note:'Devolución reincorporada al lote original'});
        remaining-=take;if(remaining===0)break;
      }
      if(remaining>0)return null;
      return {...line,lotAllocations:allocations};
    });
    if(lotAdjustedItems.some(item=>item===null))return false;
    const savedAdjustment:SaleAdjustmentRecord={...adjustment,items:lotAdjustedItems as SaleAdjustmentRecord['items']};
    const movements:InventoryMovement[]=[...returnedByProduct].map(([productId,lines])=>{
      const product=products.find(item=>item.id===productId)!;
      const quantity=lines.reduce((sum,line)=>sum+line.quantity*(line.baseUnitsPerSale??1),0);
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
    if(lotReturnMovements.length){setInventoryLots(returnedLots);setLotKardex(current=>[...current,...lotReturnMovements]);}
    if(receivable&&creditReduction>0){
      setReceivables(current=>current.map(item=>item.saleId===adjustment.saleId
        ? {...item,total:Math.max(item.paid,item.total-creditReduction)}
        : item));
    }
    if(adjustment.paymentMethod.toLowerCase().includes('efectivo')){
      setCashMovements(current=>[{id:adjustment.id,type:'Salida',description:'Reembolso por '+adjustment.type+' '+adjustment.invoiceNumber,amount:adjustment.amount,category:'Devoluciones de ventas',date:new Date().toISOString()},...current]);
    }
    setSaleAdjustments(current=>[savedAdjustment,...current]);
    return true;
  };

  const saveProduct=(product:Product):Product|null=>{
    if (!canWriteSnapshot(remoteReady, syncStatus)) return null;
    if (!product.name.trim() || [product.cost,product.retail,product.wholesale,product.stock,product.minStock].some(v=>!Number.isFinite(v)||v<0)) return null;
    let saved:Product;
    if (editing) {
      const previous = products.find(p=>p.id===editing.id);
      if(previous&&!previous.unitInventoryEnabled&&product.unitInventoryEnabled&&(fefoProductIds.includes(previous.id)||inventoryLots.some(lot=>lot.productId===previous.id)||orders.some(order=>order.status==='Pendiente'&&order.items.some(item=>item.id===previous.id))))return null;
      if(previous?.unitInventoryEnabled&&!product.unitInventoryEnabled&&(fefoProductIds.includes(previous.id)||inventoryLots.some(lot=>lot.productId===previous.id)||orders.some(order=>order.status==='Pendiente'&&order.items.some(item=>item.id===previous.id))))return null;
      if(!validUnitInventoryProduct(product))return null;
      saved = {...product,id:editing.id};
      if(previous&&previous.stock!==saved.stock&&(fefoProductIds.includes(previous.id)||previous.unitInventoryEnabled))return null;
      setProducts(current=>current.map(p=>p.id===editing.id?saved:p));
      if (previous && previous.stock !== saved.stock) {
        const difference = saved.stock - previous.stock;
        setInventoryMovements(current=>[...current,{id:nextInventoryMovementId(),productId:saved.id,productName:saved.name,type:'Ajuste',quantity:Math.abs(difference),stockBefore:previous.stock,stockAfter:saved.stock,unitCost:saved.cost,date:new Date().toISOString(),note:difference>0?'Ajuste de entrada manual':'Ajuste de salida manual'}]);
      }
    } else {
      if(!validUnitInventoryProduct(product))return null;
      saved = {...product,id:nextProductId()};
      setProducts(current=>[...current,saved]);
    }
    setEditing(null); setShowForm(false);
    return saved;
  };

  const deleteProduct=(id:number)=>{ if (!canWriteSnapshot(remoteReady, syncStatus)) return; setProducts(current=>current.filter(product=>product.id!==id)); };

  const receivePurchase=(items:PurchaseItem[],paymentMethod:string,dueDate:string,invoiceNumber='',invoiceDate='',notes='',enteredTotal?:number,paymentTerms='Contado - Efectivo',supplierOverride?:string):boolean=>{
    if (!canWriteSnapshot(remoteReady, syncStatus) || purchaseInProgress.current) return false;
    const receivingSupplier=(supplierOverride??purchaseSupplier).trim();
    if(!receivingSupplier)return false;
    if (!items.length || items.some(item => !Number.isFinite(item.qty) || item.qty <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0)) return false;
    const supplierKey=receivingSupplier.toLocaleLowerCase();
    const invoiceKey=invoiceNumber.trim().toLocaleLowerCase();
    if(invoiceKey && purchases.some(p=>p.supplier.trim().toLocaleLowerCase()===supplierKey && String(p.invoiceNumber??'').trim().toLocaleLowerCase()===invoiceKey)) return false;
    if(items.some(item=>!Number.isInteger(item.baseUnitsPerPurchase??1)||(item.baseUnitsPerPurchase??1)<1||(item.baseUnitsPerPurchase??1)>1000000))return false;
    const inventoryItems:PurchaseItem[]=items.map(item=>{const units=item.baseUnitsPerPurchase??1;return {...item,qty:item.qty*units,unitCost:item.unitCost/units,purchaseUnit:undefined,baseUnitsPerPurchase:1};});
    let updated: Product[];
    try { updated = applyPurchaseToInventory(products,inventoryItems,receivingSupplier); } catch { return false; }
    const receivedAt=new Date().toISOString();const newLots:InventoryLot[]=[];const newLotMovements:LotKardexMovement[]=[];
    for(const item of inventoryItems){if(!fefoProductIds.includes(item.id))continue;if(!item.lot?.trim()||!item.expiry||!/^\d{4}-\d{2}-\d{2}$/.test(item.expiry))return false;const lotId=crypto.randomUUID();const lot:InventoryLot={id:lotId,productId:item.id,lotCode:item.lot.trim(),expiry:item.expiry,receivedAt,supplier:receivingSupplier,unitCost:item.unitCost,quantityReceived:item.qty,quantityRemaining:item.qty,sourceReference:invoiceNumber||'COMPRA',opening:false};newLots.push(lot);newLotMovements.push({id:crypto.randomUUID(),lotId,productId:item.id,productName:item.name,lotCode:lot.lotCode,expiry:lot.expiry,type:'Compra',quantity:item.qty,stockBefore:0,stockAfter:item.qty,unitCost:item.unitCost,reference:invoiceNumber||'COMPRA',date:receivedAt});}
    purchaseInProgress.current=true;
    const referenceId = nextPurchaseId();
    setProducts(updated);
    setInventoryMovements(current=>[...current,...createInventoryMovementsForPurchase(products,inventoryItems,referenceId,nextInventoryMovementId)]);
    const calculatedTotal=items.reduce((sum,item)=>sum+item.qty*item.unitCost,0);
    const total=typeof enteredTotal==='number'&&Number.isFinite(enteredTotal)&&enteredTotal>=0?enteredTotal:calculatedTotal;
    setPurchases(current=>[{id:referenceId,supplier:receivingSupplier,total,paymentMethod:paymentMethod as 'Efectivo'|'Transferencia'|'Crédito',date:receivedAt,invoiceNumber,invoiceDate,notes,paymentTerms,dueDate:paymentMethod==='Crédito'?dueDate:undefined},...current]);
    if(newLots.length){setInventoryLots(current=>[...current,...newLots]);setLotKardex(current=>[...current,...newLotMovements]);}
    setPurchaseCostHistory(current=>[
      ...inventoryItems.map((item):PurchaseCostHistoryEntry=>({id:nextPurchaseCostHistoryId(),purchaseId:referenceId,productId:item.id,productCode:item.code,productName:item.name,supplier:receivingSupplier,unitCost:item.unitCost,quantity:item.qty,date:receivedAt})),
      ...current,
    ]);
    if(paymentMethod==='Crédito'){const payable=createPayableFromPurchase(items,receivingSupplier,dueDate,new Date(),referenceId,invoiceNumber,nextPayableId());setPayables(current=>[...current,{...payable,total}]);}
    return true;
  };

  // Public snapshot setters fail closed; internal hydration continues using raw setters.
  const guardedSetCustomers = guardSnapshotSetter(setCustomers, canWriteSnapshotNow);
  const guardedSetQuotes = guardSnapshotSetter(setQuotes, canWriteSnapshotNow);
  const guardedSetSuppliers = guardSnapshotSetter(setSuppliers, canWriteSnapshotNow);
  const guardedSetProducts = guardSnapshotSetter(setProducts, canWriteSnapshotNow);
  const guardedSetMonthlyGoal = guardSnapshotSetter(setMonthlyGoal, canWriteSnapshotNow);
  const guardedSetAccountingAccounts = guardSnapshotSetter(setAccountingAccounts, canWriteSnapshotNow);
  const guardedSetAccountingEntries = guardSnapshotSetter(setAccountingEntries, canWriteSnapshotNow);
  const guardedSetHrEmployees = guardSnapshotSetter(setHrEmployeesRaw, canWriteSnapshotNow);
  const guardedSetHrAttendance = guardSnapshotSetter(setHrAttendanceRaw, canWriteSnapshotNow);
  const guardedSetHrLeaveRequests = guardSnapshotSetter(setHrLeaveRequestsRaw, canWriteSnapshotNow);
  const guardedSetFixedExpenses = guardSnapshotSetter(setFixedExpenses, canWriteSnapshotNow);
  const guardedSetSettings = guardSnapshotSetter(setSettings, canWriteSnapshotNow);
  const guardedSetSales = guardSnapshotSetter(setSales, canWriteSnapshotNow);
  const guardedSetExpenses = guardSnapshotSetter(setExpenses, canWriteSnapshotNow);
  const guardedSetReceivables = guardSnapshotSetter(setReceivables, canWriteSnapshotNow);
  const guardedSetPayables = guardSnapshotSetter(setPayables, canWriteSnapshotNow);
  const guardedSetCashClosures = guardSnapshotSetter(setCashClosures, canWriteSnapshotNow);
  const guardedSetCashMovements = guardSnapshotSetter(setCashMovements, canWriteSnapshotNow);
  const guardedSetCashOpenings = guardSnapshotSetter(setCashOpenings, canWriteSnapshotNow);
  const guardedSetPaymentTransactions = guardSnapshotSetter(setPaymentTransactions, canWriteSnapshotNow);
  const guardedSetMissingProductRequests = guardSnapshotSetter(setMissingProductRequests, canWriteSnapshotNow);
  const guardedSetSupplierReturns = guardSnapshotSetter(setSupplierReturns, canWriteSnapshotNow);
  const receivePurchaseLogistics=(orderId:string,items:PurchaseItem[]):boolean=>{
    if(!canWriteSnapshot(remoteReady,syncStatus)||logisticsReceiptInProgress.current.has(orderId))return false;
    const order=purchaseLogistics.find(record=>record.id===orderId);
    if(!order||order.status==='Recibida'||!items.length)return false;
    const lineKey=(item:PurchaseItem)=>item.purchaseLineId??String(item.id);
    const orderedByLine=new Map(order.items.map(item=>[lineKey(item),item]));
    const receivedByLine=new Map<string,number>();
    (order.receivedItems??[]).forEach(item=>receivedByLine.set(lineKey(item),(receivedByLine.get(lineKey(item))??0)+item.qty));
    const batchByLine=new Map<string,number>();
    for(const item of items){
      const key=lineKey(item);const ordered=orderedByLine.get(key);
      if(!ordered||ordered.id!==item.id||!Number.isFinite(item.qty)||item.qty<=0||!Number.isFinite(item.unitCost)||item.unitCost<0)return false;
      batchByLine.set(key,(batchByLine.get(key)??0)+item.qty);
      if((batchByLine.get(key)??0)+(receivedByLine.get(key)??0)>ordered.qty+0.000001)return false;
      if(!item.expiry||!/^\d{4}-\d{2}-\d{2}$/.test(item.expiry))return false;
      if(fefoProductIds.includes(item.id)&&!item.lot?.trim())return false;
      if(!Number.isInteger(item.baseUnitsPerPurchase??1)||(item.baseUnitsPerPurchase??1)<1||(item.baseUnitsPerPurchase??1)>1000000)return false;
    }
    const supplierKey=order.supplier.trim().toLocaleLowerCase();
    const invoiceKey=order.invoiceNumber.trim().toLocaleLowerCase();
    if(!order.purchaseRegistered&&invoiceKey&&purchases.some(p=>p.supplier.trim().toLocaleLowerCase()===supplierKey&&String(p.invoiceNumber??'').trim().toLocaleLowerCase()===invoiceKey))return false;
    const inventoryItems:PurchaseItem[]=items.map(item=>{const units=item.baseUnitsPerPurchase??1;return {...item,qty:item.qty*units,unitCost:item.unitCost/units,purchaseUnit:undefined,baseUnitsPerPurchase:1};});
    let updatedProducts:Product[];
    try{updatedProducts=applyPurchaseToInventory(products,inventoryItems,order.supplier);}catch{return false;}
    const receivedAt=new Date().toISOString();
    const newLots:InventoryLot[]=[];const lotMovements:LotKardexMovement[]=[];
    for(const item of inventoryItems){
      if(!fefoProductIds.includes(item.id))continue;
      const lotId=crypto.randomUUID();
      const lot:InventoryLot={id:lotId,productId:item.id,lotCode:item.lot.trim(),expiry:item.expiry,receivedAt,supplier:order.supplier,unitCost:item.unitCost,quantityReceived:item.qty,quantityRemaining:item.qty,sourceReference:order.invoiceNumber||order.id,opening:false};
      newLots.push(lot);
      lotMovements.push({id:crypto.randomUUID(),lotId,productId:item.id,productName:item.name,lotCode:lot.lotCode,expiry:lot.expiry,type:'Compra',quantity:item.qty,stockBefore:0,stockAfter:item.qty,unitCost:item.unitCost,reference:order.invoiceNumber||order.id,date:receivedAt,note:'Recepción de orden logística'});
    }
    const updatedReceived=[...(order.receivedItems??[]),...items.map(item=>({...item}))];
    const remaining=order.items.some(ordered=>ordered.qty>(updatedReceived.filter(item=>lineKey(item)===lineKey(ordered)).reduce((sum,item)=>sum+item.qty,0)+0.000001));
    const shouldRegisterPurchase=!order.purchaseRegistered&&(Boolean(invoiceKey)||!remaining);
    logisticsReceiptInProgress.current.add(orderId);
    const purchaseId=order.purchaseId??nextPurchaseId();
    setProducts(updatedProducts);
    setInventoryMovements(current=>[...current,...createInventoryMovementsForPurchase(products,inventoryItems,purchaseId,nextInventoryMovementId)]);
    if(newLots.length){setInventoryLots(current=>[...current,...newLots]);setLotKardex(current=>[...current,...lotMovements]);}
    setPurchaseCostHistory(current=>[
      ...inventoryItems.map((item):PurchaseCostHistoryEntry=>({id:nextPurchaseCostHistoryId(),purchaseId,productId:item.id,productCode:item.code,productName:item.name,supplier:order.supplier,unitCost:item.unitCost,quantity:item.qty,date:receivedAt})),
      ...current,
    ]);
    if(shouldRegisterPurchase){
      setPurchases(current=>[{id:purchaseId,supplier:order.supplier,total:order.total,paymentMethod:order.paymentMethod,date:receivedAt,invoiceNumber:order.invoiceNumber,invoiceDate:order.invoiceDate,notes:order.notes,paymentTerms:order.paymentTerms,dueDate:order.paymentMethod==='Crédito'?order.dueDate:undefined},...current]);
      if(order.paymentMethod==='Crédito'){
        const payable=createPayableFromPurchase(order.items,order.supplier,order.dueDate,new Date(),purchaseId,order.invoiceNumber,nextPayableId());
        setPayables(current=>[...current,{...payable,total:order.total}]);
      }
    }
    setPurchaseLogistics(current=>current.map(record=>record.id===orderId?{...record,purchaseId,purchaseRegistered:record.purchaseRegistered||shouldRegisterPurchase,receivedItems:updatedReceived,status:remaining?'Recepción parcial':'Recibida',receivedAt}:record));
    return true;
  };

  const guardedSetPurchaseLogistics=guardSnapshotSetter(setPurchaseLogistics,canWriteSnapshotNow);
  const guardedSetSaleAdjustments = guardSnapshotSetter(setSaleAdjustments, canWriteSnapshotNow);

  return {active,setActive,fractionInventoryProduct,purchaseLogistics,setPurchaseLogistics:guardedSetPurchaseLogistics,inventoryLots,lotKardex,fefoProductIds,registerOpeningLot,activateFefo,adjustInventoryLot,hrEmployees,setHrEmployees:guardedSetHrEmployees,hrAttendance,setHrAttendance:guardedSetHrAttendance,hrLeaveRequests,setHrLeaveRequests:guardedSetHrLeaveRequests,accountingAccounts,setAccountingAccounts:guardedSetAccountingAccounts,accountingEntries,setAccountingEntries:guardedSetAccountingEntries,orders,saveOrder,updateOrder,deleteOrder,customers,setCustomers:guardedSetCustomers,quotes,setQuotes:guardedSetQuotes,saveQuotes,suppliers,setSuppliers:guardedSetSuppliers,products,setProducts:guardedSetProducts,search,setSearch,monthlyGoal,setMonthlyGoal:guardedSetMonthlyGoal,fixedExpenses,setFixedExpenses:guardedSetFixedExpenses,settings,setSettings:guardedSetSettings,showForm,setShowForm,editing,setEditing,cart,setCart,saleType,setSaleType,payment,setPayment,saleSearch,setSaleSearch,purchaseCart,setPurchaseCart,purchaseSearch,setPurchaseSearch,purchaseSupplier,setPurchaseSupplier,sales,setSales:guardedSetSales,purchases,purchaseCostHistory,receivePurchaseLogistics,expenses,setExpenses:guardedSetExpenses,receivables,setReceivables:guardedSetReceivables,payables,setPayables:guardedSetPayables,inventoryMovements,cashClosures,setCashClosures:guardedSetCashClosures,cashMovements,setCashMovements:guardedSetCashMovements,cashOpenings,setCashOpenings:guardedSetCashOpenings,paymentTransactions,setPaymentTransactions:guardedSetPaymentTransactions,missingProductRequests,setMissingProductRequests:guardedSetMissingProductRequests,supplierReturns,setSupplierReturns:guardedSetSupplierReturns,saleAdjustments,setSaleAdjustments:guardedSetSaleAdjustments,recordSupplierDispatch,resolveSupplierReturn,recordSaleAdjustment,recordMissingProduct,filtered,recordSale,updateStandardInvoice,saveProduct,deleteProduct,receivePurchase,syncStatus,syncError,remoteReady};
}