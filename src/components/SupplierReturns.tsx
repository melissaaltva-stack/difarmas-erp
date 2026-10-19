import { useState } from 'react';
import { ClipboardList, PackageMinus, Plus, Search } from 'lucide-react';
import type { Product, Supplier, SupplierReturnRecord, SupplierReturnItem } from '../domain/types';

const money=(value:number)=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL',maximumFractionDigits:2}).format(value);

export function SupplierReturns({products,suppliers,records,setRecords,onDispatch}:{products:Product[];suppliers:Supplier[];records:SupplierReturnRecord[];setRecords:(items:SupplierReturnRecord[])=>void;onDispatch:(record:SupplierReturnRecord)=>boolean}) {
  const [supplier,setSupplier]=useState('');
  const [purchaseReference,setPurchaseReference]=useState('');
  const [productId,setProductId]=useState('');
  const [quantity,setQuantity]=useState('1');
  const [reason,setReason]=useState('Producto dañado');
  const [notes,setNotes]=useState('');
  const [filter,setFilter]=useState('Todos');
  const [notice,setNotice]=useState('');
  const selected=products.find(p=>String(p.id)===productId);
  const validQty=Number(quantity);
  const create=()=>{
    setNotice('');
    if(!supplier.trim()||!selected||!Number.isInteger(validQty)||validQty<1||validQty>selected.stock||!reason.trim()){
      setNotice('Revisa proveedor, producto, cantidad (máximo el stock disponible) y motivo.');
      return;
    }
    const item:SupplierReturnItem={productId:selected.id,productName:selected.name,code:selected.code,quantity:validQty,unitCost:selected.cost,reason};
    const record:SupplierReturnRecord={id:Date.now(),supplier:supplier.trim(),purchaseReference:purchaseReference.trim(),date:new Date().toISOString(),status:'Pendiente',items:[item],totalCost:item.quantity*item.unitCost,reason,notes:notes.trim()};
    setRecords([record,...records]);
    setPurchaseReference('');setProductId('');setQuantity('1');setNotes('');
    setNotice('Devolución registrada como pendiente. El inventario no se modifica hasta confirmar la salida al proveedor.');
  };
  const updateStatus=(id:number,status:SupplierReturnRecord['status'])=>setRecords(records.map(r=>r.id===id?{...r,status}:r));
  const dispatch=(record:SupplierReturnRecord)=>{
    if(record.status!=='Pendiente')return;
    if(onDispatch(record)){updateStatus(record.id,'Enviado al proveedor');setNotice('Salida registrada y descontada del inventario.');}
    else setNotice('No se pudo registrar la salida. Verifica el stock disponible y la sincronización.');
  };
  const visible=records.filter(r=>filter==='Todos'||r.status===filter);
  return <div className="content">
    <div className="page-head"><div><span className="pill">CONTROL DE PROVEEDORES</span><h2>Cambios y devoluciones</h2><p>Registra productos para cambio, devolución, nota de crédito o reclamación al proveedor.</p></div><div className="page-head-icon"><ClipboardList size={25}/></div></div>
    <div className="card"><div className="card-title"><div><h3>Nueva devolución a proveedor</h3><p>La salida de inventario se registra únicamente al confirmar el envío.</p></div><PackageMinus size={20}/></div>
      <div className="form-grid">
        <label>Proveedor<select value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="">Seleccionar proveedor</option>{suppliers.filter(s=>s.active).map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</select></label>
        <label>Factura / referencia de compra<input value={purchaseReference} onChange={e=>setPurchaseReference(e.target.value)} placeholder="Número de factura o compra"/></label>
        <label>Producto<select value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Seleccionar producto</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · Stock: {p.stock}</option>)}</select></label>
        <label>Cantidad<input type="number" min="1" max={selected?.stock??1} step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/>{selected&&<small className="helper">Disponible: {selected.stock} · Costo unitario: {money(selected.cost)}</small>}</label>
        <label>Motivo<select value={reason} onChange={e=>setReason(e.target.value)}><option>Producto dañado</option><option>Producto vencido</option><option>Vencimiento próximo</option><option>Error de despacho</option><option>Producto incorrecto</option><option>Retiro de producto</option><option>Otro</option></select></label>
        <label>Observaciones<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Lote, vencimiento, acuerdo con proveedor…"/></label>
      </div>
      {notice&&<p className={notice.startsWith('No se pudo')||notice.startsWith('Revisa')?'form-error':'helper'} role="status">{notice}</p>}
      <button className="primary" type="button" onClick={create}><Plus size={16}/> Registrar devolución</button>
    </div>
    <section className="card"><div className="card-title"><div><h3>Historial de devoluciones</h3><p>{records.length} registro(s)</p></div><div className="search"><Search size={16}/><select aria-label="Filtrar por estado" value={filter} onChange={e=>setFilter(e.target.value)}><option>Todos</option><option>Pendiente</option><option>Enviado al proveedor</option><option>Cambio recibido</option><option>Nota de crédito recibida</option><option>Rechazado</option></select></div></div>
      {visible.length===0?<div className="cart-empty">No hay devoluciones para mostrar.</div>:<div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Referencia</th><th>Producto / motivo</th><th>Cantidad</th><th>Costo</th><th>Estado / acción</th></tr></thead><tbody>{visible.map(r=><tr key={r.id}><td>{new Date(r.date).toLocaleDateString('es-HN')}</td><td>{r.supplier}</td><td>{r.purchaseReference||'—'}</td><td>{r.items.map(i=><div key={i.productId}><strong>{i.productName}</strong><small>{i.reason}{r.notes ? ' · '+r.notes : ''}</small></div>)}</td><td>{r.items.reduce((sum,i)=>sum+i.quantity,0)}</td><td>{money(r.totalCost)}</td><td><span className="pill">{r.status}</span><div className="table-actions">{r.status==='Pendiente'&&<button className="secondary" type="button" onClick={()=>dispatch(r)}>Confirmar salida</button>}{r.status==='Enviado al proveedor'&&<><button className="secondary" type="button" onClick={()=>updateStatus(r.id,'Cambio recibido')}>Cambio recibido</button><button className="secondary" type="button" onClick={()=>updateStatus(r.id,'Nota de crédito recibida')}>Nota de crédito</button><button className="secondary" type="button" onClick={()=>updateStatus(r.id,'Rechazado')}>Rechazado</button></>}</div></td></tr>)}</tbody></table></div>}
    </section>
    <p className="helper">Este control registra movimientos por producto y costo promedio. Si necesitas trazabilidad exacta por lote, debe añadirse un inventario por lotes antes de automatizar devoluciones de lotes específicos.</p>
  </div>;
}
