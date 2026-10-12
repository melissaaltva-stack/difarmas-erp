import { AlertTriangle, DollarSign, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import type { Product, SaleRecord, Expense } from '../domain/types';

const money = (value: number) => new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', maximumFractionDigits: 2 }).format(value);
const localDateKey = (d = new Date()) => { const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; };
const currentMonthKey = (d = new Date()) => localDateKey(d).slice(0,7);
const isCurrentMonth = (date:string) => (date||'').slice(0,7) === currentMonthKey();

export function Dashboard({products,sales,expenses,monthlyGoal,fixedExpenses}:{products:Product[];sales:SaleRecord[];expenses:Expense[];monthlyGoal:number;fixedExpenses:number}) {
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

