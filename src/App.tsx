import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Boxes, DollarSign, LayoutDashboard, Pencil, Plus, Search, ShoppingCart, TrendingUp, Wallet, X } from 'lucide-react';

type Module = 'dashboard' | 'ventas' | 'inventario' | 'compras' | 'finanzas';
type CartItem = Product & { qty: number; price: number };
type PurchaseItem = Product & { qty: number; unitCost: number };
type SaleRecord = { id:number; total:number; cost:number; profit:number; payment:string; type:string; date:string };
type Expense = { id:number; description:string; amount:number; category:string; date:string };
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

  useEffect(() => { localStorage.setItem('difarmas_products', JSON.stringify(products)); }, [products]);
  useEffect(() => { localStorage.setItem('difarmas_sales', JSON.stringify(sales)); }, [sales]);
  useEffect(() => { localStorage.setItem('difarmas_expenses', JSON.stringify(expenses)); }, [expenses]);

  const nav = [
    ['dashboard', 'Dashboard', LayoutDashboard], ['ventas', 'Ventas / POS', ShoppingCart],
    ['inventario', 'Inventario', Boxes], ['compras', 'Compras', ShoppingCart], ['finanzas', 'Finanzas', Wallet],
  ] as const;

  const filtered = useMemo(() => products.filter(p =>
    [p.code, p.name, p.category, p.laboratory].join(' ').toLowerCase().includes(search.toLowerCase())
  ), [products, search]);

  const recordSale = (sold: CartItem[]) => { setProducts(current=>current.map(p=>{const item=sold.find(x=>x.id===p.id);return item?{...p,stock:p.stock-item.qty}:p})); setSales(current=>[...current,{id:Date.now(),total:sold.reduce((a,i)=>a+i.price*i.qty,0),cost:sold.reduce((a,i)=>a+i.cost*i.qty,0),profit:sold.reduce((a,i)=>a+(i.price-i.cost)*i.qty,0),payment,type:saleType,date:new Date().toISOString()}]); };

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
      {active === 'dashboard' ? <Dashboard products={products} sales={sales} expenses={expenses}/> : active === 'inventario' ? <Inventory products={filtered} search={search} setSearch={setSearch} onNew={() => { setEditing(null); setShowForm(true); }} onEdit={p => { setEditing(p); setShowForm(true); }} /> : active === 'ventas' ? <POS products={products} cart={cart} setCart={setCart} saleType={saleType} setSaleType={setSaleType} payment={payment} setPayment={setPayment} search={saleSearch} setSearch={setSaleSearch} onComplete={recordSale}/> : active === 'compras' ? <Purchases products={products} cart={purchaseCart} setCart={setPurchaseCart} search={purchaseSearch} setSearch={setPurchaseSearch} supplier={purchaseSupplier} setSupplier={setPurchaseSupplier} onReceive={(items)=>setProducts(current=>current.map(p=>{const item=items.find(x=>x.id===p.id); return item?{...p,stock:p.stock+item.qty,cost:item.unitCost,supplier:purchaseSupplier||p.supplier}:p}))}/> : active === 'finanzas' ? <Finance sales={sales} expenses={expenses} setExpenses={setExpenses}/> : <ModulePlaceholder name={nav.find(n => n[0] === active)?.[1] || ''}/>} 
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

function POS({products,cart,setCart,saleType,setSaleType,payment,setPayment,search,setSearch,onComplete}:{products:Product[];cart:CartItem[];setCart:(c:CartItem[])=>void;saleType:'minorista'|'mayorista';setSaleType:(v:'minorista'|'mayorista')=>void;payment:'Efectivo'|'Transferencia'|'Crédito';setPayment:(v:'Efectivo'|'Transferencia'|'Crédito')=>void;search:string;setSearch:(v:string)=>void;onComplete:(sold:CartItem[])=>void}) {
  const results=products.filter(p=>[p.code,p.name].join(' ').toLowerCase().includes(search.toLowerCase())).slice(0,6);
  const total=cart.reduce((sum,i)=>sum+i.price*i.qty,0);
  const profit=cart.reduce((sum,i)=>sum+(i.price-i.cost)*i.qty,0);
  const add=(p:Product)=>{if(p.stock<=0)return;setCart(cart.some(i=>i.id===p.id)?cart.map(i=>i.id===p.id?{...i,qty:Math.min(i.qty+1,p.stock),price:saleType==='mayorista'?p.wholesale:p.retail}:i):[...cart,{...p,qty:1,price:saleType==='mayorista'?p.wholesale:p.retail}]);setSearch('');};
  const change=(id:number,delta:number)=>setCart(cart.map(i=>i.id===id?{...i,qty:Math.max(1,Math.min(i.qty+delta,i.stock))}:i));
  const remove=(id:number)=>setCart(cart.filter(i=>i.id!==id));
  const checkout=()=>{if(!cart.length)return;onComplete(cart);setCart([]);};
  return <div className="content"><div className="page-head"><div><span className="pill">MVP · MÓDULO 3</span><h2>Punto de venta</h2><p>Venta rápida con precio minorista o mayorista.</p></div><div className="sale-type"><button className={saleType==='minorista'?'type active':'type'} onClick={()=>setSaleType('minorista')}>Minorista</button><button className={saleType==='mayorista'?'type active':'type'} onClick={()=>setSaleType('mayorista')}>Mayorista</button></div></div>
  <div className="pos-grid"><section><div className="card search-pos"><Search size={18}/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar producto o escanear código..." /></div>{search&&<div className="results card">{results.length?results.map(p=><button key={p.id} onClick={()=>add(p)}><span><strong>{p.name}</strong><small>{p.code} · Stock: {p.stock}</small></span><b>{money(saleType==='mayorista'?p.wholesale:p.retail)}</b></button>):<p>No se encontraron productos.</p>}</div>}<div className="card cart-card"><div className="card-title"><div><h3>Carrito</h3><p>{cart.length} productos</p></div><ShoppingCart size={20}/></div>{cart.length===0?<div className="cart-empty">Agrega productos para iniciar la venta.</div>:cart.map(i=><div className="cart-row" key={i.id}><div><strong>{i.name}</strong><small>{money(i.price)} c/u</small></div><div className="qty"><button onClick={()=>change(i.id,-1)}>-</button><b>{i.qty}</b><button onClick={()=>change(i.id,1)}>+</button></div><strong>{money(i.price*i.qty)}</strong><button className="remove" onClick={()=>remove(i.id)}>×</button></div>)}</div></section><aside className="card checkout"><h3>Resumen de venta</h3><div className="summary-line"><span>Subtotal</span><strong>{money(total)}</strong></div><div className="summary-line"><span>Utilidad estimada</span><strong>{money(profit)}</strong></div><label className="checkout-label">Método de pago<select value={payment} onChange={e=>setPayment(e.target.value as typeof payment)}><option>Efectivo</option><option>Transferencia</option><option>Crédito</option></select></label><div className="grand"><span>Total</span><strong>{money(total)}</strong></div><button className="primary checkout-btn" disabled={!cart.length} onClick={checkout}>Registrar venta</button></aside></div></div>;
}

function Purchases({products,cart,setCart,search,setSearch,supplier,setSupplier,onReceive}:{products:Product[];cart:PurchaseItem[];setCart:(c:PurchaseItem[])=>void;search:string;setSearch:(v:string)=>void;supplier:string;setSupplier:(v:string)=>void;onReceive:(items:PurchaseItem[])=>void}) {
  const results=products.filter(p=>[p.code,p.name].join(' ').toLowerCase().includes(search.toLowerCase())).slice(0,6);
  const total=cart.reduce((sum,i)=>sum+i.unitCost*i.qty,0);
  const add=(p:Product)=>{setCart(cart.some(i=>i.id===p.id)?cart.map(i=>i.id===p.id?{...i,qty:i.qty+1}:i):[...cart,{...p,qty:1,unitCost:p.cost}]);setSearch('');};
  const change=(id:number,delta:number)=>setCart(cart.map(i=>i.id===id?{...i,qty:Math.max(1,i.qty+delta)}:i));
  const updateCost=(id:number,value:number)=>setCart(cart.map(i=>i.id===id?{...i,unitCost:value}:i));
  return <div className="content"><div className="page-head"><div><span className="pill">MVP · MÓDULO 4</span><h2>Compras y recepción</h2><p>Registra compras, costos y entrada de mercancía al inventario.</p></div></div>
  <div className="purchase-grid"><section><div className="card purchase-head"><label>Proveedor<input value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Nombre del proveedor"/></label><div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar producto para agregar..." /></div></div>{search&&<div className="results card">{results.map(p=><button key={p.id} onClick={()=>add(p)}><span><strong>{p.name}</strong><small>{p.code} · Costo actual {money(p.cost)}</small></span><b>Agregar</b></button>)}</div>}<div className="card cart-card"><div className="card-title"><div><h3>Detalle de compra</h3><p>{cart.length} productos</p></div><Boxes size={20}/></div>{cart.length===0?<div className="cart-empty">Agrega productos a la compra.</div>:cart.map(i=><div className="purchase-row" key={i.id}><div><strong>{i.name}</strong><small>{i.code}</small></div><input type="number" min="0.01" value={i.unitCost} onChange={e=>updateCost(i.id,Number(e.target.value))}/><div className="qty"><button onClick={()=>change(i.id,-1)}>-</button><b>{i.qty}</b><button onClick={()=>change(i.id,1)}>+</button></div><strong>{money(i.unitCost*i.qty)}</strong></div>)}</div></section><aside className="card checkout"><h3>Recepción</h3><div className="summary-line"><span>Subtotal compra</span><strong>{money(total)}</strong></div><div className="summary-line"><span>Productos</span><strong>{cart.reduce((s,i)=>s+i.qty,0)}</strong></div><div className="grand"><span>Total</span><strong>{money(total)}</strong></div><button className="primary checkout-btn" disabled={!cart.length||!supplier.trim()} onClick={()=>{onReceive(cart);setCart([]);setSupplier('');}}>Recibir mercancía</button><small className="helper">Al recibir, se suma al stock y se actualiza el costo del producto.</small></aside></div></div>;
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

function Finance({sales,expenses,setExpenses}:{sales:SaleRecord[];expenses:Expense[];setExpenses:(e:Expense[])=>void}) {
  const [description,setDescription]=useState(''); const [amount,setAmount]=useState(0); const [category,setCategory]=useState('Operación');
  const salesTotal=sales.reduce((a,s)=>a+s.total,0); const profit=sales.reduce((a,s)=>a+s.profit,0); const expenseTotal=expenses.reduce((a,e)=>a+e.amount,0);
  const addExpense=()=>{if(!description.trim()||amount<=0)return;setExpenses([...expenses,{id:Date.now(),description,amount,category,date:new Date().toISOString()}]);setDescription('');setAmount(0);};
  return <div className="content"><div className="page-head"><div><span className="pill">MVP · MÓDULO 5</span><h2>Finanzas</h2><p>Control de ventas, gastos y utilidad registrada en el ERP.</p></div></div>
  <div className="grid metrics"><article className="card metric"><div className="metric-top"><span>Ventas registradas</span><ShoppingCart size={20}/></div><strong>{money(salesTotal)}</strong><small>{sales.length} operaciones</small></article><article className="card metric"><div className="metric-top"><span>Utilidad bruta</span><TrendingUp size={20}/></div><strong>{money(profit)}</strong><small>Según ventas registradas</small></article><article className="card metric"><div className="metric-top"><span>Gastos</span><Wallet size={20}/></div><strong>{money(expenseTotal)}</strong><small>{expenses.length} gastos</small></article><article className="card metric"><div className="metric-top"><span>Resultado</span><DollarSign size={20}/></div><strong>{money(profit-expenseTotal)}</strong><small>Utilidad después de gastos</small></article></div>
  <div className="finance-grid"><section className="card"><div className="card-title"><div><h3>Registrar gasto</h3><p>Agrega alquiler, servicios, personal, impuestos u otros.</p></div><Wallet size={20}/></div><div className="expense-form"><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descripción del gasto"/><input type="number" min="0" value={amount||''} onChange={e=>setAmount(Number(e.target.value))} placeholder="Monto"/><select value={category} onChange={e=>setCategory(e.target.value)}><option>Operación</option><option>Alquiler</option><option>Servicios</option><option>Personal</option><option>Impuestos</option><option>Otros</option></select><button className="primary" onClick={addExpense}>Registrar gasto</button></div></section>
  <section className="card"><div className="card-title"><div><h3>Últimos gastos</h3><p>Control de egresos registrados</p></div></div>{expenses.length===0?<div className="cart-empty">Todavía no hay gastos registrados.</div>:expenses.slice(-8).reverse().map(e=><div className="expense-row" key={e.id}><div><strong>{e.description}</strong><small>{e.category}</small></div><strong>{money(e.amount)}</strong></div>)}</section></div>
  <div className="card table-wrap finance-table"><div className="card-title"><div><h3>Ventas registradas</h3><p>Historial de operaciones del POS</p></div></div>{sales.length===0?<div className="cart-empty">Las ventas registradas desde POS aparecerán aquí.</div>:<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Pago</th><th>Total</th><th>Utilidad</th></tr></thead><tbody>{sales.slice().reverse().map(x=><tr key={x.id}><td>{new Date(x.date).toLocaleString('es-HN')}</td><td>{x.type}</td><td>{x.payment}</td><td>{money(x.total)}</td><td>{money(x.profit)}</td></tr>)}</tbody></table>}</div></div>;
}

function ModulePlaceholder({name}:{name:string}) { return <div className="content"><div className="empty card"><Boxes size={42}/><h2>{name}</h2><p>Este módulo está preparado en la navegación. Será construido en la siguiente fase del MVP.</p><span className="pill">PRÓXIMO MÓDULO</span></div></div> }

export default App;
