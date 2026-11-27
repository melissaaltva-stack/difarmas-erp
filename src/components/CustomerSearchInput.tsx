import { useMemo, type ReactNode } from 'react';
import { Search, UserPlus } from 'lucide-react';
import type { Customer } from '../domain/types';

type Props = {
 customers: Customer[];
 query: string;
 onQueryChange: (value:string)=>void;
 open: boolean;
 onOpenChange: (open:boolean)=>void;
 onSelect: (customer:Customer|null)=>void;
 onRegisterNew: ()=>void;
 id: string;
 placeholder?: string;
 includeConsumerFinal?: boolean;
 children?: ReactNode;
};

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/[^a-z0-9]/g,'');

export function CustomerSearchInput({customers,query,onQueryChange,open,onOpenChange,onSelect,onRegisterNew,id,placeholder='Buscar por nombre, código o RTN',includeConsumerFinal=false,children}:Props){
 const matches=useMemo(()=>{
  const needle=normalize(query);
  return customers.filter(customer=>customer.active!==false)
   .filter(customer=>!needle||[customer.name,customer.code??'',customer.rtn??'',customer.documentNumber??''].some(value=>normalize(value).includes(needle)))
   .slice(0,8);
 },[customers,query]);
 const showConsumerFinal=includeConsumerFinal&&(!normalize(query)||normalize('Consumidor Final').includes(normalize(query))||normalize(query).includes(normalize('Consumidor Final')));
 return <div className="invoice-customer-select-row customer-search-row">
  <div className="customer-search-picker">
   <div className="invoice-search customer-search-control">
    <Search size={17}/>
    <input id={id} type="text" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={id+'-results'} value={query} placeholder={placeholder}
     onFocus={()=>onOpenChange(true)} onBlur={()=>onOpenChange(false)} onChange={event=>{onQueryChange(event.target.value);onOpenChange(true);}}
     onKeyDown={event=>{if(event.key==='Escape')onOpenChange(false);}}/>
   </div>
   {open&&<div id={id+'-results'} className="customer-search-results" role="listbox" aria-label="Clientes encontrados">
    {showConsumerFinal&&<button type="button" role="option" className="customer-search-option" onMouseDown={event=>event.preventDefault()} onClick={()=>{onSelect(null);onOpenChange(false);}}>
     <strong>Consumidor Final</strong><small>Cliente sin registro</small>
    </button>}
    {matches.map(customer=><button type="button" role="option" className="customer-search-option" key={customer.id} onMouseDown={event=>event.preventDefault()} onClick={()=>{onSelect(customer);onOpenChange(false);}}>
     <strong>{customer.name}</strong>
     <small>{[customer.code?'Código: '+customer.code:'',customer.rtn?'RTN: '+customer.rtn:''].filter(Boolean).join(' · ')||'Cliente registrado'}</small>
    </button>)}
    {!showConsumerFinal&&matches.length===0&&<div className="customer-search-empty">No se encontraron clientes. Puedes registrar uno nuevo.</div>}
   </div>}
  </div>
  <button className="text-button register-customer-button" type="button" onMouseDown={event=>event.preventDefault()} onClick={()=>{onOpenChange(false);onRegisterNew();}}><UserPlus size={15}/> Registrar cliente nuevo</button>
  {children}
 </div>;
}
