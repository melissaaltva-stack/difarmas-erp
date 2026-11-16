import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Sparkles, AlertTriangle, Package, TrendingUp, Wallet, CalendarClock, Search, Bell, CheckCircle2, Clock3, RotateCcw, Activity } from 'lucide-react';
import type { Product, SaleRecord, PurchaseRecord, Expense, Receivable, Payable, InventoryMovement } from '../domain/types';
import { localDateKey } from '../utils/dates';

type Props = { userId:string; products: Product[]; sales: SaleRecord[]; purchases: PurchaseRecord[]; expenses: Expense[]; receivables: Receivable[]; payables: Payable[]; movements: InventoryMovement[] };
type AgentAlert = { id:string; title:string; detail:string; category:'Inventario'|'Vencimientos'|'Cuentas por cobrar'|'Cuentas por pagar'|'Finanzas'; severity:'critical'|'warning'|'info'; createdAt:string };
type HandledAlert = AgentAlert & { attendedAt:string };
const cash=(n:number)=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL'}).format(n);
const dayKey=()=>localDateKey();
const daysTo=(date:string)=>{if(!date)return Infinity;const d=new Date(date.length===10?date+'T12:00:00':date);return Number.isNaN(d.getTime())?Infinity:Math.ceil((d.getTime()-new Date(dayKey()+'T12:00:00').getTime())/86400000);};
const storageKey=(userId:string)=>'farmi-agent-alert-history:'+userId;
const loadHandled=(userId:string):HandledAlert[]=>{try{const raw=localStorage.getItem(storageKey(userId));const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed.filter((item):item is HandledAlert=>item&&typeof item.id==='string'&&typeof item.attendedAt==='string'):[];}catch{return [];}};

export function AiAssistant({userId,products,sales,purchases,expenses,receivables,payables,movements}:Props){
  const [question,setQuestion]=useState('');
  const [answer,setAnswer]=useState('');
  const [active,setActive]=useState('resumen');
  const [view,setView]=useState<'assistant'|'alerts'>('assistant');
  const [handledAlerts,setHandledAlerts]=useState<HandledAlert[]>(()=>loadHandled(userId));
  const [historyOpen,setHistoryOpen]=useState(false);
  useEffect(()=>{try{localStorage.setItem(storageKey(userId),JSON.stringify(handledAlerts.slice(0,250)));}catch{/* Local history is optional; alerts remain available in this session. */}},[userId,handledAlerts]);

  const stockAlerts=useMemo(()=>products.filter(p=>p.stock<=p.minStock),[products]);
  const expiryAlerts=useMemo(()=>products.filter(p=>daysTo(p.expiry)<=90).sort((a,b)=>daysTo(a.expiry)-daysTo(b.expiry)),[products]);
  const overdueAR=receivables.filter(x=>x.total+(x.debitNotes??0)-x.paid-(x.creditNotes??0)>0&&x.dueDate&&x.dueDate<dayKey());
  const overdueAP=payables.filter(x=>x.total>x.paid&&x.dueDate&&x.dueDate<dayKey());
  const ar=receivables.reduce((n,x)=>n+Math.max(0,x.total+(x.debitNotes??0)-x.paid-(x.creditNotes??0)),0);
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

  const alerts=useMemo<AgentAlert[]>(()=>{
    const today=dayKey();
    const list:AgentAlert[]=[];
    products.filter(p=>p.stock<=p.minStock).forEach(p=>list.push({id:'stock-'+p.id+'-'+p.stock+'-'+p.minStock,title:p.stock<=0?'Producto agotado: '+p.name:'Stock bajo: '+p.name,detail:'Existencia actual: '+p.stock+' · Mínimo configurado: '+p.minStock+'. Verifica pedidos pendientes y disponibilidad antes de reponer.',category:'Inventario',severity:p.stock<=0?'critical':'warning',createdAt:today}));
    products.filter(p=>daysTo(p.expiry)<=90).forEach(p=>{const d=daysTo(p.expiry);list.push({id:'expiry-'+p.id+'-'+p.expiry,title:d<0?'Producto vencido: '+p.name:'Próximo vencimiento: '+p.name,detail:(d<0?'Venció hace '+Math.abs(d)+' días.':'Vence '+(d===0?'hoy':'en '+d+' días')+'.')+' Lote: '+(p.lot||'No registrado')+' · Existencia: '+p.stock+'. Requiere verificación física y aplicación del procedimiento de farmacia.',category:'Vencimientos',severity:d<0?'critical':d<=30?'warning':'info',createdAt:today}));});
    overdueAR.forEach(x=>list.push({id:'ar-'+x.id+'-'+(x.total+(x.debitNotes??0)-x.paid-(x.creditNotes??0))+'-'+x.dueDate,title:'Cuenta por cobrar vencida: '+x.customer,detail:'Saldo pendiente: '+cash(Math.max(0,x.total+(x.debitNotes??0)-x.paid-(x.creditNotes??0)))+' · Vencimiento: '+x.dueDate+'. Confirma el estado de cuenta antes de contactar al cliente.',category:'Cuentas por cobrar',severity:'warning',createdAt:today}));
    overdueAP.forEach(x=>list.push({id:'ap-'+x.id+'-'+(x.total-x.paid)+'-'+x.dueDate,title:'Cuenta por pagar vencida: '+x.supplier,detail:'Saldo pendiente: '+cash(Math.max(0,x.total-x.paid))+' · Vencimiento: '+x.dueDate+'. Verifica caja y condiciones con el proveedor antes de programar el pago.',category:'Cuentas por pagar',severity:'warning',createdAt:today}));
    if(monthSales>0&&monthExpenses>monthProfit)list.push({id:'expense-margin-'+month+'-'+Math.round(monthProfit)+'-'+Math.round(monthExpenses),title:'Gastos superiores a la utilidad bruta del mes',detail:'Utilidad bruta registrada: '+cash(monthProfit)+' · Gastos registrados: '+cash(monthExpenses)+'. Revisa que los registros estén completos y clasificados correctamente.',category:'Finanzas',severity:'warning',createdAt:today});
    const priority={critical:0,warning:1,info:2};
    return list.sort((a,b)=>priority[a.severity]-priority[b.severity]);
  },[products,overdueAR,overdueAP,monthSales,monthProfit,monthExpenses,month]);
  const handledIds=new Set(handledAlerts.map(item=>item.id));
  const activeAlerts=alerts.filter(item=>!handledIds.has(item.id));
  const markHandled=(alert:AgentAlert)=>setHandledAlerts(current=>[{...alert,attendedAt:new Date().toISOString()},...current.filter(item=>item.id!==alert.id)].slice(0,250));
  const restoreAlert=(alert:HandledAlert)=>setHandledAlerts(current=>current.filter(item=>item.id!==alert.id));

  const generate=(raw:string)=>{
    setQuestion(raw);const q=raw.toLowerCase();let result='';
    if(q.includes('venc')||q.includes('caduc')||q.includes('fecha')){
      result='REVISIÓN DE VENCIMIENTOS\\n'+(expiryAlerts.length?expiryAlerts.map(p=>{const d=daysTo(p.expiry);return '• '+p.name+' — '+(d<0?'VENCIDO hace '+Math.abs(d)+' días':d===0?'vence hoy':'vence en '+d+' días')+' (lote '+(p.lot||'sin lote')+', existencia '+p.stock+')';}).join('\\n'):'No hay productos con vencimiento registrado dentro de los próximos 90 días. Verifica que las fechas estén ingresadas.');
      if(expiryAlerts.some(p=>daysTo(p.expiry)<0))result+='\\n\\nAcción: separar y bloquear los productos vencidos según el procedimiento de la farmacia.';
      else if(expiryAlerts.length)result+='\\n\\nAcción: revisar lotes próximos a vencer y priorizar rotación segura conforme a las políticas de la farmacia.';
    }else if(q.includes('stock')||q.includes('invent')||q.includes('repon')||q.includes('comprar')){
      result='SUGERENCIA DE REPOSICIÓN\\n'+(stockAlerts.length?stockAlerts.map(p=>'• '+p.name+' — existencia '+p.stock+', mínimo '+p.minStock+', diferencia '+Math.max(0,p.minStock-p.stock)+' unidades para llegar al mínimo.').join('\\n'):'No hay productos por debajo del mínimo de stock registrado.')+'\\n\\nAntes de comprar, verifica ventas recientes, pedidos pendientes y disponibilidad con proveedores.';
    }else if(q.includes('venta')||q.includes('rentab')||q.includes('ganancia')||q.includes('utilidad')){
      result='RESUMEN DE VENTAS DEL MES\\n• Ventas registradas: '+cash(monthSales)+'\\n• Utilidad registrada en ventas: '+cash(monthProfit)+'\\n• Gastos registrados: '+cash(monthExpenses)+'\\n• Diferencia simple utilidad menos gastos: '+cash(monthProfit-monthExpenses)+'\\n\\nEsta diferencia es una referencia operativa, no sustituye el cierre contable ni contempla ajustes o impuestos que no estén registrados.';
    }else if(q.includes('cobrar')||q.includes('cliente')||q.includes('vencida')||q.includes('cuenta por cobrar')){
      result='PRIORIZAR COBROS\\n• Saldo total por cobrar: '+cash(ar)+'\\n• Cuentas vencidas: '+overdueAR.length+'\\n'+(overdueAR.length?overdueAR.map(x=>'• '+x.customer+' — saldo '+cash(Math.max(0,x.total+(x.debitNotes??0)-x.paid-(x.creditNotes??0)))+' — vencimiento '+x.dueDate).join('\\n'):'No hay cuentas vencidas según las fechas registradas.')+'\\n\\nSugerencia: confirmar el saldo y contactar al cliente antes de registrar un cobro.';
    }else if(q.includes('pagar')||q.includes('proveedor')||q.includes('cuenta por pagar')){
      result='PRIORIZAR PAGOS\\n• Saldo total por pagar: '+cash(ap)+'\\n• Cuentas vencidas: '+overdueAP.length+'\\n'+(overdueAP.length?overdueAP.map(x=>'• '+x.supplier+' — saldo '+cash(Math.max(0,x.total-x.paid))+' — vencimiento '+x.dueDate).join('\\n'):'No hay cuentas vencidas según las fechas registradas.')+'\\n\\nSugerencia: revisar caja disponible y condiciones del proveedor antes de programar pagos.';
    }else if(q.includes('movimiento')||q.includes('ajuste')){
      result='ACTIVIDAD DE INVENTARIO\\n• Movimientos registrados: '+movements.length+'\\n• Ventas registradas: '+movements.filter(m=>m.type==='Venta').length+' movimientos\\n• Compras registradas: '+movements.filter(m=>m.type==='Compra').length+' movimientos\\n• Ajustes registrados: '+movements.filter(m=>m.type==='Ajuste').length+' movimientos\\n\\nUsa el reporte de movimientos de inventario para revisar fecha, producto y referencia.';
    }else if(q.includes('compra')||q.includes('gasto')){
      result='COMPRAS Y GASTOS DEL MES\\n• Compras registradas: '+cash(purchases.filter(x=>x.date.startsWith(month)).reduce((n,x)=>n+x.total,0))+'\\n• Gastos registrados: '+cash(monthExpenses)+'\\n\\nCompara estos importes con facturas, pagos y movimientos de caja para verificar que no falten registros.';
    }else{
      result='RESUMEN OPERATIVO\\n• Ventas de este mes: '+cash(monthSales)+'\\n• Utilidad registrada en ventas: '+cash(monthProfit)+'\\n• Gastos registrados este mes: '+cash(monthExpenses)+'\\n• Productos por reponer: '+stockAlerts.length+'\\n• Productos con vencimiento en 90 días o menos: '+expiryAlerts.length+'\\n• Saldo por cobrar: '+cash(ar)+' ('+overdueAR.length+' vencidas)\\n• Saldo por pagar: '+cash(ap)+' ('+overdueAP.length+' vencidas)\\n\\nElige una consulta rápida para obtener una lista más detallada. Las sugerencias se calculan con los datos guardados en el ERP.';
    }
    setAnswer(result);setActive(q.includes('venc')||q.includes('caduc')?'vencimientos':q.includes('stock')||q.includes('invent')||q.includes('repon')||q.includes('comprar')?'stock':q.includes('cobrar')||q.includes('cliente')?'cobros':q.includes('pagar')||q.includes('proveedor')?'pagos':q.includes('venta')||q.includes('rentab')||q.includes('ganancia')?'ventas':'resumen');
  };
  const iconFor=(category:AgentAlert['category'])=>category==='Inventario'?Package:category==='Vencimientos'?CalendarClock:category==='Cuentas por cobrar'?TrendingUp:category==='Cuentas por pagar'?Wallet:Activity;

  return <div className="content ai-page">
    <section className="ai-hero"><div><span className="pill"><Sparkles size={12} style={{display:'inline',verticalAlign:'middle'}}/> AGENTE FARMI</span><h2>Tu copiloto de DIFARMÁS</h2><p>Supervisa prioridades y consulta ventas, inventario, vencimientos y cuentas por cobrar o pagar.</p></div><BrainCircuit size={52}/></section>
    <div className="ai-view-tabs"><button type="button" className={view==='assistant'?'active':''} onClick={()=>setView('assistant')}><BrainCircuit size={16}/> Asistente</button><button type="button" className={view==='alerts'?'active':''} onClick={()=>setView('alerts')}><Bell size={16}/> Centro de alertas <span>{activeAlerts.length}</span></button></div>
    {view==='assistant'?<>
      <div className="grid metrics ai-metrics">{insights.map(({title,value,detail,icon:Icon,kind})=><article className="card metric" key={title}><div className="metric-top"><span>{title}</span><Icon size={18}/></div><strong>{value}</strong><small>{detail}</small>{kind==='warning'&&<span className="ai-warning"><AlertTriangle size={13}/> Requiere revisión</span>}</article>)}</div>
      <section className="card ai-query"><h3><Sparkles size={18}/> ¿Qué necesitas revisar?</h3><form onSubmit={e=>{e.preventDefault();if(question.trim())generate(question.trim());}}><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ej.: ¿Qué productos debo reponer?" aria-label="Consulta al asistente"/><button className="primary" type="submit"><Search size={16}/> Analizar</button></form><div className="ai-prompts">{['Resumen del negocio','Productos por reponer','Próximos vencimientos','Ventas y rentabilidad','Cuentas por cobrar vencidas','Pagos a proveedores','Compras y gastos'].map(p=><button type="button" className="secondary" key={p} onClick={()=>generate(p)}>{p}</button>)}</div></section>
      {answer&&<section className="card ai-answer"><div className="ai-answer-head"><BrainCircuit size={20}/><strong>Análisis del asistente</strong><button className="secondary" onClick={()=>{void navigator.clipboard?.writeText(answer);}}>Copiar</button></div><pre>{answer}</pre></section>}
      <p className="ai-disclaimer">El análisis utiliza reglas automáticas y datos guardados en FARMI; no envía información a servicios externos ni sustituye la revisión humana. Confirma los datos antes de comprar, cobrar, pagar o modificar inventario.</p>
    </>:<>
      <section className="card agent-alert-summary"><div><div className="agent-alert-icon"><Bell size={20}/></div><div><h3>Supervisión operativa</h3><p>Alertas calculadas con los datos sincronizados del ERP. No ejecutan cambios en tus registros.</p></div></div><strong>{activeAlerts.length} pendientes</strong></section>
      <div className="agent-alert-toolbar"><span><Activity size={15}/> {activeAlerts.length?'Prioridades que requieren revisión':'Sin alertas pendientes'}</span><button type="button" className="secondary" onClick={()=>setHistoryOpen(open=>!open)}><Clock3 size={15}/> {historyOpen?'Ocultar historial':'Ver atendidas ('+handledAlerts.length+')'}</button></div>
      {activeAlerts.length===0?<section className="card agent-alert-empty"><CheckCircle2 size={28}/><strong>Todo al día por ahora</strong><p>Cuando los datos cumplan alguna regla de alerta, aparecerán aquí.</p></section>:<div className="agent-alert-list">{activeAlerts.map(alert=>{const Icon=iconFor(alert.category);return <article className={'card agent-alert-card severity-'+alert.severity} key={alert.id}><div className="agent-alert-symbol"><Icon size={19}/></div><div className="agent-alert-content"><div className="agent-alert-meta"><span>{alert.category}</span><b>{alert.severity==='critical'?'Urgente':alert.severity==='warning'?'Revisar':'Aviso'}</b></div><strong>{alert.title}</strong><p>{alert.detail}</p><small>Detectada: {alert.createdAt}</small></div><button type="button" className="secondary agent-alert-action" onClick={()=>markHandled(alert)}><CheckCircle2 size={15}/> Atendida</button></article>;})}</div>}
      {historyOpen&&<section className="card agent-alert-history"><h3><Clock3 size={17}/> Alertas atendidas</h3>{handledAlerts.length===0?<p>No hay alertas atendidas todavía.</p>:handledAlerts.map(alert=><div className="agent-history-row" key={alert.id}><div><strong>{alert.title}</strong><small>{alert.category} · Atendida {new Date(alert.attendedAt).toLocaleString('es-HN')}</small></div><button type="button" className="secondary" onClick={()=>restoreAlert(alert)}><RotateCcw size={14}/> Reactivar</button></div>)}</section>}
      <p className="ai-disclaimer">La primera etapa revisa los datos al abrir el módulo y cuando se actualiza la información del ERP. El historial de atendidas se guarda en este navegador y cuenta de usuario. La supervisión programada cuando FARMI está cerrado y la sincronización del historial entre dispositivos se habilitarán en una fase posterior.</p>
    </>}
  </div>;
}
