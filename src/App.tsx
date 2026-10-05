import { useState } from 'react';
import { Activity, AlertTriangle, Boxes, DollarSign, LayoutDashboard, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';

type Module = 'dashboard' | 'ventas' | 'inventario' | 'compras' | 'finanzas';

const money = (value: number) => new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', maximumFractionDigits: 2 }).format(value);

const metrics = [
  { label: 'Ventas del día', value: 4280, icon: ShoppingCart, note: '+8.4% vs. ayer' },
  { label: 'Ventas del mes', value: 81630, icon: TrendingUp, note: 'Meta mensual: L 100,000' },
  { label: 'Utilidad bruta', value: 18650, icon: DollarSign, note: 'Margen aproximado 22.9%' },
  { label: 'Gastos del mes', value: 19000, icon: Wallet, note: 'Control de gastos' },
];

const alerts = [
  ['Stock bajo', 'Revisar productos por debajo del mínimo', 'warning'],
  ['Vencimientos', 'Productos próximos a vencer', 'danger'],
  ['Caja', 'Revisar flujo de efectivo del día', 'info'],
];

function App() {
  const [active, setActive] = useState<Module>('dashboard');
  const nav = [
    ['dashboard', 'Dashboard', LayoutDashboard],
    ['ventas', 'Ventas / POS', ShoppingCart],
    ['inventario', 'Inventario', Boxes],
    ['compras', 'Compras', ShoppingCart],
    ['finanzas', 'Finanzas', Wallet],
  ] as const;

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">D</div><div><strong>DIFARMÁS</strong><span>ERP</span></div></div>
      <div className="section-label">OPERACIÓN</div>
      {nav.map(([id, label, Icon]) => <button key={id} className={active === id ? 'nav active' : 'nav'} onClick={() => setActive(id)}><Icon size={19}/>{label}</button>)}
      <div className="sidebar-footer"><Activity size={17}/> Sistema MVP v0.1</div>
    </aside>
    <main className="main">
      <header className="topbar"><div><p className="eyebrow">DIFARMÁS · ERP</p><h1>{active === 'dashboard' ? 'Panel de control' : nav.find(n => n[0] === active)?.[1]}</h1></div><div className="status"><span/> Sistema operativo</div></header>
      {active === 'dashboard' ? <Dashboard/> : <ModulePlaceholder name={nav.find(n => n[0] === active)?.[1] || ''}/>} 
    </main>
  </div>
}

function Dashboard() {
  return <div className="content">
    <section className="hero"><div><span className="pill">MVP · MÓDULO 1</span><h2>Controla DIFARMÁS desde un solo lugar.</h2><p>Resumen operativo para ventas, utilidad, gastos e inventario.</p></div><div className="hero-goal"><span>Meta diaria sugerida</span><strong>{money(3846.15)}</strong><small>para alcanzar L 100,000/mes en 26 días</small></div></section>
    <section className="grid metrics">{metrics.map(({label,value,icon:Icon,note}) => <article className="card metric" key={label}><div className="metric-top"><span>{label}</span><Icon size={20}/></div><strong>{money(value)}</strong><small>{note}</small></article>)}</section>
    <section className="two-col"><article className="card"><div className="card-title"><div><h3>Rendimiento de ventas</h3><p>Resumen del período actual</p></div><TrendingUp size={20}/></div><div className="bar-area"><div className="bar" style={{height:'42%'}}/><div className="bar" style={{height:'58%'}}/><div className="bar" style={{height:'49%'}}/><div className="bar" style={{height:'74%'}}/><div className="bar" style={{height:'68%'}}/><div className="bar" style={{height:'88%'}}/><div className="bar current" style={{height:'79%'}}/></div><div className="days"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>H</span></div></article>
    <article className="card"><div className="card-title"><div><h3>Alertas</h3><p>Acciones recomendadas</p></div><AlertTriangle size={20}/></div>{alerts.map(([title,text,type]) => <div className="alert" key={title}><div className={'dot '+type}/><div><strong>{title}</strong><p>{text}</p></div></div>)}</article></section>
  </div>
}

function ModulePlaceholder({name}:{name:string}) { return <div className="content"><div className="empty card"><Boxes size={42}/><h2>{name}</h2><p>Este módulo está preparado en la navegación. Será construido en la siguiente fase del MVP.</p><span className="pill">PRÓXIMO MÓDULO</span></div></div> }

export default App;
