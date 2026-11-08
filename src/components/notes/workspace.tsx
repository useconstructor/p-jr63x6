'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, Check, RotateCcw, FileText, LoaderCircle, Pin, PinOff, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription } from '@/components/ui/alert-dialog';
import { useSession } from './session-provider';
import { ErrorBox, Loading } from './shared';
import { trackNoteStarted, ApiError, clearOperation, dateLabel, notifyNotesChanged, readOperations, request, retainOperation, type Note, type Operation } from '@/lib/client/notes-api';

type Draft = {title:string;text:string};
type Modal = 'delete' | 'leave' | 'new-intent' | null;
const sorted = (notes:Note[]) => [...notes].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updated_at.localeCompare(a.updated_at)||a.id.localeCompare(b.id));
const same = (a:Draft,b:Draft) => a.title===b.title && a.text===b.text;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function NotesWorkspace() {
 const session=useSession(); const router=useRouter(); const params=useSearchParams();
 const id=params.get('id'); const newRequested=params.get('nueva')==='1';
 const [notes,setNotes]=useState<Note[]>([]); const [total,setTotal]=useState<number|null>(null); const [query,setQuery]=useState(''); const [listLoading,setListLoading]=useState(true); const [listError,setListError]=useState(''); const [attempt,setAttempt]=useState(0);
 const [confirmed,setConfirmed]=useState<Note|null>(null); const [draft,setDraft]=useState<Draft>({title:'',text:''}); const [selected,setSelected]=useState(false); const [detailLoading,setDetailLoading]=useState(false); const [detailError,setDetailError]=useState(''); const [unavailable,setUnavailable]=useState(false);
 const [busy,setBusy]=useState(false); const [status,setStatus]=useState(''); const [error,setError]=useState(''); const [invalid,setInvalid]=useState(false); const [focusTitle,setFocusTitle]=useState(0); const [conflict,setConflict]=useState<Note|null>(null); const [operations,setOperations]=useState<Operation[]>([]);
 const [modal,setModal]=useState<Modal>(null); const [dialogKind,setDialogKind]=useState<Modal>(null); const [announcement,setAnnouncement]=useState('');
 const saveRef=useRef<HTMLButtonElement>(null); const pinRef=useRef<HTMLButtonElement>(null); const restorePinFocus=useRef(false);
 const titleRef=useRef<HTMLTextAreaElement>(null); const newRef=useRef<HTMLButtonElement>(null); const cancelRef=useRef<HTMLButtonElement>(null); const invalidModalFocus=useRef(false); const modalTrigger=useRef<HTMLElement|null>(null); const pendingNavigation=useRef<null|(()=>void)>(null); const bypass=useRef(false);
 const draftRef=useRef(draft); draftRef.current=draft; const confirmedRef=useRef(confirmed); confirmedRef.current=confirmed;
 const busyRef=useRef(false); const selectionGeneration=useRef(0); const loadedKey=useRef('');const draftReady=useRef(false); const rowRefs=useRef(new Map<string,HTMLButtonElement>()); const rowBounds=useRef(new Map<string,number>()); const animations=useRef<Animation[]>([]); const mobileScroll=useRef(0); const restoreList=useRef(false);
 const dirty=selected && (!confirmed ? draft.title!=='' || draft.text!=='' : !same(draft,confirmed)); const dirtyRef=useRef(dirty); dirtyRef.current=dirty;
 const currentHistory=useRef<unknown>(null); const currentUrl=useRef('/notas'); const [restoreFocus,setRestoreFocus]=useState(0);
 const activeOperation=selected ? operations.find(o => (confirmed || id) ? o.endpoint.includes(confirmed?.id || id!) : newRequested && o.endpoint==='/api/notas') : undefined;
 const uncertainStatus=activeOperation?.endpoint.endsWith('/eliminar')?'Eliminación sin confirmar':activeOperation?.endpoint.endsWith('/fijar')?'Fijación sin confirmar':'Guardado sin confirmar';
 const currentRef=useRef({id,newRequested});currentRef.current={id,newRequested};

 useLayoutEffect(()=>{
  const field=titleRef.current;if(!field)return;
  let disposed=false,lastWidth=0;
  const fit=()=>{if(disposed)return;field.style.height='auto';const style=getComputedStyle(field);field.style.height=`${field.scrollHeight+parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth)}px`;};
  fit();
  const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.width!==lastWidth){lastWidth=entry.contentRect.width;fit();}});
  observer.observe(field);void document.fonts.ready.then(fit);
  return()=>{disposed=true;observer.disconnect();};
 },[draft.title,selected,detailLoading,session.ready]);

 useLayoutEffect(()=>{
  if(busy || !restorePinFocus.current)return;
  restorePinFocus.current=false;
  if(document.activeElement===document.body || document.activeElement===pinRef.current)pinRef.current?.focus({preventScroll:true});
 },[busy]);
 useEffect(()=>{
  const revealFocusedField=()=>{
   const field=document.activeElement;
   if(!(field instanceof HTMLElement) || !field.matches('.note-field'))return;
   const viewport=window.visualViewport;
   const top=(viewport?.offsetTop||0)+16;
   const bottom=(viewport?.offsetTop||0)+(viewport?.height||window.innerHeight)-16;
   const rect=field.getBoundingClientRect();
   const offset=rect.top<top ? rect.top-top : rect.bottom>bottom ? Math.min(rect.bottom-bottom,rect.top-top) : 0;
   if(offset)window.scrollBy({top:offset,behavior:'instant'});
  };
  window.addEventListener('resize',revealFocusedField);
  window.visualViewport?.addEventListener('resize',revealFocusedField);
  return()=>{window.removeEventListener('resize',revealFocusedField);window.visualViewport?.removeEventListener('resize',revealFocusedField);};
 },[]);
 useEffect(()=>{setOperations(readOperations());},[]);
 useEffect(()=>{if(focusTitle)titleRef.current?.focus();},[focusTitle,detailLoading,selected]);
 useEffect(()=>{if(restoreFocus && !selected){newRef.current?.focus(); if(restoreList.current){window.scrollTo({top:mobileScroll.current});restoreList.current=false;}}},[restoreFocus,selected]);
 useEffect(()=>{if(!session.ready)return;const controller=new AbortController();setListLoading(true);setListError('');const timeout=setTimeout(()=>{request<{notes:Note[];total:number}>('/api/notas?q='+encodeURIComponent(query),undefined,controller.signal).then(data=>{setNotes(data.notes);setTotal(data.total);}).catch(e=>{if(!controller.signal.aborted)setListError(e.message);}).finally(()=>{if(!controller.signal.aborted)setListLoading(false);});},query?180:0);return()=>{clearTimeout(timeout);controller.abort();};},[session.ready,session.version,query,attempt]);

 useEffect(()=>{
  if(!session.ready)return;
  const key=params.toString(); const changed=loadedKey.current!==key || !loadedKey.current; loadedKey.current=key || 'index';
  currentUrl.current=window.location.pathname+window.location.search;currentHistory.current=history.state;
  if(params.has('id') && params.has('nueva') || params.has('nueva') && !newRequested || id!==null && !uuid.test(id)) {setDetailError('No se encontró la nota.');setUnavailable(true);setSelected(true);setDetailLoading(false);return;}
  if(newRequested){if(changed){draftReady.current=false;selectionGeneration.current++;setSelected(true);setConfirmed(null);setDraft({title:'',text:''});setError('');setInvalid(false);setStatus('');setConflict(null);setDetailError('');setUnavailable(false);
    const pending=readOperations().find(o=>o.endpoint==='/api/notas');if(pending){try{const recovery=JSON.parse(sessionStorage.getItem('notas:recovery-draft:v1')||'null');setDraft(recovery && typeof recovery.title==='string' && typeof recovery.text==='string' ? {title:recovery.title,text:recovery.text} : {title:String(pending.body.title||''),text:String(pending.body.text||'')});}catch{setDraft({title:String(pending.body.title||''),text:String(pending.body.text||'')});}}}
   draftReady.current=true;return;}
  if(!id){draftReady.current=false;selectionGeneration.current++;setSelected(false);setConfirmed(null);setDetailError('');setUnavailable(false);return;}
  const controller=new AbortController();
  if(changed){draftReady.current=false;selectionGeneration.current++;setSelected(true);setDetailLoading(true);setConfirmed(null);setDraft({title:'',text:''});setError('');setInvalid(false);setStatus('');setConflict(null);setDetailError('');setUnavailable(false);}
  request<{note:Note}>('/api/notas/'+id,undefined,controller.signal).then(({note})=>{
   if(changed){setConfirmed(note);let restore:Draft|null=null;try{if(readOperations().some(o=>o.endpoint.includes(id))){const cached=JSON.parse(sessionStorage.getItem('notas:recovery-draft:v1')||'null');if(cached?.id===id && typeof cached.title==='string' && typeof cached.text==='string')restore={title:cached.title,text:cached.text};}}catch{}setDraft(restore||{title:note.title,text:note.text});draftReady.current=true;}
   else if(!dirtyRef.current && !busyRef.current && !readOperations().some(o=>o.endpoint.includes(id))){setConfirmed(note);setDraft({title:note.title,text:note.text});}
   setUnavailable(false);setDetailError('');
  }).catch(e=>{if(!controller.signal.aborted){setDetailError(e.message);setUnavailable(e instanceof ApiError && e.status===404);}}).finally(()=>{if(!controller.signal.aborted)setDetailLoading(false);});
  return()=>controller.abort();
 },[session.ready,id,newRequested,params,attempt]);

 useEffect(()=>{const note=confirmedRef.current;if(!session.ready||!note||busyRef.current)return;const controller=new AbortController();request<{note:Note}>('/api/notas/'+note.id,undefined,controller.signal).then(({note:current})=>{if(confirmedRef.current?.id!==current.id||dirtyRef.current||busyRef.current||readOperations().some(o=>o.endpoint.includes(current.id)))return;setConfirmed(current);setDraft({title:current.title,text:current.text});}).catch(e=>{if(!controller.signal.aborted)setDetailError(e.message);});return()=>controller.abort();},[session.ready,session.version]);

 useEffect(()=>{if(!operations.length||!draftReady.current||!selected||detailLoading)return;try{sessionStorage.setItem('notas:recovery-draft:v1',JSON.stringify({...draft,id:confirmed?.id||id||null}));}catch{}},[draft,operations,confirmed?.id,id,selected,detailLoading]);
 useLayoutEffect(()=>{if(!rowBounds.current.size)return;const old=rowBounds.current;rowBounds.current=new Map();const updates=[...rowRefs.current].map(([id,node])=>({node,offset:(old.get(id)??node.getBoundingClientRect().top)-node.getBoundingClientRect().top}));if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;animations.current=updates.filter(v=>v.offset).map(({node,offset})=>node.animate([{transform:`translateY(${offset}px)`},{transform:'translateY(0)'}],{duration:180,easing:'ease-out'}));},[notes]);
 useEffect(()=>()=>animations.current.forEach(a=>a.cancel()),[]);

 const openModal=useCallback((next:Modal)=>{modalTrigger.current=document.activeElement as HTMLElement;setDialogKind(next);setModal(next);},[]);
 const navigate=useCallback((action:()=>void)=>{if(busyRef.current)return;if(dirtyRef.current || readOperations().length){pendingNavigation.current=action;openModal('leave');}else action();},[openModal]);
 const go=useCallback((url:string)=>navigate(()=>{bypass.current=true;router.push(url,{scroll:false});queueMicrotask(()=>{bypass.current=false;});}),[navigate,router]);
 useEffect(()=>{
  const click=(event:MouseEvent)=>{if(bypass.current||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const target=(event.target as Element).closest('a');if(!target||target.target==='_blank'||target.hasAttribute('download'))return;const url=new URL(target.href,location.href);if(url.origin!==location.origin)return;if(url.pathname===location.pathname && url.search===location.search && url.hash)return;if((dirtyRef.current||readOperations().length)&&url.href!==location.href){event.preventDefault();event.stopPropagation();navigate(()=>{bypass.current=true;router.push(url.pathname+url.search+url.hash);queueMicrotask(()=>bypass.current=false);});}};
  const unload=(e:BeforeUnloadEvent)=>{if(dirtyRef.current||busyRef.current||readOperations().length){e.preventDefault();e.returnValue='';}};
  const pop=(event:PopStateEvent)=>{if(bypass.current)return;if(dirtyRef.current||readOperations().length){event.stopImmediatePropagation();const destination=location.pathname+location.search;history.pushState(currentHistory.current,'',currentUrl.current);navigate(()=>{bypass.current=true;router.push(destination);queueMicrotask(()=>bypass.current=false);});}};
  document.addEventListener('click',click,true);window.addEventListener('beforeunload',unload);session.guardHistory(pop);
  return()=>{document.removeEventListener('click',click,true);window.removeEventListener('beforeunload',unload);session.guardHistory(null);};
 },[navigate,router,session.guardHistory]);
 function changeDraft(next:Draft){setDraft(next);setStatus('');if(invalid && next.title.trim())setInvalid(false);}
 function removeCapsule(operation:Operation){clearOperation(operation);setOperations(readOperations());}
 function snapshotRows(){animations.current.forEach(a=>a.cancel());rowBounds.current=new Map([...rowRefs.current].map(([key,node])=>[key,node.getBoundingClientRect().top]));}
 function closeModal(){setModal(null);pendingNavigation.current=null;}
 function returnToList(){navigate(()=>{restoreList.current=true;setRestoreFocus(n=>n+1);router.push('/notas',{scroll:false});});}
 function startNew(){navigate(()=>{trackNoteStarted();mobileScroll.current=window.scrollY;if(newRequested){setDraft({title:'',text:''});setConfirmed(null);setStatus('');setError('');setInvalid(false);setConflict(null);}else router.push('/notas?nueva=1',{scroll:false});});}
 function updateList(note:Note){setNotes(previous=>sorted([...previous.filter(n=>n.id!==note.id),note]).filter(n=>!query || (n.title.toLowerCase().includes(query.toLowerCase())||n.text.toLowerCase().includes(query.toLowerCase()))));}

 async function send(operation:Operation,recover=false):Promise<boolean>{
  if(busyRef.current)return false;
  busyRef.current=true;setBusy(true);setError('');setStatus(recover?'Recuperando resultado…':'Guardando…');
  const generation=selectionGeneration.current;const targetsCurrent=operation.endpoint==='/api/notas' ? currentRef.current.newRequested && !confirmedRef.current : operation.endpoint.includes(confirmedRef.current?.id || currentRef.current.id || 'missing');const submittedDraft={...draftRef.current};
  try{retainOperation(operation);setOperations(readOperations());}catch{busyRef.current=false;setBusy(false);setStatus('');setError('No se pudo preparar la recuperación segura. Permite el almacenamiento de esta pestaña y reintenta.');return false;}
  try{
   const result=await request<{note?:Note;deleted?:{id:string}}> (operation.endpoint,operation.body);
   if(!result.note&&!result.deleted)throw new Error('No se pudo confirmar la respuesta.');
   removeCapsule(operation);
   if(result.deleted){
    setNotes(previous=>previous.filter(n=>n.id!==result.deleted!.id));
    setTotal(n=>n===null?n:Math.max(0,n-1));
    if(targetsCurrent){
     // This is a selection change within the same page. Update the URL with
     // the confirmed deletion, so an immediate reload cannot reopen the
     // deleted ID while a server-component navigation is still pending.
     window.history.replaceState(null,'','/notas');
     setModal(null);setConfirmed(null);confirmedRef.current=null;
     setDraft({title:'',text:''});setSelected(false);setStatus('');
     dirtyRef.current=false;setRestoreFocus(n=>n+1);
    }
    setAnnouncement('Nota eliminada');notifyNotesChanged();return true;
   }
   const note=result.note;if(!note)throw new Error('No se pudo confirmar la nota.');
   const pin=operation.endpoint.endsWith('/fijar');
   if(pin)snapshotRows();
   updateList(note);
   if(generation===selectionGeneration.current && targetsCurrent){
    const existing=confirmedRef.current;const newer=existing && existing.id===note.id && existing.revision>note.revision;
    if(!newer){setConfirmed(note);confirmedRef.current=note;
     if(!pin && (recover ? same(draftRef.current,{title:String(operation.body.title),text:String(operation.body.text)}) : same(draftRef.current,submittedDraft))){setDraft({title:note.title,text:note.text});setStatus('Nota guardada');dirtyRef.current=false;}else setStatus('');
    }
    if(pin){setAnnouncement(note.pinned?'Nota fijada':'Nota desfijada');setStatus('');}
    else setAnnouncement('Nota guardada');
    if(operation.endpoint==='/api/notas' && !existing){loadedKey.current='id='+note.id;router.replace('/notas?id='+note.id,{scroll:false});}
   }
   setConflict(null);setUnavailable(false);notifyNotesChanged();
   return !pin && same(draftRef.current,note);
  }catch(e){
   setStatus('');
   if(e instanceof ApiError){removeCapsule(operation);if(e.status===409){if(targetsCurrent){setConflict(e.current||null);if(e.current)setAnnouncement('La nota cambió en otra vista. Compara las versiones antes de guardar.');}setError(e.current?'La nota cambió en otra vista. Compara las versiones antes de guardar.':e.message);}else if(e.status===404){setUnavailable(true);setDetailError('No se encontró la nota.');}else{setError(e.message);if(e.fields?.title){setInvalid(true);setFocusTitle(n=>n+1);}}}
   else {setOperations(readOperations());setError(operation.endpoint.endsWith('/eliminar')?'No sabemos si se eliminó. Recupera el resultado antes de volver a enviar.':operation.endpoint.endsWith('/fijar')?'No sabemos si se fijó. Recupera el resultado antes de volver a enviar.':'No sabemos si se guardó. Recupera el resultado antes de volver a enviar.');}
   return false;
  }finally{busyRef.current=false;setBusy(false);}
 }
 async function save(fresh=false):Promise<boolean>{
  if(!draftRef.current.title.trim()){if(modal)invalidModalFocus.current=true;setInvalid(true);setError('Revisa el título de la nota.');setFocusTitle(n=>n+1);return false;}
  if(operations.length && !fresh){openModal('new-intent');return false;}
  const note=confirmedRef.current;
  return send({method:'POST',endpoint:note?`/api/notas/${note.id}/guardar`:'/api/notas',body:{title:draftRef.current.title,text:draftRef.current.text,...(note?{expected_revision:note.revision}:{}),idempotency_key:crypto.randomUUID()}});
 }
 async function pinNote(){const note=confirmedRef.current;if(!note||operations.length||busyRef.current)return;restorePinFocus.current=document.activeElement===pinRef.current;await send({method:'POST',endpoint:`/api/notas/${note.id}/fijar`,body:{pinned:!note.pinned,expected_revision:note.revision,idempotency_key:crypto.randomUUID()}});}
 async function deleteNote(){const note=confirmedRef.current;if(!note||operations.length)return;await send({method:'POST',endpoint:`/api/notas/${note.id}/eliminar`,body:{expected_revision:note.revision,idempotency_key:crypto.randomUUID()}});}
 function asNew(){draftReady.current=true;setConfirmed(null);setConflict(null);setUnavailable(false);setDetailError('');setError('');setStatus('');loadedKey.current='nueva=1';router.replace('/notas?nueva=1',{scroll:false});}
 function reconcile(adopt:boolean){if(!conflict)return;setConfirmed(conflict);confirmedRef.current=conflict;if(adopt)setDraft({title:conflict.title,text:conflict.text});setConflict(null);setError('');setStatus('');setAnnouncement(adopt?'Versión actual cargada':'Borrador conservado. Puedes guardar sobre la versión actual.');}
 function containFocus(event:React.KeyboardEvent<HTMLDivElement>){if(event.key!=='Tab')return;const elements=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(el=>el.getClientRects().length);const first=elements[0],last=elements[elements.length-1];if(!first)return;if(event.shiftKey && (document.activeElement===first || !event.currentTarget.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey && (document.activeElement===last || !event.currentTarget.contains(document.activeElement))){event.preventDefault();first.focus();}}
 return <main id="contenido" className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-8 max-sm:px-4 max-sm:py-4">
 <div aria-live="polite" className="sr-only">{announcement}</div>
 {session.error?<ErrorBox title="No se pudo iniciar la sesión" message={session.error} retry={session.retry}/>:!session.ready?<Loading text="Preparando tu espacio privado…"/>:<>
 <div className={`mb-5 flex items-end justify-between gap-4 ${selected?'max-sm:hidden':''}`}><div><h1 className="text-[26px]">Notas</h1><p className="mt-1 text-sm text-muted-foreground">Un lugar para continuar tus ideas.</p></div><span className="text-sm text-muted-foreground">{total!==null?`${total} ${total===1?'nota':'notas'}`:'Cargando…'}</span></div>
 {selected && <Button variant="ghost" className="mb-2 -ml-3 hidden max-sm:flex" onClick={returnToList}><ArrowLeft/>Volver a la lista</Button>}
 {operations.length>0&&!busy&&!activeOperation&&<div className="state-notice mb-4"><h2 className="font-semibold">Hay resultados pendientes de recuperar</h2><p className="mt-1 text-sm">Puedes consultar el resultado de los envíos anteriores sin modificar esta nota.</p><div className="mt-3 flex flex-wrap gap-2">{operations.map((operation,index)=><Button key={String(operation.body.idempotency_key)} variant="outline" onClick={()=>void send(operation,true)}>Recuperar envío {index+1}</Button>)}</div></div>}
 <div className="workspace" data-has-selection={selected}>
 <aside className="note-index" aria-label="Índice de notas"><div className="space-y-5 border-b border-border p-5"><Button ref={newRef} className="w-full" onClick={startNew} disabled={busy}><Plus/>Nueva nota</Button><div><label htmlFor="buscar" className="mb-2 block text-sm font-medium">Buscar por título y texto</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 size-5 text-muted-foreground"/><input id="buscar" type="search" value={query} onChange={e=>setQuery(e.target.value)} className="note-field pl-10" placeholder="Buscar notas"/></div>{query && <Button variant="ghost" className="mt-1 px-0 text-primary" onClick={()=>setQuery('')}><X/>Limpiar búsqueda</Button>}</div></div>
 {listError && <div className="p-4"><ErrorBox message={listError} retry={()=>setAttempt(n=>n+1)}/>{total!==null&&<p className="mt-2 text-sm">Última lectura disponible.</p>}</div>}
 {listLoading && total===null?<Loading/>:notes.length>0?<div aria-label="Lista de notas" aria-busy={listLoading}>{notes.map(note=><button key={note.id} ref={node=>{if(node)rowRefs.current.set(note.id,node);else rowRefs.current.delete(note.id);}} data-note-id={note.id} type="button" className="note-row" aria-current={confirmed?.id===note.id?'true':undefined} onClick={()=>{mobileScroll.current=window.scrollY;if(id===note.id)return;go('/notas?id='+note.id);}}><div className="flex items-start gap-2"><h3 className="min-w-0 flex-1 break-words">{note.title}</h3>{note.pinned&&<Pin className="mt-1 size-4 text-primary" aria-label="Fijada"/>}</div>{note.text&&<p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{note.text}</p>}<time dateTime={note.updated_at} className="mt-3 block text-xs text-muted-foreground">{dateLabel(note.updated_at)}</time></button>)}</div>:!listError&&<div className="p-6"><FileText className="mb-4 size-6 text-muted-foreground"/><h2 className="font-medium">{query?'No se encontraron notas':'Todavía no tienes notas'}</h2><p className="mt-2 text-sm text-muted-foreground">{query?`No hay coincidencias para «${query}».`:'Crea una nota y empieza por un título.'}</p></div>}
 </aside>
 <section className="active-sheet min-w-0 bg-white" aria-label="Editor de notas">
 {!selected?<div className="flex min-h-[560px] flex-col items-start justify-center px-12"><FileText className="mb-6 size-8 text-primary"/><h2 className="max-w-md text-[26px] font-semibold leading-9">Selecciona una nota o crea una nueva</h2><p className="mt-3 max-w-md text-muted-foreground">Elige una nota del índice para continuar escribiendo. Tus cambios se guardan cuando pulsas Guardar nota.</p></div>:detailLoading?<Loading text="Abriendo la nota…"/>:<>
 <form noValidate onSubmit={e=>{e.preventDefault();void save();}}>
 <div className="work-edge"><div className="min-w-0 flex-1"><h1 className="truncate" title={confirmed?.title}>{confirmed?<><span className="sr-only">Editar nota: </span><span data-selected-note-title>{confirmed.title}</span></>:'Nueva nota'}</h1><p role="status" className={`mt-1 flex items-start gap-1.5 text-sm ${status==='Nota guardada'&&!dirty?'text-[#17613B]':'text-muted-foreground'}`}>{busy?<><LoaderCircle className="mt-0.5 size-4 motion-safe:animate-spin"/>{status}</>:status==='Nota guardada'&&!dirty&&confirmed?<><Check className="mt-0.5 size-4"/><span>Nota guardada · <time dateTime={confirmed.updated_at}>{dateLabel(confirmed.updated_at)}</time></span></>:activeOperation?<><RotateCcw className="mt-0.5 size-4"/>{uncertainStatus}</>:<><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current"/>{dirty?'Cambios sin guardar':confirmed?'Sin cambios pendientes':'Borrador nuevo'}</>}</p></div>
 <Button ref={saveRef} type={activeOperation&&!busy?'button':'submit'} onClick={activeOperation&&!busy?()=>void send(activeOperation,true):undefined} disabled={busy||unavailable||Boolean(conflict)} className="save-action shrink-0 transition-colors">{busy?<LoaderCircle className="motion-safe:animate-spin"/>:activeOperation?<RotateCcw/>:<Save/>}{activeOperation&&!busy?'Recuperar guardado':'Guardar nota'}</Button></div>
 <div className="editor-fields">
 {detailError&&<ErrorBox autoFocus title={unavailable?'Nota no disponible':'No se pudo abrir la nota'} message={detailError} retry={unavailable?undefined:()=>setAttempt(n=>n+1)}/>}
 {unavailable&&<div className="state-notice"><p>Elige otra nota del índice. Puedes conservar el texto que tienes aquí como un nuevo borrador.</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={asNew}>Conservar como nueva nota</Button><Button type="button" variant="ghost" onClick={()=>{setDetailError('');setUnavailable(false);go('/notas');}}>Volver a mis notas</Button></div></div>}
 {error&&!conflict&&!activeOperation&&<div role="alert" className="rounded border border-destructive p-4 text-destructive"><p className="flex items-start gap-2"><AlertCircle className="mt-0.5 size-5"/><span>{error}</span></p>{invalid&&<a href="#titulo" className="mt-2 inline-flex min-h-11 items-center underline" onClick={e=>{e.preventDefault();titleRef.current?.focus();}}>Escribe un título.</a>}</div>}
 {activeOperation&&!busy&&<div role="alert" className="state-notice"><h2 className="flex items-center gap-2 font-semibold"><RotateCcw className="size-5"/>Hay un resultado pendiente de recuperar</h2><p className="mt-2 text-sm">{error||'El envío original sigue sin confirmar. Recupera su resultado antes de volver a enviar.'}</p>{invalid&&<a href="#titulo" className="mt-2 inline-flex min-h-11 items-center text-primary underline" onClick={e=>{e.preventDefault();titleRef.current?.focus();}}>Escribe un título.</a>}<p className="mt-2 text-sm">Recuperarlo no reemplazará los cambios que hayas escrito después.</p><div className="mt-3 flex flex-wrap gap-2">{operations.filter(operation=>operation!==activeOperation).map((operation,index)=><Button type="button" variant="outline" key={String(operation.body.idempotency_key)} onClick={()=>void send(operation,true)}>Recuperar envío {index+1}</Button>)}<Button type="button" variant="outline" onClick={()=>openModal('new-intent')}>Guardar cambios posteriores</Button></div></div>}
 {conflict&&<div className="state-notice conflict-notice"><h2 className="text-lg font-semibold">Esta nota cambió en otra vista</h2><p className="mt-1 text-sm">Compara los cambios y elige qué versión quieres seguir editando.</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" onClick={()=>reconcile(false)}>Conservar mi borrador y revisar</Button><Button type="button" variant="outline" onClick={()=>reconcile(true)}>Usar la versión actual</Button></div><p className="mt-2 text-sm">Después de elegir, pulsa Guardar nota para confirmar tus cambios.</p><div className="mt-4 grid gap-3 min-[1100px]:grid-cols-3"><Version title="Tu borrador" draft={draft} compare={confirmed||draft} note={confirmed}/><Version title="Última versión confirmada" draft={confirmed||draft} compare={conflict} note={confirmed}/><Version title="Versión actual" draft={conflict} compare={confirmed||draft} note={conflict}/></div></div>}
 <div><label htmlFor="titulo" className="mb-2 block font-medium">Título</label><textarea id="titulo" name="title" ref={titleRef} rows={1} wrap="soft" className="note-field title-field" value={draft.title} onChange={e=>changeDraft({...draftRef.current,title:e.target.value})} aria-invalid={invalid} aria-describedby={invalid?'titulo-error':undefined} placeholder="¿Qué quieres recordar?"/>{invalid&&<p id="titulo-error" className="mt-2 flex items-center gap-2 text-sm text-destructive"><AlertCircle className="size-4"/>Escribe un título.</p>}</div>
 <div><label htmlFor="texto" className="mb-2 block font-medium">Texto — opcional</label><textarea id="texto" name="text" className="note-field min-h-[320px] resize-y leading-7 max-sm:min-h-[260px]" value={draft.text} onChange={e=>changeDraft({...draftRef.current,text:e.target.value})} placeholder="Dale espacio a tu idea…"/></div>
 <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/30 pt-4">{confirmed?<><Button ref={pinRef} type="button" variant="ghost" onClick={()=>void pinNote()} disabled={busy||operations.length>0||unavailable} className="text-primary">{confirmed.pinned?<PinOff/>:<Pin/>}{confirmed.pinned?'Desfijar nota':'Fijar nota'}</Button><Button type="button" variant="ghost" className="text-destructive" onClick={()=>openModal('delete')} disabled={busy||operations.length>0||unavailable}><Trash2/>Eliminar nota</Button></>:<p className="text-sm text-muted-foreground">Guarda la nota para poder fijarla.</p>}</div>
 {confirmed&&<p className="text-xs text-muted-foreground">Última modificación: <time dateTime={confirmed.updated_at}>{dateLabel(confirmed.updated_at)}</time></p>}
 </div></form></>}
 </section></div></>}
 <AlertDialog open={modal!==null} onOpenChange={open=>{if(!open&&!busy)closeModal();}}><AlertDialogContent className="dialog-surface data-[size=default]:max-w-[520px] data-[size=default]:sm:max-w-[520px]" initialFocus={cancelRef} finalFocus={()=>{if(invalidModalFocus.current){invalidModalFocus.current=false;return titleRef.current;}return activeOperation ? saveRef.current : modalTrigger.current?.isConnected ? modalTrigger.current : newRef.current;}} onKeyDown={containFocus}>
 <AlertDialogTitle className="text-xl font-semibold">{dialogKind==='delete'?'¿Eliminar esta nota?':dialogKind==='new-intent'?'Hay un envío sin confirmar':'Hay cambios sin guardar'}</AlertDialogTitle>
 <AlertDialogDescription className="text-base text-muted-foreground">{dialogKind==='delete'?<>Vas a eliminar «{confirmed?.title}». Esta acción no se puede deshacer.{dirty?' También perderás los cambios sin guardar.':''}</>:dialogKind==='new-intent'?'Recupera el envío original o inicia otro envío. Si el original creó una nota, un nuevo envío podría duplicarla. El resultado original seguirá disponible.':'Antes de salir, elige Guardar, Descartar o Continuar editando. Los envíos pendientes seguirán disponibles para recuperar.'}</AlertDialogDescription>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 <div className="mt-2 flex flex-wrap gap-2"><Button ref={cancelRef} variant="outline" onClick={closeModal} disabled={busy}>{dialogKind==='delete'?'Cancelar':'Continuar editando'}</Button>
 {dialogKind==='delete'?<Button variant="destructive" onClick={()=>void deleteNote()} disabled={busy}>{busy?'Eliminando…':'Eliminar nota'}</Button>:dialogKind==='new-intent'?<><Button onClick={()=>{setModal(null);if(activeOperation)void send(activeOperation,true);}} disabled={busy}>Recuperar guardado</Button><Button variant="outline" onClick={()=>{setModal(null);void save(true);}} disabled={busy}>Iniciar otro envío</Button></>:<><Button variant="ghost" onClick={()=>{const destination=pendingNavigation.current;pendingNavigation.current=null;dirtyRef.current=false;setModal(null);destination?.();}}>Descartar</Button><Button onClick={async()=>{const destination=pendingNavigation.current;const success=activeOperation?await send(activeOperation,true):await save();if(success){setModal(null);pendingNavigation.current=null;destination?.();}else if(invalid||!draftRef.current.title.trim()){setModal(null);setFocusTitle(n=>n+1);}}} disabled={busy}>{busy?'Guardando…':'Guardar'}</Button></>}
 </div></AlertDialogContent></AlertDialog>
 </main>;
}
// Excerpts are presentation only; the complete original values remain expandable.
function changedPassage(value:string,other:string){
 if(value===other)return null;
 let start=0;while(start<Math.min(value.length,other.length)&&value[start]===other[start])start++;
 let end=value.length,otherEnd=other.length;while(end>start&&otherEnd>start&&value[end-1]===other[otherEnd-1]){end--;otherEnd--;}
 const from=Math.max(0,start-40),to=Math.min(value.length,Math.max(end,start)+40);
 const passage=value.slice(from,to);
 return (from?'…':'')+(passage.length>160?passage.slice(0,80)+' … '+passage.slice(-80):passage)+(to<value.length?'…':'');
}
function Version({title,draft,compare,note}:{title:string;draft:Draft;compare:Draft;note:Note|null}){
 const titleChange=changedPassage(draft.title,compare.title),textChange=changedPassage(draft.text,compare.text);
 return <section className="min-w-0 rounded border border-border bg-white p-3"><h3 className="font-semibold">{title}</h3><div className="mt-2 space-y-2 text-sm"><div><span className="font-medium">Título: </span><span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{titleChange===null?'Sin cambios.':titleChange||'Vacío.'}</span></div><div><span className="font-medium">Texto: </span><span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{textChange===null?'Sin cambios.':textChange||'Sin texto.'}</span></div></div><details className="mt-2"><summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium text-primary">Ver valores completos</summary><div className="border-t border-border/30 pt-2"><p className="text-sm font-medium">Título completo</p><p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]" data-version-title>{draft.title}</p><p className="mt-3 text-sm font-medium">Texto completo</p><p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-sm" data-version-text>{draft.text||'Sin texto'}</p></div></details>{note&&<p className="mt-2 text-xs text-muted-foreground">{note.pinned?'Fijada':'Sin fijar'} · Revisión {note.revision} · {dateLabel(note.updated_at)}</p>}</section>;
}
