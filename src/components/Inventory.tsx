import { useState } from 'react';
import { Search, Plus, Pencil, History, X, AlertTriangle } from 'lucide-react';
import type { InventoryMovement, Product } from '../domain/types';

const money = (value: number) => new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', maximumFractionDigits: 2 }).format(value);
const margin = (price: number, cost: number) => price > 0 ? ((price - cost) / price) * 100 : 0;
const daysUntil = (expiry: string) => {
  if (!expiry) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(expiry + 'T00:00:00').getTime() - today.getTime()) / 86400000);
};

export function Inventory({products, search, setSearch, movements, onNew, onEdit}:{products:Product[];search:string;setSearch:(v:string)=>void;movements:InventoryMovement[];onNew:()=>void;onEdit:(p:Product)=>void}) {
  const lowStock = products.filter(p => p.stock <= p.minStock);
  const expiring = products.filter(p => daysUntil(p.expiry) >= 0 && daysUntil(p.expiry) <= 90);
  const expired = products.filter(p => daysUntil(p.expiry) < 0);
  const lowMargin = products.filter(p => margin(p.retail, p.cost) < 15);
  return <div className="content">
    <div className="page-head"><div><span className="pill">MÓDULO 2</span><h2>Productos e inventario</h2><p>Existencias, costos, margen, lotes y vencimientos.</p></div><button className="primary" onClick={onNew}><Plus size={17}/> Nuevo producto</button></div>
    <div className="inventory-toolbar card"><div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por código, producto, categoría..." /></div><span className="count">{products.length} productos</span></div>
    <div className="inventory-alerts">
      {lowStock.length > 0 && <div className="card alert-card"><AlertTriangle size={18}/><div><strong>{lowStock.length} con stock bajo</strong><small>{lowStock.slice(0,3).map(p=>p.name).join(', ')}</small></div></div>}
      {expired.length > 0 && <div className="card alert-card danger"><AlertTriangle size={18}/><div><strong>{expired.length} vencido(s)</strong><small>{expired.slice(0,3).map(p=>p.name).join(', ')}</small></div></div>}
      {expiring.length > 0 && <div className="card alert-card"><AlertTriangle size={18}/><div><strong>{expiring.length} vence(n) en 90 días</strong><small>{expiring.slice(0,3).map(p=>p.name).join(', ')}</small></div></div>}
      {lowMargin.length > 0 && <div className="card alert-card"><AlertTriangle size={18}/><div><strong>{lowMargin.length} con margen minorista menor a 15%</strong><small>Revisa precio o costo antes de modificarlo.</small></div></div>}
    </div>
    <div className="card table-wrap"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Costo promedio</th><th>Minorista</th><th>Margen</th><th>Mayorista</th><th>Margen</th><th>Stock</th><th>Vencimiento</th><th></th></tr></thead><tbody>{products.map(p=>{const days=daysUntil(p.expiry);const retailMargin=margin(p.retail,p.cost);const wholesaleMargin=margin(p.wholesale,p.cost);return <tr key={p.id}><td><strong>{p.name}</strong><small>{p.code} · {p.presentation}</small></td><td>{p.category}</td><td>{money(p.cost)}</td><td>{money(p.retail)}</td><td><span className={retailMargin<15?'stock low':'stock'}>{retailMargin.toFixed(1)}%</span></td><td>{money(p.wholesale)}</td><td><span className={wholesaleMargin<15?'stock low':'stock'}>{wholesaleMargin.toFixed(1)}%</span></td><td><span className={p.stock<=p.minStock?'stock low':'stock'}>{p.stock}</span><small>Mín. {p.minStock}</small></td><td><span className={days<0?'stock low':days<=90?'stock low':'stock'}>{p.expiry?new Date(p.expiry+'T00:00:00').toLocaleDateString('es-HN'):'Sin fecha'}</span></td><td><button className="icon-btn" title="Editar" onClick={()=>onEdit(p)}><Pencil size={16}/></button></td></tr>})}</tbody></table></div>
    <div className="card table-wrap"><div className="card-title"><div><h3>Historial de movimientos</h3><p>Últimas entradas y salidas registradas.</p></div><History size={20}/></div><table><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Stock antes</th><th>Stock después</th><th>Costo unitario</th></tr></thead><tbody>{movements.slice().reverse().slice(0,20).map(m=><tr key={m.id}><td>{new Date(m.date).toLocaleString('es-HN')}</td><td><strong>{m.productName}</strong></td><td>{m.type}</td><td>{m.quantity}</td><td>{m.stockBefore}</td><td>{m.stockAfter}</td><td>{money(m.unitCost)}</td></tr>)}{movements.length===0&&<tr><td colSpan={7}>Aún no hay movimientos registrados.</td></tr>}</tbody></table></div>
  </div>;
}

export function ProductModal({product,onClose,onSave}:{product:Product|null;onClose:()=>void;onSave:(p:Product)=>void}) {
  const blank:Product={id:0,code:'',name:'',category:'Medicamentos',laboratory:'',presentation:'',cost:0,retail:0,wholesale:0,stock:0,minStock:0,lot:'',expiry:'',supplier:''};
  const [form,setForm]=useState<Product>(product||blank);
  const set=(key:keyof Product,value:string|number)=>setForm(f=>({...f,[key]:typeof value==='string' && ['cost','retail','wholesale','stock','minStock'].includes(key) ? Number(value) : value}));
  const fields:[keyof Product,string,string][]=[['code','Código de barras','text'],['name','Nombre del producto','text'],['category','Categoría','text'],['laboratory','Laboratorio','text'],['presentation','Presentación','text'],['cost','Costo','number'],['retail','Precio minorista','number'],['wholesale','Precio mayorista','number'],['stock','Existencia','number'],['minStock','Stock mínimo','number'],['lot','Lote','text'],['expiry','Vencimiento','date'],['supplier','Proveedor','text']];
  const valid=!!form.name.trim()&&form.cost>=0&&form.retail>=0&&form.wholesale>=0&&form.stock>=0&&form.minStock>=0;
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><h2>{product?'Editar producto':'Nuevo producto'}</h2><p>Completa la ficha del producto.</p></div><button className="icon-btn" onClick={onClose}><X/></button></div><div className="form-grid">{fields.map(([key,label,type])=><label key={key}>{label}<input type={type} min={type==='number'?0:undefined} value={String(form[key] ?? '')} onChange={e=>set(key,type==='number'?Number(e.target.value):e.target.value)}/></label>)}</div><div className="modal-actions"><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={!valid} onClick={()=>onSave(form)}>Guardar producto</button></div></div></div>;
}
