'use client';
import { AlertCircle, ArrowRight, FileText, Home, LockKeyhole, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import branding from '../../../branding.json';
import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
export function Brand() { return <span className="inline-flex items-center gap-2 p-2"><img data-brand-logo src={branding.logoImageUrl || '/brand-mark.svg'} width="32" height="32" alt=""/><span className="text-[20px] max-sm:text-[18px] font-semibold whitespace-nowrap">{branding.logoText}</span></span>; }
export function Header() {
 const path = usePathname(); const [open,setOpen] = useState(false);
 function containMenuFocus(event: React.KeyboardEvent<HTMLDivElement>) {
  if(event.key!=='Tab')return;
  const targets=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')).filter(el=>el.tabIndex>=0 && el.getClientRects().length);
  const first=targets[0],last=targets[targets.length-1];
  if(!first)return;
  if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
 }

 const links = <><Link href="/" aria-current={path === '/' ? 'page' : undefined} onClick={()=>setOpen(false)} className="nav-link"><Home/>Inicio</Link><Link href="/notas" aria-current={path === '/notas' ? 'page' : undefined} onClick={()=>setOpen(false)} className="nav-link"><FileText/>Notas</Link></>;
 return <header className="border-b border-border/30 bg-white"><div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between px-6 max-sm:h-14 max-sm:px-2"><Link href="/" aria-label={`${branding.logoText}, Inicio`}><Brand/></Link><nav aria-label="Navegación principal" className="hidden sm:flex items-center gap-2">{links}<span className="ml-6 flex items-center gap-2 border-l border-border/30 pl-6 text-sm text-muted-foreground"><LockKeyhole className="size-4"/>Espacio privado</span></nav><Sheet open={open} onOpenChange={setOpen}><SheetTrigger render={<Button variant="ghost" className="sm:hidden h-11 w-11" aria-label="Abrir menú"/>}><Menu/></SheetTrigger><SheetContent onKeyDown={containMenuFocus} showCloseButton={false} className="w-[min(320px,90vw)] bg-white opacity-100 data-starting-style:opacity-100 data-ending-style:opacity-100 transition-transform motion-reduce:transition-none motion-reduce:translate-x-0!"><div className="flex items-center justify-between border-b p-4"><SheetTitle>Tu espacio</SheetTitle><SheetClose render={<Button variant="ghost" className="h-11 w-11" aria-label="Cerrar menú"/>}><X/></SheetClose></div><SheetDescription className="px-6">Navega por tus notas privadas.</SheetDescription><nav aria-label="Navegación móvil" className="grid gap-2 p-4">{links}</nav></SheetContent></Sheet></div></header>;
}
export function Footer() { return <footer className="mt-auto border-t border-border/25 bg-white"><div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-muted-foreground"><span>Un ejemplo de Esteban para probar Constructor.</span><a href="/api/info" className="inline-flex min-h-11 items-center gap-2 text-primary underline-offset-4 hover:underline">Información pública de la app <ArrowRight className="size-4"/></a></div></footer>; }
export function ErrorBox({ message, retry, title = 'No se pudo cargar', autoFocus = false }: {message: string; retry?: () => void; title?: string; autoFocus?: boolean}) { const heading = useRef<HTMLHeadingElement>(null);useEffect(()=>{if(autoFocus)heading.current?.focus();},[autoFocus,message]);return <div role="alert" className="rounded border border-destructive bg-white p-5"><h2 ref={heading} tabIndex={-1} className="flex items-center gap-2 font-semibold text-destructive"><AlertCircle className="size-5 shrink-0"/>{title}</h2><p className="mt-2">{message}</p>{retry && <Button variant="outline" className="mt-4" onClick={retry}>Reintentar</Button>}</div>; }
export function Loading({text='Cargando tus notas…'}:{text?:string}) { return <div role="status" className="min-h-48 space-y-4 p-6"><p className="text-muted-foreground">{text}</p><div className="h-3 w-3/4 rounded bg-muted motion-safe:animate-pulse"/><div className="h-3 w-1/2 rounded bg-muted motion-safe:animate-pulse"/></div>; }
