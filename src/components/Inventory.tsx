import { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Search, Plus, Pencil, History, X, AlertTriangle, Printer, Barcode, Image as ImageIcon, ExternalLink, LoaderCircle } from 'lucide-react';
import type { InventoryMovement, Product } from '../domain/types';

const money = (value: number) => new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', maximumFractionDigits: 2 }).format(value);
const margin = (price: number, cost: number) => price > 0 ? ((price - cost) / price) * 100 : 0;
const daysUntil = (expiry: string) => {
  if (!expiry) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(expiry + 'T00:00:00').getTime() - today.getTime()) / 86400000);
};
const makeBarcode = (products: Product[]) => {
  const existing = new Set(products.map(p => p.code.trim().toUpperCase()).filter(Boolean));
  let code = '';
  do { code = `DF${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`; }
  while (existing.has(code));
  return code;
};

export function Inventory({products, search, setSearch, movements, onNew, onEdit}:{products:Product[];search:string;setSearch:(v:string)=>void;movements:InventoryMovement[];onNew:()=>void;onEdit:(p:Product)=>void}) {
  const lowStock = products.filter(p => p.stock <= p.minStock);
  const expiring = products.filter(p => daysUntil(p.expiry) >= 0 && daysUntil(p.expiry) <= 90);
  const expired = products.filter(p => daysUntil(p.expiry) < 0);
  const lowMargin = products.filter(p => margin(p.retail, p.cost) < 15);
  const [selected, setSelected] = useState<number[]>([]);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const selectedProducts = useMemo(() => products.filter(p => selected.includes(p.id) && p.code.trim()), [products, selected]);
  const toggle = (id:number, checked:boolean) => setSelected(current => checked ? [...new Set([...current,id])] : current.filter(x => x !== id));
  const selectVisible = (checked:boolean) => setSelected(current => checked ? [...new Set([...current,...products.map(p=>p.id)])] : current.filter(id => !products.some(p=>p.id===id)));
  return <div className="content">
    <div className="page-head"><div><span className="pill">MÓDULO 2</span><h2>Productos e inventario</h2><p>Existencias, costos, margen, lotes, vencimientos y etiquetas.</p></div><div className="inventory-actions"><button className="secondary" onClick={()=>setLabelsOpen(true)} disabled={selected.length===0}><Printer size={17}/> Imprimir etiquetas ({selected.length})</button><button className="primary" onClick={onNew}><Plus size={17}/> Nuevo producto</button></div></div>
    <div className="inventory-toolbar card"><div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por código, producto, categoría..." /></div><span className="count">{products.length} productos</span></div>
    <div className="inventory-alerts">
      {lowStock.length > 0 && <div className="card alert-card"><AlertTriangle size={18}/><div><strong>{lowStock.length} con stock bajo</strong><small>{lowStock.slice(0,3).map(p=>p.name).join(', ')}</small></div></div>}
      {expired.length > 0 && <div className="card alert-card danger"><AlertTriangle size={18}/><div><strong>{expired.length} vencido(s)</strong><small>{expired.slice(0,3).map(p=>p.name).join(', ')}</small></div></div>}
      {expiring.length > 0 && <div className="card alert-card"><AlertTriangle size={18}/><div><strong>{expiring.length} vence(n) en 90 días</strong><small>{expiring.slice(0,3).map(p=>p.name).join(', ')}</small></div></div>}
      {lowMargin.length > 0 && <div className="card alert-card"><AlertTriangle size={18}/><div><strong>{lowMargin.length} con margen minorista menor a 15%</strong><small>Revisa precio o costo antes de modificarlo.</small></div></div>}
    </div>
    <div className="card table-wrap"><table><thead><tr><th><input aria-label="Seleccionar todos los productos visibles" type="checkbox" checked={products.length>0&&products.every(p=>selected.includes(p.id))} onChange={e=>selectVisible(e.target.checked)}/></th><th>Producto</th><th>Categoría</th><th>Costo promedio</th><th>Minorista</th><th>Margen</th><th>Mayorista</th><th>Margen</th><th>Stock</th><th>Vencimiento</th><th></th></tr></thead><tbody>{products.map(p=>{const days=daysUntil(p.expiry);const retailMargin=margin(p.retail,p.cost);const wholesaleMargin=margin(p.wholesale,p.cost);return <tr key={p.id}><td><input aria-label={`Seleccionar ${p.name}`} type="checkbox" checked={selected.includes(p.id)} onChange={e=>toggle(p.id,e.target.checked)}/></td><td><div className="product-cell">{p.imageUrl&&<img src={p.imageUrl} alt="" loading="lazy"/>}<div><strong>{p.name}</strong><small>{p.code||'Sin código'} · {p.presentation}</small></div></div>{p.activeIngredients?.length ? <small><b>Principio(s) activo(s):</b> {p.activeIngredients.join(' + ')}</small> : <small>Sin principios activos registrados</small>}</td><td>{p.category}</td><td>{money(p.cost)}</td><td>{money(p.retail)}</td><td><span className={retailMargin<15?'stock low':'stock'}>{retailMargin.toFixed(1)}%</span></td><td>{money(p.wholesale)}</td><td><span className={wholesaleMargin<15?'stock low':'stock'}>{wholesaleMargin.toFixed(1)}%</span></td><td><span className={p.stock<=p.minStock?'stock low':'stock'}>{p.stock}</span><small>Mín. {p.minStock}</small></td><td><span className={days<0?'stock low':days<=90?'stock low':'stock'}>{p.expiry?new Date(p.expiry+'T00:00:00').toLocaleDateString('es-HN'):'Sin fecha'}</span></td><td><button className="icon-btn" title="Editar" onClick={()=>onEdit(p)}><Pencil size={16}/></button></td></tr>})}</tbody></table></div>
    <div className="card table-wrap"><div className="card-title"><div><h3>Historial de movimientos</h3><p>Últimas entradas y salidas registradas.</p></div><History size={20}/></div><table><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Stock antes</th><th>Stock después</th><th>Costo unitario</th></tr></thead><tbody>{movements.slice().reverse().slice(0,20).map(m=><tr key={m.id}><td>{new Date(m.date).toLocaleString('es-HN')}</td><td><strong>{m.productName}</strong></td><td>{m.type}</td><td>{m.quantity}</td><td>{m.stockBefore}</td><td>{m.stockAfter}</td><td>{money(m.unitCost)}</td></tr>)}{movements.length===0&&<tr><td colSpan={7}>Aún no hay movimientos registrados.</td></tr>}</tbody></table></div>
    {labelsOpen && <div className="modal-backdrop label-backdrop"><div className="modal labels-modal"><div className="modal-head no-print"><div><h2>Etiquetas de productos</h2><p>{selectedProducts.length} etiqueta(s) listas. Selecciona imprimir en tamaño real o ajustado a la hoja.</p></div><button className="icon-btn" onClick={()=>setLabelsOpen(false)}><X/></button></div>
      {selectedProducts.length===0 ? <div className="form-error">Los productos seleccionados no tienen código de barras. Edita el producto o genera un código antes de imprimir.</div> : <div className="print-labels">{selectedProducts.map(p=><BarcodeLabel key={p.id} product={p}/>)}</div>}
      <div className="modal-actions no-print"><button className="secondary" onClick={()=>setLabelsOpen(false)}>Cerrar</button><button className="primary" disabled={selectedProducts.length===0} onClick={()=>window.print()}><Printer size={16}/> Imprimir etiquetas</button></div></div></div>}
  </div>;
}

function BarcodeLabel({product}:{product:Product}) {
  const svg=useRef<SVGSVGElement>(null);
  useEffect(()=>{if(svg.current&&product.code){try{JsBarcode(svg.current,product.code,{format:'CODE128',displayValue:true,font:'Arial',fontSize:11,textMargin:2,height:38,margin:3,background:'#ffffff',lineColor:'#111111'});}catch{if(svg.current)svg.current.innerHTML='';}}},[product.code]);
  return <div className="barcode-label"><strong className="label-name">{product.name}</strong><span className="label-presentation">{product.presentation||product.category}</span><svg ref={svg} aria-label={`Código de barras ${product.code}`}/><strong className="label-price">{money(product.retail)}</strong></div>;
}

export function ProductModal({product,onClose,onSave,products=[]}:{product:Product|null;onClose:()=>void;onSave:(p:Product)=>void;products?:Product[]}) {
  const blank:Product={id:0,code:'',name:'',imageUrl:'',activeIngredients:[],category:'Medicamentos',laboratory:'',presentation:'',cost:0,retail:0,wholesale:0,stock:0,minStock:0,lot:'',expiry:'',supplier:''};
  const [form,setForm]=useState<Product>(product||blank);
  const [codeError,setCodeError]=useState('');
  const [imageQuery,setImageQuery]=useState(product?.name??'');
  const [imageResults,setImageResults]=useState<{title:string;thumbnail:string;url:string;description:string;page:string}[]>([]);
  const [imageSearching,setImageSearching]=useState(false);
  const [imagePanelOpen,setImagePanelOpen]=useState(false);
  const [imageSearchError,setImageSearchError]=useState('');
  const searchImages=async()=>{
    const query=(imageQuery||form.name).trim();
    if(!query){setImageSearchError('Escribe el nombre del producto para buscar imágenes.');return;}
    setImageSearching(true);setImageSearchError('');setImageResults([]);
    try{
      const endpoint=new URL('https://commons.wikimedia.org/w/api.php');
      endpoint.searchParams.set('action','query');endpoint.searchParams.set('generator','search');
      endpoint.searchParams.set('gsrsearch',query+' filetype:bitmap');endpoint.searchParams.set('gsrnamespace','6');
      endpoint.searchParams.set('gsrlimit','8');endpoint.searchParams.set('prop','imageinfo');
      endpoint.searchParams.set('iiprop','url');endpoint.searchParams.set('iiurlwidth','320');
      endpoint.searchParams.set('format','json');endpoint.searchParams.set('origin','*');
      const response=await fetch(endpoint.toString());
      if(!response.ok)throw new Error('El servicio de imágenes no respondió.');
      const data=await response.json() as any;
      const results=Object.values(data.query?.pages??{}).flatMap((raw:any)=>{const info=raw.imageinfo?.[0];const url=info?.url;const thumbnail=info?.thumburl||url;return url&&thumbnail?[{title:String(raw.title||'Imagen').replace(/^File:/,''),thumbnail,url,description:'Imagen alojada en Wikimedia Commons',page:info?.descriptionurl||'https://commons.wikimedia.org/'}]:[];});
      setImageResults(results);
      if(!results.length)setImageSearchError('No se encontraron imágenes. Prueba con el nombre genérico del producto o pega un enlace de imagen.');
    }catch(error){setImageSearchError(error instanceof Error?error.message:'No se pudieron cargar las imágenes. Puedes pegar un enlace directo.');}
    finally{setImageSearching(false);}
  };
  const set=(key:keyof Product,value:string|number)=>{setForm(f=>({...f,[key]:typeof value==='string' && ['cost','retail','wholesale','stock','minStock'].includes(key) ? Number(value) : value}));if(key==='code')setCodeError('');};
  const fields:[keyof Product,string,string][]=[['code','Código de barras / SKU','text'],['name','Nombre del producto','text'],['category','Categoría','text'],['laboratory','Laboratorio','text'],['presentation','Presentación','text'],['cost','Costo','number'],['retail','Precio minorista','number'],['wholesale','Precio mayorista','number'],['stock','Existencia','number'],['minStock','Stock mínimo','number'],['lot','Lote','text'],['expiry','Vencimiento','date'],['supplier','Proveedor','text']];
  const valid=!!form.name.trim()&&form.cost>=0&&form.retail>=0&&form.wholesale>=0&&form.stock>=0&&form.minStock>=0;
  const duplicate=!!form.code.trim()&&products.some(p=>p.id!==form.id&&p.code.trim().toUpperCase()===form.code.trim().toUpperCase());
  const save=()=>{if(duplicate){setCodeError('Este código ya está asignado a otro producto. Genera uno nuevo o introduce uno diferente.');return;}onSave({...form,code:form.code.trim()||makeBarcode(products)});};
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><h2>{product?'Editar producto':'Nuevo producto'}</h2><p>Completa la ficha. El código se puede generar automáticamente o introducir manualmente.</p></div><button className="icon-btn" onClick={onClose}><X/></button></div><div className="barcode-field"><label>Código de barras / SKU<input value={form.code} placeholder="Se genera automáticamente al guardar" onChange={e=>set('code',e.target.value)}/></label><button className="secondary" onClick={()=>{set('code',makeBarcode(products));setCodeError('');}}><Barcode size={16}/> Generar código</button></div>{codeError&&<p role="alert" className="form-error">{codeError}</p>}<div className="form-grid">{fields.filter(([key])=>key!=='code').map(([key,label,type])=>key==='name'?<><div className="product-name-image-row" key={key}><label>{label}<input type={type} value={String(form[key] ?? '')} onChange={e=>{set(key,e.target.value);if(!imageQuery.trim())setImageQuery(e.target.value);}}/></label><button type="button" className="secondary product-image-trigger" onClick={()=>setImagePanelOpen(open=>!open)}><ImageIcon size={16}/>{imagePanelOpen?'Cerrar':'Buscar imagen'}</button></div>{imagePanelOpen&&<section className="product-image-editor"><div className="product-image-editor-head"><div><h3><ImageIcon size={17}/> Imagen del producto</h3><p>Busca imágenes públicas en Wikimedia Commons o pega un enlace directo.</p></div>{form.imageUrl&&<button type="button" className="secondary" onClick={()=>setForm(f=>({...f,imageUrl:''}))}>Quitar imagen</button>}</div><div className="product-image-search"><input value={imageQuery} onChange={e=>setImageQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void searchImages();}}} placeholder="Ej. Eutirox 50 mcg caja"/><button type="button" className="secondary" onClick={()=>void searchImages()} disabled={imageSearching}>{imageSearching?<LoaderCircle size={16} className="spin-icon"/>:<Search size={16}/>} Buscar en la web</button></div><label className="image-url-label">O pega URL de la imagen<input type="url" value={form.imageUrl??''} placeholder="https://..." onChange={e=>setForm(f=>({...f,imageUrl:e.target.value}))}/></label>{form.imageUrl&&<div className="product-image-current"><img src={form.imageUrl} alt="Vista previa del producto" onError={e=>{e.currentTarget.style.opacity='.25';}}/><span>Vista previa de la imagen seleccionada</span></div>}{imageSearchError&&<p className="image-search-error" role="status">{imageSearchError}</p>}{imageResults.length>0&&<div className="product-image-results">{imageResults.map(result=><button type="button" className={form.imageUrl===result.url?'selected':''} key={result.url} onClick={()=>setForm(f=>({...f,imageUrl:result.url}))} title={result.title}><img src={result.thumbnail} alt={result.title} loading="lazy"/><span>{result.title}</span><small><ExternalLink size={11}/> Seleccionar</small></button>)}</div>}<p className="helper">Comprueba que la imagen corresponda exactamente a la presentación y marca. Respeta las condiciones de uso de la fuente; la imagen se guarda como enlace.</p></section>}}</>:<label key={key}>{label}<input type={type} min={type==='number'?0:undefined} value={String(form[key] ?? '')} onChange={e=>set(key,type==='number'?Number(e.target.value):e.target.value)}/></label>)}</div><label className="ingredients-field">Principio(s) activo(s)<input value={(form.activeIngredients ?? []).join(', ')} placeholder="Ej.: paracetamol, cafeína, fenilefrina" onChange={e=>setForm(f=>({...f,activeIngredients:e.target.value.split(',').map(value=>value.trim()).filter(Boolean)}))}/><small>Si el medicamento contiene varios, sepáralos con comas. Puedes registrar uno o varios.</small></label><p className="helper">Se utiliza CODE 128, compatible con lectores de barras habituales. Si usas un código de proveedor, puedes escribirlo en el campo.</p><div className="modal-actions"><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={!valid} onClick={save}>Guardar producto</button></div></div></div>;
}
