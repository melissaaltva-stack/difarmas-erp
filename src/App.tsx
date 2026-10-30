import { lazy, Suspense, startTransition, useState } from 'react';
import { useErpState } from './hooks/useErpState';
import type { Module, UserAccess } from './domain/types';

const POS = lazy(() => import('./components/POS').then(m => ({ default: m.POS })));
const StandardInvoice = lazy(() => import('./components/StandardInvoice').then(m => ({ default: m.StandardInvoice })));
const AiAssistant = lazy(() => import('./components/AiAssistant').then(m => ({ default: m.AiAssistant })));
const Purchases = lazy(() => import('./components/Purchases').then(m => ({ default: m.Purchases })));
const Inventory = lazy(() => import('./components/Inventory').then(m => ({ default: m.Inventory })));
const ProductModal = lazy(() => import('./components/Inventory').then(m => ({ default: m.ProductModal })));
const Finance = lazy(() => import('./components/Finance').then(m => ({ default: m.Finance })));
const GoalsSettings = lazy(() => import('./components/ManagementSuite').then(m => ({ default: m.GoalsSettings })));
const ManagementSuite = lazy(() => import('./components/ManagementSuite').then(m => ({ default: m.ManagementSuite })));
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
import { Activity, Boxes, LayoutDashboard, ShoppingCart, Wallet, Truck, Settings as SettingsIcon, HandCoins, CreditCard, Printer, BrainCircuit, UsersRound, MessagesSquare, Menu, X } from 'lucide-react';
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const Customers = lazy(() => import('./components/Customers').then(m => ({ default: m.Customers })));
const Quotes = lazy(() => import('./components/Quotes').then(m => ({ default: m.Quotes })));
const SocialSales = lazy(() => import('./components/SocialSales').then(m => ({ default: m.SocialSales })));
const ReceivablesModule = lazy(() => import('./components/FinancialModules').then(m => ({ default: m.ReceivablesModule })));
const PayablesModule = lazy(() => import('./components/FinancialModules').then(m => ({ default: m.PayablesModule })));
const ReportsModule = lazy(() => import('./components/FinancialModules').then(m => ({ default: m.ReportsModule })));

const preloadModule = (id: string) => {
  switch (id) {
    case 'dashboard': case 'finanzas': return Promise.all([import('./components/Dashboard'), import('./components/ManagementSuite'), import('./components/Finance')]);
    case 'inventario': return import('./components/Inventory');
    case 'ventas': return import('./components/POS');
    case 'facturacion_estandar': return import('./components/StandardInvoice');
    case 'compras': case 'proveedores': return import('./components/Purchases');
    case 'clientes': return import('./components/Customers');
    case 'cotizaciones': return import('./components/Quotes');
    case 'redes_sociales': return import('./components/SocialSales');
    case 'configuracion': return import('./components/Settings');
    case 'cuentas_cobrar': case 'cuentas_pagar': case 'reportes': return import('./components/FinancialModules');
    case 'asistente_ia': return import('./components/AiAssistant');
    default: return Promise.resolve();
  }
};

function App({ userId, userEmail, userAppMetadata, signOut }: { userId: string; userEmail:string; userAppMetadata:Record<string, unknown>; signOut: () => Promise<void> }) {
  const {
    active,setActive,quotes,setQuotes,saveQuotes,products,search,setSearch,suppliers,setSuppliers,customers,setCustomers,inventoryMovements,cashMovements,monthlyGoal,setMonthlyGoal,fixedExpenses,setFixedExpenses,
    showForm,setShowForm,editing,setEditing,cart,setCart,saleType,setSaleType,payment,setPayment,
    saleSearch,setSaleSearch,purchaseCart,setPurchaseCart,purchaseSearch,setPurchaseSearch,purchaseSupplier,setPurchaseSupplier,
    sales,purchases,purchaseCostHistory,expenses,setExpenses,receivables,setReceivables,payables,setPayables,cashClosures,setCashClosures,setCashMovements,paymentTransactions,setPaymentTransactions,missingProductRequests,setMissingProductRequests,supplierReturns,setSupplierReturns,saleAdjustments,recordSupplierDispatch,recordSaleAdjustment,recordMissingProduct,settings,setSettings,filtered,recordSale,updateStandardInvoice,saveProduct,deleteProduct,receivePurchase,syncStatus,syncError
  } = useErpState(userId);

  const nav = [
    ['dashboard', 'Dashboard', LayoutDashboard], ['facturacion_estandar', 'Facturación estándar', Printer], ['ventas', 'Ventas / POS', ShoppingCart], ['redes_sociales', 'Redes sociales / Ventas', MessagesSquare],
    ['inventario', 'Inventario', Boxes], ['clientes', 'Clientes', UsersRound], ['compras', 'Compras', ShoppingCart], ['finanzas', 'Finanzas', Wallet], ['cuentas_cobrar', 'Cuentas por cobrar', HandCoins], ['cuentas_pagar', 'Cuentas por pagar', CreditCard], ['reportes', 'Reportes e impresión', Printer], ['asistente_ia', 'Asistente IA', BrainCircuit], ['proveedores', 'Proveedores', Truck], ['configuracion', 'Configuración', SettingsIcon],
  ] as const;
  const roleOptions:UserAccess['role'][]=['Administrador','Supervisor','Ventas','Compras','Finanzas','Solo lectura'];
  const metadataRole=typeof userAppMetadata.farmi_role==='string'&&roleOptions.includes(userAppMetadata.farmi_role as UserAccess['role'])?userAppMetadata.farmi_role as UserAccess['role']:undefined;
  const metadataPermissions=Array.isArray(userAppMetadata.farmi_permissions)?userAppMetadata.farmi_permissions.filter((value):value is Module=>nav.some(item=>item[0]===value)):undefined;
  const tokenAccess:UserAccess|undefined=metadataRole?{id:userId,email:userEmail,name:userEmail.split('@')[0],role:metadataRole,permissions:metadataPermissions??[],active:userAppMetadata.farmi_active!==false}:undefined;
  const userAccess=tokenAccess;
  const permissions=userAccess?.permissions??['dashboard','configuracion'];
  // Existing user records may predate the reports module. Preserve role-based access for those accounts.
  const canSee=(module:string)=>permissions.includes(module as Module);
  const visibleNav=nav.filter(([id])=>id!=='proveedores'&&id!=='cuentas_cobrar'&&id!=='cuentas_pagar'&&canSee(id));
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const [newProductOrigin,setNewProductOrigin]=useState<'inventory'|'purchase'>('inventory');
  const [purchasesExpanded,setPurchasesExpanded]=useState(false);
  const [customersExpanded,setCustomersExpanded]=useState(false);
  const [financeExpanded,setFinanceExpanded]=useState(false);
  const [financeSection,setFinanceSection]=useState<'resumen'|'gastos'|'ventas'|'compras_recibidas'|'cobrar'|'pagar'|'historial_pagos'|'movimientos'|'cierre'|'historial_cierres'|'gestion'>('resumen');
  const financeItems=[['resumen','Resumen financiero'],['gastos','Gastos'],['ventas','Ventas registradas'],['compras_recibidas','Compras recibidas'],['cobrar','Cuentas por cobrar'],['pagar','Cuentas por pagar'],['historial_pagos','Historial de cobros y pagos'],['movimientos','Movimientos de caja'],['cierre','Cierre de caja diario'],['historial_cierres','Historial de cierres'],['gestion','Gestión y análisis']] as const;
  const goToFinanceSection=(target:typeof financeSection)=>{setFinanceSection(target);startTransition(()=>setActive('finanzas'));setFinanceExpanded(true);setMobileMenuOpen(false);};
  const [purchaseSectionRequest,setPurchaseSectionRequest]=useState(0);
  const [purchaseRequestedSection,setPurchaseRequestedSection]=useState<'compras'|'proveedores'|'nueva-compra'>('compras');
  const goToPurchaseSection=(target:string)=>{setPurchaseRequestedSection('nueva-compra');setPurchaseSectionRequest(n=>n+1);startTransition(()=>setActive('compras'));setPurchasesExpanded(true);setMobileMenuOpen(false);window.setTimeout(()=>document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'}),180);};

  return <div className={`app${mobileMenuOpen?" mobile-menu-open":""}`}>
    {mobileMenuOpen&&<button type="button" className="mobile-menu-backdrop" aria-label="Cerrar menú" onClick={()=>setMobileMenuOpen(false)}/>}
    <aside className="sidebar">
      <button type="button" className="mobile-menu-close" aria-label="Cerrar menú" onClick={()=>setMobileMenuOpen(false)}><X size={21}/></button>
      <div className="brand"><div className="brand-mark">F</div><div><strong>Farmi</strong><span>Sistema de gestión</span></div></div>
      <div className="section-label">OPERACIÓN</div>
      {visibleNav.map(([id, label, Icon]) => id==='clientes' ? <div className="nav-group" key={id}><button type="button" className="nav nav-parent" aria-expanded={customersExpanded} aria-controls="customers-subnav" onClick={()=>setCustomersExpanded(open=>!open)}><Icon size={19}/><span>Clientes</span><span className="nav-chevron">{customersExpanded?'▾':'▸'}</span></button>{customersExpanded&&<div className="nav-submenu" id="customers-subnav"><button type="button" className={active==='clientes'?'active':''} onMouseEnter={()=>void preloadModule('clientes')} onClick={()=>{startTransition(()=>setActive('clientes'));setMobileMenuOpen(false)}}>Registro de nuevo cliente</button><button type="button" className={active==='cotizaciones'?'active':''} onMouseEnter={()=>void preloadModule('cotizaciones')} onClick={()=>{startTransition(()=>setActive('cotizaciones'));setMobileMenuOpen(false)}}>Cotizaciones</button></div>}</div> : id==='compras' ? <div className="nav-group" key={id}>
        <button type="button" className="nav nav-parent" aria-expanded={purchasesExpanded} aria-controls="purchases-subnav" onClick={()=>setPurchasesExpanded(open=>!open)}><Icon size={19}/><span>Compras</span><span className="nav-chevron">{purchasesExpanded?'▾':'▸'}</span></button>
        {purchasesExpanded&&<div className="nav-submenu" id="purchases-subnav">
          <button type="button" onMouseEnter={()=>void preloadModule('compras')} onClick={()=>goToPurchaseSection('purchase-order')}>Nueva compra</button>
          {(canSee('proveedores')||canSee('compras'))&&<button type="button" className={active==='proveedores'?'active':''} onMouseEnter={()=>void preloadModule('proveedores')} onClick={()=>{setPurchaseRequestedSection('proveedores');setPurchaseSectionRequest(n=>n+1);startTransition(()=>setActive('proveedores'));setMobileMenuOpen(false);}}>Proveedores</button>}
        </div>}
      </div> : id==='finanzas' ? <div className="nav-group" key={id}>
        <button type="button" className="nav nav-parent" aria-expanded={financeExpanded} aria-controls="finance-subnav" onClick={()=>setFinanceExpanded(open=>!open)}><Icon size={19}/><span>Finanzas</span><span className="nav-chevron">{financeExpanded?'▾':'▸'}</span></button>
        {financeExpanded&&<div className="nav-submenu" id="finance-subnav">{financeItems.map(([key,title])=><button type="button" key={key} className={active==='finanzas'&&financeSection===key?'active':''} onMouseEnter={()=>void preloadModule('finanzas')} onClick={()=>goToFinanceSection(key)}>{title}</button>)}</div>}
      </div> : <button key={id} className={active === id ? 'nav active' : 'nav'} onMouseEnter={()=>void preloadModule(id)} onClick={() => {if(id==='facturacion_estandar')setSaleType('minorista');startTransition(()=>setActive(id));setMobileMenuOpen(false);}}><Icon size={19}/>{label}</button>)}
      <div className="sidebar-footer"><Activity size={17}/> Sistema MVP v0.7</div>
    </aside>
    <main className="main">
      <header className="topbar"><button type="button" className="mobile-menu-toggle" aria-label="Abrir menú" onClick={()=>setMobileMenuOpen(open=>!open)}><Menu size={21}/></button><div className="topbar-title"><p className="eyebrow">Farmi · Sistema de gestión</p><h1>{active === 'dashboard' ? 'Panel de control' : active === 'compras' ? 'Nueva compra' : active === 'finanzas' ? financeItems.find(([key])=>key===financeSection)?.[1] : active === 'cotizaciones' ? 'Cotizaciones' : nav.find(n => n[0] === active)?.[1]}</h1></div><div className="topbar-actions"><div className={`status ${syncStatus === 'error' ? 'status-error' : syncStatus === 'loading' || syncStatus === 'saving' ? 'status-pending' : ''}`}><span/>{syncStatus === 'loading' ? 'Cargando datos seguros…' : syncStatus === 'saving' ? 'Sincronizando…' : syncStatus === 'error' ? 'Error de sincronización' : 'Sincronizado con Supabase'}</div>{syncStatus === 'error' && syncError && <p role="alert" className="sync-error" title={syncError}>{syncError}</p>}<button className="secondary signout" onClick={() => { void signOut().catch(() => {}); }}>Cerrar sesión</button></div></header>
      <Suspense fallback={<div className="content"><div className="card">Cargando módulo…</div></div>}>{active === 'configuracion' ? <Settings settings={settings} setSettings={setSettings} userEmail={userEmail} userId={userId}/> : active === 'dashboard' ? <><Dashboard products={products} sales={sales} expenses={expenses} monthlyGoal={monthlyGoal} fixedExpenses={fixedExpenses}/><GoalsSettings monthlyGoal={monthlyGoal} setMonthlyGoal={setMonthlyGoal} fixedExpenses={fixedExpenses} setFixedExpenses={setFixedExpenses}/></> : active === 'inventario' ? <Inventory products={filtered} search={search} setSearch={setSearch} movements={inventoryMovements} onNew={() => { setNewProductOrigin('inventory'); setEditing(null); setShowForm(true); }} onEdit={p => { setNewProductOrigin('inventory'); setEditing(p); setShowForm(true); }} /> : active === 'facturacion_estandar' ? <StandardInvoice products={products} customers={customers} sales={sales} settings={settings} payment={payment} setPayment={setPayment} onComplete={recordSale} onUpdateInvoice={updateStandardInvoice} onCreateCustomer={customer=>setCustomers(current=>[customer,...current])}/> : active === 'ventas' ? <POS products={products} customers={customers} cart={cart} setCart={setCart} saleType={saleType} setSaleType={setSaleType} payment={payment} setPayment={setPayment} search={saleSearch} setSearch={setSaleSearch} onComplete={recordSale} settings={settings} setSettings={setSettings} onRecordMissingProduct={recordMissingProduct} sales={sales} saleAdjustments={saleAdjustments} onRecordAdjustment={recordSaleAdjustment} onCreateCustomer={customer=>setCustomers(current=>[customer,...current])}/> : active === 'clientes' ? <Customers customers={customers} setCustomers={setCustomers}/> : active === 'cotizaciones' ? <Quotes customers={customers} products={products} settings={settings} quotes={quotes} setQuotes={setQuotes} saveQuotes={saveQuotes}/> : active === 'redes_sociales' ? <SocialSales products={products} customers={customers} settings={settings}/> : active === 'compras' || active === 'proveedores' ? <Purchases products={products} sales={sales} cart={purchaseCart} setCart={setPurchaseCart} search={purchaseSearch} setSearch={setPurchaseSearch} supplier={purchaseSupplier} setSupplier={setPurchaseSupplier} suppliers={suppliers} setSuppliers={setSuppliers} records={supplierReturns} setRecords={setSupplierReturns} onDispatch={recordSupplierDispatch} showSuppliers={canSee('compras')||canSee('proveedores')} costHistory={purchaseCostHistory} onReceive={receivePurchase} onOpenNewProduct={()=>{setNewProductOrigin('purchase');setEditing(null);setShowForm(true);}} onEditProduct={product=>{setNewProductOrigin('purchase');setEditing(product);setShowForm(true);}} sectionRequest={purchaseSectionRequest} requestedSection={purchaseRequestedSection}/> : active === 'cuentas_cobrar' ? <ReceivablesModule receivables={receivables} setReceivables={setReceivables} transactions={paymentTransactions} setTransactions={setPaymentTransactions}/> : active === 'cuentas_pagar' ? <PayablesModule payables={payables} setPayables={setPayables} transactions={paymentTransactions} setTransactions={setPaymentTransactions}/> : active === 'asistente_ia' ? <AiAssistant products={products} sales={sales} purchases={purchases} expenses={expenses} receivables={receivables} payables={payables} movements={inventoryMovements}/> : active === 'reportes' ? <ReportsModule sales={sales} purchases={purchases} expenses={expenses} receivables={receivables} payables={payables} closures={cashClosures} transactions={paymentTransactions} settings={settings} products={products} inventoryMovements={inventoryMovements} cashMovements={cashMovements} customers={customers} suppliers={suppliers} missingProductRequests={missingProductRequests} setMissingProductRequests={setMissingProductRequests}/> : active === 'finanzas' ? <><><Finance section={financeSection==='gestion'?'resumen':financeSection} sales={sales} purchases={purchases} expenses={expenses} setExpenses={setExpenses} receivables={receivables} setReceivables={setReceivables} payables={payables} setPayables={setPayables} closures={cashClosures} setClosures={setCashClosures} movements={cashMovements} setMovements={setCashMovements} paymentTransactions={paymentTransactions} setPaymentTransactions={setPaymentTransactions}/>{financeSection==='gestion'&&<ManagementSuite sales={sales} expenses={expenses} receivables={receivables} payables={payables} products={products} customers={customers} setCustomers={setCustomers}/>}</></> : <ModulePlaceholder name={nav.find(n => n[0] === active)?.[1] || ''}/>}</Suspense>
      {showForm && <ProductModal product={editing} products={products} onClose={() => {setShowForm(false);setEditing(null);setNewProductOrigin('inventory')}} onSave={product=>{
        const addToPurchase=newProductOrigin==='purchase'&&!editing;
        const updatePurchaseRow=newProductOrigin==='purchase'&&!!editing;
        const saved=saveProduct(product);
        if(saved){
          if(addToPurchase){
            setPurchaseCart(current=>current.some(item=>item.id===saved.id)?current:[...current,{...saved,qty:1,unitCost:Number(saved.cost)||0,purchaseTaxRate:saved.taxEnabled?Number(saved.taxRate??15):0}]);
          } else if(updatePurchaseRow){
            setPurchaseCart(current=>current.map(item=>item.id===saved.id?{...item,...saved,qty:item.qty,expiry:item.expiry,unitCost:Number(saved.cost)||0,purchaseTaxRate:item.purchaseTaxRate??(saved.taxEnabled?Number(saved.taxRate??15):0)}:item));
          }
          setNewProductOrigin('inventory');
        }
      }} onDelete={id=>{deleteProduct(id);setEditing(null);setShowForm(false);setNewProductOrigin('inventory')}}/>}
    </main>
  </div>;
}

function ModulePlaceholder({name}:{name:string}) { return <div className="content"><div className="empty card"><Boxes size={42}/><h2>{name}</h2><p>Este módulo está preparado en la navegación. Será construido en la siguiente fase del MVP.</p><span className="pill">PRÓXIMO MÓDULO</span></div></div> }
// Cambios y devoluciones se gestionan ahora dentro del módulo Proveedores.
export default App;
