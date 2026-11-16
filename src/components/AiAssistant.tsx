import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Sparkles, AlertTriangle, Package, TrendingUp, Wallet, CalendarClock, Search, Bell, CheckCircle2, Clock3, RotateCcw, Activity } from 'lucide-react';
import type { Product, SaleRecord, PurchaseRecord, Expense, Receivable, Payable, InventoryMovement } from '../domain/types';
import { localDateKey } from '../utils/dates';
import { requireSupabase } from '../services/supabaseClient';

type Props = { userId:string; products: Product[]; sales: SaleRecord[]; purchases: PurchaseRecord[]; expenses: Expense[]; receivables: Receivable[]; payables: Payable[]; movements: InventoryMovement[] };
type AgentAlert = { id:string; title:string; detail:string; category:'Inventario'|'Vencimientos'|'Cuentas por cobrar'|'Cuentas por pagar'|'Finanzas'; severity:'critical'|'warning'|'info'; createdAt:string };
type HandledAlert = AgentAlert & { attendedAt:string };
type StoredAlert = { id:string; title:string; detail:string; category:AgentAlert['category']; severity:AgentAlert['severity']; status:'pending'|'attended'; detected_at:string; attended_at:string|null };
const cash=(n:number)=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL'}).format(n);
const dayKey=()=>localDateKey();
const daysTo=(date:string)=>{if(!date)return Infinity;const d=new Date(date.length===10?date+'T12:00:00':date);return Number.isNaN(d.getTime())?Infinity:Math.ceil((d.getTime()-new Date(dayKey()+'T12:00:00').getTime())/86400000);};

export function AiAssistant({userId,products,sales,purchases,expenses,receivables,payables,movements}:Props){
  const [question,setQuestion]=useState('');
  const [answer,setAnswer]=useState('');
  const [active,setActive]=useState('resumen');
  const [view,setView]=useState<'assistant'|'analysis'|'alerts'>('assistant');
  const [storedAlerts,setStoredAlerts]=useState<StoredAlert[]>([]);
  const [alertLoadError,setAlertLoadError]=useState('');
  const [historyOpen,setHistoryOpen]=useState(false);
  useEffect(()=>{
    let alive=true;
    const load=async()=>{
      try{
        const client=requireSupabase();
        const {data,error}=await client.from('agent_alerts').select('id,title,detail,category,severity,status,detected_at,attended_at').eq('user_id',userId).eq('is_active',true).order('detected_at',{ascending:false});
        if(error)throw error;
        if(alive){setStoredAlerts((data??[]) as StoredAlert[]);setAlertLoadError('');}
      }catch(error){if(alive)setAlertLoadError(error instanceof Error?error.message:'No se pudieron cargar las alertas sincronizadas.');}
    };
    void load();
    const timer=window.setInterval(()=>void load(),60000);
    const onFocus=()=>void load();
    window.addEventListener('focus',onFocus);
    return()=>{alive=false;window.clearInterval(timer);window.removeEventListener('focus',onFocus);};
  },[userId]);

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
  const currentTime=new Date(dayKey()+'T23:59:59').getTime();
  const dayMs=86400000;
  const saleTime=(value:string)=>{const parsed=new Date(value.length===10?value+'T12:00:00':value).getTime();return Number.isFinite(parsed)?parsed:0;};
  const inPeriod=(value:string,start:number,end:number)=>{const t=saleTime(value);return t>=start&&t<end;};
  const currentPeriodSales=sales.filter(s=>inPeriod(s.date,currentTime-30*dayMs,currentTime+1));
  const previousPeriodSales=sales.filter(s=>inPeriod(s.date,currentTime-60*dayMs,currentTime-30*dayMs));
  const periodRevenue=currentPeriodSales.reduce((n,s)=>n+s.total,0);
  const previousRevenue=previousPeriodSales.reduce((n,s)=>n+s.total,0);
  const periodProfit=currentPeriodSales.reduce((n,s)=>n+s.profit,0);
  const periodExpenses=expenses.filter(e=>inPeriod(e.date,currentTime-30*dayMs,currentTime+1)).reduce((n,e)=>n+e.amount,0);
  const revenueChange=previousRevenue>0?((periodRevenue-previousRevenue)/previousRevenue)*100:null;
  const productPerformance=new Map<number,{name:string;qty:number;revenue:number;profit:number;lastSold:number}>();
  sales.filter(s=>inPeriod(s.date,currentTime-60*dayMs,currentTime+1)).forEach(s=>(s.items??[]).forEach(line=>{
    const existing=productPerformance.get(line.productId)??{name:line.productName,qty:0,revenue:0,profit:0,lastSold:0};
    existing.qty+=Number(line.qty)||0;existing.revenue+=Number(line.revenue)||0;existing.profit+=Number(line.profit)||0;
    existing.lastSold=Math.max(existing.lastSold,saleTime(s.date));productPerformance.set(line.productId,existing);
  }));
  const topProducts=[...productPerformance.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,5);
  const stockAnalysis=products.map(p=>{
    const sold=productPerformance.get(p.id)?.qty??0;
    const daily=sold/60;
    return {...p,sold60:sold,coverageDays:daily>0?p.stock/daily:null};
  });
  const noMovementProducts=stockAnalysis.filter(p=>p.stock>0&&p.sold60===0);
  const criticalCoverage=stockAnalysis.filter(p=>p.coverageDays!==null&&p.coverageDays<=7&&p.stock>0).sort((a,b)=>(a.coverageDays??0)-(b.coverageDays??0));
  const arAging=receivables.reduce((acc,item)=>{
    const balance=Math.max(0,item.total+(item.debitNotes??0)-item.paid-(item.creditNotes??0));
    const late=item.dueDate?Math.max(0,-daysTo(item.dueDate)):0;
    if(balance>0&&late>0){const bucket=late<=30?'1–30 días':late<=60?'31–60 días':'Más de 60 días';acc[bucket]+=balance;}
    return acc;
  },{'1–30 días':0,'31–60 días':0,'Más de 60 días':0});
  const apAging=payables.reduce((acc,item)=>{
    const balance=Math.max(0,item.total-item.paid);
    const late=item.dueDate?Math.max(0,-daysTo(item.dueDate)):0;
    if(balance>0&&late>0){const bucket=late<=30?'1–30 días':late<=60?'31–60 días':'Más de 60 días';acc[bucket]+=balance;}
    return acc;
  },{'1–30 días':0,'31–60 días':0,'Más de 60 días':0});
  const periodMargin=periodRevenue>0?(periodProfit/periodRevenue)*100:0;
  const periodNet=periodProfit-periodExpenses;
  const analyticalFindings=[
    ...(revenueChange!==null?[{level:revenueChange< -10?'warning':'info',title:'Tendencia de ventas',detail:'Las ventas de los últimos 30 días '+(revenueChange>=0?'subieron ':'bajaron ')+Math.abs(revenueChange).toFixed(1)+'% frente a los 30 días anteriores.'}]:[{level:'info',title:'Tendencia de ventas',detail:'Aún no hay un período anterior con ventas para comparar.'}]),
    {level:periodMargin<15&&periodRevenue>0?'warning':'info',title:'Margen bruto registrado',detail:'El margen de los últimos 30 días es '+periodMargin.toFixed(1)+'%. Verifica costos, descuentos y precios si está por debajo de tu objetivo.'},
    ...(criticalCoverage.length?[{level:'warning',title:'Riesgo de agotamiento',detail:criticalCoverage.length+' producto(s) tienen cobertura estimada de 7 días o menos, según las ventas de los últimos 60 días.'}]:[]),
    ...(noMovementProducts.length?[{level:'warning',title:'Inventario sin movimiento',detail:noMovementProducts.length+' producto(s) con existencia no registran ventas en los últimos 60 días. Revisa vencimientos y compras antes de reponer.'}]:[]),
    ...(arAging['Más de 60 días']>0?[{level:'warning',title:'Cartera antigua',detail:'Hay '+cash(arAging['Más de 60 días'])+' en cuentas por cobrar con más de 60 días de atraso.'}]:[]),
    ...(periodNet<0&&periodRevenue>0?[{level:'warning',title:'Presión de gastos',detail:'Los gastos registrados superan la utilidad bruta de los últimos 30 días por '+cash(Math.abs(periodNet))+'.'}]:[])
  ];
  const insights=useMemo(()=>[
    {title:'Inventario por reponer',value:String(stockAlerts.length),detail:'Productos en o por debajo del stock mínimo',icon:Package,kind:stockAlerts.length?'warning':'ok'},
    {title:'Próximos vencimientos',value:String(expiryAlerts.length),detail:'Productos vencidos o que vencen en 90 días',icon:CalendarClock,kind:expiryAlerts.length?'warning':'ok'},
    {title:'Cuentas por cobrar',value:cash(ar),detail:overdueAR.length+' cuentas vencidas',icon:TrendingUp,kind:overdueAR.length?'warning':'normal'},
    {title:'Cuentas por pagar',value:cash(ap),detail:overdueAP.length+' cuentas vencidas',icon:Wallet,kind:overdueAP.length?'warning':'normal'}
  ],[stockAlerts.length,expiryAlerts.length,ar,ap,overdueAR.length,overdueAP.length]);

  const activeAlerts:AgentAlert[]=storedAlerts.filter(item=>item.status==='pending').map(item=>({id:item.id,title:item.title,detail:item.detail,category:item.category,severity:item.severity,createdAt:item.detected_at.slice(0,10)}));
  const handledAlerts:HandledAlert[]=storedAlerts.filter(item=>item.status==='attended'&&item.attended_at).map(item=>({id:item.id,title:item.title,detail:item.detail,category:item.category,severity:item.severity,createdAt:item.detected_at.slice(0,10),attendedAt:item.attended_at!}));
  const markHandled=async(alert:AgentAlert)=>{
    try{const attendedAt=new Date().toISOString();const {error}=await requireSupabase().from('agent_alerts').update({status:'attended',attended_at:attendedAt}).eq('id',alert.id).eq('user_id',userId);if(error)throw error;setStoredAlerts(current=>current.map(item=>item.id===alert.id?{...item,status:'attended',attended_at:attendedAt}:item));}
    catch(error){setAlertLoadError(error instanceof Error?error.message:'No se pudo actualizar la alerta.');}
  };
  const restoreAlert=async(alert:HandledAlert)=>{
    try{const {error}=await requireSupabase().from('agent_alerts').update({status:'pending',attended_at:null}).eq('id',alert.id).eq('user_id',userId);if(error)throw error;setStoredAlerts(current=>current.map(item=>item.id===alert.id?{...item,status:'pending',attended_at:null}:item));}
    catch(error){setAlertLoadError(error instanceof Error?error.message:'No se pudo reactivar la alerta.');}
  };

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
    <div className="ai-view-tabs"><button type="button" className={view==='assistant'?'active':''} onClick={()=>setView('assistant')}><BrainCircuit size={16}/> Asistente</button><button type="button" className={view==='analysis'?'active':''} onClick={()=>setView('analysis')}><Activity size={16}/> Análisis</button><button type="button" className={view==='alerts'?'active':''} onClick={()=>setView('alerts')}><Bell size={16}/> Centro de alertas <span>{activeAlerts.length}</span></button></div>
    {view==='assistant'?<>
      <div className="grid metrics ai-metrics">{insights.map(({title,value,detail,icon:Icon,kind})=><article className="card metric" key={title}><div className="metric-top"><span>{title}</span><Icon size={18}/></div><strong>{value}</strong><small>{detail}</small>{kind==='warning'&&<span className="ai-warning"><AlertTriangle size={13}/> Requiere revisión</span>}</article>)}</div>
      <section className="card ai-query"><h3><Sparkles size={18}/> ¿Qué necesitas revisar?</h3><form onSubmit={e=>{e.preventDefault();if(question.trim())generate(question.trim());}}><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ej.: ¿Qué productos debo reponer?" aria-label="Consulta al asistente"/><button className="primary" type="submit"><Search size={16}/> Analizar</button></form><div className="ai-prompts">{['Resumen del negocio','Productos por reponer','Próximos vencimientos','Ventas y rentabilidad','Cuentas por cobrar vencidas','Pagos a proveedores','Compras y gastos'].map(p=><button type="button" className="secondary" key={p} onClick={()=>generate(p)}>{p}</button>)}</div></section>
      {answer&&<section className="card ai-answer"><div className="ai-answer-head"><BrainCircuit size={20}/><strong>Análisis del asistente</strong><button className="secondary" onClick={()=>{void navigator.clipboard?.writeText(answer);}}>Copiar</button></div><pre>{answer}</pre></section>}
      <p className="ai-disclaimer">El análisis utiliza reglas automáticas y datos guardados en FARMI; no envía información a servicios externos ni sustituye la revisión humana. Confirma los datos antes de comprar, cobrar, pagar o modificar inventario.</p>
    </>:view==='analysis'?<>
      <section className="ai-analysis-intro"><div><h3><Activity size={18}/> Análisis de los últimos 30 y 60 días</h3><p>Comparaciones y señales calculadas con ventas, líneas de productos, inventario y cuentas registradas. No se modifican datos.</p></div></section>
      <div className="grid metrics ai-analysis-metrics">
        <article className="card metric"><div className="metric-top"><span>Ventas últimos 30 días</span><TrendingUp size={18}/></div><strong>{cash(periodRevenue)}</strong><small>{revenueChange===null?'Sin período comparable':(revenueChange>=0?'↑ ':'↓ ')+Math.abs(revenueChange).toFixed(1)+'% frente a los 30 días previos'}</small></article>
        <article className="card metric"><div className="metric-top"><span>Margen bruto</span><Activity size={18}/></div><strong>{periodMargin.toFixed(1)}%</strong><small>Utilidad registrada / ventas</small></article>
        <article className="card metric"><div className="metric-top"><span>Utilidad menos gastos</span><Wallet size={18}/></div><strong>{cash(periodNet)}</strong><small>Referencia operativa de 30 días</small></article>
        <article className="card metric"><div className="metric-top"><span>Productos sin movimiento</span><Package size={18}/></div><strong>{noMovementProducts.length}</strong><small>Con existencia y sin ventas en 60 días</small></article>
      </div>
      <div className="ai-analysis-grid">
        <section className="card ai-analysis-panel"><h3>Señales detectadas</h3>{analyticalFindings.length===0?<p>No se detectaron señales relevantes con los datos disponibles.</p>:analyticalFindings.map((item,i)=><div className={'ai-finding '+item.level} key={i}><span/><div><strong>{item.title}</strong><p>{item.detail}</p></div></div>)}</section>
        <section className="card ai-analysis-panel"><h3>Productos más vendidos</h3>{topProducts.length===0?<p>No hay líneas de venta registradas en los últimos 60 días para comparar productos.</p>:topProducts.map((item,i)=><div className="ai-product-rank" key={item.name+i}><span>{i+1}</span><div><strong>{item.name}</strong><small>{item.qty.toLocaleString('es-HN')} unidades · {cash(item.revenue)}</small></div><b>{cash(item.profit)} utilidad</b></div>)}</section>
        <section className="card ai-analysis-panel"><h3>Cobertura estimada de inventario</h3>{criticalCoverage.length===0?<p>No hay productos con cobertura estimada de 7 días o menos, según ventas registradas.</p>:criticalCoverage.slice(0,6).map(item=><div className="ai-stock-risk" key={item.id}><div><strong>{item.name}</strong><small>Existencia: {item.stock} · Vendidas en 60 días: {item.sold60}</small></div><b>{Math.max(0,Math.floor(item.coverageDays??0))} días</b></div>)}</section>
        <section className="card ai-analysis-panel"><h3>Antigüedad de saldos vencidos</h3><div className="ai-aging-block"><strong>Cuentas por cobrar</strong>{Object.entries(arAging).map(([label,value])=><div key={'ar'+label}><span>{label}</span><b>{cash(value)}</b></div>)}</div><div className="ai-aging-block"><strong>Cuentas por pagar</strong>{Object.entries(apAging).map(([label,value])=><div key={'ap'+label}><span>{label}</span><b>{cash(value)}</b></div>)}</div></section>
      </div>
      <p className="ai-disclaimer">La cobertura es una estimación basada en el promedio de unidades vendidas en 60 días; no contempla estacionalidad, pedidos pendientes ni tiempos de entrega. Los análisis dependen de que las ventas y costos estén completos. Verifica los registros antes de tomar decisiones.</p>
    </>:<>
      <section className="card agent-alert-summary"><div><div className="agent-alert-icon"><Bell size={20}/></div><div><h3>Supervisión operativa</h3><p>Alertas calculadas con los datos sincronizados del ERP. No ejecutan cambios en tus registros.</p></div></div><strong>{activeAlerts.length} pendientes</strong></section>
      {alertLoadError&&<p className="sync-error" role="alert">{alertLoadError}</p>}
      <div className="agent-alert-toolbar"><span><Activity size={15}/> {activeAlerts.length?'Prioridades que requieren revisión':'Sin alertas pendientes'}</span><button type="button" className="secondary" onClick={()=>setHistoryOpen(open=>!open)}><Clock3 size={15}/> {historyOpen?'Ocultar historial':'Ver atendidas ('+handledAlerts.length+')'}</button></div>
      {activeAlerts.length===0?<section className="card agent-alert-empty"><CheckCircle2 size={28}/><strong>Todo al día por ahora</strong><p>Cuando los datos cumplan alguna regla de alerta, aparecerán aquí.</p></section>:<div className="agent-alert-list">{activeAlerts.map(alert=>{const Icon=iconFor(alert.category);return <article className={'card agent-alert-card severity-'+alert.severity} key={alert.id}><div className="agent-alert-symbol"><Icon size={19}/></div><div className="agent-alert-content"><div className="agent-alert-meta"><span>{alert.category}</span><b>{alert.severity==='critical'?'Urgente':alert.severity==='warning'?'Revisar':'Aviso'}</b></div><strong>{alert.title}</strong><p>{alert.detail}</p><small>Detectada: {alert.createdAt}</small></div><button type="button" className="secondary agent-alert-action" onClick={()=>markHandled(alert)}><CheckCircle2 size={15}/> Atendida</button></article>;})}</div>}
      {historyOpen&&<section className="card agent-alert-history"><h3><Clock3 size={17}/> Alertas atendidas</h3>{handledAlerts.length===0?<p>No hay alertas atendidas todavía.</p>:handledAlerts.map(alert=><div className="agent-history-row" key={alert.id}><div><strong>{alert.title}</strong><small>{alert.category} · Atendida {new Date(alert.attendedAt).toLocaleString('es-HN')}</small></div><button type="button" className="secondary" onClick={()=>restoreAlert(alert)}><RotateCcw size={14}/> Reactivar</button></div>)}</section>}
      <p className="ai-disclaimer">Las alertas se calculan automáticamente en Supabase cada dos horas, incluso cuando FARMI está cerrado. El historial y el estado de atención se sincronizan entre dispositivos. El agente solo lee datos del ERP y no realiza cambios en ventas, inventario ni finanzas.</p>
    </>}
  </div>;
}
