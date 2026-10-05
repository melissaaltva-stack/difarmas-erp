import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Boxes, DollarSign, LayoutDashboard, Pencil, Plus, Search, ShoppingCart, TrendingUp, Wallet, X } from 'lucide-react';

type Module = 'dashboard' | 'ventas' | 'inventario' | 'compras' | 'finanzas';
type CartItem = Product & { qty: number; price: number };
type PurchaseItem = Product & { qty: number; unitCost: number };
type SaleRecord = { id:number; total:number; cost:number; profit:number; payment:string; type:string; date:string; customer?:string; dueDate?:string };
type Expense = { id:number; description:string; amount:number; category:string; date:string };
type Receivable = { id:number; saleId:number; customer:string; total:number; paid:number; dueDate:string; date:string };
type Payable = { id:number; supplier:string; total:number; paid:number; dueDate:string; date:string };
type CashClosure = { id:number; date:string; opening:number; cashSales:number; collections:number; expenses:number; supplierPayments:number; expected:number; counted:number; difference:number; note:string }; type CashMovement = { id:number; type:'Entrada'|'Salida'; description:string; amount:number; category:string; date:string };
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
  const [products, setProducts] = useState<Product[]>(() => { try { const saved = localStorage.getItem('difarmas_products'); return saved ? JSON.parse(saved) : initialProducts; } catch { return initialProducts; } });
  const [search, setSearch] = useState('');
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

  const recordSale = (sold: CartItem[], customer = '', dueDate = '') => { const id=Date.now(); const total=sold.reduce((a,i)=>a+i.price*i.qty,0); const cost=sold.reduce((a,i)=>a+i.cost*i.qty,0); setProducts(current=>current.map(p=>{const item=sold.find(x=>x.id===p.id);return item?{...p,stock:p.stock-item.qty}:p})); setSales(current=>[...current,{id,total,cost,profit:total-cost,payment,type:saleType,date:new Date().toISOString(),customer:payment==='Crédito'?customer:undefined,dueDate:payment==='Crédito'?dueDate:undefined}]); if(payment==='Crédito') setReceivables(current=>[...current,{id,saleId:id,customer,total,paid:0,dueDate,date:new Date().toISOString()}]); };

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
      {active === 'dashboard' ? <Dashboard products={products} sales={sales} expenses={expenses}/> : active === 'inventario' ? <Inventory products={filtered} search={search} setSearch={setSearch} onNew={() => { setEditing(null); setShowForm(true); }} onEdit={p => { setEditing(p); setShowForm(true); }} /> : active === 'ventas' ? <POS products={products} cart={cart} setCart={setCart} saleType={saleType} setSaleType={setSaleType} payment={payment} setPayment={setPayment} search={saleSearch} setSearch={setSaleSearch} onComplete={recordSale}/> : active === 'compras' ? <Purchases products={products} cart={purchaseCart} setCart={setPurchaseCart} search={purchaseSearch} setSearch={setPurchaseSearch} supplier={purchaseSupplier} setSupplier={setPurchaseSupplier} onReceive={(items,paymentMethod,dueDate)=>{setProducts(current=>current.map(p=>{const item=items.find(x=>x.id===p.id); return item?{...p,stock:p.stock+item.qty,cost:item.unitCost,supplier:purchaseSupplier||p.supplier}:p})); if(paymentMethod==='Crédito'){const total=items.reduce((a,i)=>a+i.unitCost*i.qty,0);setPayables(current=>[...current,{id:Date.now(),supplier:purchaseSupplier,total,paid:0,dueDate,date:new Date().toISOString()}]);}}}/> : active === 'finanzas' ? <Finance sales={sales} expenses={expenses} setExpenses={setExpenses} receivables={receivables} setReceivables={setReceivables} payables={payables} setPayables={setPayables}/> : <ModulePlaceholder name={nav.find(n => n[0] === active)?.[1] || ''}/>} 
      {showForm && <ProductModal product={editing} onClose={() => {setShowForm(false);setEditing(null)}} onSave={saveProduct}/>}
    </main>
  </div>;
}

function Dashboard({products,sales,expenses}:{products:Product[];sales:SaleRecord[];expenses:Expense[]}) {
  const salesTotal=sales.reduce((a,s)=>a+s.total,0);
  const grossProfit=sales.reduce((a,s)=>a+s.profit,0);
  const expenseTotal=expenses.reduce((a,e)=>a+e.amount,0);
  const netResult=grossProfit-expenseTotal;
  const inventoryValue=products.reduce((a,p)=>a+p.cost*p.stock,0);
  const lowStock=products.filter(p=>p.stock<=p.minStock);
  const todayKey=new Date().toDateString();
  const salesToday=sales.filter(s=>new Date(s.date).toDateString()===todayKey).reduce((a,s)=>a+s.total,0);
  const goal=100000;
  const dailyGoal=goal/26;
  const progress=Math.min(100,(salesTotal/goal)*100);
  const expiring=products.filter(p=>{const days=(new Date(p.expiry+'T00:00:00').getTime()-Date.now())/86400000;return days>=0&&days<=90;});
  const recentSales=[...sales].sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime()).slice(-7);
  const chartValues=recentSales.length?recentSales.map(s=>s.total):[0,0,0,0,0,0,0];
  const maxChart=Math.max(...chartValues,1);
  return <div className="content">
    <section className="hero"><div><span className="pill">MVP · DASHBOARD EN VIVO</span><h2>Controla DIFARMÁS desde un solo lugar.</h2><p>Indicadores conectados a ventas, gastos e inventario.</p></div><div className="hero-goal"><span>Meta mensual</span><strong>{money(goal)}</strong><small>{money(dailyGoal)} por día · {progress.toFixed(0)}% registrado</small></div></section>
    <section className="grid metrics">
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
function ModulePlaceholder({name}:{name:string}) { return <div className="content"><div className="empty card"><Boxes size={42}/><h2>{name}</h2><p>Este módulo está preparado en la navegación. Será construido en la siguiente fase del MVP.</p><span className="pill">PRÓXIMO MÓDULO</span></div></div> }

export default App;
