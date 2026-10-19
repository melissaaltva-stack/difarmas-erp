import { useMemo, useState } from 'react';
import { BrainCircuit, Sparkles, AlertTriangle, Package, TrendingUp, Wallet, CalendarClock, Search } from 'lucide-react';
import type { Product, SaleRecord, PurchaseRecord, Expense, Receivable, Payable, InventoryMovement } from '../domain/types';
import { localDateKey } from '../utils/dates';

type Props = { products: Product[]; sales: SaleRecord[]; purchases: PurchaseRecord[]; expenses: Expense[]; receivables: Receivable[]; payables: Payable[]; movements: InventoryMovement[] };
const cash=(n:number)=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL'}).format(n);
const dayKey=()=>localDateKey();
const daysTo=(date:string)=>{if(!date)return Infinity;const d=new Date(date.length===10?date+'T12:00:00':date);return Number.isNaN(d.getTime())?Infinity:Math.ceil((d.getTime()-new Date(dayKey()+'T12:00:00').getTime())/86400000);};

export function AiAssistant({products,sales,purchases,expenses,receivables,payables,movements}:Props){
  const [question,setQuestion]=useState('');
  const [answer,setAnswer]=useState('');
  const [active,setActive]=useState('resumen');
  const stockAlerts=useMemo(()=>products.filter(p=>p.stock<=p.minStock),[products]);
  const expiryAlerts=useMemo(()=>products.filter(p=>daysTo(p.expiry)<=90).sort((a,b)=>daysTo(a.expiry)-daysTo(b.expiry)),[products]);
  const overdueAR=receivables.filter(x=>x.total>x.paid&&x.dueDate&&x.dueDate<dayKey());
  const overdueAP=payables.filter(x=>x.total>x.paid&&x.dueDate&&x.dueDate<dayKey());
  const ar=receivables.reduce((n,x)=>n+Math.max(0,x.total-x.paid),0);
  const ap=payables.reduce((n,x)=>n+Math.max(0,x.total-x.paid),0);
  const month=dayKey().slice(0,7);
  const monthSales=sales.filter(x=>x.date.startsWith(month)).reduce((n,x)=>n+x.total,0);
  const monthProfit=sales.filter(x=>x.date.startsWith(month)).reduce((n,x)=>n+x.profit,0);
  const monthExpenses=expenses.filter(x=>x.date.startsWith(month)).reduce((n,x)=>n+x.amount,0);
  const insights=useMemo(()=>[
    {title:'Inventario por reponer',value:String(stockAlerts.length),detail:'Productos en o por debajo del stock mínimo',icon:Package,kind:stockAlerts.length?'warning':'ok'},
    {title:'Próximos vencimientos',value:String(expiryAlerts.length),detail:'Productos vencidos o que vencen en 90 días',icon:CalendarClock,kind:expiryAlerts.length?'warning':'ok'},
    {title:'Cuentas por cobrar',value:cash(ar),detail:overdueAR.length+' cuentas vencidas',icon:TrendingUp,kind:overdueAR.length?'warning':'normal'},
    {title:'Cuentas por pagar',value:cash(ap),detail:overdueAP.length+' cuentas vencidas',icon:Wallet,kind:overdueAP.length?'warning':'normal'}
  ],[stockAlerts.length,expiryAlerts.length,ar,ap,overdueAR.length,overdueAP.length]);
  const generate=(raw:string)=>{
    setQuestion(raw);const q=raw.toLowerCase();let result='';
    if(q.includes('venc')||q.includes('caduc')||q.includes('fecha')){
      result='REVISIÓN DE VENCIMIENTOS\n'+(expiryAlerts.length?expiryAlerts.map(p=>{const d=daysTo(p.expiry);return '• '+p.name+' — '+(d<0?'VENCIDO hace '+Math.abs(d)+' días':d===0?'vence hoy':'vence en '+d+' días')+' (lote '+(p.lot||'sin lote')+', existencia '+p.stock+')';}).join('\n'):'No hay productos con vencimiento registrado dentro de los próximos 90 días. Verifica que las fechas estén ingresadas.');
      if(expiryAlerts.some(p=>daysTo(p.expiry)<0))result+='\n\nAcción: separar y bloquear los productos vencidos según el procedimiento de la farmacia.';
      else if(expiryAlerts.length)result+='\n\nAcción: revisar lotes próximos a vencer y priorizar rotación segura conforme a las políticas de la farmacia.';
    }else if(q.includes('stock')||q.includes('invent')||q.includes('repon')||q.includes('comprar')){
      result='SUGERENCIA DE REPOSICIÓN\n'+(stockAlerts.length?stockAlerts.map(p=>'• '+p.name+' — existencia '+p.stock+', mínimo '+p.minStock+', diferencia '+Math.max(0,p.minStock-p.stock)+' unidades para llegar al mínimo.').join('\n'):'No hay productos por debajo del mínimo de stock registrado.')+'\n\nAntes de comprar, verifica ventas recientes, pedidos pendientes y disponibilidad con proveedores.';
    }else if(q.includes('venta')||q.includes('rentab')||q.includes('ganancia')||q.includes('utilidad')){
      result='RESUMEN DE VENTAS DEL MES\n• Ventas registradas: '+cash(monthSales)+'\n• Utilidad registrada en ventas: '+cash(monthProfit)+'\n• Gastos registrados: '+cash(monthExpenses)+'\n• Diferencia simple utilidad menos gastos: '+cash(monthProfit-monthExpenses)+'\n\nEsta diferencia es una referencia operativa, no sustituye el cierre contable ni contempla ajustes o impuestos que no estén registrados.';
    }else if(q.includes('cobrar')||q.includes('cliente')||q.includes('vencida')||q.includes('cuenta por cobrar')){
      result='PRIORIZAR COBROS\n• Saldo total por cobrar: '+cash(ar)+'\n• Cuentas vencidas: '+overdueAR.length+'\n'+(overdueAR.length?overdueAR.map(x=>'• '+x.customer+' — saldo '+cash(Math.max(0,x.total-x.paid))+' — vencimiento '+x.dueDate).join('\n'):'No hay cuentas vencidas según las fechas registradas.')+'\n\nSugerencia: confirmar el saldo y contactar al cliente antes de registrar un cobro.';
    }else if(q.includes('pagar')||q.includes('proveedor')||q.includes('cuenta por pagar')){
      result='PRIORIZAR PAGOS\n• Saldo total por pagar: '+cash(ap)+'\n• Cuentas vencidas: '+overdueAP.length+'\n'+(overdueAP.length?overdueAP.map(x=>'• '+x.supplier+' — saldo '+cash(Math.max(0,x.total-x.paid))+' — vencimiento '+x.dueDate).join('\n'):'No hay cuentas vencidas según las fechas registradas.')+'\n\nSugerencia: revisar caja disponible y condiciones del proveedor antes de programar pagos.';
    }else if(q.includes('movimiento')||q.includes('ajuste')){
      result='ACTIVIDAD DE INVENTARIO\n• Movimientos registrados: '+movements.length+'\n• Ventas registradas: '+movements.filter(m=>m.type==='Venta').length+' movimientos\n• Compras registradas: '+movements.filter(m=>m.type==='Compra').length+' movimientos\n• Ajustes registrados: '+movements.filter(m=>m.type==='Ajuste').length+' movimientos\n\nUsa el reporte de movimientos de inventario para revisar fecha, producto y referencia.';
    }else if(q.includes('compra')||q.includes('gasto')){
      result='COMPRAS Y GASTOS DEL MES\n• Compras registradas: '+cash(purchases.filter(x=>x.date.startsWith(month)).reduce((n,x)=>n+x.total,0))+'\n• Gastos registrados: '+cash(monthExpenses)+'\n\nCompara estos importes con facturas, pagos y movimientos de caja para verificar que no falten registros.';
    }else{
      result='RESUMEN OPERATIVO\n• Ventas de este mes: '+cash(monthSales)+'\n• Utilidad registrada en ventas: '+cash(monthProfit)+'\n• Gastos registrados este mes: '+cash(monthExpenses)+'\n• Productos por reponer: '+stockAlerts.length+'\n• Productos con vencimiento en 90 días o menos: '+expiryAlerts.length+'\n• Saldo por cobrar: '+cash(ar)+' ('+overdueAR.length+' vencidas)\n• Saldo por pagar: '+cash(ap)+' ('+overdueAP.length+' vencidas)\n\nElige una consulta rápida para obtener una lista más detallada. Las sugerencias se calculan con los datos guardados en el ERP.';
    }
    setAnswer(result);setActive(q.includes('venc')||q.includes('caduc')?'vencimientos':q.includes('stock')||q.includes('invent')||q.includes('repon')||q.includes('comprar')?'stock':q.includes('cobrar')||q.includes('cliente')?'cobros':q.includes('pagar')||q.includes('proveedor')?'pagos':q.includes('venta')||q.includes('rentab')||q.includes('ganancia')?'ventas':'resumen');
  };
  return <div className="content ai-page">
    <section className="ai-hero"><div><span className="pill"><Sparkles size={12} style={{display:'inline',verticalAlign:'middle'}}/> ASISTENTE INTELIGENTE</span><h2>Tu copiloto de DIFARMÁS</h2><p>Detecta prioridades y consulta ventas, inventario, vencimientos y cuentas por cobrar o pagar.</p></div><BrainCircuit size={52}/></section>
    <div className="grid metrics ai-metrics">{insights.map(({title,value,detail,icon:Icon,kind})=><article className="card metric" key={title}><div className="metric-top"><span>{title}</span><Icon size={18}/></div><strong>{value}</strong><small>{detail}</small>{kind==='warning'&&<span className="ai-warning"><AlertTriangle size={13}/> Requiere revisión</span>}</article>)}</div>
    <section className="card ai-query"><h3><Sparkles size={18}/> ¿Qué necesitas revisar?</h3><form onSubmit={e=>{e.preventDefault();if(question.trim())generate(question.trim());}}><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ej.: ¿Qué productos debo reponer?" aria-label="Consulta al asistente"/><button className="primary" type="submit"><Search size={16}/> Analizar</button></form><div className="ai-prompts">{['Resumen del negocio','Productos por reponer','Próximos vencimientos','Ventas y rentabilidad','Cuentas por cobrar vencidas','Pagos a proveedores','Compras y gastos'].map(p=><button type="button" className="secondary" key={p} onClick={()=>generate(p)}>{p}</button>)}</div></section>
    {answer&&<section className="card ai-answer"><div className="ai-answer-head"><BrainCircuit size={20}/><strong>Análisis del asistente</strong><button className="secondary" onClick={()=>{void navigator.clipboard?.writeText(answer);}}>Copiar</button></div><pre>{answer}</pre></section>}
    <p className="ai-disclaimer">La versión actual analiza los datos locales del ERP mediante reglas automáticas; no envía información a servicios externos ni sustituye la revisión humana. Confirma los datos antes de comprar, cobrar, pagar o modificar inventario.</p>
  </div>;
}
