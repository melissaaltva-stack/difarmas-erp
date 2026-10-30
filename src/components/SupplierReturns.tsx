import { useEffect, useRef, useState } from 'react';
import { ClipboardList, PackageMinus, Plus, Search, Printer } from 'lucide-react';
import type { Product, Supplier, SupplierReturnRecord, SupplierReturnItem } from '../domain/types';

const money=(value:number)=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL',maximumFractionDigits:2}).format(value);

export function SupplierReturns({products,suppliers,records,setRecords,onDispatch}:{products:Product[];suppliers:Supplier[];records:SupplierReturnRecord[];setRecords:(items:SupplierReturnRecord[] | ((current:SupplierReturnRecord[])=>SupplierReturnRecord[]))=>void;onDispatch:(record:SupplierReturnRecord)=>boolean}) {
  const createInProgress=useRef(false);
  const dispatchInProgress=useRef(new Set<number>());
  useEffect(()=>{createInProgress.current=false;for(const id of dispatchInProgress.current){const current=records.find(r=>r.id===id);if(!current||current.status!=='Pendiente')dispatchInProgress.current.delete(id);}},[records]);
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
    if(createInProgress.current)return;
    setNotice('');
    if(!supplier.trim()||!selected||!Number.isInteger(validQty)||validQty<1||validQty>selected.stock||!reason.trim()){
      setNotice('Revisa proveedor, producto, cantidad (máximo el stock disponible) y motivo.');
      return;
    }
    createInProgress.current=true;
    const item:SupplierReturnItem={productId:selected.id,productName:selected.name,code:selected.code,quantity:validQty,unitCost:selected.cost,reason};
    const record:SupplierReturnRecord={id:Math.max(Date.now(),...records.map(r=>r.id+1)),supplier:supplier.trim(),purchaseReference:purchaseReference.trim(),date:new Date().toISOString(),status:'Pendiente',items:[item],totalCost:item.quantity*item.unitCost,reason,notes:notes.trim()};
    setRecords(current=>[record,...current]);
    setPurchaseReference('');setProductId('');setQuantity('1');setNotes('');
    setNotice('Devolución registrada como pendiente. El inventario no se modifica hasta confirmar la salida al proveedor.');
  };
  const updateStatus=(id:number,status:SupplierReturnRecord['status'])=>setRecords(current=>current.map(r=>r.id===id?{...r,status}:r));
  const dispatch=(record:SupplierReturnRecord)=>{
    if(record.status!=='Pendiente')return;
    if(onDispatch(record)){updateStatus(record.id,'Enviado al proveedor');setNotice('Salida registrada y descontada del inventario.');}
    else setNotice('No se pudo registrar la salida. Verifica el stock disponible y la sincronización.');
  };
  const printReturn=(record:SupplierReturnRecord)=>{
    const popup=window.open('','_blank','width=900,height=700');
    if(!popup){setNotice('Permite las ventanas emergentes para imprimir la devolución.');return;}
    const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]??ch));
    const rows=record.items.map(item=>'<tr><td>'+esc(item.code||'—')+'</td><td>'+esc(item.productName)+'</td><td>'+esc(item.reason||record.reason)+'</td><td>'+item.quantity+'</td><td>'+money(item.unitCost)+'</td><td>'+money(item.quantity*item.unitCost)+'</td></tr>').join('');
    popup.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Devolución a proveedor</title><style>body{font-family:Arial,sans-serif;color:#222;padding:28px}h1{font-size:22px;margin-bottom:4px}p{margin:7px 0}.brand{font-size:12px;color:#555;margin-bottom:22px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:22px 0}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #bbb;padding:8px;text-align:left;font-size:12px}th{background:#f1f4f3}.total{text-align:right;font-weight:bold;margin-top:18px}.signatures{display:flex;gap:60px;margin-top:70px}.signatures div{border-top:1px solid #555;text-align:center;flex:1;padding-top:8px;font-size:12px}@media print{button{display:none}}</style></head><body><div class="brand">DIFARMÁS · CONTROL DE PROVEEDORES</div><h1>Solicitud de cambio / devolución a proveedor</h1><p>Documento interno de control de devolución</p><div class="meta"><div><b>N.º de devolución:</b> DEV-'+esc(record.id)+'</div><div><b>Fecha:</b> '+esc(new Date(record.date).toLocaleString('es-HN'))+'</div><div><b>Proveedor:</b> '+esc(record.supplier)+'</div><div><b>Factura / referencia:</b> '+esc(record.purchaseReference||'—')+'</div><div><b>Estado:</b> '+esc(record.status)+'</div><div><b>Motivo:</b> '+esc(record.reason)+'</div></div><table><thead><tr><th>Código</th><th>Producto</th><th>Motivo</th><th>Cantidad</th><th>Costo unitario</th><th>Total</th></tr></thead><tbody>'+rows+'</tbody></table><div class="total">Total de costo: '+money(record.totalCost)+'</div><p><b>Observaciones:</b> '+esc(record.notes||'—')+'</p><div class="signatures"><div>Entregado por</div><div>Recibido por proveedor</div></div><script>window.onload=()=>window.print();</script></body></html>');
    popup.document.close();
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
      {visible.length===0?<div className="cart-empty">No hay devoluciones para mostrar.</div>:<div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Referencia</th><th>Producto / motivo</th><th>Cantidad</th><th>Costo</th><th>Estado / acción</th></tr></thead><tbody>{visible.map(r=><tr key={r.id}><td>{new Date(r.date).toLocaleDateString('es-HN')}</td><td>{r.supplier}</td><td>{r.purchaseReference||'—'}</td><td>{r.items.map(i=><div key={i.productId}><strong>{i.productName}</strong><small>{i.reason}{r.notes ? ' · '+r.notes : ''}</small></div>)}</td><td>{r.items.reduce((sum,i)=>sum+i.quantity,0)}</td><td>{money(r.totalCost)}</td><td><span className="pill">{r.status}</span><div className="table-actions"><button className="secondary" type="button" onClick={()=>printReturn(r)}><Printer size={14}/> Imprimir</button>{r.status==='Pendiente'&&<button className="secondary" type="button" onClick={()=>dispatch(r)}>Confirmar salida</button>}{r.status==='Enviado al proveedor'&&<><button className="secondary" type="button" onClick={()=>updateStatus(r.id,'Cambio recibido')}>Cambio recibido</button><button className="secondary" type="button" onClick={()=>updateStatus(r.id,'Nota de crédito recibida')}>Nota de crédito</button><button className="secondary" type="button" onClick={()=>updateStatus(r.id,'Rechazado')}>Rechazado</button></>}</div></td></tr>)}</tbody></table></div>}
    </section>
    <p className="helper">Este control registra movimientos por producto y costo promedio. Si necesitas trazabilidad exacta por lote, debe añadirse un inventario por lotes antes de automatizar devoluciones de lotes específicos.</p>
  </div>;
}
