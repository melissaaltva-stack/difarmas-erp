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
import { Dashboard } from './components/Dashboard';
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

function ModulePlaceholder({name}:{name:string}) { return <div className="content"><div className="empty card"><Boxes size={42}/><h2>{name}</h2><p>Este módulo está preparado en la navegación. Será construido en la siguiente fase del MVP.</p><span className="pill">PRÓXIMO MÓDULO</span></div></div> }

export default App;
