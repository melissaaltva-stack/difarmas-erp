import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Boxes, DollarSign, LayoutDashboard, Pencil, Plus, Search, ShoppingCart, TrendingUp, Wallet, X } from 'lucide-react';

type Module = 'dashboard' | 'ventas' | 'inventario' | 'compras' | 'finanzas';
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
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const nav = [
    ['dashboard', 'Dashboard', LayoutDashboard], ['ventas', 'Ventas / POS', ShoppingCart],
    ['inventario', 'Inventario', Boxes], ['compras', 'Compras', ShoppingCart], ['finanzas', 'Finanzas', Wallet],
  ] as const;

  const filtered = useMemo(() => products.filter(p =>
    [p.code, p.name, p.category, p.laboratory].join(' ').toLowerCase().includes(search.toLowerCase())
  ), [products, search]);

  const saveProduct = (product: Product) => {
    setProducts(current => editing ? current.map(p => p.id === product.id ? product : p) : [...current, { ...product, id: Date.now() }]);
    setEditing(null); setShowForm(false);
  };

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">D</div><div><strong>DIFARMÁS</strong><span>ERP</span></div></div>
      <div className="section-label">OPERACIÓN</div>
      {nav.map(([id, label, Icon]) => <button key={id} className={active === id ? 'nav active' : 'nav'} onClick={() => setActive(id)}><Icon size={19}/>{label}</button>)}
      <div className="sidebar-footer"><Activity size={17}/> Sistema MVP v0.2</div>
    </aside>
    <main className="main">
      <header className="topbar"><div><p className="eyebrow">DIFARMÁS · ERP</p><h1>{active === 'dashboard' ? 'Panel de control' : nav.find(n => n[0] === active)?.[1]}</h1></div><div className="status"><span/> Sistema operativo</div></header>
      {active === 'dashboard' ? <Dashboard/> : active === 'inventario' ? <Inventory products={filtered} search={search} setSearch={setSearch} onNew={() => { setEditing(null); setShowForm(true); }} onEdit={p => { setEditing(p); setShowForm(true); }} /> : <ModulePlaceholder name={nav.find(n => n[0] === active)?.[1] || ''}/>}
      {showForm && <ProductModal product={editing} onClose={() => {setShowForm(false);setEditing(null)}} onSave={saveProduct}/>}
    </main>
  </div>;
}

function Dashboard() {
  return <div className="content">
    <section className="hero"><div><span className="pill">MVP · MÓDULO 1</span><h2>Controla DIFARMÁS desde un solo lugar.</h2><p>Resumen operativo para ventas, utilidad, gastos e inventario.</p></div><div className="hero-goal"><span>Meta diaria sugerida</span><strong>{money(3846.15)}</strong><small>para alcanzar L 100,000/mes en 26 días</small></div></section>
    <section className="grid metrics">{metrics.map(({label,value,icon:Icon,note}) => <article className="card metric" key={label}><div className="metric-top"><span>{label}</span><Icon size={20}/></div><strong>{money(value)}</strong><small>{note}</small></article>)}</section>
    <section className="two-col"><article className="card"><div className="card-title"><div><h3>Rendimiento de ventas</h3><p>Resumen del período actual</p></div><TrendingUp size={20}/></div><div className="bar-area">{[42,58,49,74,68,88,79].map((h,i)=><div key={i} className={i===6?'bar current':'bar'} style={{height:h+'%'}}/>)}</div><div className="days"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>H</span></div></article>
    <article className="card"><div className="card-title"><div><h3>Alertas</h3><p>Acciones recomendadas</p></div><AlertTriangle size={20}/></div>{[['Stock bajo','Revisar productos por debajo del mínimo','warning'],['Vencimientos','Productos próximos a vencer','danger'],['Caja','Revisar flujo de efectivo del día','info']].map(([title,text,type])=><div className="alert" key={title}><div className={'dot '+type}/><div><strong>{title}</strong><p>{text}</p></div></div>)}</article></section>
  </div>;
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

function ModulePlaceholder({name}:{name:string}) { return <div className="content"><div className="empty card"><Boxes size={42}/><h2>{name}</h2><p>Este módulo está preparado en la navegación. Será construido en la siguiente fase del MVP.</p><span className="pill">PRÓXIMO MÓDULO</span></div></div> }

export default App;
