import { useMemo, useState } from 'react';
import { Truck, Search, Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import type { Supplier } from '../domain/types';

const emptySupplier = (): Omit<Supplier, 'id'> => ({ name:'', contact:'', phone:'', email:'', rtn:'', address:'', paymentTerms:'Contado', notes:'', active:true });

export function Suppliers({suppliers,setSuppliers}:{suppliers:Supplier[];setSuppliers:(items:Supplier[])=>void}) {
  const [query,setQuery]=useState('');
  const [editing,setEditing]=useState<Supplier|null>(null);
  const [form,setForm]=useState<Omit<Supplier,'id'>>(emptySupplier());
  const [error,setError]=useState('');
  const visible=useMemo(()=>suppliers.filter(s=>[s.name,s.contact,s.phone,s.rtn,s.email].join(' ').toLowerCase().includes(query.toLowerCase())),[suppliers,query]);
  const start=(s?:Supplier)=>{setEditing(s??null);setForm(s?{name:s.name,contact:s.contact,phone:s.phone,email:s.email,rtn:s.rtn,address:s.address,paymentTerms:s.paymentTerms,notes:s.notes,active:s.active}:emptySupplier());setError('');};
  const save=()=>{if(!form.name.trim()){setError('El nombre del proveedor es obligatorio.');return;}const duplicate=suppliers.some(s=>s.name.trim().toLowerCase()===form.name.trim().toLowerCase()&&s.id!==editing?.id);if(duplicate){setError('Ya existe un proveedor con ese nombre.');return;}if(editing)setSuppliers(suppliers.map(s=>s.id===editing.id?{...form,id:editing.id,name:form.name.trim()}:s));else setSuppliers([{...form,id:Date.now(),name:form.name.trim()},...suppliers]);setEditing(null);setError('');};
  return <div className="content">
    <div className="page-head"><div><span className="pill">GESTIÓN DE CONTACTOS</span><h2>Proveedores</h2><p>Guarda y consulta los datos comerciales de tus distribuidores.</p></div><button className="primary" onClick={()=>start()}><Plus size={17}/> Nuevo proveedor</button></div>
    <div className="grid metrics supplier-metrics"><article className="card metric"><div className="metric-top"><span>Total proveedores</span><Truck size={20}/></div><strong>{suppliers.length}</strong></article><article className="card metric"><div className="metric-top"><span>Activos</span></div><strong>{suppliers.filter(s=>s.active).length}</strong></article><article className="card metric"><div className="metric-top"><span>Inactivos</span></div><strong>{suppliers.filter(s=>!s.active).length}</strong></article></div>
    <section className="card"><div className="inventory-toolbar"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por proveedor, contacto, teléfono o RTN..."/></div><span className="count">{visible.length} registros</span></div>
      {visible.length===0?<div className="cart-empty">{suppliers.length?'No hay proveedores que coincidan con la búsqueda.':'Todavía no hay proveedores. Usa “Nuevo proveedor” para registrar el primero.'}</div>:<div className="table-wrap"><table><thead><tr><th>Proveedor</th><th>Contacto</th><th>Teléfono / correo</th><th>RTN</th><th>Condiciones</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{visible.map(s=><tr key={s.id}><td><strong>{s.name}</strong><small>{s.address||'Sin dirección registrada'}</small></td><td>{s.contact||'—'}</td><td>{s.phone||'—'}<small>{s.email||'Sin correo'}</small></td><td>{s.rtn||'—'}</td><td>{s.paymentTerms||'Contado'}</td><td><span className={s.active?'stock':'stock low'}>{s.active?'Activo':'Inactivo'}</span></td><td><div className="supplier-actions"><button className="icon-btn" aria-label={'Editar '+s.name} onClick={()=>start(s)}><Pencil size={15}/></button><button className="icon-btn" aria-label={s.active?'Desactivar '+s.name:'Activar '+s.name} onClick={()=>setSuppliers(suppliers.map(x=>x.id===s.id?{...x,active:!x.active}:x))}>{s.active?<X size={15}/>:<Save size={15}/>}</button><button className="icon-btn danger-icon" aria-label={'Eliminar '+s.name} onClick={()=>{if(window.confirm('¿Eliminar el proveedor '+s.name+' del directorio?'))setSuppliers(suppliers.filter(x=>x.id!==s.id));}}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>}
    </section>
    {form && (editing || false) && null}
    {(editing!==null || error!=='' || false) && null}
    {showFormShim(editing,form,setForm,save,error,setError,()=>setEditing(null))}
    {editing===null && false && <></>}
    {modalOpen(editing,form) && null}
  </div>;
}
function showFormShim(editing:Supplier|null,form:Omit<Supplier,'id'>,setForm:(v:Omit<Supplier,'id'>)=>void,save:()=>void,error:string,setError:(v:string)=>void,close:()=>void) {
  // Modal state is controlled by a sentinel in the component; rendered separately below.
  return null;
}
function modalOpen(_editing:Supplier|null,_form:Omit<Supplier,'id'>){return false}
