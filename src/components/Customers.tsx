import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Plus, Search, Pencil, UserRound, UsersRound, X, Save, Ban, CheckCircle2, FileText, CreditCard, Receipt, Pill, Printer, History, Trash2, CalendarDays, ClipboardPlus } from 'lucide-react';
import type { Customer, MedicationInstructionItem, MedicationInstructionRecord, Receivable, PaymentTransaction } from '../domain/types';
import { nextCustomerCode } from '../services/customerCodeService';

type CustomerForm = {
  name:string; customerType:'Persona natural'|'Persona jurídica'; documentType:'RTN'|'Identidad'|'Pasaporte'|'Otro'; documentNumber:string;
  rtn:string; legalName:string; taxRegime:string; phone:string; email:string; billingEmail:string; address:string;
  creditLimit:string; paymentTerms:'Contado'|'Crédito'; creditDays:string; assignedSeller:string; priceList:string;
  active:boolean; notes:string;
};
const emptyForm:CustomerForm={name:'',customerType:'Persona natural',documentType:'Identidad',documentNumber:'',rtn:'',legalName:'',taxRegime:'Persona Natural',phone:'',email:'',billingEmail:'',address:'',creditLimit:'0',paymentTerms:'Contado',creditDays:'0',assignedSeller:'',priceList:'Precio de venta 1',active:true,notes:''};
const customerToForm=(customer:Customer):CustomerForm=>({
  name:customer.name,customerType:customer.customerType==='Empresa'?'Persona jurídica':(customer.customerType??'Persona natural'),documentType:customer.documentType??'Identidad',
  documentNumber:customer.documentNumber??'',rtn:customer.rtn??'',legalName:customer.legalName??'',
  taxRegime:customer.taxRegime??(customer.customerType==='Empresa'||customer.customerType==='Persona jurídica'?'Régimen General':'Persona Natural'),
  phone:customer.phone??'',email:customer.email??'',billingEmail:customer.billingEmail??customer.email??'',
  address:customer.address??'',creditLimit:String(customer.creditLimit??0),paymentTerms:customer.paymentTerms??'Contado',
  creditDays:String(customer.creditDays??0),assignedSeller:customer.assignedSeller??'',priceList:customer.priceList??'Precio de venta 1',
  active:customer.active,notes:customer.notes??''
});
const toCustomer=(form:CustomerForm,id:number,code:string):Customer=>({
  id,code,name:form.name.trim(),customerType:form.customerType,documentType:form.documentType,documentNumber:form.documentNumber.trim(),
  rtn:form.rtn.trim(),legalName:form.legalName.trim(),taxRegime:form.taxRegime,phone:form.phone.trim(),email:form.email.trim(),
  billingEmail:form.billingEmail.trim(),address:form.address.trim(),creditLimit:Number(form.creditLimit)||0,
  paymentTerms:form.paymentTerms,creditDays:form.paymentTerms==='Crédito'?Number(form.creditDays)||0:0,
  assignedSeller:form.assignedSeller.trim(),priceList:form.priceList,active:form.active,notes:form.notes.trim()
});
const money=(value:number)=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL',maximumFractionDigits:2}).format(value);
const receivableBalance=(item:Receivable)=>Math.max(0,item.total+(item.debitNotes||0)-item.paid-(item.creditNotes||0));


function CustomerReceivablesSection({customer,receivables,setReceivables,transactions,setTransactions,canWrite}:{customer:Customer;receivables:Receivable[];setReceivables:Dispatch<SetStateAction<Receivable[]>>;transactions:PaymentTransaction[];setTransactions:Dispatch<SetStateAction<PaymentTransaction[]>>;canWrite:boolean}) {
  const [amounts,setAmounts]=useState<Record<number,string>>({}); const [methods,setMethods]=useState<Record<number,'Efectivo'|'Transferencia'>>({}); const [references,setReferences]=useState<Record<number,string>>({}); const [notice,setNotice]=useState('');
  const matches=receivables.filter(item=>item.customer.trim().toLocaleLowerCase()===customer.name.trim().toLocaleLowerCase());
  const balance=receivableBalance; const pending=matches.reduce((sum,item)=>sum+balance(item),0);
  const dateLabel=(value:string)=>{if(!value)return '—';const parsed=new Date(value.length===10?value+'T12:00:00':value);return Number.isNaN(parsed.getTime())?value:parsed.toLocaleDateString('es-HN');};
  const collect=(item:Receivable)=>{const value=Number(amounts[item.id]||0),remaining=balance(item);if(!canWrite){setNotice('Espera a que la información esté sincronizada para registrar un abono.');return;}if(!Number.isFinite(value)||value<=0||value>remaining){setNotice('Ingresa un abono mayor que cero y no superior al saldo pendiente.');return;}const method=methods[item.id]||'Efectivo',reference=(references[item.id]||'').trim();if(method==='Transferencia'&&!reference){setNotice('Ingresa la referencia de la transferencia para registrar el cobro.');return;}const date=new Date().toISOString();setReceivables(current=>current.map(row=>row.id===item.id?{...row,paid:Math.min(row.total,row.paid+value),lastPaymentDate:date}:row));setTransactions(current=>[{id:Math.max(Date.now(),...current.map(row=>Number(row.id)||0))+1,type:'Cobro',accountId:item.id,party:item.customer,amount:value,date,paymentMethod:method,reference,balanceBefore:remaining,balanceAfter:Math.max(0,remaining-value)},...current]);setAmounts(current=>({...current,[item.id]:''}));setReferences(current=>({...current,[item.id]:''}));setNotice('Abono registrado correctamente.');};
  const customerTransactions=transactions.filter(item=>item.type==='Cobro'&&item.party.trim().toLocaleLowerCase()===customer.name.trim().toLocaleLowerCase());
  return <section className="customer-receivables-section"><div className="customer-receivables-heading"><div><h3><CreditCard size={17}/> Cuentas por cobrar</h3><p>Ventas a crédito, saldos pendientes y abonos de este cliente</p></div><strong>{money(pending)}</strong></div>
    {notice&&<p className="customer-receivables-notice" role="status">{notice}</p>}
    {matches.length===0?<div className="customer-receivables-empty">Este cliente no tiene ventas registradas en cuentas por cobrar.</div>:<div className="customer-receivables-list">{matches.map(item=>{const remaining=balance(item);return <article className="customer-receivable-item" key={item.id}><div className="customer-receivable-meta"><strong>Venta #{item.saleId}</strong><span>{dateLabel(item.date)} · Vence: {dateLabel(item.dueDate)}</span></div><div className="customer-receivable-amounts"><span>Total <b>{money(item.total)}</b></span><span>Abonado <b>{money(item.paid)}</b></span><span>Saldo <b>{money(remaining)}</b></span></div>{remaining>0&&<div className="customer-receivable-payment"><input type="number" min="0.01" max={remaining} step="0.01" value={amounts[item.id]??''} onChange={event=>setAmounts(current=>({...current,[item.id]:event.target.value}))} placeholder="Monto del abono"/><select value={methods[item.id]||'Efectivo'} onChange={event=>setMethods(current=>({...current,[item.id]:event.target.value as 'Efectivo'|'Transferencia'}))}><option>Efectivo</option><option>Transferencia</option></select>{(methods[item.id]||'Efectivo')==='Transferencia'&&<input value={references[item.id]??''} onChange={event=>setReferences(current=>({...current,[item.id]:event.target.value}))} placeholder="Referencia de transferencia" aria-label="Referencia de transferencia"/>}<button type="button" className="primary" disabled={!canWrite} onClick={()=>collect(item)}><Plus size={14}/> Registrar abono</button></div>}{remaining===0&&<span className="customer-receivable-paid">Cuenta pagada</span>}</article>;})}</div>}
    <div className="customer-receivables-history"><strong>Historial de abonos</strong>{customerTransactions.length?customerTransactions.slice(0,5).map(item=><div key={item.id}><span>{dateLabel(item.date)} · {item.paymentMethod||'—'}</span><b>{money(item.amount)}</b></div>):<small>Aún no hay abonos registrados.</small>}</div></section>;
}
function CustomerReceivablesOverview({customers,receivables,setReceivables,transactions,setTransactions,query,canWrite}:{customers:Customer[];receivables:Receivable[];setReceivables:Dispatch<SetStateAction<Receivable[]>>;transactions:PaymentTransaction[];setTransactions:Dispatch<SetStateAction<PaymentTransaction[]>>;query:string;canWrite:boolean}) {
  const open=receivables.filter(item=>receivableBalance(item)>0); const total=open.reduce((sum,item)=>sum+receivableBalance(item),0);
  const overdue=open.filter(item=>item.dueDate&&new Date(item.dueDate.length===10?item.dueDate+'T23:59:59':item.dueDate).getTime()<Date.now()).length;
  const names=new Set(receivables.map(item=>item.customer.trim().toLocaleLowerCase())); const list=customers.filter(customer=>names.has(customer.name.trim().toLocaleLowerCase())&&customer.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="customer-ar-overview"><div className="inventory-alerts"><div className="card alert-card"><CreditCard size={18}/><div><strong>{money(total)}</strong><small>Saldo total pendiente</small></div></div><div className="card alert-card"><Receipt size={18}/><div><strong>{open.length}</strong><small>Ventas pendientes</small></div></div><div className="card alert-card"><CalendarDays size={18}/><div><strong>{overdue}</strong><small>Ventas vencidas</small></div></div></div>
    {list.length===0?<div className="card customer-ar-empty">No hay cuentas por cobrar para mostrar{query?' con esa búsqueda.':'.'}</div>:<div className="customer-ar-customer-list">{list.map(customer=><section className="card customer-ar-customer" key={customer.id}><header><div><strong>{customer.name}</strong><small>{customer.code||'Sin código'} · {customer.phone||'Sin teléfono'}</small></div><span>{money(receivables.filter(item=>item.customer.trim().toLocaleLowerCase()===customer.name.trim().toLocaleLowerCase()).reduce((sum,item)=>sum+receivableBalance(item),0))}</span></header><CustomerReceivablesSection customer={customer} receivables={receivables} setReceivables={setReceivables} transactions={transactions} setTransactions={setTransactions} canWrite={canWrite}/></section>)}</div>}</div>;
}
function CustomerEditorFields({form,setForm,customers,editing}:{form:CustomerForm;setForm:Dispatch<SetStateAction<CustomerForm>>;customers:Customer[];editing:Customer|null}) {
  const code=editing?.code??nextCustomerCode(customers);
  return <>
    <div className="customer-form-top">
      <label className="customer-form-field"><span>Código de cliente</span><input value={code} readOnly aria-label="Código de cliente asignado automáticamente"/></label>
      <label className="customer-form-field"><span>Nombre de cliente o Razón social *</span><input autoFocus value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Nombre de cliente o razón social" maxLength={160}/></label>
    </div>
    <div className="customer-form-layout">
      <div className="customer-form-main">
        <section className="customer-form-section">
          <h3><UserRound size={17}/> Información personal</h3>
          <div className="customer-form-grid">
            <label className="customer-form-field"><span>Tipo de cliente</span><select value={form.customerType} onChange={e=>setForm(f=>({...f,customerType:e.target.value as CustomerForm['customerType']}))}><option>Persona natural</option><option>Persona jurídica</option></select></label>
            <label className="customer-form-field"><span>Tipo de documento *</span><select value={form.documentType} onChange={e=>setForm(f=>({...f,documentType:e.target.value as CustomerForm['documentType']}))}><option value="RTN">RTN</option><option value="Identidad">Identidad</option><option value="Pasaporte">Pasaporte</option><option value="Otro">Otro</option></select></label>
            <label className="customer-form-field"><span>N.º de documento</span><input value={form.documentNumber} onChange={e=>setForm(f=>({...f,documentNumber:e.target.value}))} placeholder="Número de identidad o documento" maxLength={40}/></label>
            <label className="customer-form-field customer-form-full"><span>Dirección</span><input value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} placeholder="Dirección del cliente" maxLength={240}/></label>
            <label className="customer-form-field"><span>Teléfono</span><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="Ej. 9999-1234" autoComplete="tel" maxLength={40}/></label>
            <label className="customer-form-field"><span>Correo electrónico</span><input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="cliente@correo.com" autoComplete="email" maxLength={160}/></label>
          </div>
        </section>

        <section className="customer-form-section customer-form-observations">
          <h3><FileText size={17}/> Observaciones</h3>
          <label className="customer-form-field"><span>Notas internas del cliente</span><textarea rows={3} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Notas internas o información adicional del cliente..." maxLength={1000}/></label>
        </section>
      </div>
      <aside className="customer-form-sidebar">
        <section className="customer-active-panel">
          <label className="customer-active-toggle">
            <input type="checkbox" checked={form.active} onChange={e=>setForm(f=>({...f,active:e.target.checked}))}/>
            <span className="customer-switch" aria-hidden="true"/>
            <span className="customer-active-copy"><strong>Cliente activo</strong><small>Puede realizar compras y acumular crédito.</small></span>
          </label>
        </section>
        <section className="customer-form-section customer-payment-section">
          <h3><CreditCard size={17}/> Términos de pago</h3>
          <div className="customer-form-grid">
            <label className="customer-form-field"><span>Término de pago *</span><select value={form.paymentTerms} onChange={e=>setForm(f=>({...f,paymentTerms:e.target.value as CustomerForm['paymentTerms'],creditDays:e.target.value==='Contado'?'0':(Number(f.creditDays)>0?f.creditDays:'30')}))}><option value="Contado">Contado</option><option value="Crédito">Crédito</option></select></label>
            <label className="customer-form-field"><span>Días de crédito</span><input type="number" min="0" max="365" step="1" value={form.creditDays} disabled={form.paymentTerms!=='Crédito'} onChange={e=>setForm(f=>({...f,creditDays:e.target.value}))}/></label>
            <label className="customer-form-field customer-form-full"><span>Límite de crédito (L)</span><input type="number" min="0" step="0.01" value={form.creditLimit} onChange={e=>setForm(f=>({...f,creditLimit:e.target.value}))}/></label>
          </div>
        </section>
        <section className="customer-form-section customer-additional-section">
          <h3><Receipt size={17}/> Información adicional</h3>
          <label className="customer-form-field"><span>Vendedor asignado</span><input value={form.assignedSeller} onChange={e=>setForm(f=>({...f,assignedSeller:e.target.value}))} placeholder="Nombre del vendedor" maxLength={100}/></label>
          <label className="customer-form-field"><span>Lista de precios</span><select value={form.priceList} onChange={e=>setForm(f=>({...f,priceList:e.target.value}))}><option>Precio de venta 1</option><option>Precio de venta mayoreo</option><option>Precio especial</option></select></label>
          <p className="customer-additional-hint">Los términos y el límite se conservarán en la ficha del cliente.</p>
        </section>
      </aside>
    </div>
  </>;
}

export function Customers({customers,setCustomers,receivables,setReceivables,transactions,setTransactions,remoteReady,syncStatus}:{customers:Customer[];setCustomers:(value:Customer[]|((current:Customer[])=>Customer[]))=>void;receivables:Receivable[];setReceivables:Dispatch<SetStateAction<Receivable[]>>;transactions:PaymentTransaction[];setTransactions:Dispatch<SetStateAction<PaymentTransaction[]>>;remoteReady:boolean;syncStatus:'loading'|'saving'|'synced'|'error'}) {
  const [query,setQuery]=useState('');
  const [activeSection,setActiveSection]=useState<'clientes'|'cuentas_cobrar'>('clientes');
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState<Customer|null>(null);
  const [form,setForm]=useState<CustomerForm>(emptyForm);
  const [error,setError]=useState('');
  const [detailCustomer,setDetailCustomer]=useState<Customer|null>(null);
  const [medicationCustomer,setMedicationCustomer]=useState<Customer|null>(null);
  const lastCustomerId=useRef(0);
  const rowClickTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const nextCustomerId=()=>{const highestStoredId=customers.reduce((highest,customer)=>Math.max(highest,Number(customer.id)||0),0);const nextId=Math.max(Date.now(),highestStoredId,lastCustomerId.current)+1;lastCustomerId.current=nextId;return nextId;};
  const [statusFilter,setStatusFilter]=useState<'Todos'|'Activo'|'Inactivo'>('Todos');
  const [typeFilter,setTypeFilter]=useState<'Todos'|'Persona natural'|'Persona jurídica'>('Todos');
  const [termsFilter,setTermsFilter]=useState<'Todos'|'Contado'|'Crédito'>('Todos');
  const filtered=useMemo(()=>customers.filter(c=>[c.code??'',c.name,c.rtn??'',c.phone,c.email??'',c.address??''].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())&&(statusFilter==='Todos'||(statusFilter==='Activo'?c.active:!c.active))&&(typeFilter==='Todos'||(c.customerType??'Persona natural')===typeFilter)&&(termsFilter==='Todos'||(c.paymentTerms??'Contado')===termsFilter)),[customers,query,statusFilter,typeFilter,termsFilter]);
  const startNew=()=>{setEditing(null);setForm(emptyForm);setError('');setShowForm(true);};
  const startEdit=(customer:Customer)=>{setEditing(customer);setForm(customerToForm(customer));setError('');setShowForm(true);};
  const closeForm=()=>{setShowForm(false);setEditing(null);setForm(emptyForm);setError('');};
  const save=()=>{
    const name=form.name.trim(),creditLimit=Number(form.creditLimit),creditDays=Number(form.creditDays);
    if(!name){setError('Escribe el nombre del cliente o razón social.');return;}
    if(!Number.isFinite(creditLimit)||creditLimit<0){setError('El límite de crédito debe ser un monto igual o mayor a cero.');return;}
    if(!Number.isInteger(creditDays)||creditDays<0||creditDays>365){setError('Los días de crédito deben ser un número entero entre 0 y 365.');return;}
    if(form.paymentTerms==='Crédito'&&creditDays<1){setError('Para términos de crédito, indica al menos 1 día de plazo.');return;}
    const rtn=form.rtn.trim();
    if(rtn&&customers.some(c=>c.id!==editing?.id&&(c.rtn??'').replace(/[^0-9A-Za-z]/g,'').toLowerCase()===rtn.replace(/[^0-9A-Za-z]/g,'').toLowerCase())){setError('Ya existe un cliente con ese RTN.');return;}
    const record={...toCustomer(form,editing?.id??nextCustomerId(),editing?.code??nextCustomerCode(customers)),medicationInstructions:editing?.medicationInstructions};
    setCustomers(current=>editing?current.map(c=>c.id===editing.id?record:c):[record,...current]);
    setShowForm(false);setEditing(null);setForm(emptyForm);setError('');
  };
  const toggleActive=(customer:Customer)=>setCustomers(current=>current.map(c=>c.id===customer.id?{...c,active:!c.active}:c));
  return <div className="content customers-page">
    <div className="inventory-toolbar card customer-search-toolbar"><div className="customer-search-actions-row"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por nombre, RTN, teléfono o correo..."/></div><button className="primary" onClick={startNew}><Plus size={17}/> Nuevo cliente</button></div><span className="count">{activeSection==='clientes'?filtered.length+' de '+customers.length+' clientes':receivables.filter(item=>item.total>item.paid).length+' cuentas pendientes'}</span></div>
    {activeSection==='clientes'?<>
    <div className="card" style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'end',marginBottom:14}}>
      <label style={{fontSize:11,minWidth:145}}>Estado<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as typeof statusFilter)} style={{display:'block',width:'100%',marginTop:5}}><option>Todos</option><option>Activo</option><option>Inactivo</option></select></label>
      <label style={{fontSize:11,minWidth:160}}>Tipo de cliente<select value={typeFilter} onChange={e=>setTypeFilter(e.target.value as typeof typeFilter)} style={{display:'block',width:'100%',marginTop:5}}><option>Todos</option><option>Persona natural</option><option>Empresa</option></select></label>
      <label style={{fontSize:11,minWidth:145}}>Términos de pago<select value={termsFilter} onChange={e=>setTermsFilter(e.target.value as typeof termsFilter)} style={{display:'block',width:'100%',marginTop:5}}><option>Todos</option><option>Contado</option><option>Crédito</option></select></label>
      <button type="button" className="secondary" onClick={()=>{setStatusFilter('Todos');setTypeFilter('Todos');setTermsFilter('Todos');setQuery('');}}>Limpiar filtros</button>
      <span className="count">{filtered.length} resultados</span>
    </div>
    <div className="inventory-alerts">
      <div className="card alert-card"><UsersRound size={18}/><div><strong>{customers.length} registrados</strong><small>Todos los clientes guardados en el ERP.</small></div></div>
      <div className="card alert-card"><CheckCircle2 size={18}/><div><strong>{customers.filter(c=>c.active).length} activos</strong><small>Disponibles para futuras operaciones.</small></div></div>
      <div className="card alert-card"><Ban size={18}/><div><strong>{customers.filter(c=>!c.active).length} inactivos</strong><small>Se conservan sus datos e historial.</small></div></div>
    </div>
    <div className="card table-wrap customer-table-wrap"><table><thead><tr><th>Código</th><th>Cliente</th><th>RTN / Identificación</th><th>Términos de pago</th><th>Teléfono</th><th>Correo</th><th>Límite de crédito</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      {filtered.map(customer=><tr key={customer.id} className="customer-clickable-row" tabIndex={0} role="button" aria-label={"Ver información de "+customer.name+". Doble clic para editar."} title="Clic para ver información · Doble clic para editar" onClick={e=>{if((e.target as HTMLElement).closest("button,a,input,select,textarea,label"))return;if(rowClickTimer.current)clearTimeout(rowClickTimer.current);rowClickTimer.current=setTimeout(()=>{setDetailCustomer(customer);rowClickTimer.current=null;},260);}} onDoubleClick={e=>{if((e.target as HTMLElement).closest("button,a,input,select,textarea,label"))return;if(rowClickTimer.current){clearTimeout(rowClickTimer.current);rowClickTimer.current=null;}setDetailCustomer(null);startEdit(customer);}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();setDetailCustomer(customer);}}}><td><span className="customer-code">{customer.code}</span></td><td><div className="product-cell"><div className="customer-avatar"><UserRound size={18}/></div><div><span className="customer-name-link">{customer.name}</span><small>{customer.customerType==='Empresa'?'Persona jurídica':(customer.customerType??'Persona natural')}{customer.address?' · '+customer.address:''}</small></div></div></td><td>{customer.rtn||customer.documentNumber||'—'}</td><td><span className="customer-term">{customer.paymentTerms??'Contado'}{customer.paymentTerms==='Crédito'&&customer.creditDays?' · '+customer.creditDays+' días':''}</span></td><td>{customer.phone||'—'}</td><td>{customer.email||'—'}</td><td>{money(customer.creditLimit??0)}</td><td><span className={customer.active?'stock':'stock low'}>{customer.active?'Activo':'Inactivo'}</span></td><td><div className="customer-actions" onClick={e=>e.stopPropagation()}><button className="icon-btn" title="Editar cliente" aria-label={'Editar '+customer.name} onClick={()=>startEdit(customer)}><Pencil size={16}/></button><button className="secondary" onClick={()=>toggleActive(customer)}>{customer.active?'Desactivar':'Activar'}</button></div></td></tr>)}
      {filtered.length===0&&<tr><td colSpan={9}><div className="empty"><UserRound size={30}/><strong>{query||statusFilter!=='Todos'||typeFilter!=='Todos'||termsFilter!=='Todos'?'No se encontraron clientes':'Aún no hay clientes registrados'}</strong><p>{query||statusFilter!=='Todos'||typeFilter!=='Todos'||termsFilter!=='Todos'?'Cambia o limpia los filtros para ver más resultados.':'Pulsa “Nuevo cliente” para registrar el primero.'}</p></div></td></tr>}
    </tbody></table></div>
    </>:<CustomerReceivablesOverview customers={customers} receivables={receivables} setReceivables={setReceivables} transactions={transactions} setTransactions={setTransactions} query={query} canWrite={remoteReady&&syncStatus==='synced'}/>}
    {detailCustomer&&<div className="modal-backdrop customer-detail-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDetailCustomer(null);}}><section className="modal customer-detail-modal" role="dialog" aria-modal="true" aria-label={"Información de "+detailCustomer.name}><header className="customer-detail-header"><div className="customer-detail-avatar"><UserRound size={23}/></div><div><h2>{detailCustomer.name}</h2><p>{detailCustomer.code??"Sin código"} · {detailCustomer.customerType==='Empresa'?"Persona jurídica":(detailCustomer.customerType??"Persona natural")}</p></div><button type="button" className="icon-btn" aria-label="Cerrar" onClick={()=>setDetailCustomer(null)}><X size={18}/></button></header><div className="customer-detail-grid"><div><small>Documento</small><strong>{detailCustomer.documentNumber||detailCustomer.rtn||"—"}</strong></div><div><small>RTN</small><strong>{detailCustomer.rtn||"—"}</strong></div><div><small>Teléfono</small><strong>{detailCustomer.phone||"—"}</strong></div><div><small>Correo electrónico</small><strong>{detailCustomer.email||"—"}</strong></div><div className="customer-detail-full"><small>Dirección</small><strong>{detailCustomer.address||"—"}</strong></div><div><small>Términos de pago</small><strong>{detailCustomer.paymentTerms??"Contado"}{detailCustomer.paymentTerms==="Crédito"&&detailCustomer.creditDays?" · "+detailCustomer.creditDays+" días":""}</strong></div><div><small>Límite de crédito</small><strong>{money(detailCustomer.creditLimit??0)}</strong></div><div><small>Estado</small><strong>{detailCustomer.active?"Activo":"Inactivo"}</strong></div><div><small>Vendedor asignado</small><strong>{detailCustomer.assignedSeller||"—"}</strong></div><div className="customer-detail-full"><small>Observaciones</small><strong className="customer-detail-notes">{detailCustomer.notes||"Sin observaciones"}</strong></div></div><CustomerReceivablesSection customer={detailCustomer} receivables={receivables} setReceivables={setReceivables} transactions={transactions} setTransactions={setTransactions} canWrite={remoteReady&&syncStatus==='synced'}/><div className="customer-detail-footer"><span><History size={16}/> {(detailCustomer.medicationInstructions??[]).length} indicaciones guardadas</span><button type="button" className="icon-btn customer-create-instruction" title="Crear indicación médica" aria-label="Crear indicación médica" onClick={()=>{setMedicationCustomer(detailCustomer);setDetailCustomer(null);}}><ClipboardPlus size={20}/></button></div></section></div>}
    {medicationCustomer&&<MedicationInstructions customers={customers} setCustomers={setCustomers} initialCustomerId={medicationCustomer.id} onClose={()=>setMedicationCustomer(null)}/>}
    {showForm&&<div className="modal-backdrop customer-form-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closeForm();}}><div className="modal customer-modal customer-form-modal" role="dialog" aria-modal="true" aria-label={editing?'Editar cliente':'Registrar nuevo cliente'}>
      <div className="customer-form-header"><div className="customer-form-title-icon"><UserRound size={22}/></div><div><h2>{editing?'Editar cliente':'Registrar nuevo cliente'}</h2><p>Administra datos de contacto, información fiscal y condiciones de pago.</p></div><button className="icon-btn" type="button" onClick={closeForm} aria-label="Cerrar"><X size={18}/></button></div>
      <CustomerEditorFields form={form} setForm={setForm} customers={customers} editing={editing}/>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="customer-form-footer"><button className="secondary" type="button" onClick={closeForm}>Cancelar</button><button className="primary" type="button" onClick={save}><Save size={16}/> Guardar</button></div>
    </div></div>}
  </div>;
}

const newMedicationRow=():MedicationInstructionItem=>({id:crypto.randomUUID(),name:"",concentration:"",dosage:"",schedule:"",duration:"",notes:""});

function MedicationInstructions({customers,setCustomers,initialCustomerId,onClose}:{customers:Customer[];setCustomers:(value:Customer[]|((current:Customer[])=>Customer[]))=>void;initialCustomerId:number;onClose:()=>void}) {
  const [customerId]=useState<number|null>(initialCustomerId);
  const [items,setItems]=useState<MedicationInstructionItem[]>([newMedicationRow()]);
  const [generalNotes,setGeneralNotes]=useState("");
  const [preparedBy,setPreparedBy]=useState("");
  const [error,setError]=useState("");
  const [printData,setPrintData]=useState<{customer:Customer;record:MedicationInstructionRecord}|null>(null);
  const selectedCustomer=customers.find(customer=>customer.id===customerId)??null;
  const history=selectedCustomer?.medicationInstructions??[];
  const updateItem=(id:string,key:keyof MedicationInstructionItem,value:string)=>setItems(current=>current.map(item=>item.id===id?{...item,[key]:value}:item));
  const save=()=>{
    if(!selectedCustomer){setError("Selecciona un cliente.");return;}
    const validItems=items.filter(item=>item.name.trim());
    if(!validItems.length){setError("Agrega al menos un medicamento.");return;}
    if(validItems.some(item=>!item.dosage.trim()||!item.schedule.trim())){setError("Completa la dosis y el horario de cada medicamento.");return;}
    const record:MedicationInstructionRecord={id:crypto.randomUUID(),createdAt:new Date().toISOString(),items:validItems.map(item=>({...item,name:item.name.trim(),concentration:item.concentration.trim(),dosage:item.dosage.trim(),schedule:item.schedule.trim(),duration:item.duration.trim(),notes:item.notes.trim()})),generalNotes:generalNotes.trim(),preparedBy:preparedBy.trim()};
    setCustomers(current=>current.map(customer=>customer.id===selectedCustomer.id?{...customer,medicationInstructions:[record,...(customer.medicationInstructions??[])]}:customer));
    setItems([newMedicationRow()]);setGeneralNotes("");setError("");
    setPrintData({customer:selectedCustomer,record});
    window.setTimeout(()=>window.print(),250);
  };
  const printExisting=(record:MedicationInstructionRecord)=>{if(selectedCustomer){setPrintData({customer:selectedCustomer,record});window.setTimeout(()=>window.print(),150);}};
  const dateLabel=(value:string)=>new Date(value).toLocaleDateString("es-HN",{year:"numeric",month:"long",day:"numeric"});
  return <div className="modal-backdrop medication-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="modal medication-instructions-modal" role="dialog" aria-modal="true" aria-label={"Nueva indicación médica para "+(selectedCustomer?.name??"cliente")}>
    <header className="medication-modal-header"><div><h2><Pill size={22}/> Nueva indicación médica</h2><p>Cliente: {selectedCustomer?.name??"—"}</p></div><button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}><X size={18}/></button></header>
    <section className="card medication-editor-card">
      <div className="medication-section-title"><div><h3>Nueva indicación</h3></div></div>
      {selectedCustomer&&<div className="medication-customer-summary"><UserRound size={18}/><div><strong>{selectedCustomer.name}</strong><small>{selectedCustomer.phone||"Sin teléfono"}{selectedCustomer.documentNumber?" · "+selectedCustomer.documentNumber:""}</small></div></div>}
      <div className="medication-list-heading"><h4>Medicamentos</h4><button type="button" className="secondary" onClick={()=>setItems(current=>[...current,newMedicationRow()])}><Plus size={15}/> Agregar medicamento</button></div>
      <div className="medication-entry-list">{items.map((item,index)=><div className="medication-entry" key={item.id}><div className="medication-entry-top"><strong>Medicamento {index+1}</strong>{items.length>1&&<button type="button" className="icon-btn" title="Quitar medicamento" aria-label="Quitar medicamento" onClick={()=>setItems(current=>current.filter(row=>row.id!==item.id))}><Trash2 size={16}/></button>}</div><div className="medication-entry-grid">
        <label className="customer-form-field"><span>Nombre del medicamento *</span><input value={item.name} onChange={e=>updateItem(item.id,"name",e.target.value)} placeholder="Nombre según receta"/></label>
        <label className="customer-form-field"><span>Concentración / presentación</span><input value={item.concentration} onChange={e=>updateItem(item.id,"concentration",e.target.value)} placeholder="Ej. 500 mg, tabletas"/></label>
        <label className="customer-form-field"><span>Dosis indicada *</span><input value={item.dosage} onChange={e=>updateItem(item.id,"dosage",e.target.value)} placeholder="Transcribir dosis prescrita"/></label>
        <label className="customer-form-field"><span>Horario *</span><input value={item.schedule} onChange={e=>updateItem(item.id,"schedule",e.target.value)} placeholder="Ej. después del desayuno"/></label>
        <label className="customer-form-field"><span>Duración</span><input value={item.duration} onChange={e=>updateItem(item.id,"duration",e.target.value)} placeholder="Según receta"/></label>
        <label className="customer-form-field"><span>Observaciones</span><input value={item.notes} onChange={e=>updateItem(item.id,"notes",e.target.value)} placeholder="Indicaciones adicionales"/></label>
      </div></div>)}</div>
      <div className="medication-bottom-fields"><label className="customer-form-field"><span>Observaciones generales</span><textarea rows={2} value={generalNotes} onChange={e=>setGeneralNotes(e.target.value)} placeholder="Cuidados o notas que deban aparecer impresos..."/></label><label className="customer-form-field"><span>Elaborado por</span><input value={preparedBy} onChange={e=>setPreparedBy(e.target.value)} placeholder="Nombre del personal"/></label></div>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="medication-save-row"><small>Las dosis y horarios se registran tal como fueron indicados; el sistema no prescribe ni calcula dosis.</small><button type="button" className="primary" disabled={!selectedCustomer} onClick={save}><Save size={16}/> Guardar e imprimir</button></div>
    </section>
    <section className="card medication-history-card"><div className="medication-list-heading"><div><h3><History size={18}/> Historial de indicaciones</h3><p>Registros anteriores del cliente seleccionado.</p></div><span className="count">{history.length} registros</span></div>
      {!selectedCustomer?<div className="empty"><UserRound size={28}/><p>Selecciona un cliente para consultar su historial.</p></div>:history.length===0?<div className="empty"><FileText size={28}/><p>Este cliente aún no tiene indicaciones guardadas.</p></div>:<div className="medication-history-list">{history.map(record=><article className="medication-history-item" key={record.id}><div className="medication-history-meta"><span><CalendarDays size={15}/> {dateLabel(record.createdAt)}</span><strong>{record.items.length} {record.items.length===1?"medicamento":"medicamentos"}</strong></div><div className="medication-history-drugs">{record.items.map(item=><span key={item.id}>{item.name}{item.concentration?" · "+item.concentration:""}</span>)}</div><button type="button" className="secondary" onClick={()=>printExisting(record)}><Printer size={15}/> Imprimir nuevamente</button></article>)}</div>}
    </section>
    <div className="medication-modal-footer"><button type="button" className="secondary" onClick={onClose}>Cerrar</button></div>
    {printData&&<div className="medication-print-sheet"><header><div className="medication-print-brand">DIFARMÁS</div><div><h1>Indicaciones de medicamentos</h1><p>Información registrada para el paciente</p></div></header><div className="medication-print-patient"><div><small>Paciente / Cliente</small><strong>{printData.customer.name}</strong></div><div><small>Teléfono</small><strong>{printData.customer.phone||"—"}</strong></div><div><small>Documento</small><strong>{printData.customer.documentNumber||printData.customer.rtn||"—"}</strong></div><div><small>Fecha de emisión</small><strong>{dateLabel(printData.record.createdAt)}</strong></div></div><h2>Detalle de medicamentos</h2><table><thead><tr><th>Medicamento</th><th>Dosis indicada</th><th>Horario</th><th>Duración</th></tr></thead><tbody>{printData.record.items.map(item=><tr key={item.id}><td><strong>{item.name}</strong>{item.concentration&&<small>{item.concentration}</small>}{item.notes&&<small>{item.notes}</small>}</td><td>{item.dosage}</td><td>{item.schedule}</td><td>{item.duration||"—"}</td></tr>)}</tbody></table>{printData.record.generalNotes&&<section className="medication-print-notes"><strong>Observaciones generales</strong><p>{printData.record.generalNotes}</p></section>}<footer><div><small>Elaborado por</small><strong>{printData.record.preparedBy||"Personal DIFARMÁS"}</strong></div><p>Verifique que estas indicaciones coincidan con la receta vigente del profesional de salud.</p></footer></div>}
  </section></div>;
}


/** Modal reutilizable para registrar clientes desde otros módulos del ERP. */
export function RegisterCustomerModal({customers,onClose,onSave}:{customers:Customer[];onClose:()=>void;onSave:(customer:Customer)=>void}) {
  const [form,setForm]=useState<CustomerForm>(emptyForm);
  const [error,setError]=useState('');
  const lastCustomerId=useRef(0);
  const nextCustomerId=()=>{const highestStoredId=customers.reduce((highest,customer)=>Math.max(highest,Number(customer.id)||0),0);const nextId=Math.max(Date.now(),highestStoredId,lastCustomerId.current)+1;lastCustomerId.current=nextId;return nextId;};
  const save=()=>{
    const name=form.name.trim(),creditLimit=Number(form.creditLimit),creditDays=Number(form.creditDays),rtn=form.rtn.trim();
    if(!name){setError('Escribe el nombre del cliente o razón social.');return;}
    if(!Number.isFinite(creditLimit)||creditLimit<0){setError('El límite de crédito debe ser un monto igual o mayor a cero.');return;}
    if(!Number.isInteger(creditDays)||creditDays<0||creditDays>365){setError('Los días de crédito deben ser un número entero entre 0 y 365.');return;}
    if(form.paymentTerms==='Crédito'&&creditDays<1){setError('Para términos de crédito, indica al menos 1 día de plazo.');return;}
    if(rtn&&customers.some(c=>(c.rtn??'').replace(/[^0-9A-Za-z]/g,'').toLowerCase()===rtn.replace(/[^0-9A-Za-z]/g,'').toLowerCase())){setError('Ya existe un cliente con ese RTN.');return;}
    onSave(toCustomer(form,nextCustomerId(),nextCustomerCode(customers)));
  };
  return <div className="modal-backdrop customer-form-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal customer-modal customer-form-modal" role="dialog" aria-modal="true" aria-label="Registrar nuevo cliente">
    <div className="customer-form-header"><div className="customer-form-title-icon"><UserRound size={22}/></div><div><h2>Registrar nuevo cliente</h2><p>Completa los datos y condiciones de pago del cliente.</p></div><button className="icon-btn" type="button" onClick={onClose} aria-label="Cerrar"><X size={18}/></button></div>
    <CustomerEditorFields form={form} setForm={setForm} customers={customers} editing={null}/>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="customer-form-footer"><button className="secondary" type="button" onClick={onClose}>Cancelar</button><button className="primary" type="button" onClick={save}><Save size={16}/> Guardar cliente</button></div>
  </div></div>;
}
