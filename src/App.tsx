import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Boxes, DollarSign, LayoutDashboard, Pencil, Plus, Search, ShoppingCart, TrendingUp, Wallet, X, Users } from 'lucide-react';

type Module = 'dashboard' | 'ventas' | 'inventario' | 'compras' | 'finanzas';
type CartItem = Product & { qty: number; price: number };
type PurchaseItem = Product & { qty: number; unitCost: number };
type SaleLine = { productId:number; productName:string; category:string; laboratory:string; qty:number; unitCost:number; unitPrice:number; revenue:number; cost:number; profit:number };
type SaleRecord = { id:number; total:number; cost:number; profit:number; payment:string; type:string; date:string; customer?:string; dueDate?:string; items?:SaleLine[] };
type Expense = { id:number; description:string; amount:number; category:string; date:string };
type Receivable = { id:number; saleId:number; customer:string; total:number; paid:number; dueDate:string; date:string };
type Payable = { id:number; supplier:string; total:number; paid:number; dueDate:string; date:string };
type CashClosure = { id:number; date:string; opening:number; cashSales:number; collections:number; expenses:number; supplierPayments:number; expected:number; counted:number; difference:number; note:string }; type CashMovement = { id:number; type:'Entrada'|'Salida'; description:string; amount:number; category:string; date:string };
type Customer = { id:number; name:string; phone:string; creditLimit:number; active:boolean; notes:string };

type Product = {
  id: number; code: string; name: string; category: string; laboratory: string;
  presentation: string; cost: number; retail: number; wholesale: number;
  stock: number; minStock: number; lot: string; expiry: string; supplier: string;
};

const money = (value: number) => new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', maximumFractionDigits: 2 }).format(value);

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
  const [customers,setCustomers]=useState<Customer[]>(()=>JSON.parse(localStorage.getItem('difarmas_customers')||'[]'));
  const [products, setProducts] = useState<Product[]>(() => { try { const saved = localStorage.getItem('difarmas_products'); return saved ? JSON.parse(saved) : initialProducts; } catch { return initialProducts; } });
  const [search, setSearch] = useState('');
  const [monthlyGoal, setMonthlyGoal] = useState(() => { const v=localStorage.getItem('difarmas_monthly_goal'); return v ? Number(v) : 100000; });
  const [fixedExpenses, setFixedExpenses] = useState(() => { const v=localStorage.getItem('difarmas_fixed_expenses'); return v ? Number(v) : 25000; });
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

  useEffect(() => { localStorage.setItem('difarmas_products', JSON.stringify(products)); }, [products]);
  useEffect(() => { localStorage.setItem('difarmas_monthly_goal', String(monthlyGoal)); }, [monthlyGoal]);
  useEffect(() => { localStorage.setItem('difarmas_fixed_expenses', String(fixedExpenses)); }, [fixedExpenses]);
  useEffect(() => { localStorage.setItem('difarmas_sales', JSON.stringify(sales)); }, [sales]);
  useEffect(() => { localStorage.setItem('difarmas_expenses', JSON.stringify(expenses)); }, [expenses]);
  useEffect(() => { localStorage.setItem('difarmas_receivables', JSON.stringify(receivables)); }, [receivables]);
  useEffect(() => { localStorage.setItem('difarmas_payables', JSON.stringify(payables)); }, [payables]);

  const nav = [
    ['dashboard', 'Dashboard', LayoutDashboard], ['ventas', 'Ventas / POS', ShoppingCart],
    ['inventario', 'Inventario', Boxes], ['compras', 'Compras', ShoppingCart], ['finanzas', 'Finanzas', Wallet],
  ] as const;

  const filtered = useMemo(() => products.filter(p =>
    [p.code, p.name, p.category, p.laboratory].join(' ').toLowerCase().includes(search.toLowerCase())
  ), [products, search]);

  const recordSale = (sold: CartItem[], customer = '', dueDate = '') => { const id=Date.now(); const total=sold.reduce((a,i)=>a+i.price*i.qty,0); const cost=sold.reduce((a,i)=>a+i.cost*i.qty,0); setProducts(current=>current.map(p=>{const item=sold.find(x=>x.id===p.id);return item?{...p,stock:p.stock-item.qty}:p})); const items:SaleLine[]=sold.map(i=>({productId:i.id,productName:i.name,category:i.category,laboratory:i.laboratory,qty:i.qty,unitCost:i.cost,unitPrice:i.price,revenue:i.price*i.qty,cost:i.cost*i.qty,profit:(i.price-i.cost)*i.qty})); setSales(current=>[...current,{id,total,cost,profit:total-cost,payment,type:saleType,date:new Date().toISOString(),customer:payment==='Crédito'?customer:undefined,dueDate:payment==='Crédito'?dueDate:undefined,items}]); if(payment==='Crédito') setReceivables(current=>[...current,{id,saleId:id,customer,total,paid:0,dueDate,date:new Date().toISOString()}]); };

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
      {active === 'dashboard' ? <Dashboard products={products} sales={sales} expenses={expenses} monthlyGoal={monthlyGoal} fixedExpenses={fixedExpenses}/><GoalsSettings monthlyGoal={monthlyGoal} setMonthlyGoal={setMonthlyGoal} fixedExpenses={fixedExpenses} setFixedExpenses={setFixedExpenses}/> : active === 'inventario' ? <Inventory products={filtered} search={search} setSearch={setSearch} onNew={() => { setEditing(null); setShowForm(true); }} onEdit={p => { setEditing(p); setShowForm(true); }} /> : active === 'ventas' ? <POS products={products} cart={cart} setCart={setCart} saleType={saleType} setSaleType={setSaleType} payment={payment} setPayment={setPayment} search={saleSearch} setSearch={setSaleSearch} onComplete={recordSale}/> : active === 'compras' ? <Purchases products={products} cart={purchaseCart} setCart={setPurchaseCart} search={purchaseSearch} setSearch={setPurchaseSearch} supplier={purchaseSupplier} setSupplier={setPurchaseSupplier} onReceive={(items,paymentMethod,dueDate)=>{setProducts(current=>current.map(p=>{const item=items.find(x=>x.id===p.id); return item?{...p,stock:p.stock+item.qty,cost:item.unitCost,supplier:purchaseSupplier||p.supplier}:p})); if(paymentMethod==='Crédito'){const total=items.reduce((a,i)=>a+i.unitCost*i.qty,0);setPayables(current=>[...current,{id:Date.now(),supplier:purchaseSupplier,total,paid:0,dueDate,date:new Date().toISOString()}]);}}}/> : active === 'finanzas' ? <Finance sales={sales} expenses={expenses} setExpenses={setExpenses} receivables={receivables} setReceivables={setReceivables} payables={payables} setPayables={setPayables}/> : <ModulePlaceholder name={nav.find(n => n[0] === active)?.[1] || ''}/>} 
      {showForm && <ProductModal product={editing} onClose={() => {setShowForm(false);setEditing(null)}} onSave={saveProduct}/>}
    </main>
  </div>;
}

function Dashboard({products,sales,expenses,monthlyGoal,fixedExpenses}:{products:Product[];sales:SaleRecord[];expenses:Expense[];monthlyGoal:number;fixedExpenses:number}) {
  const salesTotal=sales.reduce((a,s)=>a+s.total,0);
  const grossProfit=sales.reduce((a,s)=>a+s.profit,0);
  const expenseTotal=expenses.reduce((a,e)=>a+e.amount,0);
  const netResult=grossProfit-expenseTotal;
  const inventoryValue=products.reduce((a,p)=>a+p.cost*p.stock,0);
  const lowStock=products.filter(p=>p.stock<=p.minStock);
  const todayKey=new Date().toDateString();
  const salesToday=sales.filter(s=>new Date(s.date).toDateString()===todayKey).reduce((a,s)=>a+s.total,0);
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

function POS({products,cart,setCart,saleType,setSaleType,payment,setPayment,search,setSearch,onComplete}:{products:Product[];cart:CartItem[];setCart:(c:CartItem[])=>void;saleType:'minorista'|'mayorista';setSaleType:(v:'minorista'|'mayorista')=>void;payment:'Efectivo'|'Transferencia'|'Crédito';setPayment:(v:'Efectivo'|'Transferencia'|'Crédito')=>void;search:string;setSearch:(v:string)=>void;onComplete:(sold:CartItem[],customer?:string,dueDate?:string)=>void}) {
  const results=products.filter(p=>[p.code,p.name].join(' ').toLowerCase().includes(search.toLowerCase())).slice(0,6);
  const total=cart.reduce((sum,i)=>sum+i.price*i.qty,0);
  const profit=cart.reduce((sum,i)=>sum+(i.price-i.cost)*i.qty,0);
  const [customer,setCustomer]=useState('');
  const [dueDate,setDueDate]=useState(()=>{const d=new Date();d.setDate(d.getDate()+30);return d.toISOString().slice(0,10);});
  const add=(p:Product)=>{if(p.stock<=0)return;setCart(cart.some(i=>i.id===p.id)?cart.map(i=>i.id===p.id?{...i,qty:Math.min(i.qty+1,p.stock),price:saleType==='mayorista'?p.wholesale:p.retail}:i):[...cart,{...p,qty:1,price:saleType==='mayorista'?p.wholesale:p.retail}]);setSearch('');};
  const change=(id:number,delta:number)=>setCart(cart.map(i=>i.id===id?{...i,qty:Math.max(1,Math.min(i.qty+delta,i.stock))}:i));
  const remove=(id:number)=>setCart(cart.filter(i=>i.id!==id));
  const checkout=()=>{if(!cart.length)return;if(payment==='Crédito'&&!customer.trim())return;onComplete(cart,customer.trim(),dueDate);setCart([]);setCustomer('');};
  return <div className="content"><div className="page-head"><div><span className="pill">MVP · MÓDULO 3</span><h2>Punto de venta</h2><p>Venta rápida con precio minorista o mayorista.</p></div><div className="sale-type"><button className={saleType==='minorista'?'type active':'type'} onClick={()=>setSaleType('minorista')}>Minorista</button><button className={saleType==='mayorista'?'type active':'type'} onClick={()=>setSaleType('mayorista')}>Mayorista</button></div></div>
  <div className="pos-grid"><section><div className="card search-pos"><Search size={18}/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar producto o escanear código..." /></div>{search&&<div className="results card">{results.length?results.map(p=><button key={p.id} onClick={()=>add(p)}><span><strong>{p.name}</strong><small>{p.code} · Stock: {p.stock}</small></span><b>{money(saleType==='mayorista'?p.wholesale:p.retail)}</b></button>):<p>No se encontraron productos.</p>}</div>}<div className="card cart-card"><div className="card-title"><div><h3>Carrito</h3><p>{cart.length} productos</p></div><ShoppingCart size={20}/></div>{cart.length===0?<div className="cart-empty">Agrega productos para iniciar la venta.</div>:cart.map(i=><div className="cart-row" key={i.id}><div><strong>{i.name}</strong><small>{money(i.price)} c/u</small></div><div className="qty"><button onClick={()=>change(i.id,-1)}>-</button><b>{i.qty}</b><button onClick={()=>change(i.id,1)}>+</button></div><strong>{money(i.price*i.qty)}</strong><button className="remove" onClick={()=>remove(i.id)}>×</button></div>)}</div></section><aside className="card checkout"><h3>Resumen de venta</h3><div className="summary-line"><span>Subtotal</span><strong>{money(total)}</strong></div><div className="summary-line"><span>Utilidad estimada</span><strong>{money(profit)}</strong></div><label className="checkout-label">Método de pago<select value={payment} onChange={e=>setPayment(e.target.value as typeof payment)}><option>Efectivo</option><option>Transferencia</option><option>Crédito</option></select></label>{payment==='Crédito'&&<><label className="checkout-label">Cliente<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Nombre del cliente"/></label><label className="checkout-label">Fecha de vencimiento<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label></>}<div className="grand"><span>Total</span><strong>{money(total)}</strong></div><button className="primary checkout-btn" disabled={!cart.length} onClick={checkout}>Registrar venta</button></aside></div></div>;
}

function Purchases({products,cart,setCart,search,setSearch,supplier,setSupplier,onReceive}:{products:Product[];cart:PurchaseItem[];setCart:(c:PurchaseItem[])=>void;search:string;setSearch:(v:string)=>void;supplier:string;setSupplier:(v:string)=>void;onReceive:(items:PurchaseItem[],paymentMethod:'Efectivo'|'Transferencia'|'Crédito',dueDate:string)=>void}) {
  const results=products.filter(p=>[p.code,p.name].join(' ').toLowerCase().includes(search.toLowerCase())).slice(0,6);
  const total=cart.reduce((sum,i)=>sum+i.unitCost*i.qty,0);
  const [paymentMethod,setPaymentMethod]=useState<'Efectivo'|'Transferencia'|'Crédito'>('Efectivo');
  const [dueDate,setDueDate]=useState(()=>{const d=new Date();d.setDate(d.getDate()+30);return d.toISOString().slice(0,10);});
  const add=(p:Product)=>{setCart(cart.some(i=>i.id===p.id)?cart.map(i=>i.id===p.id?{...i,qty:i.qty+1}:i):[...cart,{...p,qty:1,unitCost:p.cost}]);setSearch('');};
  const change=(id:number,delta:number)=>setCart(cart.map(i=>i.id===id?{...i,qty:Math.max(1,i.qty+delta)}:i));
  const updateCost=(id:number,value:number)=>setCart(cart.map(i=>i.id===id?{...i,unitCost:value}:i));
  return <div className="content"><div className="page-head"><div><span className="pill">MVP · MÓDULO 4</span><h2>Compras y recepción</h2><p>Registra compras, costos y entrada de mercancía al inventario.</p></div></div>
  <div className="purchase-grid"><section><div className="card purchase-head"><label>Proveedor<input value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Nombre del proveedor"/></label><div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar producto para agregar..." /></div></div>{search&&<div className="results card">{results.map(p=><button key={p.id} onClick={()=>add(p)}><span><strong>{p.name}</strong><small>{p.code} · Costo actual {money(p.cost)}</small></span><b>Agregar</b></button>)}</div>}<div className="card cart-card"><div className="card-title"><div><h3>Detalle de compra</h3><p>{cart.length} productos</p></div><Boxes size={20}/></div>{cart.length===0?<div className="cart-empty">Agrega productos a la compra.</div>:cart.map(i=><div className="purchase-row" key={i.id}><div><strong>{i.name}</strong><small>{i.code}</small></div><input type="number" min="0.01" value={i.unitCost} onChange={e=>updateCost(i.id,Number(e.target.value))}/><div className="qty"><button onClick={()=>change(i.id,-1)}>-</button><b>{i.qty}</b><button onClick={()=>change(i.id,1)}>+</button></div><strong>{money(i.unitCost*i.qty)}</strong></div>)}</div></section><aside className="card checkout"><h3>Recepción</h3><div className="summary-line"><span>Subtotal compra</span><strong>{money(total)}</strong></div><div className="summary-line"><span>Productos</span><strong>{cart.reduce((s,i)=>s+i.qty,0)}</strong></div><label className="checkout-label">Método de pago<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as typeof paymentMethod)}><option>Efectivo</option><option>Transferencia</option><option>Crédito</option></select></label>{paymentMethod==='Crédito'&&<label className="checkout-label">Vencimiento<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>}<div className="grand"><span>Total</span><strong>{money(total)}</strong></div><button className="primary checkout-btn" disabled={!cart.length||!supplier.trim()} onClick={()=>{onReceive(cart,paymentMethod,dueDate);setCart([]);setSupplier('');setPaymentMethod('Efectivo');}}>Recibir mercancía</button><small className="helper">Al recibir, se suma al stock y se actualiza el costo del producto.</small></aside></div></div>;
}

function Inventory({products, search, setSearch, onNew, onEdit}:{products:Product[];search:string;setSearch:(v:string)=>void;onNew:()=>void;onEdit:(p:Product)=>void}) {
  return <div className="content"><div className="page-head"><div><span className="pill">MVP · MÓDULO 2</span><h2>Productos e inventario</h2><p>Control de existencias, costos, precios, lotes y vencimientos.</p></div><button className="primary" onClick={onNew}><Plus size={17}/> Nuevo producto</button></div>
    <div className="inventory-toolbar card"><div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por código, producto, categoría..." /></div><span className="count">{products.length} productos</span></div>
    <div className="card table-wrap"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Costo</th><th>Minorista</th><th>Mayorista</th><th>Stock</th><th>Vencimiento</th><th></th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td><strong>{p.name}</strong><small>{p.code} · {p.presentation}</small></td><td>{p.category}</td><td>{money(p.cost)}</td><td>{money(p.retail)}</td><td>{money(p.wholesale)}</td><td><span className={p.stock<=p.minStock?'stock low':'stock'}>{p.stock}</span><small>Mín. {p.minStock}</small></td><td>{new Date(p.expiry+'T00:00:00').toLocaleDateString('es-HN')}</td><td><button className="icon-btn" title="Editar" onClick={()=>onEdit(p)}><Pencil size={16}/></button></td></tr>)}</tbody></table></div>
  </div>;
}

function ProductModal({product,onClose,onSave}:{product:Product|null;onClose:()=>void;onSave:(p:Product)=>void}) {
  const blank:Product={id:0,code:'',name:'',category:'Medicamentos',laboratory:'',presentation:'',cost:0,retail:0,wholesale:0,stock:0,minStock:0,lot:'',expiry:'',supplier:''};
  const [form,setForm]=useState<Product>(product||blank);
  const set=(key:keyof Product,value:string|number)=>setForm(f=>({...f,[key]:typeof value==='string' && ['cost','retail','wholesale','stock','minStock'].includes(key) ? Number(value) : value}));
  const fields:[keyof Product,string,string][]=[['code','Código de barras','text'],['name','Nombre del producto','text'],['category','Categoría','text'],['laboratory','Laboratorio','text'],['presentation','Presentación','text'],['cost','Costo','number'],['retail','Precio minorista','number'],['wholesale','Precio mayorista','number'],['stock','Existencia','number'],['minStock','Stock mínimo','number'],['lot','Lote','text'],['expiry','Vencimiento','date'],['supplier','Proveedor','text']];
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><h2>{product?'Editar producto':'Nuevo producto'}</h2><p>Completa la ficha del producto.</p></div><button className="icon-btn" onClick={onClose}><X/></button></div><div className="form-grid">{fields.map(([key,label,type])=><label key={key}>{label}<input type={type} value={String(form[key] ?? '')} onChange={e=>set(key,type==='number'?Number(e.target.value):e.target.value)}/></label>)}</div><div className="modal-actions"><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" onClick={()=>onSave(form)}>Guardar producto</button></div></div></div>;
}

function Finance({sales,expenses,setExpenses,receivables,setReceivables,payables,setPayables}:{sales:SaleRecord[];expenses:Expense[];setExpenses:(e:Expense[])=>void;receivables:Receivable[];setReceivables:(e:Receivable[])=>void;payables:Payable[];setPayables:(e:Payable[])=>void}) {
  const [description,setDescription]=useState(''); const [amount,setAmount]=useState(0); const [category,setCategory]=useState('Operación');
  const [paymentAmount,setPaymentAmount]=useState<Record<number,number>>({});
  const [opening,setOpening]=useState(0); const [counted,setCounted]=useState(0); const [note,setNote]=useState('');
  const [closures,setClosures]=useState<CashClosure[]>(()=>{try{const s=localStorage.getItem('difarmas_cash_closures');return s?JSON.parse(s):[]}catch{return []}});
  const [movements,setMovements]=useState<CashMovement[]>(()=>{try{const s=localStorage.getItem('difarmas_cash_movements');return s?JSON.parse(s):[]}catch{return []}});
  useEffect(()=>{localStorage.setItem('difarmas_cash_closures',JSON.stringify(closures))},[closures]);
  useEffect(()=>{localStorage.setItem('difarmas_cash_movements',JSON.stringify(movements))},[movements]);
  const salesTotal=sales.reduce((a,s)=>a+s.total,0); const profit=sales.reduce((a,s)=>a+s.profit,0); const expenseTotal=expenses.reduce((a,e)=>a+e.amount,0);
  const receivablePending=receivables.reduce((a,r)=>a+Math.max(0,r.total-r.paid),0); const payablePending=payables.reduce((a,r)=>a+Math.max(0,r.total-r.paid),0);
  const cashSales=sales.filter(s=>s.payment!=='Crédito').reduce((a,s)=>a+s.total,0); const collected=receivables.reduce((a,r)=>a+r.paid,0); const supplierPayments=payables.reduce((a,r)=>a+r.paid,0);
  const cashFlow=cashSales+collected-expenseTotal-supplierPayments;
  const today=new Date().toISOString().slice(0,10);
  const dayMovementIn=movements.filter(m=>m.date.slice(0,10)===today&&m.type==='Entrada').reduce((a,m)=>a+m.amount,0); const dayMovementOut=movements.filter(m=>m.date.slice(0,10)===today&&m.type==='Salida').reduce((a,m)=>a+m.amount,0);
  const daySales=sales.filter(s=>s.date.slice(0,10)===today&&s.payment!=='Crédito').reduce((a,s)=>a+s.total,0);
  const dayCollections=receivables.filter(r=>r.date.slice(0,10)===today).reduce((a,r)=>a+r.paid,0);
  const dayExpenses=expenses.filter(e=>e.date.slice(0,10)===today).reduce((a,e)=>a+e.amount,0);
  const daySupplierPayments=payables.filter(r=>r.date.slice(0,10)===today).reduce((a,r)=>a+r.paid,0);
  const expected=opening+daySales+dayCollections+dayMovementIn-dayExpenses-daySupplierPayments-dayMovementOut;
  const addExpense=()=>{if(!description.trim()||amount<=0)return;setExpenses([...expenses,{id:Date.now(),description,amount,category,date:new Date().toISOString()}]);setDescription('');setAmount(0);};
  const collect=(r:Receivable)=>{const value=Math.min(paymentAmount[r.id]||0,Math.max(0,r.total-r.paid));if(value<=0)return;setReceivables(receivables.map(x=>x.id===r.id?{...x,paid:x.paid+value}:x));setPaymentAmount({...paymentAmount,[r.id]:0});};
  const paySupplier=(r:Payable)=>{const value=Math.min(paymentAmount[r.id]||0,Math.max(0,r.total-r.paid));if(value<=0)return;setPayables(payables.map(x=>x.id===r.id?{...x,paid:x.paid+value}:x));setPaymentAmount({...paymentAmount,[r.id]:0});};
  const closeCash=()=>{const difference=counted-expected;setClosures([{id:Date.now(),date:new Date().toISOString(),opening,cashSales:daySales,collections:dayCollections,expenses:dayExpenses,supplierPayments:daySupplierPayments,expected,counted,difference,note},...closures]);setOpening(counted);setCounted(0);setNote('');};
  return <div className="content"><div className="page-head"><div><span className="pill">MVP · FINANZAS + CAJA</span><h2>Finanzas y caja</h2><p>Control de ventas, cobros, pagos, flujo de caja y cierre diario.</p></div></div>
  <div className="grid metrics"><article className="card metric"><div className="metric-top"><span>Ventas</span><ShoppingCart size={20}/></div><strong>{money(salesTotal)}</strong><small>{sales.length} operaciones</small></article><article className="card metric"><div className="metric-top"><span>Utilidad bruta</span><TrendingUp size={20}/></div><strong>{money(profit)}</strong></article><article className="card metric"><div className="metric-top"><span>Por cobrar</span><DollarSign size={20}/></div><strong>{money(receivablePending)}</strong></article><article className="card metric"><div className="metric-top"><span>Por pagar</span><Wallet size={20}/></div><strong>{money(payablePending)}</strong></article></div>
  <div className="grid metrics"><article className="card metric"><div className="metric-top"><span>Flujo de caja</span><Activity size={20}/></div><strong>{money(cashFlow)}</strong><small>Entradas de efectivo − egresos</small></article><article className="card metric"><div className="metric-top"><span>Ventas contado</span><DollarSign size={20}/></div><strong>{money(cashSales)}</strong></article><article className="card metric"><div className="metric-top"><span>Cobros</span><DollarSign size={20}/></div><strong>{money(collected)}</strong></article><article className="card metric"><div className="metric-top"><span>Pagos proveedores</span><Wallet size={20}/></div><strong>{money(supplierPayments)}</strong></article></div>
  <ManagementReports sales={sales} expenses={expenses}/><SmartAlerts products={products} sales={sales} receivables={receivables} payables={payables} monthlyGoal={monthlyGoal}/><SmartPurchasing products={products} sales={sales}/>{activeModule==='clientes'&&<><PriceControl products={products}/><PriceSimulator products={products}/><PriceRecommendations products={products}/><PriceHistory products={products}/><CostImpactAlerts products={products}/><ProfitabilityDecisionCenter products={products} sales={sales}/><StockProfitability products={products} sales={sales}/><ProductPriorityRanking products={products} sales={sales}/><PromotionEngine products={products} sales={sales}/><BundlePromotionEngine products={products} sales={sales}/><CampaignCenter products={products} sales={sales}/><CampaignTracking products={products} sales={sales}/><CampaignAnalytics products={products} sales={sales}/><CommercialActionCenter products={products} sales={sales} receivables={receivables}/><AdvancedProfitability products={products} sales={sales}/><ManagementAssistant sales={sales} monthlyGoal={monthlyGoal} products={products}/><OpportunityCenter customers={customers} sales={sales} products={products}/><CustomerRecommendations customers={customers} sales={sales} products={products}/><CustomerInsights customers={customers} sales={sales}/><CustomerCRM customers={customers} setCustomers={setCustomers} sales={sales}/></>} <ProductProfitability sales={sales}/>
  <div className="finance-grid"><section className="card"><div className="card-title"><div><h3>Registrar gasto</h3><p>Alquiler, servicios, personal, impuestos u otros.</p></div><Wallet size={20}/></div><div className="expense-form"><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descripción del gasto"/><input type="number" min="0" value={amount||''} onChange={e=>setAmount(Number(e.target.value))} placeholder="Monto"/><select value={category} onChange={e=>setCategory(e.target.value)}><option>Operación</option><option>Alquiler</option><option>Servicios</option><option>Personal</option><option>Impuestos</option><option>Otros</option></select><button className="primary" onClick={addExpense}>Registrar gasto</button></div></section>
  <section className="card"><div className="card-title"><div><h3>Últimos gastos</h3><p>Control de egresos</p></div></div>{expenses.length===0?<div className="cart-empty">Todavía no hay gastos.</div>:expenses.slice(-8).reverse().map(e=><div className="expense-row" key={e.id}><div><strong>{e.description}</strong><small>{e.category}</small></div><strong>{money(e.amount)}</strong></div>)}</section></div>
  <div className="card table-wrap finance-table"><div className="card-title"><div><h3>Ventas registradas</h3><p>Historial del POS</p></div></div>{sales.length===0?<div className="cart-empty">No hay ventas.</div>:<table><thead><tr><th>Fecha</th><th>Cliente</th><th>Pago</th><th>Total</th><th>Utilidad</th></tr></thead><tbody>{sales.slice().reverse().map(x=><tr key={x.id}><td>{new Date(x.date).toLocaleString('es-HN')}</td><td>{x.customer||'Contado'}</td><td>{x.payment}</td><td>{money(x.total)}</td><td>{money(x.profit)}</td></tr>)}</tbody></table>}</div>
  <div className="finance-grid"><section className="card"><div className="card-title"><div><h3>Cuentas por cobrar</h3><p>Registra abonos de clientes.</p></div></div>{receivables.length===0?<div className="cart-empty">No hay cuentas por cobrar.</div>:receivables.slice().reverse().map(r=>{const balance=Math.max(0,r.total-r.paid);return <div className="expense-row" key={r.id}><div><strong>{r.customer}</strong><small>Saldo {money(balance)} · Vence {new Date(r.dueDate+'T00:00:00').toLocaleDateString('es-HN')}</small></div>{balance>0&&<div className="qty"><input type="number" min="0" max={balance} value={paymentAmount[r.id]||''} onChange={e=>setPaymentAmount({...paymentAmount,[r.id]:Number(e.target.value)})}/><button onClick={()=>collect(r)}>Cobrar</button></div>}</div>})}</section>
  <section className="card"><div className="card-title"><div><h3>Cuentas por pagar</h3><p>Registra pagos a proveedores.</p></div></div>{payables.length===0?<div className="cart-empty">No hay cuentas por pagar.</div>:payables.slice().reverse().map(r=>{const balance=Math.max(0,r.total-r.paid);return <div className="expense-row" key={r.id}><div><strong>{r.supplier}</strong><small>Saldo {money(balance)} · Vence {new Date(r.dueDate+'T00:00:00').toLocaleDateString('es-HN')}</small></div>{balance>0&&<div className="qty"><input type="number" min="0" max={balance} value={paymentAmount[r.id]||''} onChange={e=>setPaymentAmount({...paymentAmount,[r.id]:Number(e.target.value)})}/><button onClick={()=>paySupplier(r)}>Pagar</button></div>}</div>})}</section></div>
  <section className="card"><div className="card-title"><div><h3>Movimientos de caja</h3><p>Entradas y salidas manuales que afectan el efectivo.</p></div><Activity size={20}/></div><div className="expense-form"><select id="cashType"><option>Entrada</option><option>Salida</option></select><input id="cashDesc" placeholder="Descripción"/><input id="cashAmount" type="number" min="0" placeholder="Monto"/><select id="cashCat"><option>Otros</option><option>Aporte</option><option>Retiro</option><option>Préstamo</option><option>Devolución</option><option>Banco</option></select><button className="primary" onClick={()=>{const t=(document.getElementById('cashType') as HTMLSelectElement).value as 'Entrada'|'Salida';const d=(document.getElementById('cashDesc') as HTMLInputElement).value.trim();const a=Number((document.getElementById('cashAmount') as HTMLInputElement).value);const cat=(document.getElementById('cashCat') as HTMLSelectElement).value;if(!d||a<=0)return;setMovements([{id:Date.now(),type:t,description:d,amount:a,category:cat,date:new Date().toISOString()},...movements]);}}>Registrar</button></div>{movements.slice(0,8).map(m=><div className="expense-row" key={m.id}><div><strong>{m.description}</strong><small>{m.type} · {m.category} · {new Date(m.date).toLocaleDateString('es-HN')}</small></div><strong>{m.type==='Entrada'?'+':'-'}{money(m.amount)}</strong></div>)}</section>
  <section className="card"><div className="card-title"><div><h3>Cierre de caja diario</h3><p>Calcula cuánto debería haber en efectivo y compara con el efectivo contado.</p></div><Wallet size={20}/></div><div className="expense-form"><label>Saldo inicial<input type="number" min="0" value={opening||''} onChange={e=>setOpening(Number(e.target.value))}/></label><div className="summary-line"><span>Ventas de contado hoy</span><strong>{money(daySales)}</strong></div><div className="summary-line"><span>Cobros de hoy</span><strong>{money(dayCollections)}</strong></div><div className="summary-line"><span>Gastos de hoy</span><strong>{money(dayExpenses)}</strong></div><div className="summary-line"><span>Pagos a proveedores hoy</span><strong>{money(daySupplierPayments)}</strong></div><div className="grand"><span>Efectivo esperado</span><strong>{money(expected)}</strong></div><label>Dinero contado<input type="number" min="0" value={counted||''} onChange={e=>setCounted(Number(e.target.value))}/></label><label>Nota<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Observación del cierre"/></label><button className="primary" onClick={closeCash}>Cerrar caja</button></div></section>
  <section className="card"><div className="card-title"><div><h3>Historial de cierres</h3><p>Diferencias encontradas por día.</p></div></div>{closures.length===0?<div className="cart-empty">Aún no hay cierres.</div>:closures.slice(0,10).map(x=><div className="expense-row" key={x.id}><div><strong>{new Date(x.date).toLocaleDateString('es-HN')}</strong><small>Esperado {money(x.expected)} · Contado {money(x.counted)}{x.note?' · '+x.note:''}</small></div><strong>{x.difference>=0?'+':''}{money(x.difference)}</strong></div>)}</section>
  </div>;
}
function ProductProfitability({sales}:{sales:SaleRecord[]}) {
  const [search,setSearch]=useState('');
  const [group,setGroup]=useState<'Producto'|'Categoría'|'Laboratorio'>('Producto');
  const rows=useMemo(()=>{
    const map=new Map<string,{name:string;category:string;laboratory:string;units:number;revenue:number;cost:number;profit:number}>();
    sales.forEach(s=>s.items?.forEach(i=>{
      const key=group==='Producto'?i.productName:group==='Categoría'?i.category:i.laboratory;
      const current=map.get(key)||{name:key,category:i.category,laboratory:i.laboratory,units:0,revenue:0,cost:0,profit:0};
      current.units+=i.qty; current.revenue+=i.revenue; current.cost+=i.cost; current.profit+=i.profit; map.set(key,current);
    }));
    return [...map.values()].filter(r=>r.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>b.profit-a.profit);
  },[sales,group,search]);
  const revenue=rows.reduce((a,r)=>a+r.revenue,0);
  const profit=rows.reduce((a,r)=>a+r.profit,0);
  const best=rows[0];
  return <section className="card profitability">
    <div className="card-title"><div><h3>Rentabilidad por producto</h3><p>Utilidad real basada en las líneas registradas en el POS.</p></div><TrendingUp size={20}/></div>
    <div className="profit-toolbar"><div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar producto, categoría o laboratorio..." /></div><select value={group} onChange={e=>setGroup(e.target.value as typeof group)}><option>Producto</option><option>Categoría</option><option>Laboratorio</option></select></div>
    <div className="grid metrics profit-metrics"><article className="card metric"><span>Ventas con detalle</span><strong>{money(revenue)}</strong></article><article className="card metric"><span>Utilidad</span><strong>{money(profit)}</strong></article><article className="card metric"><span>Margen</span><strong>{revenue?((profit/revenue)*100).toFixed(1):'0.0'}%</strong></article><article className="card metric"><span>Mayor utilidad</span><strong>{best?best.name:'—'}</strong></article></div>
    {rows.length===0?<div className="cart-empty">Las nuevas ventas quedarán disponibles aquí con producto, costo, precio, unidades y utilidad. Las ventas históricas sin detalle no pueden desglosarse por producto.</div>:
    <div className="table-wrap"><table><thead><tr><th>{group}</th><th>Unidades</th><th>Ventas</th><th>Costo</th><th>Utilidad</th><th>Margen</th></tr></thead><tbody>{rows.map(r=><tr key={r.name}><td><strong>{r.name}</strong>{group!=='Producto'&&<small>{r.category} · {r.laboratory}</small>}</td><td>{r.units}</td><td>{money(r.revenue)}</td><td>{money(r.cost)}</td><td>{money(r.profit)}</td><td>{r.revenue?((r.profit/r.revenue)*100).toFixed(1):'0.0'}%</td></tr>)}</tbody></table></div>}
  </section>;
}

function GoalsSettings({monthlyGoal,setMonthlyGoal,fixedExpenses,setFixedExpenses}:{monthlyGoal:number;setMonthlyGoal:(v:number)=>void;fixedExpenses:number;setFixedExpenses:(v:number)=>void}) {
  return <section className="card"><div className="card-title"><div><h3>Configuración de metas</h3><p>Estos valores alimentan el cálculo de meta y punto de equilibrio.</p></div><DollarSign size={20}/></div>
    <div className="expense-form"><label>Meta mensual<input type="number" min="0" value={monthlyGoal||''} onChange={e=>setMonthlyGoal(Number(e.target.value))}/></label><label>Gastos fijos mensuales<input type="number" min="0" value={fixedExpenses||''} onChange={e=>setFixedExpenses(Number(e.target.value))}/></label></div>
  </section>;
}

function SmartPurchasing({products,sales}:{products:Product[];sales:SaleRecord[]}) {
  const demand=useMemo(()=>{const m=new Map<number,number>();sales.forEach(s=>s.items?.forEach(i=>m.set(i.productId,(m.get(i.productId)||0)+i.qty));return m},[sales]);
  const rows=products.map(p=>{const sold=demand.get(p.id)||0;const avg=Math.max(sold/3,0.1);const target=Math.ceil(avg*2);const suggested=Math.max(0,target-p.stock);return {...p,sold,avg,target,suggested}}).filter(p=>p.suggested>0).sort((a,b)=>b.suggested-a.suggested);
  const stockValue=rows.reduce((a,p)=>a+p.suggested*p.cost,0);
  return <section className="card"><div className="card-title"><div><h3>Compras inteligentes</h3><p>Sugerencias basadas en ventas registradas y stock actual.</p></div><ShoppingCart size={20}/></div>
    <div className="metrics-grid"><div className="metric"><span>Productos a reponer</span><strong>{rows.length}</strong></div><div className="metric"><span>Inversión sugerida</span><strong>{money(stockValue)}</strong></div><div className="metric"><span>Horizonte</span><strong>2 meses</strong></div></div>
    {rows.length?<div className="table-wrap"><table><thead><tr><th>Producto</th><th>Stock</th><th>Vendidos</th><th>Prom./mes</th><th>Objetivo</th><th>Comprar</th><th>Costo</th></tr></thead><tbody>{rows.slice(0,12).map(p=><tr key={p.id}><td>{p.name}</td><td>{p.stock}</td><td>{p.sold}</td><td>{p.avg.toFixed(1)}</td><td>{p.target}</td><td><strong>{p.suggested}</strong></td><td>{money(p.suggested*p.cost)}</td></tr>)}</tbody></table></div>:<div className="empty">No hay compras sugeridas con los datos actuales.</div>}
  </section>;
}

function CommercialActionCenter({products,sales,receivables}:{products:Product[];sales:SaleRecord[];receivables:Receivable[]}) {
 const sold=new Map<number,number>(); const profit=new Map<number,number>(); sales.forEach(s=>(s.items||[]).forEach(i=>{sold.set(i.productId,(sold.get(i.productId)||0)+i.qty);profit.set(i.productId,(profit.get(i.productId)||0)+i.profit)}));
 const actions=products.flatMap(p=>{const units=sold.get(p.id)||0;const margin=p.retail?(p.retail-p.cost)/p.retail:0;const items:{priority:number;type:string;product:string;reason:string}[]=[];if(margin<.2)items.push({priority:100,type:'PRECIO',product:p.name,reason:'Margen menor al 20%: revisar precio.'});else if(margin<.3)items.push({priority:70,type:'PRECIO',product:p.name,reason:'Margen menor al objetivo de 30%.'});if(units>0&&p.stock<=p.minStock)items.push({priority:95,type:'COMPRA',product:p.name,reason:'Ventas registradas y stock en mínimo.'});if(units>0&&margin>=.3&&p.stock>p.minStock*2)items.push({priority:60,type:'PROMOCIÓN',product:p.name,reason:'Buen margen pero existe inventario disponible.'});return items}).sort((a,b)=>b.priority-a.priority);
 const credit=receivables.filter(r=>r.paid<r.total).length;
 if(credit) actions.push({priority:90,type:'COBRO',product:'Cuentas por cobrar',reason:'Hay clientes con saldo pendiente.'});
 return <section className="card"><div className="card-title"><div><h3>Asistente comercial de acciones</h3><p>Convierte indicadores del ERP en tareas prioritarias para gerencia.</p></div><Brain size={20}/></div><div className="metrics-grid"><div className="metric"><span>Acciones prioritarias</span><strong>{actions.length}</strong></div><div className="metric"><span>Precios a revisar</span><strong>{actions.filter(x=>x.type==='PRECIO').length}</strong></div><div className="metric"><span>Compras sugeridas</span><strong>{actions.filter(x=>x.type==='COMPRA').length}</strong></div><div className="metric"><span>Cobros pendientes</span><strong>{credit}</strong></div></div><div className="table-wrap"><table><thead><tr><th>Prioridad</th><th>Tipo</th><th>Elemento</th><th>Recomendación</th></tr></thead><tbody>{actions.slice(0,15).map((x,i)=><tr key={i}><td>{x.priority}</td><td><strong>{x.type}</strong></td><td>{x.product}</td><td>{x.reason}</td></tr>)}</tbody></table></div></section>;
}

function CampaignAnalytics({products,sales}:{products:Product[];sales:SaleRecord[]}) {
 const campaigns=JSON.parse(localStorage.getItem('difarmas_campaigns')||'[]');
 const rows=campaigns.map((x:any)=>{const product=products.find(p=>p.id===x.productId);const during=sales.filter(s=>s.items?.some(i=>i.productId===x.productId&&s.date>=x.start&&s.date<=x.end));const units=during.reduce((n,s)=>n+(s.items||[]).filter(i=>i.productId===x.productId).reduce((a,i)=>a+i.qty,0),0);const revenue=units*x.promo;const cost=units*(product?.cost||0);const profit=revenue-cost;const regularProfit=units*((product?.retail||x.regular)-(product?.cost||0));const impact=profit-regularProfit;const roi=cost>0?(profit/cost)*100:0;return {...x,units,revenue,profit,impact,roi}}).sort((a:any,b:any)=>b.profit-a.profit);
 const profitable=rows.filter((x:any)=>x.impact>=0).length;
 return <section className="card"><div className="card-title"><div><h3>Análisis de efectividad de campañas</h3><p>Mide utilidad e impacto de las promociones registradas.</p></div><LineChart size={20}/></div><div className="metrics-grid"><div className="metric"><span>Campañas analizadas</span><strong>{rows.length}</strong></div><div className="metric"><span>Con impacto positivo</span><strong>{profitable}</strong></div><div className="metric"><span>Utilidad promocional</span><strong>{money(rows.reduce((s:any,x:any)=>s+x.profit,0))}</strong></div></div><div className="table-wrap"><table><thead><tr><th>Campaña</th><th>Unidades</th><th>Ingresos</th><th>Utilidad</th><th>Impacto vs. precio normal</th><th>ROI</th></tr></thead><tbody>{rows.slice(0,10).map((x:any)=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{x.units}</td><td>{money(x.revenue)}</td><td>{money(x.profit)}</td><td>{money(x.impact)}</td><td>{x.roi.toFixed(1)}%</td></tr>)}</tbody></table></div></section>;
}

function CampaignTracking({products,sales}:{products:Product[];sales:SaleRecord[]}) {
 const [campaigns,setCampaigns]=React.useState<{id:number;productId:number;name:string;regular:number;promo:number;start:string;end:string;baselineUnits:number}[]>(()=>JSON.parse(localStorage.getItem('difarmas_campaigns')||'[]'));
 const [selected,setSelected]=React.useState(products[0]?.id??0); const p=products.find(x=>x.id===selected);
 const [days,setDays]=React.useState(7);
 const create=()=>{if(!p)return;const item={id:Date.now(),productId:p.id,name:p.name,regular:p.retail,promo:p.retail*.9,start:new Date().toISOString(),end:new Date(Date.now()+days*86400000).toISOString(),baselineUnits:0};const next=[item,...campaigns];setCampaigns(next);localStorage.setItem('difarmas_campaigns',JSON.stringify(next));};
 const units=(id:number)=>sales.reduce((n,s)=>n+(s.items||[]).filter(i=>i.productId===id).reduce((a,i)=>a+i.qty,0),0);
 return <section className="card"><div className="card-title"><div><h3>Seguimiento de campañas</h3><p>Registra campañas y compara su desempeño con las ventas acumuladas.</p></div><BarChart3 size={20}/></div><div className="form-grid"><label>Producto<select value={selected} onChange={e=>setSelected(Number(e.target.value))}>{products.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Duración (días)<input type="number" min="1" value={days} onChange={e=>setDays(Number(e.target.value))}/></label></div><button className="primary" onClick={create}>Registrar campaña</button><div className="table-wrap"><table><thead><tr><th>Campaña</th><th>Precio promo</th><th>Inicio</th><th>Fin</th><th>Unidades registradas</th><th>Ingresos estimados</th></tr></thead><tbody>{campaigns.slice(0,10).map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{money(x.promo)}</td><td>{new Date(x.start).toLocaleDateString()}</td><td>{new Date(x.end).toLocaleDateString()}</td><td>{units(x.productId)}</td><td>{money(units(x.productId)*x.promo)}</td></tr>)}</tbody></table></div></section>;
}

function CampaignCenter({products,sales}:{products:Product[];sales:SaleRecord[]}) {
 const candidates=products.map(p=>{const margin=p.retail?(p.retail-p.cost)/p.retail:0;const promo=p.retail*.9;const promoMargin=promo?(promo-p.cost)/promo:0;return {...p,margin,promo,promoMargin}}).filter(p=>p.margin>=.3&&p.promoMargin>=.15).slice(0,8);
 const [selected,setSelected]=React.useState(candidates[0]?.id??0); const p=candidates.find(x=>x.id===selected);
 const [days,setDays]=React.useState(7);
 const message=p?'OFERTA DIFARMAS - '+p.name+' - Precio especial: '+money(p.promo)+' - Ahorras: '+money(p.retail-p.promo)+' - Valida por '+days+' dias. Pregunta por disponibilidad!':'';
 return <section className="card"><div className="card-title"><div><h3>Centro de campañas</h3><p>Convierte una recomendación rentable en una campaña lista para comunicar.</p></div><Megaphone size={20}/></div>{p?<><div className="form-grid"><label>Producto<select value={selected} onChange={e=>setSelected(Number(e.target.value))}>{candidates.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Vigencia (días)<input type="number" min="1" value={days} onChange={e=>setDays(Number(e.target.value))}/></label></div><div className="alert"><strong>Precio promocional:</strong> {money(p.promo)} · <strong>Ahorro:</strong> {money(p.retail-p.promo)} · <strong>Margen:</strong> {(p.promoMargin*100).toFixed(1)}%</div><div className="alert"><strong>Texto sugerido:</strong><br/>{message}</div><button className="primary" onClick={()=>navigator.clipboard?.writeText(message)}>Copiar mensaje</button></>:<div className="alert">No hay productos que cumplan las condiciones para una campaña.</div>}</section>;
}

function BundlePromotionEngine({products,sales}:{products:Product[];sales:SaleRecord[]}) {
 const sold=new Map<number,number>(); sales.forEach(s=>(s.items||[]).forEach(i=>sold.set(i.productId,(sold.get(i.productId)||0)+i.qty)));
 const active=products.map(p=>({...p,units:sold.get(p.id)||0,margin:p.retail?(p.retail-p.cost)/p.retail:0})).filter(p=>p.units>0).sort((a,b)=>b.margin-a.margin);
 const bundles=active.slice(0,5).flatMap((a,i)=>active.slice(i+1,7).map(b=>{const price=a.retail+b.retail;const cost=a.cost+b.cost;const bundle=price*.9;const margin=bundle?(bundle-cost)/bundle:0;return {a,b,price,bundle,margin}})).filter(x=>x.margin>=.2).sort((a,b)=>b.margin-a.margin).slice(0,6);
 return <section className="card"><div className="card-title"><div><h3>Combos y promociones por productos</h3><p>Propone paquetes con descuento manteniendo un margen conjunto saludable.</p></div><ShoppingBag size={20}/></div><div className="metrics-grid"><div className="metric"><span>Combos sugeridos</span><strong>{bundles.length}</strong></div><div className="metric"><span>Descuento evaluado</span><strong>10%</strong></div><div className="metric"><span>Margen mínimo</span><strong>20%</strong></div></div><div className="table-wrap"><table><thead><tr><th>Combo</th><th>Precio normal</th><th>Precio combo</th><th>Ahorro</th><th>Margen conjunto</th><th>Recomendación</th></tr></thead><tbody>{bundles.map((x,i)=><tr key={i}><td><strong>{x.a.name} + {x.b.name}</strong></td><td>{money(x.price)}</td><td>{money(x.bundle)}</td><td>{money(x.price-x.bundle)}</td><td>{(x.margin*100).toFixed(1)}%</td><td>Promocionar combo</td></tr>)}</tbody></table></div></section>;
}

function PromotionEngine({products,sales}:{products:Product[];sales:SaleRecord[]}) {
 const sold=new Map<number,number>(); sales.forEach(s=>(s.items||[]).forEach(i=>sold.set(i.productId,(sold.get(i.productId)||0)+i.qty)));
 const rows=products.map(p=>{const units=sold.get(p.id)||0;const margin=p.retail?(p.retail-p.cost)/p.retail:0;const promo10=p.retail*.9;const promoMargin=promo10?(promo10-p.cost)/promo10:0;const promo15=p.retail*.85;const promo15Margin=promo15?(promo15-p.cost)/promo15:0;const opportunity=units<3&&margin>=.3;const recommendation=opportunity&&promo15Margin>=.15?'15% de descuento':opportunity&&promoMargin>=.15?'10% de descuento':'No promocionar';return {...p,units,margin,promoMargin,promo15Margin,opportunity,recommendation}}).filter(r=>r.opportunity).sort((a,b)=>b.margin-a.margin);
 return <section className="card"><div className="card-title"><div><h3>Motor de promociones inteligentes</h3><p>Sugiere promociones para productos con margen saludable y baja rotación.</p></div><Megaphone size={20}/></div><div className="metrics-grid"><div className="metric"><span>Oportunidades</span><strong>{rows.length}</strong></div><div className="metric"><span>Con 10% de descuento</span><strong>{rows.filter(r=>r.promoMargin>=.15).length}</strong></div><div className="metric"><span>Margen objetivo mínimo</span><strong>15%</strong></div></div><div className="table-wrap"><table><thead><tr><th>Producto</th><th>Precio</th><th>Margen</th><th>Unidades vendidas</th><th>Promoción sugerida</th><th>Margen promo</th></tr></thead><tbody>{rows.slice(0,10).map(r=><tr key={r.id}><td><strong>{r.name}</strong></td><td>{money(r.retail)}</td><td>{(r.margin*100).toFixed(1)}%</td><td>{r.units}</td><td>{r.recommendation}</td><td>{r.recommendation==='15% de descuento'?(r.promo15Margin*100).toFixed(1):r.recommendation==='10% de descuento'?(r.promoMargin*100).toFixed(1):'—'}{r.recommendation!=='No promocionar'?'%':''}</td></tr>)}</tbody></table></div></section>;
}

function ProductPriorityRanking({products,sales}:{products:Product[];sales:SaleRecord[]}) {
 const sold=new Map<number,number>(); const profit=new Map<number,number>(); sales.forEach(s=>(s.items||[]).forEach(i=>{sold.set(i.productId,(sold.get(i.productId)||0)+i.qty);profit.set(i.productId,(profit.get(i.productId)||0)+i.profit)}));
 const rows=products.map(p=>{const units=sold.get(p.id)||0;const totalProfit=profit.get(p.id)||0;const margin=p.retail?(p.retail-p.cost)/p.retail:0;const rotation=Math.min(units/10,1);const marginScore=Math.min(margin/.4,1);const stockScore=p.stock>0?Math.min(units/Math.max(p.stock,1),1):1;const score=Math.round((rotation*.35+marginScore*.35+Math.min(totalProfit/1000,1)*.2+stockScore*.1)*100);const action=score>=75?'PRIORIDAD ALTA':score>=50?'PRIORIDAD MEDIA':'BAJA PRIORIDAD';return {...p,units,totalProfit,margin,score,action}}).filter(r=>r.units>0||r.totalProfit>0).sort((a,b)=>b.score-a.score));
 return <section className="card"><div className="card-title"><div><h3>Ranking inteligente de productos</h3><p>Prioriza productos según rotación, margen y utilidad registrada.</p></div><Award size={20}/></div><div className="metrics-grid"><div className="metric"><span>Prioridad alta</span><strong>{rows.filter(r=>r.score>=75).length}</strong></div><div className="metric"><span>Utilidad acumulada</span><strong>{money(rows.reduce((s,r)=>s+r.totalProfit,0))}</strong></div><div className="metric"><span>Productos evaluados</span><strong>{rows.length}</strong></div></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Producto</th><th>Puntaje</th><th>Unidades</th><th>Margen</th><th>Utilidad</th><th>Acción</th></tr></thead><tbody>{rows.slice(0,10).map((r,i)=><tr key={r.id}><td>{i+1}</td><td><strong>{r.name}</strong></td><td>{r.score}/100</td><td>{r.units}</td><td>{(r.margin*100).toFixed(1)}%</td><td>{money(r.totalProfit)}</td><td>{r.action}</td></tr>)}</tbody></table></div></section>;
}

function StockProfitability({products,sales}:{products:Product[];sales:SaleRecord[]}) {
 const sold=new Map<number,number>(); sales.forEach(s=>(s.items||[]).forEach(i=>sold.set(i.productId,(sold.get(i.productId)||0)+i.qty)));
 const rows=products.map(p=>{const units=sold.get(p.id)||0;const margin=p.retail?(p.retail-p.cost)/p.retail:0;const monthly=units/3;const coverage=monthly>0?p.stock/monthly:Infinity;const score=units*p.retail*margin;const action=units===0?'Reducir compra':coverage<1?'Comprar ahora':coverage<2?'Planificar compra':'Mantener';return {...p,units,margin,coverage,score,action}}).sort((a,b)=>b.score-a.score);
 const buy=rows.filter(r=>r.action==='Comprar ahora').length;
 return <section className="card"><div className="card-title"><div><h3>Rotación + margen + inventario</h3><p>Combina ventas detalladas, rentabilidad y stock para priorizar compras.</p></div><Package size={20}/></div><div className="metrics-grid"><div className="metric"><span>Comprar ahora</span><strong>{buy}</strong></div><div className="metric"><span>Alta oportunidad</span><strong>{rows.filter(r=>r.score>0).length}</strong></div><div className="metric"><span>Productos sin ventas</span><strong>{rows.filter(r=>r.units===0).length}</strong></div></div><div className="table-wrap"><table><thead><tr><th>Producto</th><th>Unidades vendidas</th><th>Stock</th><th>Margen</th><th>Cobertura aprox.</th><th>Acción</th></tr></thead><tbody>{rows.slice(0,15).map(r=><tr key={r.id}><td><strong>{r.name}</strong></td><td>{r.units}</td><td>{r.stock}</td><td>{(r.margin*100).toFixed(1)}%</td><td>{Number.isFinite(r.coverage)?r.coverage.toFixed(1)+' meses':'Sin rotación'}</td><td>{r.action}</td></tr>)}</tbody></table></div></section>;
}

function ProfitabilityDecisionCenter({products,sales}:{products:Product[];sales:SaleRecord[]}) {
 const units=new Map<number,number>(); sales.forEach(s=>(s.items||[]).forEach(i=>units.set(i.productId,(units.get(i.productId)||0)+i.qty)));
 const rows=products.map(p=>{const margin=p.retail?(p.retail-p.cost)/p.retail:0;const sold=units.get(p.id)||0;const suggested=p.cost/.7;const gap=Math.max(0,suggested-p.retail);const priority=margin<.2?'URGENTE':margin<.3?'REVISAR':sold>0?'RENTABLE':'SIN VENTAS';return {...p,margin,sold,suggested,gap,priority}}).sort((a,b)=>{const rank=(x:string)=>x==='URGENTE'?0:x==='REVISAR'?1:x==='SIN VENTAS'?2:3;return rank(a.priority)-rank(b.priority)});
 const urgent=rows.filter(r=>r.priority==='URGENTE').length, review=rows.filter(r=>r.priority==='REVISAR').length, opportunity=rows.reduce((s,r)=>s+r.gap,0);
 return <section className="card"><div className="card-title"><div><h3>Centro de decisiones de rentabilidad</h3><p>Prioriza dónde actuar para proteger y aumentar la utilidad.</p></div><Target size={20}/></div><div className="metrics-grid"><div className="metric"><span>Acción urgente</span><strong>{urgent}</strong></div><div className="metric"><span>Para revisar</span><strong>{review}</strong></div><div className="metric"><span>Oportunidad de precio</span><strong>{money(opportunity)}</strong></div></div><div className="table-wrap"><table><thead><tr><th>Prioridad</th><th>Producto</th><th>Margen</th><th>Ventas unidades</th><th>Precio actual</th><th>Precio sugerido</th><th>Acción</th></tr></thead><tbody>{rows.slice(0,15).map(r=><tr key={r.id}><td><strong>{r.priority}</strong></td><td>{r.name}</td><td>{(r.margin*100).toFixed(1)}%</td><td>{r.sold}</td><td>{money(r.retail)}</td><td>{money(r.suggested)}</td><td>{r.priority==='URGENTE'?'Subir precio y revisar costo':r.priority==='REVISAR'?'Evaluar aumento':'Mantener seguimiento'}</td></tr>)}</tbody></table></div></section>;
}

function CostImpactAlerts({products}:{products:Product[]}) {
 const rows=products.map(p=>{const target=p.cost/.7;const currentMargin=p.retail?(p.retail-p.cost)/p.retail:0;const profit=p.retail-p.cost;const targetProfit=p.retail-p.cost;const loss=Math.max(0,target-profit);const alert=currentMargin<.2;return {...p,target,currentMargin,loss,alert}});
 const alerts=rows.filter(x=>x.alert);
 return <section className="card"><div className="card-title"><div><h3>Alertas por impacto de costos</h3><p>Identifica productos cuyo costo está presionando la rentabilidad.</p></div><AlertTriangle size={20}/></div><div className="metrics-grid"><div className="metric"><span>Productos en alerta</span><strong>{alerts.length}</strong></div><div className="metric"><span>Margen mínimo</span><strong>20%</strong></div><div className="metric"><span>Productos revisados</span><strong>{rows.length}</strong></div></div>{alerts.length===0?<div className="alert">No hay productos por debajo del margen mínimo.</div>:<div className="table-wrap"><table><thead><tr><th>Producto</th><th>Costo</th><th>Precio actual</th><th>Margen</th><th>Precio para 30%</th><th>Aumento</th></tr></thead><tbody>{alerts.map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{money(x.cost)}</td><td>{money(x.retail)}</td><td>{(x.currentMargin*100).toFixed(1)}%</td><td>{money(x.target)}</td><td>{x.target>x.retail?money(x.target-x.retail):money(0)}</td></tr>)}</tbody></table></div>}</section>;
}

function PriceHistory({products}:{products:Product[]}) {
 const [changes,setChanges]=React.useState<{id:number;productId:number;productName:string;oldPrice:number;newPrice:number;oldMargin:number;newMargin:number;date:string}[]>(()=>JSON.parse(localStorage.getItem('difarmas_price_history')||'[]'));
 const [selected,setSelected]=React.useState(products[0]?.id??0);
 const p=products.find(x=>x.id===selected);
 const [newPrice,setNewPrice]=React.useState(p?.retail??0);
 React.useEffect(()=>{if(p)setNewPrice(p.retail)},[selected]);
 const save=()=>{if(!p||newPrice<=0||newPrice===p.retail)return;const oldMargin=(p.retail-p.cost)/p.retail;const newMargin=(newPrice-p.cost)/newPrice;const item={id:Date.now(),productId:p.id,productName:p.name,oldPrice:p.retail,newPrice,oldMargin,newMargin,date:new Date().toISOString()};const next=[item,...changes];setChanges(next);localStorage.setItem('difarmas_price_history',JSON.stringify(next));};
 return <section className="card"><div className="card-title"><div><h3>Historial de cambios de precios</h3><p>Registra la evolución del precio y del margen por producto.</p></div><History size={20}/></div><div className="form-grid"><label>Producto<select value={selected} onChange={e=>setSelected(Number(e.target.value))}>{products.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Nuevo precio minorista<input type="number" min="0" step="0.01" value={newPrice} onChange={e=>setNewPrice(Number(e.target.value))}/></label></div><button className="primary" onClick={save}>Registrar cambio</button><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Anterior</th><th>Nuevo</th><th>Margen anterior</th><th>Margen nuevo</th></tr></thead><tbody>{changes.slice(0,10).map(x=><tr key={x.id}><td>{new Date(x.date).toLocaleDateString()}</td><td>{x.productName}</td><td>{money(x.oldPrice)}</td><td>{money(x.newPrice)}</td><td>{(x.oldMargin*100).toFixed(1)}%</td><td>{(x.newMargin*100).toFixed(1)}%</td></tr>)}</tbody></table></div></section>;
}

function PriceRecommendations({products}:{products:Product[]}) {
 const rows=products.map(p=>{const retailMargin=p.retail?(p.retail-p.cost)/p.retail:0;const wholesaleMargin=p.wholesale?(p.wholesale-p.cost)/p.wholesale:0;const target=p.cost/.7;const increase=target>p.retail?(target-p.retail)/p.retail:0;const status=retailMargin<.2||wholesaleMargin<.15?'Precio demasiado bajo':retailMargin<.3?'Considerar aumento':'Mantener precio';return {...p,retailMargin,wholesaleMargin,target,increase,status}}).sort((a,b)=>a.retailMargin-b.retailMargin);
 return <section className="card"><div className="card-title"><div><h3>Recomendación automática de precios</h3><p>Prioriza los productos donde el margen puede mejorar.</p></div><TrendingUp size={20}/></div><div className="metrics-grid"><div className="metric"><span>Subir precio</span><strong>{rows.filter(r=>r.status!=='Mantener precio').length}</strong></div><div className="metric"><span>Margen objetivo</span><strong>30%</strong></div><div className="metric"><span>Margen minorista promedio</span><strong>{(rows.reduce((s,r)=>s+r.retailMargin,0)/(rows.length||1)*100).toFixed(1)}%</strong></div></div><div className="table-wrap"><table><thead><tr><th>Producto</th><th>Precio actual</th><th>Precio sugerido</th><th>Margen actual</th><th>Cambio</th><th>Acción</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.name}</strong></td><td>{money(r.retail)}</td><td>{money(r.target)}</td><td>{(r.retailMargin*100).toFixed(1)}%</td><td>{r.increase>0?('+'+(r.increase*100).toFixed(1)+'%'):'0%'}</td><td><span className="badge">{r.status}</span></td></tr>)}</tbody></table></div></section>;
}

function PriceSimulator({products}:{products:Product[]}) {
 const [selected,setSelected]=React.useState(products[0]?.id??0);
 const product=products.find(p=>p.id===selected);
 const [price,setPrice]=React.useState(product?.retail??0);
 React.useEffect(()=>{if(product)setPrice(product.retail)},[selected]);
 if(!product)return null;
 const margin=price>0?(price-product.cost)/price:0;
 const unitProfit=price-product.cost;
 const monthlyUnits=10;
 const monthlyProfit=unitProfit*monthlyUnits;
 const target30=product.cost/.7;
 return <section className="card"><div className="card-title"><div><h3>Simulador de precios</h3><p>Prueba cambios de precio antes de aplicarlos al catálogo.</p></div><Calculator size={20}/></div><div className="form-grid"><label>Producto<select value={selected} onChange={e=>setSelected(Number(e.target.value))}>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Nuevo precio minorista<input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(Number(e.target.value))}/></label></div><div className="metrics-grid"><div className="metric"><span>Costo</span><strong>{money(product.cost)}</strong></div><div className="metric"><span>Precio actual</span><strong>{money(product.retail)}</strong></div><div className="metric"><span>Nuevo margen</span><strong>{(margin*100).toFixed(1)}%</strong></div><div className="metric"><span>Utilidad por unidad</span><strong>{money(unitProfit)}</strong></div></div><div className="alert"><strong>Referencia:</strong> con 10 unidades/mes, la utilidad sería {money(monthlyProfit)} al mes. Precio para 30% de margen: <strong>{money(target30)}</strong>.</div></section>;
}

function PriceControl({products}:{products:Product[]}) {
 const rows=products.map(p=>{const retailMargin=p.retail?p.retail-p.cost:0;const retailPct=p.retail?p.retailMargin/p.retail:0;const wholesalePct=p.wholesale?p.wholesaleMargin/p.wholesale:0:0;return {...p,retailPct,wholesalePct,minPrice:p.cost/(1-.2)}}); 
 const risk=rows.filter(p=>p.retailPct<.2||p.wholesalePct<.15);
 return <section className="card"><div className="card-title"><div><h3>Control inteligente de precios</h3><p>Detecta márgenes bajos y establece un precio mínimo de referencia.</p></div><DollarSign size={20}/></div><div className="metrics-grid"><div className="metric"><span>Productos revisados</span><strong>{rows.length}</strong></div><div className="metric"><span>En riesgo</span><strong>{risk.length}</strong></div></div><div className="table-wrap"><table><thead><tr><th>Producto</th><th>Costo</th><th>Minorista</th><th>Margen minorista</th><th>Mayorista</th><th>Margen mayorista</th><th>Mínimo 20%</th></tr></thead><tbody>{rows.map(p=><tr key={p.id}><td><strong>{p.name}</strong></td><td>{money(p.cost)}</td><td>{money(p.retail)}</td><td>{(p.retailPct*100).toFixed(1)}%</td><td>{money(p.wholesale)}</td><td>{(p.wholesalePct*100).toFixed(1)}%</td><td>{money(p.minPrice)}</td></tr>)}</tbody></table></div></section>;
}

function AdvancedProfitability({products,sales}:{products:Product[];sales:SaleRecord[]}) {
 const data=useMemo(()=>products.map(p=>{const lines=sales.flatMap(s=>s.items||[]).filter(i=>i.productId===p.id);const revenue=lines.reduce((a,i)=>a+i.revenue,0);const cost=lines.reduce((a,i)=>a+i.cost,0);const profit=revenue-cost;const margin=revenue?profit/revenue:0;return {...p,revenue,profit,margin,suggested:p.cost/(1-.3)}}).filter(p=>p.revenue>0).sort((a,b)=>b.profit-a.profit),[products,sales]);
 const revenue=data.reduce((a,p)=>a+p.revenue,0),profit=data.reduce((a,p)=>a+p.profit,0),low=data.filter(p=>p.margin<.2).length;
 return <section className="card"><div className="card-title"><div><h3>Rentabilidad avanzada</h3><p>Detecta margen bajo y oportunidades de precio.</p></div><DollarSign size={20}/></div><div className="metrics-grid"><div className="metric"><span>Ventas analizadas</span><strong>{money(revenue)}</strong></div><div className="metric"><span>Utilidad bruta</span><strong>{money(profit)}</strong></div><div className="metric"><span>Margen</span><strong>{revenue?(profit/revenue*100).toFixed(1):0}%</strong></div></div><div className="alert"><div className="dot danger"/><div><strong>Margen bajo</strong><p>{low} producto(s) están por debajo del 20%.</p></div></div><div className="table-wrap"><table><thead><tr><th>Producto</th><th>Ventas</th><th>Utilidad</th><th>Margen</th><th>Precio 30%</th></tr></thead><tbody>{data.slice(0,15).map(p=><tr key={p.id}><td><strong>{p.name}</strong></td><td>{money(p.revenue)}</td><td>{money(p.profit)}</td><td>{(p.margin*100).toFixed(1)}%</td><td>{money(p.suggested)}</td></tr>)}</tbody></table></div></section>;
}

function ManagementAssistant({sales,monthlyGoal,products}:{sales:SaleRecord[];monthlyGoal:number;products:Product[]}) {
 const now=new Date(), day=now.getDate(), dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
 const month=sales.filter(s=>{const d=new Date(s.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()});
 const sold=month.reduce((a,s)=>a+s.total,0), remain=Math.max(0,monthlyGoal-sold), days=Math.max(1,dim-day+1), daily=remain/days, avg=month.length?month.reduce((a,s)=>a+s.total,0)/Math.max(1,day):0;
 const pace=avg*dim, status=pace>=monthlyGoal?'En camino a la meta':'Por debajo del ritmo';
 const top=[...new Map<number,number>(month.flatMap(s=>s.items||[]).map(i=>[i.productId,0])).keys()].map(id=>{const p=products.find(x=>x.id===id);const units=month.reduce((a,s)=>a+(s.items?.filter(i=>i.productId===id).reduce((q,i)=>q+i.qty,0)||0),0);return {p,units}}).filter(x=>x.p).sort((a,b)=>b.units-a.units).slice(0,5);
 return <section className="card"><div className="card-title"><div><h3>Asistente gerencial</h3><p>Resumen automático para decidir qué hacer hoy.</p></div><Activity size={20}/></div>
 <div className="metrics-grid"><div className="metric"><span>Venta del mes</span><strong>{money(sold)}</strong></div><div className="metric"><span>Falta para meta</span><strong>{money(remain)}</strong></div><div className="metric"><span>Venta diaria necesaria</span><strong>{money(daily)}</strong></div></div>
 <div className="alert"><div className={"dot "+(status==='En camino a la meta'?'info':'danger')}/><div><strong>{status}</strong><p>Proyección actual: {money(pace)}. Para cerrar la brecha, prioriza {money(daily)} en ventas por día durante los días restantes.</p></div></div>
 <div className="table-wrap"><table><thead><tr><th>Prioridad comercial</th><th>Producto</th><th>Unidades</th><th>Acción</th></tr></thead><tbody>{top.map(x=><tr key={x.p!.id}><td>Alta</td><td>{x.p!.name}</td><td>{x.units}</td><td>Impulsar venta</td></tr>)}</tbody></table></div>
 </section>;
}

function OpportunityCenter({customers,sales,products}:{customers:Customer[];sales:SaleRecord[];products:Product[]}) {
 const rows=useMemo(()=>customers.flatMap(c=>{const ss=sales.filter(s=>s.customer===c.name&&s.items?.length);const counts=new Map<number,number>();ss.forEach(s=>s.items?.forEach(i=>counts.set(i.productId,(counts.get(i.productId)||0)+i.qty)));return [...counts.entries()].map(([id,qty])=>{const p=products.find(x=>x.id===id);if(!p)return null;const last=ss.map(s=>new Date(s.date).getTime()).sort((a,b)=>b-a)[0]||0;const days=Math.floor((Date.now()-last)/86400000);const opportunity=Math.max(0,days-30)*Math.max(0,p.retail-p.cost);return {customer:c.name,product:p.name,days,qty,margin:p.retail-p.cost,opportunity}}).filter(Boolean)}).filter((r:any)=>r.days>=30).sort((a:any,b:any)=>b.opportunity-a.opportunity),[customers,sales,products]);
 return <section className="card"><div className="card-title"><div><h3>Centro de oportunidades</h3><p>Combina cliente, historial, inventario y margen para priorizar ventas.</p></div><DollarSign size={20}/></div>
 <div className="metrics-grid"><div className="metric"><span>Oportunidades</span><strong>{rows.length}</strong></div><div className="metric"><span>Margen potencial</span><strong>{money(rows.slice(0,10).reduce((a:any,r:any)=>a+r.margin,0))}</strong></div></div>
 {rows.length?<div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Producto</th><th>Días</th><th>Margen/u.</th><th>Prioridad</th></tr></thead><tbody>{rows.slice(0,12).map((r:any,i:number)=><tr key={i}><td><strong>{r.customer}</strong></td><td>{r.product}</td><td>{r.days}</td><td>{money(r.margin)}</td><td>{r.days>90?'Alta':r.days>60?'Media':'Normal'}</td></tr>)}</tbody></table></div>:<div className="empty">No hay oportunidades suficientes con los datos registrados.</div>}
 </section>;
}

function CustomerRecommendations({customers,sales,products}:{customers:Customer[];sales:SaleRecord[];products:Product[]}) {
 const rows=customers.map(c=>{const ss=sales.filter(s=>s.customer===c.name&&s.items?.length);const counts=new Map<number,number>();ss.forEach(s=>s.items?.forEach(i=>counts.set(i.productId,(counts.get(i.productId)||0)+i.qty)));const top=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0];const last=ss.map(s=>new Date(s.date).getTime()).sort((a,b)=>b-a)[0];const days=last?Math.floor((Date.now()-last)/86400000):999;const product=top?products.find(p=>p.id===top[0]):undefined;return {...c,days,product,qty:top?.[1]||0}}).filter(r=>r.product&&r.days>=30).sort((a,b)=>b.days-a.days);
 return <section className="card"><div className="card-title"><div><h3>Recomendaciones comerciales</h3><p>Clientes con historial de productos y más de 30 días sin comprar.</p></div><TrendingUp size={20}/></div>
 {rows.length?<div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Producto recomendado</th><th>Compras previas</th><th>Última compra</th><th>Acción</th></tr></thead><tbody>{rows.slice(0,15).map(r=><tr key={r.id}><td><strong>{r.name}</strong></td><td>{r.product?.name}</td><td>{r.qty} unidades</td><td>{r.days} días</td><td><button className="secondary" onClick={()=>navigator.clipboard?.writeText('Hola '+r.name+', tenemos disponible '+r.product?.name+'.')}>Preparar contacto</button></td></tr>)}</tbody></table></div>:<div className="empty">Aún no hay recomendaciones suficientes con ventas detalladas.</div>}
 </section>;
}

function CustomerInsights({customers,sales}:{customers:Customer[];sales:SaleRecord[]}) {
 const today=new Date(); const rows=customers.map(c=>{const ss=sales.filter(s=>s.customer===c.name);const total=ss.reduce((a,s)=>a+s.total,0);const dates=ss.map(s=>new Date(s.date).getTime()).filter(Boolean);const last=dates.length?new Date(Math.max(...dates)):null;const days=last?Math.floor((today.getTime()-last.getTime())/86400000):999;let status=ss.length===0?'Sin compras':days>60?'Inactivo':days>30?'En riesgo':'Activo';return {...c,total,orders:ss.length,days,status}}).sort((a,b)=>b.total-a.total);
 const active=rows.filter(r=>r.status==='Activo').length, risk=rows.filter(r=>r.status==='En riesgo').length, inactive=rows.filter(r=>r.status==='Inactivo').length;
 return <section className="card"><div className="card-title"><div><h3>Inteligencia comercial</h3><p>Detecta clientes activos, en riesgo e inactivos según su última compra.</p></div><TrendingUp size={20}/></div>
 <div className="metrics-grid"><div className="metric"><span>Activos</span><strong>{active}</strong></div><div className="metric"><span>En riesgo</span><strong>{risk}</strong></div><div className="metric"><span>Inactivos</span><strong>{inactive}</strong></div></div>
 <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Compras</th><th>Pedidos</th><th>Última actividad</th><th>Estado</th></tr></thead><tbody>{rows.slice(0,15).map(r=><tr key={r.id}><td><strong>{r.name}</strong></td><td>{money(r.total)}</td><td>{r.orders}</td><td>{r.orders?r.days+' días atrás':'Sin compras'}</td><td><span className="badge">{r.status}</span></td></tr>)}</tbody></table></div></section>;
}

function CustomerCRM({customers,setCustomers,sales}:{customers:Customer[];setCustomers:React.Dispatch<React.SetStateAction<Customer[]>>;sales:SaleRecord[]}) {
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[limit,setLimit]=useState('0');
 const rows=customers.map(c=>{const ss=sales.filter(s=>s.customer===c.name);return {...c,total:ss.reduce((a,s)=>a+s.total,0),orders:ss.length,last:ss.map(s=>s.date).sort().pop()||''}}).sort((a,b)=>b.total-a.total);
 const add=()=>{if(!name.trim())return;setCustomers(v=>[...v,{id:Date.now(),name:name.trim(),phone,creditLimit:Number(limit)||0,active:true,notes:''}]);setName('');setPhone('');setLimit('0')};
 return <section className="card"><div className="card-title"><div><h3>Clientes / CRM</h3><p>Historial comercial y control básico de crédito.</p></div><Users size={20}/></div>
 <div className="form-grid"><input placeholder="Nombre" value={name} onChange={e=>setName(e.target.value)}/><input placeholder="Teléfono" value={phone} onChange={e=>setPhone(e.target.value)}/><input type="number" placeholder="Límite de crédito" value={limit} onChange={e=>setLimit(e.target.value)}/><button className="primary" onClick={add}><Plus size={16}/>Agregar</button></div>
 <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Compras</th><th>Pedidos</th><th>Última compra</th><th>Límite</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td><strong>{c.name}</strong></td><td>{c.phone||'—'}</td><td>{money(c.total)}</td><td>{c.orders}</td><td>{c.last||'Sin compras'}</td><td>{money(c.creditLimit)}</td></tr>)}</tbody></table></div></section>;
}

function SmartAlerts({products,sales,receivables,payables,monthlyGoal}:{products:Product[];sales:SaleRecord[];receivables:Receivable[];payables:Payable[];monthlyGoal:number}) {
  const now=new Date(); const today=now.toISOString().slice(0,10); const daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(); const remaining=Math.max(1,daysInMonth-now.getDate()+1);
  const monthSales=sales.filter(s=>{const d=new Date(s.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}).reduce((a,s)=>a+s.total,0);
  const required=Math.max(0,(monthlyGoal-monthSales)/remaining);
  const low=products.filter(p=>p.stock<=p.minStock);
  const expiring=products.filter(p=>{const d=(new Date(p.expiry+'T00:00:00').getTime()-now.getTime())/86400000;return d>=0&&d<=90;});
  const overdue=receivables.filter(r=>r.paid<r.total&&r.dueDate<today);
  const due=payables.filter(r=>r.paid<r.total&&r.dueDate<=new Date(now.getTime()+7*86400000).toISOString().slice(0,10));
  const sold=useMemo(()=>{const m=new Map<number,number>();sales.forEach(s=>s.items?.forEach(i=>m.set(i.productId,(m.get(i.productId)||0)+i.qty));return m},[sales]);
  const noSales=products.filter(p=>p.stock>p.minStock&&(sold.get(p.id)||0)===0);
  const alerts=[['danger','Meta diaria',required>monthlyGoal/26?money(required)+' por día para alcanzar la meta.':'Ritmo compatible con la meta de referencia.'],['warning','Stock bajo',low.length?low.length+' producto(s) requieren reposición.':'Sin productos bajo mínimo.'],['warning','Próximos a vencer',expiring.length?expiring.length+' producto(s) vencen en 90 días o menos.':'Sin vencimientos próximos.'],['danger','Cobros vencidos',overdue.length?overdue.length+' cuenta(s) están vencidas.':'Sin cuentas vencidas.'],['warning','Pagos próximos',due.length?due.length+' cuenta(s) vencen en 7 días.':'Sin pagos próximos.'],['info','Baja rotación',noSales.length?noSales.length+' producto(s) no registran ventas detalladas.':'Sin alertas de baja rotación.']];
  return <section className="card"><div className="card-title"><div><h3>Alertas inteligentes</h3><p>Prioridades operativas detectadas automáticamente.</p></div><AlertTriangle size={20}/></div><div className="dashboard-grid">{alerts.map(([level,title,text])=><div className="alert" key={title}><div className={"dot "+level}/><div><strong>{title}</strong><p>{text}</p></div></div>)}</div><div className="alert"><div className="dot info"/><div><strong>Ventas restantes</strong><p>{money(Math.max(0,monthlyGoal-monthSales))} para completar la meta. Recomendación: {money(required)} diarios durante los días restantes.</p></div></div></section>;
}

function ManagementReports({sales,expenses}:{sales:SaleRecord[];expenses:Expense[]}) {
  const monthly=useMemo(()=>{
    const map=new Map<string,{sales:number;profit:number;expenses:number}>();
    sales.forEach(s=>{const key=new Date(s.date).toLocaleDateString('es-HN',{month:'short',year:'numeric'});const x=map.get(key)||{sales:0,profit:0,expenses:0};x.sales+=s.total;x.profit+=s.profit;map.set(key,x);});
    expenses.forEach(e=>{const key=new Date(e.date).toLocaleDateString('es-HN',{month:'short',year:'numeric'});const x=map.get(key)||{sales:0,profit:0,expenses:0};x.expenses+=e.amount;map.set(key,x);});
    return [...map.entries()].map(([month,x])=>({month,...x,net:x.profit-x.expenses})).slice(-12);
  },[sales,expenses]);
  const totalSales=sales.reduce((a,s)=>a+s.total,0);
  const totalProfit=sales.reduce((a,s)=>a+s.profit,0);
  const totalExpenses=expenses.reduce((a,e)=>a+e.amount,0);
  const topProducts=useMemo(()=>{const m=new Map<string,{name:string;units:number;profit:number}>();sales.forEach(s=>s.items?.forEach(i=>{const x=m.get(i.productName)||{name:i.productName,units:0,profit:0};x.units+=i.qty;x.profit+=i.profit;m.set(i.productName,x)}));return [...m.values()].sort((a,b)=>b.profit-a.profit).slice(0,5)},[sales]);
  return <section className="card"><div className="card-title"><div><h3>Reportes gerenciales</h3><p>Ventas, utilidad y resultado por período.</p></div><TrendingUp size={20}/></div>
    <div className="grid metrics"><article className="card metric"><span>Ventas acumuladas</span><strong>{money(totalSales)}</strong></article><article className="card metric"><span>Utilidad bruta</span><strong>{money(totalProfit)}</strong></article><article className="card metric"><span>Gastos</span><strong>{money(totalExpenses)}</strong></article><article className="card metric"><span>Resultado</span><strong>{money(totalProfit-totalExpenses)}</strong></article></div>
    <div className="table-wrap"><table><thead><tr><th>Mes</th><th>Ventas</th><th>Utilidad</th><th>Gastos</th><th>Resultado</th><th>Margen</th></tr></thead><tbody>{monthly.length?monthly.map(x=><tr key={x.month}><td><strong>{x.month}</strong></td><td>{money(x.sales)}</td><td>{money(x.profit)}</td><td>{money(x.expenses)}</td><td>{money(x.net)}</td><td>{x.sales?((x.profit/x.sales)*100).toFixed(1):'0.0'}%</td></tr>):<tr><td colSpan={6}>Aún no hay datos.</td></tr>}</tbody></table></div>
    <div className="finance-grid"><div className="card"><div className="card-title"><div><h3>Top productos rentables</h3><p>Ordenados por utilidad registrada.</p></div></div>{topProducts.length?topProducts.map((p,i)=><div className="expense-row" key={p.name}><div><strong>#{i+1} {p.name}</strong><small>{p.units} unidades</small></div><strong>{money(p.profit)}</strong></div>):<div className="cart-empty">Registra nuevas ventas para generar el ranking.</div>}</div></div>
  </section>;
}

function ModulePlaceholder({name}:{name:string}) { return <div className="content"><div className="empty card"><Boxes size={42}/><h2>{name}</h2><p>Este módulo está preparado en la navegación. Será construido en la siguiente fase del MVP.</p><span className="pill">PRÓXIMO MÓDULO</span></div></div> }

export default App;
