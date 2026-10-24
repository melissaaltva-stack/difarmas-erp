import { useMemo, useState } from 'react';
import { Plus, Search, Pencil, UserRound, UsersRound, X, Save, Ban, CheckCircle2, FileText, CreditCard, Receipt, Building2 } from 'lucide-react';
import type { Customer } from '../domain/types';
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
  const filtered=useMemo(()=>customers.filter(c=>[c.code??'',c.name,c.rtn??'',c.phone,c.email??'',c.address??''].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())),[customers,query]);
  const startNew=()=>{setEditing(null);setForm(emptyForm);setError('');setShowForm(true);};
  const startEdit=(customer:Customer)=>{setEditing(customer);setForm(customerToForm(customer));setError('');setShowForm(true);};
  const save=()=>{
    const name=form.name.trim(),creditLimit=Number(form.creditLimit),creditDays=Number(form.creditDays);
    if(!name){setError('Escribe el nombre del cliente o razón social.');return;}
    if(!Number.isFinite(creditLimit)||creditLimit<0){setError('El límite de crédito debe ser un monto igual o mayor a cero.');return;}
    if(!Number.isInteger(creditDays)||creditDays<0||creditDays>365){setError('Los días de crédito deben ser un número entero entre 0 y 365.');return;}
    if(form.paymentTerms==='Crédito'&&creditDays<1){setError('Para términos de crédito, indica al menos 1 día de plazo.');return;}
    const rtn=form.rtn.trim();
    if(rtn&&customers.some(c=>c.id!==editing?.id&&(c.rtn??'').replace(/[^0-9A-Za-z]/g,'').toLowerCase()===rtn.replace(/[^0-9A-Za-z]/g,'').toLowerCase())){setError('Ya existe un cliente con ese RTN.');return;}
    const record=toCustomer(form,editing?.id??Date.now(),editing?.code??nextCustomerCode(customers));
    setCustomers(current=>editing?current.map(c=>c.id===editing.id?record:c):[record,...current]);
    setShowForm(false);setEditing(null);setForm(emptyForm);setError('');
  };
  const toggleActive=(customer:Customer)=>setCustomers(current=>current.map(c=>c.id===customer.id?{...c,active:!c.active}:c));
  return <div className="content">
    <div className="page-head"><div><span className="pill">MÓDULO · CLIENTES</span><h2>Registro de clientes</h2><p>Guarda y consulta los datos de clientes particulares y empresas de DIFARMÁS.</p></div><button className="primary" onClick={startNew}><Plus size={17}/> Nuevo cliente</button></div>
    <div className="inventory-toolbar card"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por nombre, RTN, teléfono o correo..."/></div><span className="count">{customers.length} clientes registrados</span></div>
    <div className="inventory-alerts">
      <div className="card alert-card"><UsersRound size={18}/><div><strong>{customers.length} registrados</strong><small>Todos los clientes guardados en el ERP.</small></div></div>
      <div className="card alert-card"><CheckCircle2 size={18}/><div><strong>{customers.filter(c=>c.active).length} activos</strong><small>Disponibles para futuras operaciones.</small></div></div>
      <div className="card alert-card"><Ban size={18}/><div><strong>{customers.filter(c=>!c.active).length} inactivos</strong><small>Se conservan sus datos e historial.</small></div></div>
    </div>
    <div className="card table-wrap"><table><thead><tr><th>Código</th><th>Cliente</th><th>RTN / Identificación</th><th>Teléfono</th><th>Correo</th><th>Límite de crédito</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      {filtered.map(customer=><tr key={customer.id}><td><span className="customer-code">{customer.code}</span></td><td><div className="product-cell"><div className="customer-avatar"><UserRound size={18}/></div><div><strong>{customer.name}</strong><small>{customer.customerType??'Persona natural'}{customer.address?' · '+customer.address:''}</small></div></div></td><td>{customer.rtn||'—'}</td><td>{customer.phone||'—'}</td><td>{customer.email||'—'}</td><td>{money(customer.creditLimit??0)}</td><td><span className={customer.active?'stock':'stock low'}>{customer.active?'Activo':'Inactivo'}</span></td><td><div className="customer-actions"><button className="icon-btn" title="Editar cliente" aria-label={'Editar '+customer.name} onClick={()=>startEdit(customer)}><Pencil size={16}/></button><button className="secondary" onClick={()=>toggleActive(customer)}>{customer.active?'Desactivar':'Activar'}</button></div></td></tr>)}
      {filtered.length===0&&<tr><td colSpan={8}><div className="empty"><UserRound size={30}/><strong>{query?'No se encontraron clientes':'Aún no hay clientes registrados'}</strong><p>{query?'Prueba otra búsqueda.':'Pulsa “Nuevo cliente” para registrar el primero.'}</p></div></td></tr>}
    </tbody></table></div>
    {showForm&&<div className="modal-backdrop"><div className="modal customer-modal" role="dialog" aria-modal="true" aria-label={editing?'Editar cliente':'Registrar nuevo cliente'}><div className="modal-head"><div><h2>{editing?'Editar cliente':'Registrar nuevo cliente'}</h2><p>Completa los datos de contacto y crédito del cliente.</p></div><button className="icon-btn" onClick={()=>setShowForm(false)} aria-label="Cerrar"><X size={18}/></button></div>
      <div className="form-grid">
        <label>Tipo de cliente<select value={form.customerType} onChange={e=>setForm(f=>({...f,customerType:e.target.value as CustomerForm['customerType']}))}><option>Persona natural</option><option>Empresa</option></select></label>
        <label>Código de cliente<input value={editing?.code??nextCustomerCode(customers)} readOnly aria-label="Código asignado automáticamente"/></label><label>Nombre completo / Razón social *<input autoFocus value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Nombre del cliente o empresa" maxLength={160}/></label>
        <label>RTN / Identificación<input value={form.rtn} onChange={e=>setForm(f=>({...f,rtn:e.target.value}))} placeholder="Número de identificación" maxLength={40}/></label>
        <label>Teléfono<input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="Ej. 9999-9999" autoComplete="tel" maxLength={40}/></label>
        <label>Correo electrónico<input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="cliente@correo.com" autoComplete="email" maxLength={160}/></label>
        <label>Dirección<input value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} placeholder="Dirección del cliente" maxLength={240}/></label>
        <label>Límite de crédito (L)<input type="number" min="0" step="0.01" value={form.creditLimit} onChange={e=>setForm(f=>({...f,creditLimit:e.target.value}))}/></label>
        <label className="settings-check-label"><input type="checkbox" checked={form.active} onChange={e=>setForm(f=>({...f,active:e.target.checked}))}/> Cliente activo</label>
        <label style={{gridColumn:'1 / -1'}}>Notas<textarea rows={3} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Observaciones, preferencias o condiciones de pago" maxLength={1000}/></label>
      </div>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="secondary" onClick={()=>setShowForm(false)}>Cancelar</button><button className="primary" onClick={save}><Save size={16}/> Guardar cliente</button></div>
    </div></div>}
  </div>;
}


/** Modal reutilizable para registrar clientes desde cualquier módulo del ERP. */
export function RegisterCustomerModal({customers,onClose,onSave}:{customers:Customer[];onClose:()=>void;onSave:(customer:Customer)=>void}) {
 const [form,setForm]=useState<CustomerForm>(emptyForm);
 const [error,setError]=useState('');
 const save=()=>{
  const name=form.name.trim(), creditLimit=Number(form.creditLimit), rtn=form.rtn.trim();
  if(!name){setError('Escribe el nombre del cliente o razón social.');return;}
  if(!Number.isFinite(creditLimit)||creditLimit<0){setError('El límite de crédito debe ser un monto igual o mayor a cero.');return;}
  if(rtn&&customers.some(c=>(c.rtn??'').replace(/[^0-9A-Za-z]/g,'').toLowerCase()===rtn.replace(/[^0-9A-Za-z]/g,'').toLowerCase())){setError('Ya existe un cliente con ese RTN.');return;}
  onSave({id:Date.now(),code:nextCustomerCode(customers),name,customerType:form.customerType,rtn,phone:form.phone.trim(),email:form.email.trim(),address:form.address.trim(),creditLimit,active:form.active,notes:form.notes.trim()});
 };
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal customer-modal" role="dialog" aria-modal="true" aria-label="Registrar nuevo cliente"><div className="modal-head"><div><h2>Registrar nuevo cliente</h2><p>Completa los datos de contacto y crédito del cliente.</p></div><button className="icon-btn" type="button" onClick={onClose} aria-label="Cerrar"><X size={18}/></button></div>
 <div className="form-grid">
 <label>Tipo de cliente<select value={form.customerType} onChange={e=>setForm(f=>({...f,customerType:e.target.value as CustomerForm['customerType']}))}><option>Persona natural</option><option>Empresa</option></select></label>
 <label>Código de cliente<input value={nextCustomerCode(customers)} readOnly aria-label="Código asignado automáticamente"/></label><label>Nombre completo / Razón social *<input autoFocus value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Nombre del cliente o empresa" maxLength={160}/></label>
 <label>RTN / Identificación<input value={form.rtn} onChange={e=>setForm(f=>({...f,rtn:e.target.value}))} placeholder="Número de identificación" maxLength={40}/></label>
 <label>Teléfono<input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="Ej. 9999-9999" maxLength={40}/></label>
 <label>Correo electrónico<input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="cliente@correo.com" maxLength={160}/></label>
 <label>Dirección<input value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} placeholder="Dirección del cliente" maxLength={240}/></label>
 <label>Límite de crédito (L)<input type="number" min="0" step="0.01" value={form.creditLimit} onChange={e=>setForm(f=>({...f,creditLimit:e.target.value}))}/></label>
 <label className="settings-check-label"><input type="checkbox" checked={form.active} onChange={e=>setForm(f=>({...f,active:e.target.checked}))}/> Cliente activo</label>
 <label style={{gridColumn:'1 / -1'}}>Notas<textarea rows={3} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Observaciones, preferencias o condiciones de pago" maxLength={1000}/></label>
 </div>
 {error&&<p className="form-error" role="alert">{error}</p>}
 <div className="modal-actions"><button className="secondary" type="button" onClick={onClose}>Cancelar</button><button className="primary" type="button" onClick={save}><Save size={16}/> Guardar cliente</button></div>
 </div></div>;
}
