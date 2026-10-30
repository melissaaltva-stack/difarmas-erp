import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Activity, AlertTriangle, DollarSign, ShoppingCart, TrendingUp, Wallet, Search, Plus, Pencil, Package, History, Target, BrainCircuit, Scale, SlidersHorizontal, ShieldCheck, CheckCircle2, Clock3, ListChecks, ReceiptText, WalletCards, ArrowUpDown, Brain, LineChart, BarChart3, Megaphone, ShoppingBag, Award, Boxes, Users, X, Calculator, LayoutDashboard } from 'lucide-react';
import type { SaleRecord, Expense, Receivable, Payable, PurchaseRecord, CashClosure, CashMovement, PaymentTransaction, ErpSettings } from '../domain/types';
import { dateKey, localDateKey } from '../utils/dates';
const validPayment = (value:number, balance:number) => Number.isFinite(value) && value > 0 && value <= balance;
const currentMonthKey = (d = new Date()) => localDateKey(d).slice(0,7);
const isCurrentMonth = (date:string) => dateKey(date).slice(0,7) === currentMonthKey();

import { sumSales, sumProfit, sumExpenses, cashExpenses, cashMovementTotals, pendingReceivables, pendingPayables, cashSales, collectedReceivables, supplierPayments, calculateExpectedCash, createCashClosure, addCashMovement } from '../services/financeService';

const money = (value: number) => new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', maximumFractionDigits: 2 }).format(value);

export function Finance({section='resumen',sales,purchases,expenses,setExpenses,receivables,setReceivables,payables,setPayables,closures,setClosures,movements,setMovements,paymentTransactions,setPaymentTransactions,settings}:{section?:'resumen'|'gastos'|'ventas'|'compras_recibidas'|'cobrar'|'pagar'|'historial_pagos'|'movimientos'|'cierre'|'historial_cierres';sales:SaleRecord[];purchases:PurchaseRecord[];expenses:Expense[];setExpenses:Dispatch<SetStateAction<Expense[]>>;receivables:Receivable[];setReceivables:Dispatch<SetStateAction<Receivable[]>>;payables:Payable[];setPayables:Dispatch<SetStateAction<Payable[]>>;closures:CashClosure[];setClosures:React.Dispatch<React.SetStateAction<CashClosure[]>>;movements:CashMovement[];setMovements:React.Dispatch<React.SetStateAction<CashMovement[]>>;paymentTransactions:PaymentTransaction[];setPaymentTransactions:React.Dispatch<React.SetStateAction<PaymentTransaction[]>>;settings:ErpSettings}) {
  const [description,setDescription]=useState(''); const [amount,setAmount]=useState(0); const [category,setCategory]=useState('Operación'); const [expensePaymentMethod,setExpensePaymentMethod]=useState<'Efectivo'|'Transferencia'>('Efectivo');
  const [paymentAmount,setPaymentAmount]=useState<Record<number,number>>({}); const [supplierPaymentMethod,setSupplierPaymentMethod]=useState<'Efectivo'|'Transferencia'>('Efectivo'); const [collectionPaymentMethod,setCollectionPaymentMethod]=useState<'Efectivo'|'Transferencia'>('Efectivo');
  const [opening,setOpening]=useState(0); const [counted,setCounted]=useState(0); const [note,setNote]=useState('');

  const paymentLocks=useRef<Set<string>>(new Set()); const closingRef=useRef(false); const [isClosing,setIsClosing]=useState(false);
  useEffect(()=>{paymentLocks.current.clear();},[receivables,payables,paymentTransactions]);
  useEffect(()=>{closingRef.current=false;setIsClosing(false);},[closures]);

  const salesTotal=sumSales(sales); const profit=sumProfit(sales); const expenseTotal=sumExpenses(expenses); const cashExpenseTotal=cashExpenses(expenses);
  const receivablePending=pendingReceivables(receivables); const payablePending=pendingPayables(payables);
  const isCashPayment=(method:string)=>method==='Efectivo'||(settings.paymentMethods??[]).some(config=>config.name===method&&config.kind==='cash');
  const cashSalesTotal=sales.filter(sale=>isCashPayment(sale.payment)).reduce((sum,sale)=>sum+sale.total,0); const collected=collectedReceivables(receivables); const supplierPaymentsTotal=supplierPayments(payables);
  const cashCollections=receivables.reduce((sum,r)=>{
    const transactions=paymentTransactions.filter(t=>t.type==='Cobro'&&t.accountId===r.id);
    const recorded=transactions.reduce((total,t)=>total+t.amount,0);
    const cash=transactions.filter(t=>(t.paymentMethod??'Efectivo')==='Efectivo').reduce((total,t)=>total+t.amount,0);
    return sum+cash;
  },0);
  const cashSupplierPayments=payables.reduce((sum,r)=>{
    const transactions=paymentTransactions.filter(t=>t.type==='Pago proveedor'&&t.accountId===r.id);
    const recorded=transactions.reduce((total,t)=>total+t.amount,0);
    const cash=transactions.filter(t=>(t.paymentMethod??'Efectivo')==='Efectivo').reduce((total,t)=>total+t.amount,0);
    return sum+cash;
  },0);
  const { incoming: cashMovementIn, outgoing: cashMovementOut } = cashMovementTotals(movements);
  const cashFlow=cashSalesTotal+cashCollections+cashMovementIn-cashExpenseTotal-cashSupplierPayments-purchases.filter(p=>p.paymentMethod==='Efectivo').reduce((sum,p)=>sum+p.total,0)-cashMovementOut;
  const today=localDateKey();
  const dayMovementIn=movements.filter(m=>m.category!=='Banco'&&dateKey(m.date)===today&&m.type==='Entrada').reduce((a,m)=>a+m.amount,0); const dayMovementOut=movements.filter(m=>m.category!=='Banco'&&dateKey(m.date)===today&&m.type==='Salida').reduce((a,m)=>a+m.amount,0);
  const daySales=sales.filter(s=>dateKey(s.date)===today&&isCashPayment(s.payment)).reduce((a,s)=>a+s.total,0);
  const dayCollections=receivables.reduce((sum,r)=>{
    const accountTransactions=paymentTransactions.filter(t=>t.type==='Cobro'&&t.accountId===r.id);
    if(accountTransactions.length>0) {
      return sum+accountTransactions.filter(t=>dateKey(t.date)===today&&(t.paymentMethod??'Efectivo')==='Efectivo').reduce((a,t)=>a+t.amount,0);
    }
    return sum;
  },0);
  const dayExpenses=expenses.filter(e=>dateKey(e.date)===today&&(e.paymentMethod??'Efectivo')==='Efectivo').reduce((a,e)=>a+e.amount,0);
  const dayCashPurchases=purchases.filter(p=>dateKey(p.date)===today&&p.paymentMethod==='Efectivo').reduce((a,p)=>a+p.total,0);
  const daySupplierPayments=payables.reduce((sum,r)=>{
    const accountTransactions=paymentTransactions.filter(t=>t.type==='Pago proveedor'&&t.accountId===r.id);
    if(accountTransactions.length>0) {
      return sum+accountTransactions.filter(t=>dateKey(t.date)===today&&(t.paymentMethod??'Efectivo')==='Efectivo').reduce((a,t)=>a+t.amount,0);
    }
    return sum;
  },0);
  const expected=calculateExpectedCash(opening,daySales,dayCollections,dayMovementIn,dayExpenses+dayCashPurchases,daySupplierPayments,dayMovementOut);
  const addExpense=()=>{if(!description.trim()||!Number.isFinite(amount)||amount<=0)return;setExpenses(current=>[{id:Math.max(Date.now(),...current.map(e=>e.id+1)),description,amount,category,date:new Date().toISOString(),paymentMethod:expensePaymentMethod},...current]);setDescription('');setAmount(0);};
  const collect=(r:Receivable)=>{const lock='Cobro:'+r.id;if(paymentLocks.current.has(lock))return;const balance=Math.max(0,r.total-r.paid);const value=paymentAmount[r.id]||0;if(!validPayment(value,balance))return;paymentLocks.current.add(lock);const date=new Date().toISOString();setReceivables(current=>current.map(x=>x.id===r.id?{...x,paid:Math.min(x.total,x.paid+value),lastPaymentDate:date}:x));setPaymentTransactions(current=>[{id:Math.max(Date.now(),...current.map(t=>t.id+1)),type:'Cobro',accountId:r.id,party:r.customer,amount:value,date,paymentMethod:collectionPaymentMethod},...current]);setPaymentAmount(current=>({...current,[r.id]:0}));};
  const paySupplier=(r:Payable)=>{const lock='Pago proveedor:'+r.id;if(paymentLocks.current.has(lock))return;const balance=Math.max(0,r.total-r.paid);const value=paymentAmount[r.id]||0;if(!validPayment(value,balance))return;paymentLocks.current.add(lock);const date=new Date().toISOString();setPayables(current=>current.map(x=>x.id===r.id?{...x,paid:Math.min(x.total,x.paid+value),lastPaymentDate:date}:x));setPaymentTransactions(current=>[{id:Math.max(Date.now(),...current.map(t=>t.id+1)),type:'Pago proveedor',accountId:r.id,party:r.supplier,amount:value,date,paymentMethod:supplierPaymentMethod},...current]);setPaymentAmount(current=>({...current,[r.id]:0}));};
  const closeCash=()=>{if(closingRef.current||!Number.isFinite(opening)||opening<0||!Number.isFinite(counted)||counted<0)return;closingRef.current=true;setIsClosing(true);setClosures(current=>[createCashClosure(opening,daySales,dayCollections,dayExpenses,daySupplierPayments,expected,counted,note,new Date(),dayCashPurchases),...current]);setOpening(counted);setCounted(0);setNote('');};
  return <div className="content">
  {section === 'resumen' && <><div className="grid metrics"><article className="card metric"><div className="metric-top"><span>Ventas</span><ShoppingCart size={20}/></div><strong>{money(salesTotal)}</strong><small>{sales.length} operaciones</small></article><article className="card metric"><div className="metric-top"><span>Utilidad bruta</span><TrendingUp size={20}/></div><strong>{money(profit)}</strong></article><article className="card metric"><div className="metric-top"><span>Por cobrar</span><DollarSign size={20}/></div><strong>{money(receivablePending)}</strong></article><article className="card metric"><div className="metric-top"><span>Por pagar</span><Wallet size={20}/></div><strong>{money(payablePending)}</strong></article></div>
  <div className="grid metrics"><article className="card metric"><div className="metric-top"><span>Flujo de caja</span><Activity size={20}/></div><strong>{money(cashFlow)}</strong><small>Entradas de efectivo − egresos</small></article><article className="card metric"><div className="metric-top"><span>Ventas contado</span><DollarSign size={20}/></div><strong>{money(cashSalesTotal)}</strong></article><article className="card metric"><div className="metric-top"><span>Cobros</span><DollarSign size={20}/></div><strong>{money(collected)}</strong></article><article className="card metric"><div className="metric-top"><span>Pagos proveedores</span><Wallet size={20}/></div><strong>{money(supplierPaymentsTotal)}</strong></article></div></>}
  {section === 'gastos' && <div className="finance-grid"><section className="card"><div className="card-title"><div><h3>Registrar gasto</h3><p>Alquiler, servicios, personal, impuestos u otros.</p></div><Wallet size={20}/></div><div className="expense-form"><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descripción del gasto"/><input type="number" min="0" value={amount||''} onChange={e=>setAmount(Number(e.target.value))} placeholder="Monto"/><select value={category} onChange={e=>setCategory(e.target.value)}><option>Operación</option><option>Alquiler</option><option>Servicios</option><option>Personal</option><option>Impuestos</option><option>Otros</option></select><select aria-label="Forma de pago del gasto" value={expensePaymentMethod} onChange={e=>setExpensePaymentMethod(e.target.value as 'Efectivo'|'Transferencia')}><option>Efectivo</option><option>Transferencia</option></select><button className="primary" onClick={addExpense}>Registrar gasto</button></div></section>
  <section className="card"><div className="card-title"><div><h3>Últimos gastos</h3><p>Control de egresos</p></div></div>{expenses.length===0?<div className="cart-empty">Todavía no hay gastos.</div>:expenses.slice(-8).reverse().map(e=><div className="expense-row" key={e.id}><div><strong>{e.description}</strong><small>{e.category} · {e.paymentMethod??'Efectivo'}</small></div><strong>{money(e.amount)}</strong></div>)}</section></div>}
  {section === 'ventas' && (<div className="card table-wrap finance-table"><div className="card-title"><div><h3>Ventas registradas</h3><p>Historial del POS</p></div></div>{sales.length===0?<div className="cart-empty">No hay ventas.</div>:<table><thead><tr><th>Fecha</th><th>Cliente</th><th>Pago</th><th>Total</th><th>Utilidad</th></tr></thead><tbody>{sales.slice().reverse().map(x=><tr key={x.id}><td>{new Date(x.date).toLocaleString('es-HN')}</td><td>{x.customer||'Contado'}</td><td>{x.payment}</td><td>{money(x.total)}</td><td>{money(x.profit)}</td></tr>)}</tbody></table>}</div>)}
  {section === 'compras_recibidas' && (<section className="card"><div className="card-title"><div><h3>Compras recibidas</h3><p>Historial de compras y forma de pago.</p></div><ShoppingCart size={20}/></div>{purchases.length===0?<div className="cart-empty">Todavía no hay compras recibidas.</div>:purchases.slice(0,8).map(p=><div className="expense-row" key={p.id}><div><strong>{p.supplier}</strong><small>{new Date(p.date).toLocaleString('es-HN')} · {p.paymentMethod}</small></div><strong>{money(p.total)}</strong></div>)}</section>)}
  {section === 'cobrar' && <div className="finance-grid"><section className="card"><div className="card-title"><div><h3>Cuentas por cobrar</h3><p>Registra abonos de clientes.</p></div></div>{receivables.length===0?<div className="cart-empty">No hay cuentas por cobrar.</div>:receivables.slice().reverse().map(r=>{const balance=Math.max(0,r.total-r.paid);return <div className="expense-row" key={r.id}><div><strong>{r.customer}</strong><small>Saldo {money(balance)} · Vence {new Date(r.dueDate+'T00:00:00').toLocaleDateString('es-HN')}</small></div>{balance>0&&<div className="qty"><input type="number" min="0" max={balance} value={paymentAmount[r.id]||''} onChange={e=>setPaymentAmount({...paymentAmount,[r.id]:Number(e.target.value)})}/><select aria-label={'Forma de cobro de '+r.customer} value={collectionPaymentMethod} onChange={e=>setCollectionPaymentMethod(e.target.value as 'Efectivo'|'Transferencia')}><option>Efectivo</option><option>Transferencia</option></select><button onClick={()=>collect(r)}>Cobrar</button></div>}</div>})}</section></div>}
  {section === 'pagar' && (<section className="card"><div className="card-title"><div><h3>Cuentas por pagar</h3><p>Registra pagos a proveedores.</p></div></div>{payables.length===0?<div className="cart-empty">No hay cuentas por pagar.</div>:payables.slice().reverse().map(r=>{const balance=Math.max(0,r.total-r.paid);return <div className="expense-row" key={r.id}><div><strong>{r.supplier}</strong><small>Saldo {money(balance)} · Vence {new Date(r.dueDate+'T00:00:00').toLocaleDateString('es-HN')}</small></div>{balance>0&&<div className="qty"><input type="number" min="0" max={balance} value={paymentAmount[r.id]||''} onChange={e=>setPaymentAmount({...paymentAmount,[r.id]:Number(e.target.value)})}/><select aria-label={'Forma de pago a '+r.supplier} value={supplierPaymentMethod} onChange={e=>setSupplierPaymentMethod(e.target.value as 'Efectivo'|'Transferencia')}><option>Efectivo</option><option>Transferencia</option></select><button onClick={()=>paySupplier(r)}>Pagar</button></div>}</div>})}</section>)}
  {section === 'historial_pagos' && (<section className="card"><div className="card-title"><div><h3>Historial de cobros y pagos</h3><p>Abonos individuales registrados para evitar sumar saldos acumulados como si fueran efectivo del día.</p></div><Activity size={20}/></div>{paymentTransactions.length===0?<div className="cart-empty">Todavía no hay cobros o pagos individuales registrados.</div>:paymentTransactions.slice(0,12).map(t=><div className="expense-row" key={t.id}><div><strong>{t.party}</strong><small>{t.type}{t.paymentMethod?' · '+t.paymentMethod:''} · {new Date(t.date).toLocaleString('es-HN')}</small></div><strong>{t.type==='Cobro'?'+':'−'}{money(t.amount)}</strong></div>)}</section>)}
  {section === 'movimientos' && (<section className="card"><div className="card-title"><div><h3>Movimientos de caja</h3><p>Entradas y salidas manuales que afectan el efectivo.</p></div><Activity size={20}/></div><div className="expense-form"><select id="cashType"><option>Entrada</option><option>Salida</option></select><input id="cashDesc" placeholder="Descripción"/><input id="cashAmount" type="number" min="0" placeholder="Monto"/><select id="cashCat"><option>Otros</option><option>Aporte</option><option>Retiro</option><option>Préstamo</option><option>Devolución</option><option>Banco</option></select><button className="primary" onClick={()=>{const t=(document.getElementById('cashType') as HTMLSelectElement).value as 'Entrada'|'Salida';const d=(document.getElementById('cashDesc') as HTMLInputElement).value.trim();const a=Number((document.getElementById('cashAmount') as HTMLInputElement).value);const cat=(document.getElementById('cashCat') as HTMLSelectElement).value;if(!d||!Number.isFinite(a)||a<=0)return;setMovements(current=>[{...addCashMovement(t,d,a,cat),id:Math.max(Date.now(),...current.map(m=>m.id+1))},...current]);}}>Registrar</button></div>{movements.slice(0,8).map(m=><div className="expense-row" key={m.id}><div><strong>{m.description}</strong><small>{m.type} · {m.category} · {new Date(m.date).toLocaleDateString('es-HN')}</small></div><strong>{m.type==='Entrada'?'+':'-'}{money(m.amount)}</strong></div>)}</section>)}
  {section === 'cierre' && (<div className="cash-closing-page">
    <div className="cash-closing-intro"><div><span className="cash-closing-kicker">CONTROL DIARIO</span><h2>Cierre de caja</h2><p>Revisa los movimientos del día, cuenta el efectivo disponible y confirma el resultado.</p></div><div className="cash-closing-date"><span>Fecha de cierre</span><strong>{new Date().toLocaleDateString('es-HN',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</strong></div></div>
    <div className="cash-closing-metrics">
      <article className="cash-closing-metric"><span>Saldo inicial</span><strong>{money(opening)}</strong><small>Fondo al iniciar el día</small></article>
      <article className="cash-closing-metric positive"><span>Entradas del día</span><strong>{money(daySales+dayCollections+dayMovementIn)}</strong><small>Ventas, cobros y entradas manuales</small></article>
      <article className="cash-closing-metric negative"><span>Salidas del día</span><strong>{money(dayExpenses+dayCashPurchases+daySupplierPayments+dayMovementOut)}</strong><small>Gastos, compras, pagos y salidas</small></article>
      <article className="cash-closing-metric expected"><span>Efectivo esperado</span><strong>{money(expected)}</strong><small>Saldo calculado en caja</small></article>
    </div>
    <div className="cash-closing-layout">
      <section className="card cash-closing-breakdown">
        <div className="cash-closing-section-head"><div><h3>Resumen de movimientos</h3><p>Solo se consideran operaciones en efectivo registradas para hoy.</p></div><span className="cash-closing-status"><CheckCircle2 size={15}/> Datos del día</span></div>
        <div className="cash-closing-group"><h4><span className="cash-flow-dot in"/> Entradas de efectivo</h4>
          <div className="cash-closing-line"><span>Ventas de contado</span><strong>{money(daySales)}</strong></div>
          <div className="cash-closing-line"><span>Cobros a clientes</span><strong>{money(dayCollections)}</strong></div>
          <div className="cash-closing-line"><span>Otras entradas de caja</span><strong>{money(dayMovementIn)}</strong></div>
          <div className="cash-closing-subtotal"><span>Total de entradas</span><strong>{money(daySales+dayCollections+dayMovementIn)}</strong></div>
        </div>
        <div className="cash-closing-group"><h4><span className="cash-flow-dot out"/> Salidas de efectivo</h4>
          <div className="cash-closing-line"><span>Gastos pagados en efectivo</span><strong>{money(dayExpenses)}</strong></div>
          <div className="cash-closing-line"><span>Compras al contado</span><strong>{money(dayCashPurchases)}</strong></div>
          <div className="cash-closing-line"><span>Pagos a proveedores</span><strong>{money(daySupplierPayments)}</strong></div>
          <div className="cash-closing-line"><span>Otras salidas de caja</span><strong>{money(dayMovementOut)}</strong></div>
          <div className="cash-closing-subtotal"><span>Total de salidas</span><strong>{money(dayExpenses+dayCashPurchases+daySupplierPayments+dayMovementOut)}</strong></div>
        </div>
        <div className="cash-closing-formula"><span>Saldo inicial + entradas − salidas</span><strong>{money(expected)}</strong></div>
      </section>
      <section className="card cash-count-card">
        <div className="cash-closing-section-head"><div><h3>Conteo de efectivo</h3><p>Ingresa el dinero físico que tienes en caja.</p></div><Wallet size={21}/></div>
        <label className="cash-field">Saldo inicial de caja<input type="number" min="0" step="0.01" value={opening||''} onChange={e=>setOpening(Number(e.target.value))} placeholder="0.00"/></label>
        <label className="cash-field">Efectivo contado<input type="number" min="0" step="0.01" value={counted||''} onChange={e=>setCounted(Number(e.target.value))} placeholder="Escribe el total contado"/></label>
        <div className={`cash-difference ${counted-expected===0?'balanced':counted-expected>0?'surplus':'shortage'}`}><span>Diferencia de caja</span><strong>{money(counted-expected)}</strong><small>{counted-expected===0?'La caja está cuadrada':counted-expected>0?'Hay un sobrante de efectivo':'Hay un faltante de efectivo'}</small></div>
        <label className="cash-field">Observaciones <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Agrega una nota si hubo alguna diferencia..." rows={3}/></label>
        <button className="primary cash-confirm-btn" onClick={closeCash} disabled={isClosing}>{isClosing?'Guardando cierre…':'Confirmar cierre de caja'}</button>
        <small className="cash-closing-footnote">Al confirmar, el cierre quedará guardado en el historial.</small>
      </section>
    </div>
  </div>)}
  {section === 'historial_cierres' && (<section className="card"><div className="card-title"><div><h3>Historial de cierres</h3><p>Diferencias encontradas por día.</p></div></div>{closures.length===0?<div className="cart-empty">Aún no hay cierres.</div>:closures.slice(0,10).map(x=><div className="expense-row" key={x.id}><div><strong>{new Date(x.date).toLocaleDateString('es-HN')}</strong><small>Esperado {money(x.expected)} · Contado {money(x.counted)}{x.purchasesCash!==undefined?' · Compras contado '+money(x.purchasesCash):''}{x.note?' · '+x.note:''}</small></div><strong>{x.difference>=0?'+':''}{money(x.difference)}</strong></div>)}</section>)}
  </div>;
}
