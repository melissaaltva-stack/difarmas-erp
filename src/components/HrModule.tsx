import { useMemo, useState, type FormEvent } from 'react';
import { Users, UserPlus, Search, CalendarDays, Clock3, ClipboardList, Pencil, Trash2, Check, X, Phone, Mail, BriefcaseBusiness, FileText } from 'lucide-react';
import type { HrEmployee, HrAttendanceRecord, HrLeaveRequest } from '../domain/types';

type Setter<T> = (value:T|((current:T)=>T))=>void;
type Props = {
  employees:HrEmployee[];
  setEmployees:Setter<HrEmployee[]>;
  attendance:HrAttendanceRecord[];
  setAttendance:Setter<HrAttendanceRecord[]>;
  leaveRequests:HrLeaveRequest[];
  setLeaveRequests:Setter<HrLeaveRequest[]>;
  canWrite:boolean;
};
type EmployeeDraft = Omit<HrEmployee,'id'|'createdAt'|'updatedAt'>;
type Tab = 'personal'|'attendance'|'leave';

const pad=(value:number)=>String(value).padStart(2,'0');
const today=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const makeId=(prefix:string)=>prefix+'-'+(typeof crypto!=='undefined'&&'randomUUID'in crypto?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-HN').trim();
const inclusiveDays=(start:string,end:string)=>{const a=start.split('-').map(Number),b=end.split('-').map(Number);if(a.length!==3||b.length!==3)return 0;return Math.max(0,Math.round((Date.UTC(b[0],b[1]-1,b[2])-Date.UTC(a[0],a[1]-1,a[2]))/86400000)+1);};
const formatDate=(value:string)=>{if(!value)return '—';const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('es-HN',{day:'2-digit',month:'short',year:'numeric'});};
const blankEmployee=(employees:HrEmployee[]):EmployeeDraft=>{
  const next=employees.reduce((max,employee)=>Math.max(max,Number(employee.employeeCode.match(/(\d+)$/)?.[1]??0)),0)+1;
  return {employeeCode:'EMP-'+String(next).padStart(4,'0'),fullName:'',position:'',department:'',phone:'',email:'',hireDate:today(),contractType:'Permanente',status:'Activo',emergencyContact:'',notes:''};
};
const statusClass=(status:string)=>status.toLocaleLowerCase('es-HN').replace(/\s+/g,'-');

export function HrModule({employees,setEmployees,attendance,setAttendance,leaveRequests,setLeaveRequests,canWrite}:Props){
  const [tab,setTab]=useState<Tab>('personal');
  const [query,setQuery]=useState('');
  const [employeeFilter,setEmployeeFilter]=useState<'Todos'|'Activo'|'Inactivo'>('Todos');
  const [editingEmployee,setEditingEmployee]=useState<HrEmployee|null>(null);
  const [employeeDraft,setEmployeeDraft]=useState<EmployeeDraft>(()=>blankEmployee(employees));
  const [employeeModalOpen,setEmployeeModalOpen]=useState(false);
  const [employeeError,setEmployeeError]=useState('');
  const [attendanceDate,setAttendanceDate]=useState(today());
  const [attendanceEmployeeId,setAttendanceEmployeeId]=useState('');
  const [attendanceStatus,setAttendanceStatus]=useState<HrAttendanceRecord['status']>('Presente');
  const [checkIn,setCheckIn]=useState('08:00');
  const [checkOut,setCheckOut]=useState('17:00');
  const [attendanceNotes,setAttendanceNotes]=useState('');
  const [attendanceNotice,setAttendanceNotice]=useState('');
  const [leaveModalOpen,setLeaveModalOpen]=useState(false);
  const [leaveEmployeeId,setLeaveEmployeeId]=useState('');
  const [leaveType,setLeaveType]=useState<HrLeaveRequest['type']>('Vacaciones');
  const [leaveStart,setLeaveStart]=useState(today());
  const [leaveEnd,setLeaveEnd]=useState(today());
  const [leaveReason,setLeaveReason]=useState('');
  const [leaveError,setLeaveError]=useState('');
  const [leaveFilter,setLeaveFilter]=useState<'Todos'|'Pendiente'|'Aprobado'|'Rechazado'>('Todos');

  const activeEmployees=useMemo(()=>employees.filter(employee=>employee.status==='Activo'),[employees]);
  const selectedDateAttendance=useMemo(()=>attendance.filter(item=>item.date===attendanceDate),[attendance,attendanceDate]);
  const employeeById=useMemo(()=>new Map(employees.map(employee=>[employee.id,employee])),[employees]);
  const filteredEmployees=useMemo(()=>{
    const q=normalize(query);
    return employees.filter(employee=>(employeeFilter==='Todos'||employee.status===employeeFilter)&&(!q||normalize([employee.employeeCode,employee.fullName,employee.position,employee.department,employee.phone,employee.email].join(' ')).includes(q))).sort((a,b)=>a.fullName.localeCompare(b.fullName,'es'));
  },[employees,employeeFilter,query]);
  const filteredLeaves=useMemo(()=>leaveRequests.filter(item=>leaveFilter==='Todos'||item.status===leaveFilter).sort((a,b)=>b.requestedAt.localeCompare(a.requestedAt)),[leaveRequests,leaveFilter]);
  const openNewEmployee=()=>{setEditingEmployee(null);setEmployeeDraft(blankEmployee(employees));setEmployeeError('');setEmployeeModalOpen(true);};
  const openEditEmployee=(employee:HrEmployee)=>{setEditingEmployee(employee);const {id,createdAt,updatedAt,...draft}=employee;void id;void createdAt;void updatedAt;setEmployeeDraft({...draft});setEmployeeError('');setEmployeeModalOpen(true);};
  const saveEmployee=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const fullName=employeeDraft.fullName.trim(),code=employeeDraft.employeeCode.trim().toUpperCase();
    if(!fullName||!code||!employeeDraft.position.trim()||!employeeDraft.hireDate){setEmployeeError('Completa el nombre, código, puesto y fecha de ingreso.');return;}
    if(employees.some(employee=>employee.id!==editingEmployee?.id&&employee.employeeCode.toLocaleLowerCase()===code.toLocaleLowerCase())){setEmployeeError('Ese código de colaborador ya está registrado.');return;}
    const now=new Date().toISOString();
    if(editingEmployee){
      setEmployees(current=>current.map(employee=>employee.id===editingEmployee.id?{...employee,...employeeDraft,employeeCode:code,fullName,position:employeeDraft.position.trim(),department:employeeDraft.department.trim(),phone:employeeDraft.phone.trim(),email:employeeDraft.email.trim(),emergencyContact:employeeDraft.emergencyContact.trim(),notes:employeeDraft.notes.trim(),updatedAt:now}:employee));
    }else{
      setEmployees(current=>[{...employeeDraft,id:makeId('emp'),employeeCode:code,fullName,position:employeeDraft.position.trim(),department:employeeDraft.department.trim(),phone:employeeDraft.phone.trim(),email:employeeDraft.email.trim(),emergencyContact:employeeDraft.emergencyContact.trim(),notes:employeeDraft.notes.trim(),createdAt:now,updatedAt:now},...current]);
    }
    setEmployeeModalOpen(false);
  };
  const deleteEmployee=(employee:HrEmployee)=>{
    if(!window.confirm('¿Eliminar el expediente de '+employee.fullName+'? También se eliminarán sus registros de asistencia y solicitudes de permiso.'))return;
    setEmployees(current=>current.filter(item=>item.id!==employee.id));
    setAttendance(current=>current.filter(item=>item.employeeId!==employee.id));
    setLeaveRequests(current=>current.filter(item=>item.employeeId!==employee.id));
  };
  const saveAttendance=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!attendanceEmployeeId){setAttendanceNotice('Selecciona un colaborador.');return;}
    const existing=attendance.find(item=>item.employeeId===attendanceEmployeeId&&item.date===attendanceDate);
    const now=new Date().toISOString();
    const record:HrAttendanceRecord={id:existing?.id??makeId('att'),employeeId:attendanceEmployeeId,date:attendanceDate,status:attendanceStatus,checkIn:attendanceStatus==='Ausente'||attendanceStatus==='Permiso'||attendanceStatus==='Vacaciones'?'':checkIn,checkOut:attendanceStatus==='Ausente'||attendanceStatus==='Permiso'||attendanceStatus==='Vacaciones'?'':checkOut,notes:attendanceNotes.trim(),createdAt:existing?.createdAt??now,updatedAt:now};
    setAttendance(current=>existing?current.map(item=>item.id===existing.id?record:item):[record,...current]);
    setAttendanceNotice(existing?'Registro de asistencia actualizado.':'Asistencia registrada correctamente.');
    setAttendanceNotes('');
  };
  const createLeave=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const days=inclusiveDays(leaveStart,leaveEnd);
    if(!leaveEmployeeId){setLeaveError('Selecciona un colaborador.');return;}
    if(!leaveStart||!leaveEnd||days<1){setLeaveError('Verifica las fechas del permiso.');return;}
    const duplicate=leaveRequests.some(item=>item.employeeId===leaveEmployeeId&&item.status!=='Rechazado'&&leaveStart<=item.endDate&&leaveEnd>=item.startDate);
    if(duplicate){setLeaveError('Ya existe una solicitud pendiente o aprobada que se cruza con ese período.');return;}
    setLeaveRequests(current=>[{id:makeId('leave'),employeeId:leaveEmployeeId,type:leaveType,startDate:leaveStart,endDate:leaveEnd,days,reason:leaveReason.trim(),status:'Pendiente',requestedAt:new Date().toISOString()},...current]);
    setLeaveModalOpen(false);setLeaveError('');setLeaveReason('');
  };
  const reviewLeave=(item:HrLeaveRequest,status:'Aprobado'|'Rechazado')=>{
    if(status==='Aprobado'){
      const overlaps=leaveRequests.some(other=>other.id!==item.id&&other.employeeId===item.employeeId&&other.status==='Aprobado'&&item.startDate<=other.endDate&&item.endDate>=other.startDate);
      if(overlaps){window.alert('No se puede aprobar: existe otro permiso aprobado para ese colaborador en las mismas fechas.');return;}
    }
    setLeaveRequests(current=>current.map(currentItem=>currentItem.id===item.id?{...currentItem,status,reviewedAt:new Date().toISOString()}:currentItem));
  };

  const presentCount=selectedDateAttendance.filter(item=>item.status==='Presente'||item.status==='Tardanza').length;
  const pendingCount=leaveRequests.filter(item=>item.status==='Pendiente').length;
  const attendanceSummary=activeEmployees.length?Math.round(presentCount/activeEmployees.length*100):0;

  return <div className="content hr-page">
    <div className="page-head hr-page-head"><div><span className="pill">GESTIÓN DEL PERSONAL</span><h2>Recursos Humanos</h2><p>Administra colaboradores, asistencia y solicitudes internas de DIFARMÁS.</p></div><div className="hr-header-actions"><span className="hr-private-note"><BriefcaseBusiness size={15}/> Información interna</span></div></div>
    <div className="hr-metrics">
      <article className="card hr-metric"><span className="hr-metric-icon"><Users size={18}/></span><div><small>Colaboradores activos</small><strong>{activeEmployees.length}</strong><span>{employees.length} expedientes registrados</span></div></article>
      <article className="card hr-metric"><span className="hr-metric-icon"><Clock3 size={18}/></span><div><small>Asistencia del día seleccionado</small><strong>{presentCount}/{activeEmployees.length}</strong><span>{attendanceSummary}% con asistencia marcada</span></div></article>
      <article className="card hr-metric"><span className="hr-metric-icon"><CalendarDays size={18}/></span><div><small>Solicitudes pendientes</small><strong>{pendingCount}</strong><span>Vacaciones y permisos por revisar</span></div></article>
    </div>
    <div className="hr-tabs" role="tablist" aria-label="Secciones de Recursos Humanos">
      <button type="button" role="tab" aria-selected={tab==='personal'} className={tab==='personal'?'active':''} onClick={()=>setTab('personal')}><Users size={16}/> Personal</button>
      <button type="button" role="tab" aria-selected={tab==='attendance'} className={tab==='attendance'?'active':''} onClick={()=>setTab('attendance')}><Clock3 size={16}/> Asistencia</button>
      <button type="button" role="tab" aria-selected={tab==='leave'} className={tab==='leave'?'active':''} onClick={()=>setTab('leave')}><CalendarDays size={16}/> Permisos y vacaciones{pendingCount>0&&<span className="hr-tab-count">{pendingCount}</span>}</button>
    </div>
    {!canWrite&&<div className="settings-hint hr-sync-hint"><FileText size={16}/> El módulo está en modo de consulta mientras FARMI termina de sincronizar los datos.</div>}
    {tab==='personal'&&<section className="card hr-panel">
      <div className="hr-panel-heading"><div><h3>Directorio de colaboradores</h3><p>Expedientes laborales básicos y datos de contacto.</p></div><button type="button" className="primary" onClick={openNewEmployee} disabled={!canWrite}><UserPlus size={16}/> Nuevo colaborador</button></div>
      <div className="hr-toolbar"><label className="search"><Search size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar por nombre, código, puesto o área..."/></label><select value={employeeFilter} onChange={event=>setEmployeeFilter(event.target.value as typeof employeeFilter)}><option>Todos</option><option>Activo</option><option>Inactivo</option></select></div>
      {filteredEmployees.length===0?<div className="hr-empty"><Users size={30}/><strong>{employees.length?'No hay coincidencias':'Aún no hay colaboradores registrados'}</strong><span>{employees.length?'Prueba con otro nombre, código o área.':'Registra el primer expediente para comenzar a utilizar RRHH.'}</span></div>:<div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>Colaborador</th><th>Puesto / área</th><th>Ingreso</th><th>Contrato</th><th>Estado</th><th>Contacto</th><th/></tr></thead><tbody>{filteredEmployees.map(employee=><tr key={employee.id}><td><div className="hr-person-cell"><span className="hr-avatar">{employee.fullName.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()}</span><span><strong>{employee.fullName}</strong><small>{employee.employeeCode}</small></span></div></td><td><strong>{employee.position}</strong><small>{employee.department||'Sin área asignada'}</small></td><td>{formatDate(employee.hireDate)}</td><td>{employee.contractType}</td><td><span className={'hr-status '+statusClass(employee.status)}>{employee.status}</span></td><td><span className="hr-contact">{employee.phone&&<span><Phone size={13}/>{employee.phone}</span>}{employee.email&&<span><Mail size={13}/>{employee.email}</span>}{!employee.phone&&!employee.email&&'—'}</span></td><td><div className="hr-row-actions"><button type="button" className="icon-btn" title="Editar expediente" aria-label={'Editar '+employee.fullName} onClick={()=>openEditEmployee(employee)} disabled={!canWrite}><Pencil size={15}/></button><button type="button" className="icon-btn hr-delete-btn" title="Eliminar expediente" aria-label={'Eliminar '+employee.fullName} onClick={()=>deleteEmployee(employee)} disabled={!canWrite}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>}
      <p className="hr-footnote">Los expedientes de RRHH no crean cuentas de usuario ni modifican los permisos de acceso a FARMI.</p>
    </section>}
    {tab==='attendance'&&<section className="card hr-panel">
      <div className="hr-panel-heading"><div><h3>Control de asistencia</h3><p>Registra la jornada por colaborador y fecha.</p></div><label className="hr-date-filter">Fecha de control<input type="date" value={attendanceDate} onChange={event=>{setAttendanceDate(event.target.value);setAttendanceNotice('');}}/></label></div>
      <form className="hr-attendance-form" onSubmit={saveAttendance}>
        <label>Colaborador<select value={attendanceEmployeeId} onChange={event=>setAttendanceEmployeeId(event.target.value)} required><option value="">Seleccionar colaborador</option>{activeEmployees.map(employee=><option key={employee.id} value={employee.id}>{employee.employeeCode} · {employee.fullName}</option>)}</select></label>
        <label>Estado<select value={attendanceStatus} onChange={event=>setAttendanceStatus(event.target.value as HrAttendanceRecord['status'])}><option>Presente</option><option>Tardanza</option><option>Ausente</option><option>Permiso</option><option>Vacaciones</option></select></label>
        <label>Entrada<input type="time" value={checkIn} disabled={['Ausente','Permiso','Vacaciones'].includes(attendanceStatus)} onChange={event=>setCheckIn(event.target.value)}/></label>
        <label>Salida<input type="time" value={checkOut} disabled={['Ausente','Permiso','Vacaciones'].includes(attendanceStatus)} onChange={event=>setCheckOut(event.target.value)}/></label>
        <label className="hr-attendance-notes">Observación<input value={attendanceNotes} onChange={event=>setAttendanceNotes(event.target.value)} placeholder="Observación opcional"/></label>
        <button type="submit" className="primary" disabled={!canWrite||activeEmployees.length===0}><Check size={15}/> Guardar asistencia</button>
      </form>
      {attendanceNotice&&<p className="hr-inline-notice" role="status">{attendanceNotice}</p>}
      <div className="hr-list-heading"><strong>Registros del {formatDate(attendanceDate)}</strong><span>{selectedDateAttendance.length} registro(s)</span></div>
      {selectedDateAttendance.length===0?<div className="hr-empty compact"><Clock3 size={25}/><span>No hay asistencia registrada para esta fecha.</span></div>:<div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>Colaborador</th><th>Estado</th><th>Entrada</th><th>Salida</th><th>Observación</th></tr></thead><tbody>{selectedDateAttendance.map(item=>{const employee=employeeById.get(item.employeeId);return <tr key={item.id}><td><strong>{employee?.fullName??'Colaborador eliminado'}</strong><small>{employee?.employeeCode??''}</small></td><td><span className={'hr-status '+statusClass(item.status)}>{item.status}</span></td><td>{item.checkIn||'—'}</td><td>{item.checkOut||'—'}</td><td>{item.notes||'—'}</td></tr>;})}</tbody></table></div>}
      <p className="hr-footnote">La asistencia se captura manualmente. Este registro no realiza descuentos ni cálculos de jornada o planilla.</p>
    </section>}
    {tab==='leave'&&<section className="card hr-panel">
      <div className="hr-panel-heading"><div><h3>Solicitudes de permisos y vacaciones</h3><p>Registra solicitudes y controla su aprobación.</p></div><button type="button" className="primary" onClick={()=>{setLeaveEmployeeId(activeEmployees[0]?.id??'');setLeaveStart(today());setLeaveEnd(today());setLeaveError('');setLeaveModalOpen(true);}} disabled={!canWrite||activeEmployees.length===0}><CalendarDays size={16}/> Nueva solicitud</button></div>
      <div className="hr-toolbar"><span className="hr-list-label"><ClipboardList size={16}/> Historial de solicitudes</span><select value={leaveFilter} onChange={event=>setLeaveFilter(event.target.value as typeof leaveFilter)}><option>Todos</option><option>Pendiente</option><option>Aprobado</option><option>Rechazado</option></select></div>
      {filteredLeaves.length===0?<div className="hr-empty"><CalendarDays size={30}/><strong>No hay solicitudes para mostrar</strong><span>Las vacaciones y permisos registrados aparecerán aquí.</span></div>:<div className="hr-leave-list">{filteredLeaves.map(item=><article className="hr-leave-row" key={item.id}><div className="hr-leave-icon"><CalendarDays size={19}/></div><div className="hr-leave-main"><strong>{employeeById.get(item.employeeId)?.fullName??'Colaborador eliminado'} · {item.type}</strong><span>{formatDate(item.startDate)} – {formatDate(item.endDate)} · {item.days} día(s) calendario</span>{item.reason&&<small>{item.reason}</small>}</div><span className={'hr-status '+statusClass(item.status)}>{item.status}</span>{item.status==='Pendiente'&&<div className="hr-row-actions"><button type="button" className="secondary hr-approve-btn" onClick={()=>reviewLeave(item,'Aprobado')} disabled={!canWrite}><Check size={14}/> Aprobar</button><button type="button" className="secondary hr-reject-btn" onClick={()=>reviewLeave(item,'Rechazado')} disabled={!canWrite}><X size={14}/> Rechazar</button></div>}</article>)}</div>}
    </section>}
    {employeeModalOpen&&<div className="modal-backdrop hr-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setEmployeeModalOpen(false);}}><section className="modal hr-employee-modal" role="dialog" aria-modal="true" aria-labelledby="hr-employee-title"><div className="modal-head"><div><h2 id="hr-employee-title">{editingEmployee?'Editar colaborador':'Nuevo colaborador'}</h2><p>Completa los datos básicos del expediente laboral.</p></div><button type="button" className="icon-btn" aria-label="Cerrar" onClick={()=>setEmployeeModalOpen(false)}><X size={18}/></button></div>
      <form onSubmit={saveEmployee}><div className="hr-form-grid">
        <label>Código de colaborador<input value={employeeDraft.employeeCode} onChange={event=>setEmployeeDraft(current=>({...current,employeeCode:event.target.value}))} maxLength={24} required/></label>
        <label>Nombre completo *<input autoFocus value={employeeDraft.fullName} onChange={event=>setEmployeeDraft(current=>({...current,fullName:event.target.value}))} maxLength={140} required/></label>
        <label>Puesto *<input value={employeeDraft.position} onChange={event=>setEmployeeDraft(current=>({...current,position:event.target.value}))} maxLength={100} placeholder="Ej. Auxiliar de farmacia" required/></label>
        <label>Departamento / área<input value={employeeDraft.department} onChange={event=>setEmployeeDraft(current=>({...current,department:event.target.value}))} maxLength={80} placeholder="Ej. Ventas, Compras, Administración"/></label>
        <label>Fecha de ingreso<input type="date" value={employeeDraft.hireDate} onChange={event=>setEmployeeDraft(current=>({...current,hireDate:event.target.value}))} required/></label>
        <label>Tipo de contrato<select value={employeeDraft.contractType} onChange={event=>setEmployeeDraft(current=>({...current,contractType:event.target.value as HrEmployee['contractType']}))}><option>Permanente</option><option>Temporal</option><option>Por servicios</option></select></label>
        <label>Teléfono<input value={employeeDraft.phone} onChange={event=>setEmployeeDraft(current=>({...current,phone:event.target.value}))} maxLength={40} placeholder="Teléfono de contacto"/></label>
        <label>Correo electrónico<input type="email" value={employeeDraft.email} onChange={event=>setEmployeeDraft(current=>({...current,email:event.target.value}))} maxLength={160} placeholder="colaborador@correo.com"/></label>
        <label>Contacto de emergencia<input value={employeeDraft.emergencyContact} onChange={event=>setEmployeeDraft(current=>({...current,emergencyContact:event.target.value}))} maxLength={120} placeholder="Nombre y teléfono"/></label>
        <label>Estado<select value={employeeDraft.status} onChange={event=>setEmployeeDraft(current=>({...current,status:event.target.value as HrEmployee['status']}))}><option>Activo</option><option>Inactivo</option></select></label>
        <label className="hr-form-full">Notas internas<textarea rows={3} value={employeeDraft.notes} onChange={event=>setEmployeeDraft(current=>({...current,notes:event.target.value}))} maxLength={1200} placeholder="Observaciones laborales generales (no incluir datos médicos ni contraseñas)."/></label>
      </div>{employeeError&&<p className="form-error" role="alert">{employeeError}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={()=>setEmployeeModalOpen(false)}>Cancelar</button><button type="submit" className="primary" disabled={!canWrite}><Check size={16}/> Guardar expediente</button></div></form>
    </section></div>}
    {leaveModalOpen&&<div className="modal-backdrop hr-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setLeaveModalOpen(false);}}><section className="modal hr-leave-modal" role="dialog" aria-modal="true" aria-labelledby="hr-leave-title"><div className="modal-head"><div><h2 id="hr-leave-title">Nueva solicitud</h2><p>Registra una solicitud para revisión del responsable.</p></div><button type="button" className="icon-btn" aria-label="Cerrar" onClick={()=>setLeaveModalOpen(false)}><X size={18}/></button></div>
      <form onSubmit={createLeave}><div className="hr-form-grid">
        <label className="hr-form-full">Colaborador<select value={leaveEmployeeId} onChange={event=>setLeaveEmployeeId(event.target.value)} required><option value="">Seleccionar colaborador</option>{activeEmployees.map(employee=><option key={employee.id} value={employee.id}>{employee.employeeCode} · {employee.fullName}</option>)}</select></label>
        <label>Tipo de solicitud<select value={leaveType} onChange={event=>setLeaveType(event.target.value as HrLeaveRequest['type'])}><option>Vacaciones</option><option>Permiso personal</option><option>Asunto familiar</option><option>Otro</option></select></label>
        <label>Inicio<input type="date" value={leaveStart} onChange={event=>setLeaveStart(event.target.value)} required/></label>
        <label>Fin<input type="date" min={leaveStart} value={leaveEnd} onChange={event=>setLeaveEnd(event.target.value)} required/></label>
        <div className="hr-days-preview"><small>Duración solicitada</small><strong>{inclusiveDays(leaveStart,leaveEnd)} día(s) calendario</strong></div>
        <label className="hr-form-full">Motivo / nota opcional<textarea rows={3} value={leaveReason} onChange={event=>setLeaveReason(event.target.value)} maxLength={600} placeholder="Información breve para evaluar la solicitud."/></label>
      </div>{leaveError&&<p className="form-error" role="alert">{leaveError}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={()=>setLeaveModalOpen(false)}>Cancelar</button><button type="submit" className="primary" disabled={!canWrite}><Check size={16}/> Registrar solicitud</button></div></form>
    </section></div>}
  </div>;
}
