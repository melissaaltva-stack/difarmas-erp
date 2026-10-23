import { useState } from 'react';
import { POS } from './components/POS';
import { StandardInvoice } from './components/StandardInvoice';
import { AiAssistant } from './components/AiAssistant';
import { Purchases } from './components/Purchases';
import { Inventory, ProductModal } from './components/Inventory';
import { Finance } from './components/Finance';
import { GoalsSettings, ManagementSuite } from './components/ManagementSuite';
import { Dashboard } from './components/Dashboard';
import { useErpState } from './hooks/useErpState';
import { Activity, Boxes, LayoutDashboard, ShoppingCart, Wallet, Truck, Settings as SettingsIcon, HandCoins, CreditCard, Printer, BrainCircuit, UsersRound, MessagesSquare, Menu, X } from 'lucide-react';
import { Settings } from './components/Settings';
import { Customers } from './components/Customers';
import { Quotes } from './components/Quotes';
import { SocialSales } from './components/SocialSales';
import { ReceivablesModule, PayablesModule, ReportsModule } from './components/FinancialModules';

function App({ userId, userEmail, signOut }: { userId: string; userEmail:string; signOut: () => Promise<void> }) {
  const {
    active,setActive,products,search,setSearch,suppliers,setSuppliers,customers,setCustomers,inventoryMovements,cashMovements,monthlyGoal,setMonthlyGoal,fixedExpenses,setFixedExpenses,
    showForm,setShowForm,editing,setEditing,cart,setCart,saleType,setSaleType,payment,setPayment,
    saleSearch,setSaleSearch,purchaseCart,setPurchaseCart,purchaseSearch,setPurchaseSearch,purchaseSupplier,setPurchaseSupplier,
    sales,purchases,purchaseCostHistory,expenses,setExpenses,receivables,setReceivables,payables,setPayables,cashClosures,setCashClosures,setCashMovements,paymentTransactions,setPaymentTransactions,missingProductRequests,setMissingProductRequests,supplierReturns,setSupplierReturns,saleAdjustments,recordSupplierDispatch,recordSaleAdjustment,recordMissingProduct,settings,setSettings,filtered,recordSale,saveProduct,receivePurchase,syncStatus,syncError
  } = useErpState(userId);

  const nav = [
    ['dashboard', 'Dashboard', LayoutDashboard], ['facturacion_estandar', 'Facturación estándar', Printer], ['ventas', 'Ventas / POS', ShoppingCart], ['redes_sociales', 'Redes sociales / Ventas', MessagesSquare],
    ['inventario', 'Inventario', Boxes], ['clientes', 'Clientes', UsersRound], ['compras', 'Compras', ShoppingCart], ['finanzas', 'Finanzas', Wallet], ['cuentas_cobrar', 'Cuentas por cobrar', HandCoins], ['cuentas_pagar', 'Cuentas por pagar', CreditCard], ['reportes', 'Reportes e impresión', Printer], ['asistente_ia', 'Asistente IA', BrainCircuit], ['proveedores', 'Proveedores', Truck], ['configuracion', 'Configuración', SettingsIcon],
  ] as const;
  const userAccess=settings.users.find(u=>u.email.trim().toLowerCase()===userEmail.trim().toLowerCase()&&u.active);
  const permissions=userAccess?.permissions??(settings.users.length===0?nav.map(item=>item[0]):['dashboard']);
  // Existing user records may predate the reports module. Preserve role-based access for those accounts.
  const reportRoles=['Administrador','Supervisor','Finanzas','Solo lectura'];
  const customerRoles=['Administrador','Supervisor','Ventas','Solo lectura'];
  // Older saved permission lists do not include the new Clientes module. Keep it visible for roles that should have customer access.
  const socialRoles=['Administrador','Supervisor','Ventas','Solo lectura'];
  const invoiceRoles=['Administrador','Supervisor','Ventas','Finanzas'];
  const aiRoles=['Administrador','Supervisor','Finanzas','Solo lectura'];
  const canSee=(module:string)=>permissions.includes(module as typeof permissions[number])||(module==='reportes'&&!!userAccess&&reportRoles.includes(userAccess.role))||(module==='clientes'&&!!userAccess&&customerRoles.includes(userAccess.role))||(module==='redes_sociales'&&!!userAccess&&socialRoles.includes(userAccess.role))||(module==='facturacion_estandar'&&!!userAccess&&invoiceRoles.includes(userAccess.role))||(module==='asistente_ia'&&!!userAccess&&aiRoles.includes(userAccess.role));
  const visibleNav=nav.filter(([id])=>id!=='proveedores'&&id!=='cuentas_cobrar'&&id!=='cuentas_pagar'&&canSee(id));
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const [purchasesExpanded,setPurchasesExpanded]=useState(false);
  const [customersExpanded,setCustomersExpanded]=useState(false);
  const [financeExpanded,setFinanceExpanded]=useState(false);
  const [financeSection,setFinanceSection]=useState<'resumen'|'gastos'|'ventas'|'compras_recibidas'|'cobrar'|'pagar'|'historial_pagos'|'movimientos'|'cierre'|'historial_cierres'|'gestion'>('resumen');
  const financeItems=[['resumen','Resumen financiero'],['gastos','Gastos'],['ventas','Ventas registradas'],['compras_recibidas','Compras recibidas'],['cobrar','Cuentas por cobrar'],['pagar','Cuentas por pagar'],['historial_pagos','Historial de cobros y pagos'],['movimientos','Movimientos de caja'],['cierre','Cierre de caja diario'],['historial_cierres','Historial de cierres'],['gestion','Gestión y análisis']] as const;
  const goToFinanceSection=(target:typeof financeSection)=>{setFinanceSection(target);setActive('finanzas');setFinanceExpanded(true);setMobileMenuOpen(false);};
  const [purchaseSectionRequest,setPurchaseSectionRequest]=useState(0);
  const [purchaseRequestedSection,setPurchaseRequestedSection]=useState<'compras'|'proveedores'>('compras');
  const goToPurchaseSection=(target:string)=>{setPurchaseRequestedSection('compras');setPurchaseSectionRequest(n=>n+1);setActive('compras');setPurchasesExpanded(true);setMobileMenuOpen(false);window.setTimeout(()=>document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'}),180);};

  return <div className={`app${mobileMenuOpen?" mobile-menu-open":""}`}>
    {mobileMenuOpen&&<button type="button" className="mobile-menu-backdrop" aria-label="Cerrar menú" onClick={()=>setMobileMenuOpen(false)}/>}
    <aside className="sidebar">
      <button type="button" className="mobile-menu-close" aria-label="Cerrar menú" onClick={()=>setMobileMenuOpen(false)}><X size={21}/></button>
      <div className="brand"><div className="brand-mark">F</div><div><strong>Farmi</strong><span>Sistema de gestión</span></div></div>
      <div className="section-label">OPERACIÓN</div>
      {visibleNav.map(([id, label, Icon]) => id==='clientes' ? <div className="nav-group" key={id}><button type="button" className="nav nav-parent" aria-expanded={customersExpanded} aria-controls="customers-subnav" onClick={()=>setCustomersExpanded(open=>!open)}><Icon size={19}/><span>Clientes</span><span className="nav-chevron">{customersExpanded?'▾':'▸'}</span></button>{customersExpanded&&<div className="nav-submenu" id="customers-subnav"><button type="button" className={active==='clientes'?'active':''} onClick={()=>{setActive('clientes');setMobileMenuOpen(false)}}>Registro de nuevo cliente</button><button type="button" className={active==='cotizaciones'?'active':''} onClick={()=>{setActive('cotizaciones');setMobileMenuOpen(false)}}>Cotizaciones</button></div>}</div> : id==='compras' ? <div className="nav-group" key={id}>
        <button type="button" className="nav nav-parent" aria-expanded={purchasesExpanded} aria-controls="purchases-subnav" onClick={()=>setPurchasesExpanded(open=>!open)}><Icon size={19}/><span>Compras</span><span className="nav-chevron">{purchasesExpanded?'▾':'▸'}</span></button>
        {purchasesExpanded&&<div className="nav-submenu" id="purchases-subnav">
          <button type="button" onClick={()=>goToPurchaseSection('purchase-order')}>Nueva compra</button>
          {(canSee('proveedores')||canSee('compras'))&&<button type="button" className={active==='proveedores'?'active':''} onClick={()=>{setPurchaseRequestedSection('proveedores');setPurchaseSectionRequest(n=>n+1);setActive('proveedores');setMobileMenuOpen(false);}}>Proveedores</button>}
        </div>}
      </div> : id==='finanzas' ? <div className="nav-group" key={id}>
        <button type="button" className="nav nav-parent" aria-expanded={financeExpanded} aria-controls="finance-subnav" onClick={()=>setFinanceExpanded(open=>!open)}><Icon size={19}/><span>Finanzas</span><span className="nav-chevron">{financeExpanded?'▾':'▸'}</span></button>
        {financeExpanded&&<div className="nav-submenu" id="finance-subnav">{financeItems.map(([key,title])=><button type="button" key={key} className={active==='finanzas'&&financeSection===key?'active':''} onClick={()=>goToFinanceSection(key)}>{title}</button>)}</div>}
      </div> : <button key={id} className={active === id ? 'nav active' : 'nav'} onClick={() => {if(id==='facturacion_estandar')setSaleType('minorista');setActive(id);setMobileMenuOpen(false);}}><Icon size={19}/>{label}</button>)}
      <div className="sidebar-footer"><Activity size={17}/> Sistema MVP v0.7</div>
    </aside>
    <main className="main">
      <header className="topbar"><button type="button" className="mobile-menu-toggle" aria-label="Abrir menú" onClick={()=>setMobileMenuOpen(open=>!open)}><Menu size={21}/></button><div className="topbar-title"><p className="eyebrow">Farmi · Sistema de gestión</p><h1>{active === 'dashboard' ? 'Panel de control' : active === 'compras' ? 'Nueva compra' : active === 'finanzas' ? financeItems.find(([key])=>key===financeSection)?.[1] : nav.find(n => n[0] === active)?.[1]}</h1></div><div className="topbar-actions"><div className={`status ${syncStatus === 'error' ? 'status-error' : syncStatus === 'loading' || syncStatus === 'saving' ? 'status-pending' : ''}`}><span/>{syncStatus === 'loading' ? 'Cargando datos seguros…' : syncStatus === 'saving' ? 'Sincronizando…' : syncStatus === 'error' ? 'Error de sincronización' : 'Sincronizado con Supabase'}</div>{syncStatus === 'error' && syncError && <p role="alert" className="sync-error" title={syncError}>{syncError}</p>}<button className="secondary signout" onClick={() => { void signOut().catch(() => {}); }}>Cerrar sesión</button></div></header>
      {active === 'configuracion' ? <Settings settings={settings} setSettings={setSettings} userEmail={userEmail} userId={userId}/> : active === 'dashboard' ? <><Dashboard products={products} sales={sales} expenses={expenses} monthlyGoal={monthlyGoal} fixedExpenses={fixedExpenses}/><GoalsSettings monthlyGoal={monthlyGoal} setMonthlyGoal={setMonthlyGoal} fixedExpenses={fixedExpenses} setFixedExpenses={setFixedExpenses}/></> : active === 'inventario' ? <Inventory products={filtered} search={search} setSearch={setSearch} movements={inventoryMovements} onNew={() => { setEditing(null); setShowForm(true); }} onEdit={p => { setEditing(p); setShowForm(true); }} /> : active === 'facturacion_estandar' ? <StandardInvoice products={products} customers={customers} sales={sales} settings={settings} payment={payment} setPayment={setPayment} onComplete={recordSale} onCreateCustomer={customer=>setCustomers(current=>[customer,...current])}/> : active === 'ventas' ? <POS products={products} customers={customers} cart={cart} setCart={setCart} saleType={saleType} setSaleType={setSaleType} payment={payment} setPayment={setPayment} search={saleSearch} setSearch={setSaleSearch} onComplete={recordSale} settings={settings} setSettings={setSettings} onRecordMissingProduct={recordMissingProduct} sales={sales} saleAdjustments={saleAdjustments} onRecordAdjustment={recordSaleAdjustment} onCreateCustomer={customer=>setCustomers(current=>[customer,...current])}/> : active === 'clientes' ? <Customers customers={customers} setCustomers={setCustomers}/> : active === 'cotizaciones' ? <Quotes customers={customers} products={products} settings={settings}/> : active === 'redes_sociales' ? <SocialSales products={products} customers={customers} settings={settings}/> : active === 'compras' || active === 'proveedores' ? <Purchases products={products} sales={sales} cart={purchaseCart} setCart={setPurchaseCart} search={purchaseSearch} setSearch={setPurchaseSearch} supplier={purchaseSupplier} setSupplier={setPurchaseSupplier} suppliers={suppliers} setSuppliers={setSuppliers} records={supplierReturns} setRecords={setSupplierReturns} onDispatch={recordSupplierDispatch} showSuppliers={canSee('compras')||canSee('proveedores')} costHistory={purchaseCostHistory} onReceive={receivePurchase} sectionRequest={purchaseSectionRequest} requestedSection={purchaseRequestedSection}/> : active === 'cuentas_cobrar' ? <ReceivablesModule receivables={receivables} setReceivables={setReceivables} transactions={paymentTransactions} setTransactions={setPaymentTransactions}/> : active === 'cuentas_pagar' ? <PayablesModule payables={payables} setPayables={setPayables} transactions={paymentTransactions} setTransactions={setPaymentTransactions}/> : active === 'asistente_ia' ? <AiAssistant products={products} sales={sales} purchases={purchases} expenses={expenses} receivables={receivables} payables={payables} movements={inventoryMovements}/> : active === 'reportes' ? <ReportsModule sales={sales} purchases={purchases} expenses={expenses} receivables={receivables} payables={payables} closures={cashClosures} transactions={paymentTransactions} settings={settings} products={products} inventoryMovements={inventoryMovements} cashMovements={cashMovements} customers={customers} suppliers={suppliers} missingProductRequests={missingProductRequests} setMissingProductRequests={setMissingProductRequests}/> : active === 'finanzas' ? <><><Finance section={financeSection==='gestion'?'resumen':financeSection} sales={sales} purchases={purchases} expenses={expenses} setExpenses={setExpenses} receivables={receivables} setReceivables={setReceivables} payables={payables} setPayables={setPayables} closures={cashClosures} setClosures={setCashClosures} movements={cashMovements} setMovements={setCashMovements} paymentTransactions={paymentTransactions} setPaymentTransactions={setPaymentTransactions}/>{financeSection==='gestion'&&<ManagementSuite sales={sales} expenses={expenses} receivables={receivables} payables={payables} products={products} customers={customers} setCustomers={setCustomers}/>}</></> : <ModulePlaceholder name={nav.find(n => n[0] === active)?.[1] || ''}/>}
      {showForm && <ProductModal product={editing} products={products} onClose={() => {setShowForm(false);setEditing(null)}} onSave={saveProduct}/>}
    </main>
  </div>;
}

function ModulePlaceholder({name}:{name:string}) { return <div className="content"><div className="empty card"><Boxes size={42}/><h2>{name}</h2><p>Este módulo está preparado en la navegación. Será construido en la siguiente fase del MVP.</p><span className="pill">PRÓXIMO MÓDULO</span></div></div> }
// Cambios y devoluciones se gestionan ahora dentro del módulo Proveedores.
export default App;
