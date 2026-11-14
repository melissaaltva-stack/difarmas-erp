import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Plus, Search, Pencil, UserRound, UsersRound, X, Save, Ban, CheckCircle2, FileText, CreditCard, Receipt, Building2, Pill, Printer, History, Trash2, CalendarDays, ClipboardPlus } from 'lucide-react';
import type { Customer, MedicationInstructionItem, MedicationInstructionRecord } from '../domain/types';
import { nextCustomerCode } from '../services/customerCodeService';

type CustomerForm = {
  name:string; customerType:'Persona natural'|'Empresa'; documentType:'RTN'|'Identidad'|'Pasaporte'|'Otro'; documentNumber:string;
  rtn:string; legalName:string; taxRegime:string; phone:string; email:string; billingEmail:string; address:string;
  creditLimit:string; paymentTerms:'Contado'|'Crédito'; creditDays:string; assignedSeller:string; priceList:string;
  active:boolean; notes:string;
};
const emptyForm:CustomerForm={name:'',customerType:'Persona natural',documentType:'Identidad',documentNumber:'',rtn:'',legalName:'',taxRegime:'Persona Natural',phone:'',email:'',billingEmail:'',address:'',creditLimit:'0',paymentTerms:'Contado',creditDays:'0',assignedSeller:'',priceList:'Precio de venta 1',active:true,notes:''};
const customerToForm=(customer:Customer):CustomerForm=>({
  name:customer.name,customerType:customer.customerType??'Persona natural',documentType:customer.documentType??'Identidad',
  documentNumber:customer.documentNumber??'',rtn:customer.rtn??'',legalName:customer.legalName??'',
  taxRegime:customer.taxRegime??(customer.customerType==='Empresa'?'Régimen General':'Persona Natural'),
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


function CustomerEditorFields({form,setForm,customers,editing}:{form:CustomerForm;setForm:Dispatch<SetStateAction<CustomerForm>>;customers:Customer[];editing:Customer|null}) {
  const code=editing?.code??nextCustomerCode(customers);
  return <>
    <div className="customer-form-top">
      <label className="customer-form-field"><span>Código de cliente</span><input value={code} readOnly aria-label="Código de cliente asignado automáticamente"/></label>
      <label className="customer-form-field"><span>Nombre del cliente *</span><input autoFocus value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Nombre completo o razón social" maxLength={160}/></label>
    </div>
    <div className="customer-form-layout">
      <div className="customer-form-main">
        <section className="customer-form-section">
          <h3><UserRound size={17}/> Información personal</h3>
          <div className="customer-form-grid">
            <label className="customer-form-field"><span>Tipo de cliente</span><select value={form.customerType} onChange={e=>setForm(f=>({...f,customerType:e.target.value as CustomerForm['customerType']}))}><option>Persona natural</option><option>Empresa</option></select></label>
            <label className="customer-form-field"><span>Tipo de documento *</span><select value={form.documentType} onChange={e=>setForm(f=>({...f,documentType:e.target.value as CustomerForm['documentType']}))}><option value="RTN">RTN</option><option value="Identidad">Identidad</option><option value="Pasaporte">Pasaporte</option><option value="Otro">Otro</option></select></label>
            <label className="customer-form-field"><span>N.º de documento</span><input value={form.documentNumber} onChange={e=>setForm(f=>({...f,documentNumber:e.target.value}))} placeholder="Número de identidad o documento" maxLength={40}/></label>
            <label className="customer-form-field customer-form-full"><span>Dirección</span><input value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} placeholder="Dirección del cliente" maxLength={240}/></label>
            <label className="customer-form-field"><span>Teléfono</span><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="Ej. 9999-1234" autoComplete="tel" maxLength={40}/></label>
            <label className="customer-form-field"><span>Correo electrónico</span><input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="cliente@correo.com" autoComplete="email" maxLength={160}/></label>
          </div>
        </section>
        <section className="customer-form-section">
          <h3><Building2 size={17}/> Datos fiscales <small>(opcional)</small></h3>
          <div className="customer-form-grid">
            <label className="customer-form-field"><span>RTN</span><input value={form.rtn} onChange={e=>setForm(f=>({...f,rtn:e.target.value}))} placeholder="RTN fiscal" maxLength={40}/></label>
            <label className="customer-form-field"><span>Nombre o razón social</span><input value={form.legalName} onChange={e=>setForm(f=>({...f,legalName:e.target.value}))} placeholder="Nombre fiscal" maxLength={160}/></label>
            <label className="customer-form-field"><span>Régimen fiscal</span><select value={form.taxRegime} onChange={e=>setForm(f=>({...f,taxRegime:e.target.value}))}><option>Persona Natural</option><option>Régimen General</option><option>Régimen Simplificado</option><option>Exento</option><option>No especificado</option></select></label>
            <label className="customer-form-field"><span>Correo para facturación</span><input type="email" value={form.billingEmail} onChange={e=>setForm(f=>({...f,billingEmail:e.target.value}))} placeholder="facturacion@correo.com" maxLength={160}/></label>
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

export function Customers({customers,setCustomers}:{customers:Customer[];setCustomers:(value:Customer[]|((current:Customer[])=>Customer[]))=>void}) {
  const [query,setQuery]=useState('');
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState<Customer|null>(null);
  const [form,setForm]=useState<CustomerForm>(emptyForm);
  const [error,setError]=useState('');
  const [detailCustomer,setDetailCustomer]=useState<Customer|null>(null);
  const [medicationCustomer,setMedicationCustomer]=useState<Customer|null>(null);
  const lastCustomerId=useRef(0);
  const nextCustomerId=()=>{const highestStoredId=customers.reduce((highest,customer)=>Math.max(highest,Number(customer.id)||0),0);const nextId=Math.max(Date.now(),highestStoredId,lastCustomerId.current)+1;lastCustomerId.current=nextId;return nextId;};
  const filtered=useMemo(()=>customers.filter(c=>[c.code??'',c.name,c.rtn??'',c.phone,c.email??'',c.address??''].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())),[customers,query]);
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
    <div className="page-head customer-page-head-compact"><div className="customer-page-actions"><button className="primary" onClick={startNew}><Plus size={17}/> Nuevo cliente</button></div></div>
    <div className="inventory-toolbar card"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por nombre, RTN, teléfono o correo..."/></div><span className="count">{customers.length} clientes registrados</span></div>
    <div className="inventory-alerts">
      <div className="card alert-card"><UsersRound size={18}/><div><strong>{customers.length} registrados</strong><small>Todos los clientes guardados en el ERP.</small></div></div>
      <div className="card alert-card"><CheckCircle2 size={18}/><div><strong>{customers.filter(c=>c.active).length} activos</strong><small>Disponibles para futuras operaciones.</small></div></div>
      <div className="card alert-card"><Ban size={18}/><div><strong>{customers.filter(c=>!c.active).length} inactivos</strong><small>Se conservan sus datos e historial.</small></div></div>
    </div>
    <div className="card table-wrap customer-table-wrap"><table><thead><tr><th>Código</th><th>Cliente</th><th>RTN / Identificación</th><th>Términos de pago</th><th>Teléfono</th><th>Correo</th><th>Límite de crédito</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      {filtered.map(customer=><tr key={customer.id}><td><span className="customer-code">{customer.code}</span></td><td><div className="product-cell"><div className="customer-avatar"><UserRound size={18}/></div><div><button type="button" className="customer-name-link" onClick={()=>setDetailCustomer(customer)}>{customer.name}</button><small>{customer.customerType??'Persona natural'}{customer.address?' · '+customer.address:''}</small></div></div></td><td>{customer.rtn||customer.documentNumber||'—'}</td><td><span className="customer-term">{customer.paymentTerms??'Contado'}{customer.paymentTerms==='Crédito'&&customer.creditDays?' · '+customer.creditDays+' días':''}</span></td><td>{customer.phone||'—'}</td><td>{customer.email||'—'}</td><td>{money(customer.creditLimit??0)}</td><td><span className={customer.active?'stock':'stock low'}>{customer.active?'Activo':'Inactivo'}</span></td><td><div className="customer-actions"><button className="icon-btn" title="Editar cliente" aria-label={'Editar '+customer.name} onClick={()=>startEdit(customer)}><Pencil size={16}/></button><button className="secondary" onClick={()=>toggleActive(customer)}>{customer.active?'Desactivar':'Activar'}</button></div></td></tr>)}
      {filtered.length===0&&<tr><td colSpan={9}><div className="empty"><UserRound size={30}/><strong>{query?'No se encontraron clientes':'Aún no hay clientes registrados'}</strong><p>{query?'Prueba otra búsqueda.':'Pulsa “Nuevo cliente” para registrar el primero.'}</p></div></td></tr>}
    </tbody></table></div>
    {detailCustomer&&<div className="modal-backdrop customer-detail-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDetailCustomer(null);}}><section className="modal customer-detail-modal" role="dialog" aria-modal="true" aria-label={"Información de "+detailCustomer.name}><header className="customer-detail-header"><div className="customer-detail-avatar"><UserRound size={23}/></div><div><h2>{detailCustomer.name}</h2><p>{detailCustomer.code??"Sin código"} · {detailCustomer.customerType??"Persona natural"}</p></div><button type="button" className="icon-btn" aria-label="Cerrar" onClick={()=>setDetailCustomer(null)}><X size={18}/></button></header><div className="customer-detail-grid"><div><small>Documento</small><strong>{detailCustomer.documentNumber||detailCustomer.rtn||"—"}</strong></div><div><small>RTN</small><strong>{detailCustomer.rtn||"—"}</strong></div><div><small>Teléfono</small><strong>{detailCustomer.phone||"—"}</strong></div><div><small>Correo electrónico</small><strong>{detailCustomer.email||"—"}</strong></div><div className="customer-detail-full"><small>Dirección</small><strong>{detailCustomer.address||"—"}</strong></div><div><small>Términos de pago</small><strong>{detailCustomer.paymentTerms??"Contado"}{detailCustomer.paymentTerms==="Crédito"&&detailCustomer.creditDays?" · "+detailCustomer.creditDays+" días":""}</strong></div><div><small>Límite de crédito</small><strong>{money(detailCustomer.creditLimit??0)}</strong></div><div><small>Estado</small><strong>{detailCustomer.active?"Activo":"Inactivo"}</strong></div><div><small>Vendedor asignado</small><strong>{detailCustomer.assignedSeller||"—"}</strong></div><div className="customer-detail-full"><small>Observaciones</small><strong className="customer-detail-notes">{detailCustomer.notes||"Sin observaciones"}</strong></div></div><div className="customer-detail-footer"><span><History size={16}/> {(detailCustomer.medicationInstructions??[]).length} indicaciones guardadas</span><button type="button" className="icon-btn customer-create-instruction" title="Crear indicación médica" aria-label="Crear indicación médica" onClick={()=>{setMedicationCustomer(detailCustomer);setDetailCustomer(null);}}><ClipboardPlus size={20}/></button></div></section></div>}
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
      <div className="medication-section-title"><div><h3>Nueva indicación</h3><p>Transcribe la información de la receta o indicación profesional del cliente.</p></div></div>
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
