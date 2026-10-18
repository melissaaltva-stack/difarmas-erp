import { POS } from './components/POS';
import { Purchases } from './components/Purchases';
import { Inventory, ProductModal } from './components/Inventory';
import { Finance } from './components/Finance';
import { GoalsSettings, ManagementSuite } from './components/ManagementSuite';
import { Dashboard } from './components/Dashboard';
import { useErpState } from './hooks/useErpState';
import { Activity, Boxes, LayoutDashboard, ShoppingCart, Wallet, Truck } from 'lucide-react';
import { Suppliers } from './components/Suppliers';

function App({ userId, signOut }: { userId: string; signOut: () => Promise<void> }) {
  const {
    active,setActive,products,search,setSearch,suppliers,setSuppliers,monthlyGoal,setMonthlyGoal,fixedExpenses,setFixedExpenses,
    showForm,setShowForm,editing,setEditing,cart,setCart,saleType,setSaleType,payment,setPayment,
    saleSearch,setSaleSearch,purchaseCart,setPurchaseCart,purchaseSearch,setPurchaseSearch,purchaseSupplier,setPurchaseSupplier,
    sales,purchases,expenses,setExpenses,receivables,setReceivables,payables,setPayables,customers,setCustomers,inventoryMovements,cashClosures,setCashClosures,cashMovements,setCashMovements,paymentTransactions,setPaymentTransactions,filtered,recordSale,saveProduct,receivePurchase,syncStatus,syncError
  } = useErpState(userId);

  const nav = [
    ['dashboard', 'Dashboard', LayoutDashboard], ['ventas', 'Ventas / POS', ShoppingCart],
    ['inventario', 'Inventario', Boxes], ['compras', 'Compras', ShoppingCart], ['finanzas', 'Finanzas', Wallet], ['proveedores', 'Proveedores', Truck],
  ] as const;

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">D</div><div><strong>DIFARMÁS</strong><span>ERP</span></div></div>
      <div className="section-label">OPERACIÓN</div>
      {nav.map(([id, label, Icon]) => <button key={id} className={active === id ? 'nav active' : 'nav'} onClick={() => setActive(id)}><Icon size={19}/>{label}</button>)}
      <div className="sidebar-footer"><Activity size={17}/> Sistema MVP v0.7</div>
    </aside>
    <main className="main">
      <header className="topbar"><div><p className="eyebrow">DIFARMÁS · ERP</p><h1>{active === 'dashboard' ? 'Panel de control' : nav.find(n => n[0] === active)?.[1]}</h1></div><div className="topbar-actions"><div className={`status ${syncStatus === 'error' ? 'status-error' : syncStatus === 'loading' || syncStatus === 'saving' ? 'status-pending' : ''}`}><span/>{syncStatus === 'loading' ? 'Cargando datos seguros…' : syncStatus === 'saving' ? 'Sincronizando…' : syncStatus === 'error' ? 'Error de sincronización' : 'Sincronizado con Supabase'}</div>{syncStatus === 'error' && syncError && <p role="alert" className="sync-error" title={syncError}>{syncError}</p>}<button className="secondary signout" onClick={() => { void signOut().catch(() => {}); }}>Cerrar sesión</button></div></header>
      {active === 'dashboard' ? <><Dashboard products={products} sales={sales} expenses={expenses} monthlyGoal={monthlyGoal} fixedExpenses={fixedExpenses}/><GoalsSettings monthlyGoal={monthlyGoal} setMonthlyGoal={setMonthlyGoal} fixedExpenses={fixedExpenses} setFixedExpenses={setFixedExpenses}/></> : active === 'inventario' ? <Inventory products={filtered} search={search} setSearch={setSearch} movements={inventoryMovements} onNew={() => { setEditing(null); setShowForm(true); }} onEdit={p => { setEditing(p); setShowForm(true); }} /> : active === 'ventas' ? <POS products={products} cart={cart} setCart={setCart} saleType={saleType} setSaleType={setSaleType} payment={payment} setPayment={setPayment} search={saleSearch} setSearch={setSaleSearch} onComplete={recordSale}/> : active === 'compras' ? <Purchases products={products} cart={purchaseCart} setCart={setPurchaseCart} search={purchaseSearch} setSearch={setPurchaseSearch} supplier={purchaseSupplier} setSupplier={setPurchaseSupplier} onReceive={receivePurchase}/> : active === 'proveedores' ? <Suppliers suppliers={suppliers} setSuppliers={setSuppliers}/> : active === 'finanzas' ? <><Finance sales={sales} purchases={purchases} expenses={expenses} setExpenses={setExpenses} receivables={receivables} setReceivables={setReceivables} payables={payables} setPayables={setPayables} closures={cashClosures} setClosures={setCashClosures} movements={cashMovements} setMovements={setCashMovements} paymentTransactions={paymentTransactions} setPaymentTransactions={setPaymentTransactions}/><ManagementSuite sales={sales} expenses={expenses} receivables={receivables} payables={payables} products={products} customers={customers} setCustomers={setCustomers}/></> : <ModulePlaceholder name={nav.find(n => n[0] === active)?.[1] || ''}/>}
      {showForm && <ProductModal product={editing} products={products} onClose={() => {setShowForm(false);setEditing(null)}} onSave={saveProduct}/>}
    </main>
  </div>;
}

function ModulePlaceholder({name}:{name:string}) { return <div className="content"><div className="empty card"><Boxes size={42}/><h2>{name}</h2><p>Este módulo está preparado en la navegación. Será construido en la siguiente fase del MVP.</p><span className="pill">PRÓXIMO MÓDULO</span></div></div> }

export default App;
