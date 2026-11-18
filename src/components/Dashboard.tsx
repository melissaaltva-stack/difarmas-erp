import { AlertTriangle, CalendarDays, DollarSign, Package, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import type { Product, SaleRecord, Expense } from '../domain/types';
import { dateKey, localDateKey } from '../utils/dates';

const money = (value: number) => new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', maximumFractionDigits: 2 }).format(value);
const currentMonthKey = (d = new Date()) => localDateKey(d).slice(0, 7);
const isCurrentMonth = (date: string, month = currentMonthKey()) => dateKey(date).slice(0, 7) === month;

const calendarDays = (count: number, end = new Date()) => Array.from({ length: count }, (_, index) => {
  const day = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (count - index - 1));
  return { key: localDateKey(day), label: day.toLocaleDateString('es-HN', { weekday: 'short' }).replace('.', '').slice(0, 2).toUpperCase() };
});

export function Dashboard({ products, sales, expenses, monthlyGoal, fixedExpenses }: { products: Product[]; sales: SaleRecord[]; expenses: Expense[]; monthlyGoal: number; fixedExpenses: number }) {
  const now = new Date();
  const monthKey = currentMonthKey(now);
  const monthSales = sales.filter(s => isCurrentMonth(s.date, monthKey));
  const monthExpenses = expenses.filter(e => isCurrentMonth(e.date, monthKey));
  const salesTotal = monthSales.reduce((total, sale) => total + sale.total, 0);
  const grossProfit = monthSales.reduce((total, sale) => total + sale.profit, 0);
  const expenseTotal = monthExpenses.reduce((total, expense) => total + expense.amount, 0);
  const netResult = grossProfit - expenseTotal;
  const inventoryValue = products.reduce((total, product) => total + product.cost * product.stock, 0);
  const lowStock = products.filter(product => product.stock <= product.minStock);
  const todayKey = localDateKey(now);
  const salesToday = sales.filter(sale => dateKey(sale.date) === todayKey).reduce((total, sale) => total + sale.total, 0);
  const goal = monthlyGoal;
  const workDays = 26;
  const dailyGoal = goal / workDays;
  const progress = goal > 0 ? Math.min(100, Math.max(0, (salesTotal / goal) * 100)) : 0;
  const margin = salesTotal > 0 ? grossProfit / salesTotal : 0;
  const breakEvenSales = margin > 0 ? fixedExpenses / margin : 0;
  const breakEvenDaily = breakEvenSales / workDays;
  const goalRemaining = Math.max(0, goal - salesTotal);

  const days = calendarDays(7, now);
  const salesByDay = new Map<string, number>();
  for (const sale of sales) {
    const key = dateKey(sale.date);
    if (days.some(day => day.key === key)) salesByDay.set(key, (salesByDay.get(key) ?? 0) + sale.total);
  }
  const chartValues = days.map(day => salesByDay.get(day.key) ?? 0);
  const maxChart = Math.max(...chartValues, 1);
  const recentSales = [...sales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 7);

  const expired = products.filter(product => /^\d{4}-\d{2}-\d{2}$/.test(product.expiry) && product.expiry < todayKey);
  const expiringSoon = products.filter(product => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(product.expiry) || product.expiry < todayKey) return false;
    const expiryDate = new Date(Number(product.expiry.slice(0, 4)), Number(product.expiry.slice(5, 7)) - 1, Number(product.expiry.slice(8, 10)));
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysUntilExpiry = Math.round((expiryDate.getTime() - today.getTime()) / 86400000);
    return daysUntilExpiry <= 90;
  });

  return <div className="content dashboard-content">
    <section className="hero dashboard-hero">
      <div>
        <span className="pill">DIFARMÁS · PANEL DE CONTROL</span>
        <h2>Resumen general</h2>
        <p>Indicadores de ventas, rentabilidad e inventario del negocio.</p>
      </div>
      <div className="hero-goal">
        <span>Meta mensual</span>
        <strong>{money(goal)}</strong>
        <small>{money(dailyGoal)} por día · {progress.toFixed(0)}% alcanzado</small>
      </div>
    </section>

    <section className="grid metrics dashboard-kpis" aria-label="Indicadores principales">
      <article className="card metric">
        <div className="metric-top"><span>Ventas del día</span><ShoppingCart size={19} aria-hidden="true" /></div>
        <strong>{money(salesToday)}</strong>
        <small>{sales.filter(sale => dateKey(sale.date) === todayKey).length} operaciones hoy</small>
      </article>
      <article className="card metric">
        <div className="metric-top"><span>Ventas del mes</span><TrendingUp size={19} aria-hidden="true" /></div>
        <strong>{money(salesTotal)}</strong>
        <small>{monthSales.length} operaciones este mes</small>
      </article>
      <article className="card metric">
        <div className="metric-top"><span>Utilidad bruta</span><DollarSign size={19} aria-hidden="true" /></div>
        <strong>{money(grossProfit)}</strong>
        <small>Margen bruto {salesTotal ? ((grossProfit / salesTotal) * 100).toFixed(1) : '0.0'}%</small>
      </article>
      <article className="card metric">
        <div className="metric-top"><span>Resultado neto</span><Wallet size={19} aria-hidden="true" /></div>
        <strong>{money(netResult)}</strong>
        <small>Utilidad bruta menos gastos del mes</small>
      </article>
    </section>

    <section className="card goal-card dashboard-goals">
      <div className="goal-head">
        <div><h3>Metas y punto de equilibrio</h3><p>Estimaciones basadas en {workDays} días de operación y el margen bruto del mes actual.</p></div>
      </div>
      <div className="grid metrics">
        <article className="card metric"><span>Meta mensual</span><strong>{money(goal)}</strong><small>Restante: {money(goalRemaining)}</small></article>
        <article className="card metric"><span>Meta diaria</span><strong>{money(dailyGoal)}</strong><small>Meta distribuida en {workDays} días</small></article>
        <article className="card metric"><span>Punto de equilibrio</span><strong>{money(breakEvenSales)}</strong><small>Ventas mensuales estimadas</small></article>
        <article className="card metric"><span>Equilibrio diario</span><strong>{money(breakEvenDaily)}</strong><small>Estimado para cubrir gastos fijos</small></article>
      </div>
    </section>

    <section className="card goal-card dashboard-progress">
      <div className="goal-head">
        <div><h3>Avance de meta mensual</h3><p>Ventas del mes frente al objetivo establecido</p></div>
        <strong>{money(salesTotal)} / {money(goal)}</strong>
      </div>
      <div className="progress-track" role="progressbar" aria-label="Avance de meta mensual" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <div className="progress-fill" style={{ width: progress + '%' }} />
      </div>
      <small className="dashboard-progress-label">{progress.toFixed(1)}% de la meta</small>
    </section>

    <section className="dashboard-grid">
      <article className="card">
        <div className="card-title"><div><h3>Últimas ventas</h3><p>Las 7 operaciones más recientes</p></div><TrendingUp size={19} aria-hidden="true" /></div>
        {recentSales.length === 0
          ? <div className="cart-empty">Aún no hay ventas registradas.</div>
          : <div className="mini-sales">{recentSales.map(sale => <div className="mini-sale" key={sale.id}>
            <div><strong>{money(sale.total)}</strong><small>{new Date(sale.date).toLocaleString('es-HN')} · {sale.type}</small></div>
            <span>{money(sale.profit)}</span>
          </div>)}</div>}
      </article>
      <article className="card">
        <div className="card-title"><div><h3>Alertas operativas</h3><p>Inventario que requiere atención</p></div><AlertTriangle size={19} aria-hidden="true" /></div>
        <div className="alert"><div className="dot warning" /><div><strong>Stock bajo</strong><p>{lowStock.length ? `${lowStock.length} producto(s) en o por debajo del mínimo.` : 'No hay productos bajo el mínimo.'}</p></div></div>
        <div className="alert"><div className="dot danger" /><div><strong>Productos vencidos</strong><p>{expired.length ? `${expired.length} producto(s) tienen fecha de vencimiento anterior a hoy.` : 'No hay productos vencidos registrados.'}</p></div></div>
        <div className="alert"><div className="dot warning" /><div><strong>Próximos vencimientos</strong><p>{expiringSoon.length ? `${expiringSoon.length} producto(s) vencen dentro de los próximos 90 días.` : 'No hay vencimientos en los próximos 90 días.'}</p></div></div>
        <div className="alert"><div className="dot info" /><div><strong>Inventario valorizado</strong><p>{money(inventoryValue)} al costo · {products.length} productos registrados.</p></div></div>
      </article>
    </section>

    <section className="dashboard-grid">
      <article className="card">
        <div className="card-title"><div><h3>Tendencia diaria de ventas</h3><p>Importe vendido durante los últimos 7 días</p></div><CalendarDays size={19} aria-hidden="true" /></div>
        <div className="bar-area live-bars" role="img" aria-label={days.map((day, index) => `${day.key}: ${money(chartValues[index])}`).join('; ')}>
          {chartValues.map((value, index) => <div key={days[index].key} className={index === chartValues.length - 1 ? 'bar current' : 'bar'} style={{ height: `${value > 0 ? Math.max(4, value / maxChart * 100) : 0}%` }} title={`${days[index].key}: ${money(value)}`} />)}
        </div>
        <div className="days">{days.map(day => <span key={day.key} title={day.key}>{day.label}</span>)}</div>
      </article>
      <article className="card">
        <div className="card-title"><div><h3>Resumen financiero del mes</h3><p>Movimientos registrados en el mes actual</p></div><DollarSign size={19} aria-hidden="true" /></div>
        <div className="finance-summary">
          <div><span>Gastos</span><strong>{money(expenseTotal)}</strong></div>
          <div><span>Utilidad bruta</span><strong>{money(grossProfit)}</strong></div>
          <div><span>Resultado neto</span><strong>{money(netResult)}</strong></div>
        </div>
      </article>
    </section>
  </div>;
}
