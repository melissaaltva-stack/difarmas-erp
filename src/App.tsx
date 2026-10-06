import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { Module, CartItem, PurchaseItem, SaleLine, SaleRecord, Expense, Receivable, Payable, CashClosure, CashMovement, Customer, Product } from './domain/types';
import { loadJson, saveJson, loadNumber, saveNumber } from './utils/storage';
import { applySaleToInventory, applyPurchaseToInventory } from './services/inventoryService';
import { buildSaleRecord, createReceivableFromSale } from './services/salesService';
import { createPayableFromPurchase } from './services/purchaseService';
import { POS } from './components/POS';
import { Purchases } from './components/Purchases';
import { Inventory } from './components/Inventory';
import { Finance } from './components/Finance';
import { sumSales, sumProfit, sumExpenses, pendingReceivables, pendingPayables, cashSales, collectedReceivables, supplierPayments, calculateCashFlow, calculateExpectedCash, createCashClosure, addCashMovement } from './services/financeService';
import { Activity, AlertTriangle, Boxes, DollarSign, LayoutDashboard, Pencil, Plus, Search, ShoppingCart, TrendingUp, Wallet, X, Users, Target, BrainCircuit, Scale, SlidersHorizontal, ShieldCheck, CheckCircle2, Clock3, ListChecks, ReceiptText, WalletCards, ArrowUpDown, Brain, LineChart, BarChart3, Megaphone, ShoppingBag, Award, Package, History, Calculator } from 'lucide-react';

const money = (value: number) => new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', maximumFractionDigits: 2 }).format(value);

const localDateKey = (d = new Date()) => { const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; };
const currentMonthKey = (d = new Date()) => localDateKey(d).slice(0,7);
const isCurrentMonth = (date:string) => (date||'').slice(0,7) === currentMonthKey();

const initialProducts: Product[] = [
  { id: 1, code: '750100000001', name: 'Eutirox 50 mcg', category: 'Medicamentos', laboratory: 'Merck', presentation: 'Caja x 50 tabletas', cost: 250, retail: 330, wholesale: 310, stock: 18, minStock: 8, lot: 'EUT-2607', expiry: '2027-07-31', supplier: 'Distribuidora Nacional' },
  { id: 2, code: '750100000002', name: 'Neurobión 25,000', category: 'Vitaminas', laboratory: 'Merck', presentation: 'Ampolla', cost: 205, retail: 265, wholesale: 245, stock: 6, minStock: 10, lot: 'NEU-2610', expiry: '2027-10-31', supplier: 'Droguería Central' },
  { id: 3, code: '750100000003', name: 'Calcio 1,500 mg + D3', category: 'Vitaminas', laboratory: 'Genérico', presentation: 'Frasco', cost: 335.65, retail: 449, wholesale: 420, stock: 14, minStock: 6, lot: 'CAL-2608', expiry: '2028-01-31', supplier: 'Distribuidora Nacional' },
  { id: 4, code: '750100000004', name: 'Alevian Duo', category: 'Medicamentos', laboratory: 'Asofarma', presentation: 'Caja', cost: 1275, retail: 2550, wholesale: 2200, stock: 3, minStock: 3, lot: 'ALE-2605', expiry: '2027-05-31', supplier: 'Droguería Central' },
];

const metrics = [
  { label: 'Ventas del día', value: 4280, icon: ShoppingCart, note: '+8.4% vs. ayer' },
  { label: 'Ventas del mes', value: 81630, icon: TrendingUp, note: 'Meta mensual: L 100,000' },
  { label: 'Utilidad bruta', value: 18650, icon: DollarSign, note: 'Margen aproximado 22.9%' },
  { label: 'Gastos del mes', value: 19000, icon: Wallet, note: 'Control de gastos' },
];

function App() {
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
  const [sales, setSales] = useState<SaleRecord[]>(() => { try { const saved = localStorage.getItem('difarmas_sales'); return saved ? JSON.parse(saved) : []; } catch { return []; } });
  const [expenses, setExpenses] = useState<Expense[]>(() => { try { const saved = localStorage.getItem('difarmas_expenses'); return saved ? JSON.parse(saved) : []; } catch { return []; } });
  const [receivables, setReceivables] = useState<Receivable[]>(() => { try { const saved = localStorage.getItem('difarmas_receivables'); return saved ? JSON.parse(saved) : []; } catch { return []; } });
  const [payables, setPayables] = useState<Payable[]>(() => { try { const saved = localStorage.getItem('difarmas_payables'); return saved ? JSON.parse(saved) : []; } catch { return []; } });

  useEffect(() => { saveJson('difarmas_products', products); }, [products]);
  useEffect(() => { saveNumber('difarmas_monthly_goal', monthlyGoal); }, [monthlyGoal]);
  useEffect(() => { saveNumber('difarmas_fixed_expenses', fixedExpenses); }, [fixedExpenses]);
  useEffect(() => { saveJson('difarmas_sales', sales); }, [sales]);
  useEffect(() => { saveJson('difarmas_expenses', expenses); }, [expenses]);
  useEffect(() => { saveJson('difarmas_receivables', receivables); }, [receivables]);
  useEffect(() => { saveJson('difarmas_payables', payables); }, [payables]);

  const nav = [
    ['dashboard', 'Dashboard', LayoutDashboard], ['ventas', 'Ventas / POS', ShoppingCart],
    ['inventario', 'Inventario', Boxes], ['compras', 'Compras', ShoppingCart], ['finanzas', 'Finanzas', Wallet],
  ] as const;

  const filtered = useMemo(() => products.filter(p =>
    [p.code, p.name, p.category, p.laboratory].join(' ').toLowerCase().includes(search.toLowerCase())
  ), [products, search]);

  const recordSale = (sold: CartItem[], customer = '', dueDate = '') => {
    const sale = buildSaleRecord(sold, payment, saleType, customer, dueDate);
    setProducts(current => applySaleToInventory(current, sold));
    setSales(current => [...current, sale]);
    if (payment === 'Crédito') setReceivables(current => [...current, createReceivableFromSale(sale, customer, dueDate)]);
  };

  const saveProduct = (product: Product) => {
    setProducts(current => editing ? current.map(p => p.id === product.id ? product : p) : [...current, { ...product, id: Date.now() }]);
    setEditing(null); setShowForm(false);
  };

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">D</div><div><strong>DIFARMÁS</strong><span>ERP</span></div></div>
      <div className="section-label">OPERACIÓN</div>
      {nav.map(([id, label, Icon]) => <button key={id} className={active === id ? 'nav active' : 'nav'} onClick={() => setActive(id)}><Icon size={19}/>{label}</button>)}
      <div className="sidebar-footer"><Activity size={17}/> Sistema MVP v0.7</div>
    </aside>
    <main className="main">
      <header className="topbar"><div><p className="eyebrow">DIFARMÁS · ERP</p><h1>{active === 'dashboard' ? 'Panel de control' : nav.find(n => n[0] === active)?.[1]}</h1></div><div className="status"><span/> Datos guardados localmente</div></header>
      {active === 'dashboard' ? <><Dashboard products={products} sales={sales} expenses={expenses} monthlyGoal={monthlyGoal} fixedExpenses={fixedExpenses}/><GoalsSettings monthlyGoal={monthlyGoal} setMonthlyGoal={setMonthlyGoal} fixedExpenses={fixedExpenses} setFixedExpenses={setFixedExpenses}/></> : active === 'inventario' ? <Inventory products={filtered} search={search} setSearch={setSearch} onNew={() => { setEditing(null); setShowForm(true); }} onEdit={p => { setEditing(p); setShowForm(true); }} /> : active === 'ventas' ? <POS products={products} cart={cart} setCart={setCart} saleType={saleType} setSaleType={setSaleType} payment={payment} setPayment={setPayment} search={saleSearch} setSearch={setSaleSearch} onComplete={recordSale}/> : active === 'compras' ? <Purchases products={products} cart={purchaseCart} setCart={setPurchaseCart} search={purchaseSearch} setSearch={setPurchaseSearch} supplier={purchaseSupplier} setSupplier={setPurchaseSupplier} onReceive={(items,paymentMethod,dueDate)=>{setProducts(current=>applyPurchaseToInventory(current,items,purchaseSupplier)); if(paymentMethod==='Crédito'){setPayables(current=>[...current,createPayableFromPurchase(items,purchaseSupplier,dueDate)]);}}}/> : active === 'finanzas' ? <Finance sales={sales} expenses={expenses} setExpenses={setExpenses} receivables={receivables} setReceivables={setReceivables} payables={payables} setPayables={setPayables}/> : <ModulePlaceholder name={nav.find(n => n[0] === active)?.[1] || ''}/>} 
      {showForm && <ProductModal product={editing} onClose={() => {setShowForm(false);setEditing(null)}} onSave={saveProduct}/>}
    </main>
  </div>;
}

function Dashboard({products,sales,expenses,monthlyGoal,fixedExpenses}:{products:Product[];sales:SaleRecord[];expenses:Expense[];monthlyGoal:number;fixedExpenses:number}) {
  const monthSales=sales.filter(s=>isCurrentMonth(s.date));
  const monthExpenses=expenses.filter(e=>isCurrentMonth(e.date));
  const salesTotal=monthSales.reduce((a,s)=>a+s.total,0);
  const grossProfit=monthSales.reduce((a,s)=>a+s.profit,0);
  const expenseTotal=monthExpenses.reduce((a,e)=>a+e.amount,0);
  const netResult=grossProfit-expenseTotal;
  const inventoryValue=products.reduce((a,p)=>a+p.cost*p.stock,0);
  const lowStock=products.filter(p=>p.stock<=p.minStock);
  const todayKey=localDateKey();
  const salesToday=sales.filter(s=>s.date.slice(0,10)===todayKey).reduce((a,s)=>a+s.total,0);
  const goal=monthlyGoal;
  const workDays=26;
  const dailyGoal=goal/workDays;
  const progress=Math.min(100,(salesTotal/goal)*100);
  const margin=salesTotal?grossProfit/salesTotal:0;
  const breakEvenSales=margin>0?fixedExpenses/margin:0;
  const breakEvenDaily=breakEvenSales/workDays;
  const goalRemaining=Math.max(0,goal-salesTotal);
  const expiring=products.filter(p=>{const days=(new Date(p.expiry+'T00:00:00').getTime()-Date.now())/86400000;return days>=0&&days<=90;});
  const recentSales=[...sales].sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime()).slice(-7);
  const chartValues=recentSales.length?recentSales.map(s=>s.total):[0,0,0,0,0,0,0];
  const maxChart=Math.max(...chartValues,1);
  return <div className="content">
    <section className="hero"><div><span className="pill">MVP · DASHBOARD EN VIVO</span><h2>Controla DIFARMÁS desde un solo lugar.</h2><p>Indicadores conectados a ventas, gastos e inventario.</p></div><div className="hero-goal"><span>Meta mensual</span><strong>{money(goal)}</strong><small>{money(dailyGoal)} por día · {progress.toFixed(0)}% registrado</small></div></section>
    <section className="card goal-card"><div className="goal-head"><div><h3>Metas y punto de equilibrio</h3><p>Calculado con el margen bruto registrado y {workDays} días de operación.</p></div></div><div className="grid metrics"><article className="card metric"><span>Meta mensual</span><strong>{money(goal)}</strong><small>Faltan {money(goalRemaining)}</small></article><article className="card metric"><span>Meta diaria</span><strong>{money(dailyGoal)}</strong><small>Sobre {workDays} días</small></article><article className="card metric"><span>Punto de equilibrio</span><strong>{money(breakEvenSales)}</strong><small>Ventas mensuales estimadas</small></article><article className="card metric"><span>Equilibrio diario</span><strong>{money(breakEvenDaily)}</strong><small>Para cubrir gastos fijos</small></article></div></section><section className="grid metrics">
      <article className="card metric"><div className="metric-top"><span>Ventas del día</span><ShoppingCart size={20}/></div><strong>{money(salesToday)}</strong><small>{salesToday>0?'Ventas registradas hoy':'Sin ventas registradas hoy'}</small></article>
      <article className="card metric"><div className="metric-top"><span>Ventas registradas</span><TrendingUp size={20}/></div><strong>{money(salesTotal)}</strong><small>{sales.length} operaciones</small></article>
      <article className="card metric"><div className="metric-top"><span>Utilidad bruta</span><DollarSign size={20}/></div><strong>{money(grossProfit)}</strong><small>Margen {salesTotal?((grossProfit/salesTotal)*100).toFixed(1):'0.0'}%</small></article>
      <article className="card metric"><div className="metric-top"><span>Resultado neto</span><Wallet size={20}/></div><strong>{money(netResult)}</strong><small>Después de gastos</small></article>
    </section>
    <section className="card goal-card"><div className="goal-head"><div><h3>Avance de meta mensual</h3><p>Ventas registradas frente al objetivo</p></div><strong>{money(salesTotal)} / {money(goal)}</strong></div><div className="progress-track"><div className="progress-fill" style={{width:progress+'%'}}/></div></section>
    <section className="dashboard-grid">
      <article className="card"><div className="card-title"><div><h3>Últimas ventas</h3><p>Operaciones recientes del POS</p></div><TrendingUp size={20}/></div>{recentSales.length===0?<div className="cart-empty">Registra una venta en POS para comenzar.</div>:<div className="mini-sales">{recentSales.slice().reverse().map(s=><div className="mini-sale" key={s.id}><div><strong>{money(s.total)}</strong><small>{new Date(s.date).toLocaleString('es-HN')} · {s.type}</small></div><span>{money(s.profit)}</span></div>)}</div>}</article>
      <article className="card"><div className="card-title"><div><h3>Alertas operativas</h3><p>Lo que requiere atención</p></div><AlertTriangle size={20}/></div>
        <div className="alert"><div className="dot warning"/><div><strong>Stock bajo</strong><p>{lowStock.length ? lowStock.length+' producto(s) en o por debajo del mínimo.' : 'No hay productos bajo el mínimo.'}</p></div></div>
        <div className="alert"><div className="dot danger"/><div><strong>Vencimientos</strong><p>{expiring.length ? expiring.length+' producto(s) vencen en los próximos 90 días.' : 'No hay vencimientos dentro de 90 días.'}</p></div></div>
        <div className="alert"><div className="dot info"/><div><strong>Inventario valorizado</strong><p>{money(inventoryValue)} al costo, con {products.length} productos registrados.</p></div></div>
      </article>
    </section>
    <section className="dashboard-grid">
      <article className="card"><div className="card-title"><div><h3>Ventas recientes</h3><p>Visualización rápida</p></div><ShoppingCart size={20}/></div><div className="bar-area live-bars">{chartValues.map((value,i)=><div key={i} className={i===chartValues.length-1?'bar current':'bar'} style={{height:(value/maxChart*100)+'%'}}/>)}</div><div className="days">{chartValues.map((_,i)=><span key={i}>{recentSales[i]?new Date(recentSales[i].date).toLocaleDateString('es-HN',{weekday:'short'}).slice(0,2).toUpperCase():'—'}</span>)}</div></article>
      <article className="card"><div className="card-title"><div><h3>Resumen financiero</h3><p>Acumulado en el ERP</p></div><DollarSign size={20}/></div><div className="finance-summary"><div><span>Gastos</span><strong>{money(expenseTotal)}</strong></div><div><span>Utilidad bruta</span><strong>{money(grossProfit)}</strong></div><div><span>Resultado neto</span><strong>{money(netResult)}</strong></div></div></article>
    </section>
  </div>;
}

function ModulePlaceholder({name}:{name:string}) { return <div className="content"><div className="empty card"><Boxes size={42}/><h2>{name}</h2><p>Este módulo está preparado en la navegación. Será construido en la siguiente fase del MVP.</p><span className="pill">PRÓXIMO MÓDULO</span></div></div> }

export default App;
