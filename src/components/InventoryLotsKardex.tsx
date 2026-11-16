import { useMemo, useState } from 'react';
import { Layers3, Plus, ShieldCheck, History, AlertTriangle } from 'lucide-react';
import type { InventoryLot, LotKardexMovement, Product } from '../domain/types';

export function InventoryLotsKardex({products,lots,kardex,fefoProductIds,onAddOpeningLot,onActivate,onAdjustLot}:{products:Product[];lots:InventoryLot[];kardex:LotKardexMovement[];fefoProductIds:number[];onAddOpeningLot:(productId:number,lotCode:string,expiry:string,quantity:number,unitCost:number,supplier:string)=>boolean;onActivate:(productId:number)=>boolean;onAdjustLot:(lotId:string,delta:number,note:string)=>boolean}) {
  const [productId,setProductId]=useState(String(products[0]?.id??''));
  const [lotCode,setLotCode]=useState('');const [expiry,setExpiry]=useState('');const [quantity,setQuantity]=useState('');const [unitCost,setUnitCost]=useState('');const [supplier,setSupplier]=useState('');const [error,setError]=useState('');const [adjustLotId,setAdjustLotId]=useState('');const [adjustDelta,setAdjustDelta]=useState('');const [adjustNote,setAdjustNote]=useState('');
  const selected=products.find(p=>p.id===Number(productId));
  const productLots=useMemo(()=>lots.filter(lot=>lot.productId===Number(productId)).sort((a,b)=>a.expiry.localeCompare(b.expiry)),[lots,productId]);
  const openingQty=productLots.filter(lot=>lot.opening).reduce((sum,lot)=>sum+lot.quantityReceived,0);
  const remaining=productLots.reduce((sum,lot)=>sum+lot.quantityRemaining,0);
  const isActive=fefoProductIds.includes(Number(productId));
  const save=()=>{setError('');if(!selected){setError('Selecciona un producto.');return;}const ok=onAddOpeningLot(selected.id,lotCode,expiry,Number(quantity),Number(unitCost),supplier);if(!ok){setError('No se pudo registrar. Verifica lote, vencimiento, cantidad y que la suma no supere el stock actual.');return;}setLotCode('');setExpiry('');setQuantity('');setUnitCost('');setSupplier('');};
  return <section className="card inventory-lots-kardex">
    <div className="card-title"><div><h3><Layers3 size={18}/> Lotes y Kardex FEFO</h3><p>Conciliación inicial manual, trazabilidad por lote y saldos.</p></div><History size={20}/></div>
    <div className="inventory-lot-toolbar"><label>Producto<select value={productId} onChange={e=>{setProductId(e.target.value);setError('');}}>{products.map(p=><option key={p.id} value={p.id}>{p.name} · Stock {p.stock}</option>)}</select></label>
      {selected&&<div className="inventory-lot-status">{isActive?<span className="pill success"><ShieldCheck size={14}/> FEFO activo</span>:<span className="pill warning"><AlertTriangle size={14}/> Pendiente de conciliación</span>}<small>Stock actual: {selected.stock} · Lotes apertura: {openingQty} · Existencia en lotes: {remaining}</small></div>}
    </div>
    {selected&&!isActive&&<><div className="inventory-lot-form">
      <label>Número de lote<input value={lotCode} onChange={e=>setLotCode(e.target.value)} placeholder="Ej. LOTE-2026-01"/></label>
      <label>Vencimiento<input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label>
      <label>Cantidad<input type="number" min="1" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="Unidades"/></label>
      <label>Costo unitario<input type="number" min="0" step="0.01" value={unitCost} onChange={e=>setUnitCost(e.target.value)} placeholder="0.00"/></label>
      <label>Proveedor<input value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Proveedor"/></label>
      <button type="button" className="secondary" onClick={save}><Plus size={16}/> Agregar lote</button>
    </div><div className="inventory-lot-activation"><span>Distribuye todo el stock actual en lotes reales. La suma debe coincidir exactamente.</span><button type="button" className="primary" disabled={openingQty!==selected.stock||openingQty===0} onClick={()=>{if(!onActivate(selected.id))setError('No se pudo activar FEFO. Verifica la conciliación.');}}>Activar FEFO</button></div></>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="table-wrap"><table><thead><tr><th>Lote</th><th>Vencimiento</th><th>Proveedor</th><th>Costo</th><th>Recibido</th><th>Disponible</th></tr></thead><tbody>{productLots.map(lot=><tr key={lot.id}><td>{lot.lotCode}</td><td>{new Date(lot.expiry+'T00:00:00').toLocaleDateString('es-HN')}</td><td>{lot.supplier||'—'}</td><td>{lot.unitCost.toFixed(2)}</td><td>{lot.quantityReceived}</td><td>{lot.quantityRemaining}</td></tr>)}{!productLots.length&&<tr><td colSpan={6}>Aún no hay lotes registrados para este producto.</td></tr>}</tbody></table></div>
    {isActive&&<div className="inventory-lot-adjust-form"><label>Lote<select value={adjustLotId} onChange={e=>setAdjustLotId(e.target.value)}><option value="">Selecciona lote</option>{productLots.map(lot=><option key={lot.id} value={lot.id}>{lot.lotCode} · disponible {lot.quantityRemaining}</option>)}</select></label><label>Ajuste (+ entrada / − salida)<input type="number" step="1" value={adjustDelta} onChange={e=>setAdjustDelta(e.target.value)} placeholder="Ej. 5 o -2"/></label><label>Motivo<input value={adjustNote} onChange={e=>setAdjustNote(e.target.value)} placeholder="Conteo físico, merma, daño..."/></label><button type="button" className="secondary" onClick={()=>{const ok=onAdjustLot(adjustLotId,Number(adjustDelta),adjustNote);if(!ok){setError('No se pudo aplicar el ajuste. Revisa lote, cantidad disponible y motivo.');return;}setError('');setAdjustDelta('');setAdjustNote('');}}>Registrar ajuste</button></div>}
    <div className="inventory-kardex-heading"><strong>Kardex por lote</strong><small>{kardex.filter(m=>m.productId===Number(productId)).length} movimientos</small></div>
    <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Movimiento</th><th>Lote</th><th>Vencimiento</th><th>Entrada / salida</th><th>Saldo lote</th><th>Referencia</th></tr></thead><tbody>{kardex.filter(m=>m.productId===Number(productId)).slice().sort((a,b)=>b.date.localeCompare(a.date)).map(m=><tr key={m.id}><td>{new Date(m.date).toLocaleString('es-HN')}</td><td>{m.type}</td><td>{m.lotCode}</td><td>{m.expiry}</td><td>{m.type==='Venta'||m.type==='Reserva'?'−':'+'}{m.quantity}</td><td>{m.stockAfter}</td><td>{m.reference}</td></tr>)}{!kardex.some(m=>m.productId===Number(productId))&&<tr><td colSpan={7}>No hay movimientos de Kardex todavía.</td></tr>}</tbody></table></div>
  </section>;
}
