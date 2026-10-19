import { POS } from './components/POS';
import { AiAssistant } from './components/AiAssistant';
import { Purchases } from './components/Purchases';
import { Inventory, ProductModal } from './components/Inventory';
import { Finance } from './components/Finance';
import { GoalsSettings, ManagementSuite } from './components/ManagementSuite';
import { Dashboard } from './components/Dashboard';
import { useErpState } from './hooks/useErpState';
import { Activity, Boxes, LayoutDashboard, ShoppingCart, Wallet, Truck, Settings as SettingsIcon, HandCoins, CreditCard, Printer, BrainCircuit, UsersRound, MessagesSquare } from 'lucide-react';
import { Settings } from './components/Settings';
import { Suppliers } from './components/Suppliers';
import { Customers } from './components/Customers';
import { SocialSales } from './components/SocialSales';
import { ReceivablesModule, PayablesModule, ReportsModule } from './components/FinancialModules';
import { SupplierReturns } from './components/SupplierReturns';

function App({ userId, userEmail, signOut }: { userId: string; userEmail:string; signOut: () => Promise<void> }) {
  const {
    active,setActive,products,search,setSearch,suppliers,setSuppliers,customers,setCustomers,inventoryMovements,cashMovements,monthlyGoal,setMonthlyGoal,fixedExpenses,setFixedExpenses,
    showForm,setShowForm,editing,setEditing,cart,setCart,saleType,setSaleType,payment,setPayment,
    saleSearch,setSaleSearch,purchaseCart,setPurchaseCart,purchaseSearch,setPurchaseSearch,purchaseSupplier,setPurchaseSupplier,
    sales,purchases,purchaseCostHistory,expenses,setExpenses,receivables,setReceivables,payables,setPayables,cashClosures,setCashClosures,setCashMovements,paymentTransactions,setPaymentTransactions,missingProductRequests,setMissingProductRequests,supplierReturns,setSupplierReturns,saleAdjustments,recordSupplierDispatch,recordSaleAdjustment,recordMissingProduct,settings,setSettings,filtered,recordSale,saveProduct,receivePurchase,syncStatus,syncError
  } = useErpState(userId);

  const nav = [
    ['dashboard', 'Dashboard', LayoutDashboard], ['ventas', 'Ventas / POS', ShoppingCart], ['redes_sociales', 'Redes sociales / Ventas', MessagesSquare],
    ['inventario', 'Inventario', Boxes], ['clientes', 'Clientes', UsersRound], ['compras', 'Compras', ShoppingCart], ['finanzas', 'Finanzas', Wallet], ['cuentas_cobrar', 'Cuentas por cobrar', HandCoins], ['cuentas_pagar', 'Cuentas por pagar', CreditCard], ['reportes', 'Reportes e impresión', Printer], ['asistente_ia', 'Asistente IA', BrainCircuit], ['proveedores', 'Proveedores', Truck], ['devoluciones_proveedores', 'Cambios y devoluciones', Truck], ['configuracion', 'Configuración', SettingsIcon],
  ] as const;
  const userAccess=settings.users.find(u=>u.email.trim().toLowerCase()===userEmail.trim().toLowerCase()&&u.active);
  const permissions=userAccess?.permissions??(settings.users.length===0?nav.map(item=>item[0]):['dashboard']);
  // Existing user records may predate the reports module. Preserve role-based access for those accounts.
  const reportRoles=['Administrador','Supervisor','Finanzas','Solo lectura'];
  const customerRoles=['Administrador','Supervisor','Ventas','Solo lectura'];
  // Older saved permission lists do not include the new Clientes module. Keep it visible for roles that should have customer access.
  const socialRoles=['Administrador','Supervisor','Ventas','Solo lectura'];
  const aiRoles=['Administrador','Supervisor','Finanzas','Solo lectura'];
  const returnRoles=['Administrador','Supervisor','Compras','Finanzas'];
  const canSee=(module:string)=>permissions.includes(module as typeof permissions[number])||(module==='reportes'&&!!userAccess&&reportRoles.includes(userAccess.role))||(module==='clientes'&&!!userAccess&&customerRoles.includes(userAccess.role))||(module==='redes_sociales'&&!!userAccess&&socialRoles.includes(userAccess.role))||(module==='asistente_ia'&&!!userAccess&&aiRoles.includes(userAccess.role))||(module==='devoluciones_proveedores'&&!!userAccess&&returnRoles.includes(userAccess.role));
  const visibleNav=nav.filter(([id])=>canSee(id));

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">F</div><div><strong>Farmi</strong><span>Sistema de gestión</span></div></div>
      <div className="section-label">OPERACIÓN</div>
      {visibleNav.map(([id, label, Icon]) => <button key={id} className={active === id ? 'nav active' : 'nav'} onClick={() => setActive(id)}><Icon size={19}/>{label}</button>)}
      <div className="sidebar-footer"><Activity size={17}/> Sistema MVP v0.7</div>
    </aside>
    <main className="main">
      <header className="topbar"><div><p className="eyebrow">Farmi · Sistema de gestión</p><h1>{active === 'dashboard' ? 'Panel de control' : nav.find(n => n[0] === active)?.[1]}</h1></div><div className="topbar-actions"><div className={`status ${syncStatus === 'error' ? 'status-error' : syncStatus === 'loading' || syncStatus === 'saving' ? 'status-pending' : ''}`}><span/>{syncStatus === 'loading' ? 'Cargando datos seguros…' : syncStatus === 'saving' ? 'Sincronizando…' : syncStatus === 'error' ? 'Error de sincronización' : 'Sincronizado con Supabase'}</div>{syncStatus === 'error' && syncError && <p role="alert" className="sync-error" title={syncError}>{syncError}</p>}<button className="secondary signout" onClick={() => { void signOut().catch(() => {}); }}>Cerrar sesión</button></div></header>
      {active === 'configuracion' ? <Settings settings={settings} setSettings={setSettings} userEmail={userEmail} userId={userId}/> : active === 'dashboard' ? <><Dashboard products={products} sales={sales} expenses={expenses} monthlyGoal={monthlyGoal} fixedExpenses={fixedExpenses}/><GoalsSettings monthlyGoal={monthlyGoal} setMonthlyGoal={setMonthlyGoal} fixedExpenses={fixedExpenses} setFixedExpenses={setFixedExpenses}/></> : active === 'inventario' ? <Inventory products={filtered} search={search} setSearch={setSearch} movements={inventoryMovements} onNew={() => { setEditing(null); setShowForm(true); }} onEdit={p => { setEditing(p); setShowForm(true); }} /> : active === 'ventas' ? <POS products={products} customers={customers} cart={cart} setCart={setCart} saleType={saleType} setSaleType={setSaleType} payment={payment} setPayment={setPayment} search={saleSearch} setSearch={setSaleSearch} onComplete={recordSale} settings={settings} setSettings={setSettings} onRecordMissingProduct={recordMissingProduct} sales={sales} saleAdjustments={saleAdjustments} onRecordAdjustment={recordSaleAdjustment} onCreateCustomer={customer=>setCustomers(current=>[customer,...current])}/> : active === 'clientes' ? <Customers customers={customers} setCustomers={setCustomers}/> : active === 'redes_sociales' ? <SocialSales products={products} customers={customers} settings={settings}/> : active === 'compras' ? <Purchases products={products} sales={sales} cart={purchaseCart} setCart={setPurchaseCart} search={purchaseSearch} setSearch={setPurchaseSearch} supplier={purchaseSupplier} setSupplier={setPurchaseSupplier} suppliers={suppliers} costHistory={purchaseCostHistory} onReceive={receivePurchase}/> : active === 'proveedores' ? <Suppliers suppliers={suppliers} setSuppliers={setSuppliers}/> : active === 'devoluciones_proveedores' ? <SupplierReturns products={products} suppliers={suppliers} records={supplierReturns} setRecords={setSupplierReturns} onDispatch={recordSupplierDispatch}/> : active === 'cuentas_cobrar' ? <ReceivablesModule receivables={receivables} setReceivables={setReceivables} transactions={paymentTransactions} setTransactions={setPaymentTransactions}/> : active === 'cuentas_pagar' ? <PayablesModule payables={payables} setPayables={setPayables} transactions={paymentTransactions} setTransactions={setPaymentTransactions}/> : active === 'asistente_ia' ? <AiAssistant products={products} sales={sales} purchases={purchases} expenses={expenses} receivables={receivables} payables={payables} movements={inventoryMovements}/> : active === 'reportes' ? <ReportsModule sales={sales} purchases={purchases} expenses={expenses} receivables={receivables} payables={payables} closures={cashClosures} transactions={paymentTransactions} settings={settings} products={products} inventoryMovements={inventoryMovements} cashMovements={cashMovements} customers={customers} suppliers={suppliers} missingProductRequests={missingProductRequests} setMissingProductRequests={setMissingProductRequests}/> : active === 'finanzas' ? <><Finance sales={sales} purchases={purchases} expenses={expenses} setExpenses={setExpenses} receivables={receivables} setReceivables={setReceivables} payables={payables} setPayables={setPayables} closures={cashClosures} setClosures={setCashClosures} movements={cashMovements} setMovements={setCashMovements} paymentTransactions={paymentTransactions} setPaymentTransactions={setPaymentTransactions}/><ManagementSuite sales={sales} expenses={expenses} receivables={receivables} payables={payables} products={products} customers={customers} setCustomers={setCustomers}/></> : <ModulePlaceholder name={nav.find(n => n[0] === active)?.[1] || ''}/>}
      {showForm && <ProductModal product={editing} products={products} onClose={() => {setShowForm(false);setEditing(null)}} onSave={saveProduct}/>}
    </main>
  </div>;
}

function ModulePlaceholder({name}:{name:string}) { return <div className="content"><div className="empty card"><Boxes size={42}/><h2>{name}</h2><p>Este módulo está preparado en la navegación. Será construido en la siguiente fase del MVP.</p><span className="pill">PRÓXIMO MÓDULO</span></div></div> }
export default App;
