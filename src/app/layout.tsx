import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import branding from '../../branding.json';
import localFaces from '../../public/fonts/manifest.json';
import { Header, Footer } from '@/components/notes/shared';
import { SessionProvider } from '@/components/notes/session-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
const plex = localFont({ src: [
 {path:'../../public/fonts/ibm-plex-sans-400.ttf',weight:'400',style:'normal'},
 {path:'../../public/fonts/ibm-plex-sans-500.ttf',weight:'500',style:'normal'},
 {path:'../../public/fonts/ibm-plex-sans-600.ttf',weight:'600',style:'normal'},
 {path:'../../public/fonts/ibm-plex-sans-700.ttf',weight:'700',style:'normal'},
], variable:'--font-plex', display:'swap' });
export const metadata: Metadata = {title: {default:`Inicio — ${branding.logoText}`,template:`%s — ${branding.logoText}`},description:'Un ejemplo de Esteban para probar Constructor.',icons:{icon:'/icon.svg',apple:'/brand-mark.svg'}};
export default function RootLayout({children}: {children:React.ReactNode}) {
 const api=process.env.NEXT_PUBLIC_CONSTRUCTOR_API || 'https://constructor-api-git-dev-useconstructor.vercel.app';
 const project=process.env.NEXT_PUBLIC_PROJECT_ID || 'P-JR63X6';
 const fontCSS = branding.brandbook.fontFaces.map(face => `@font-face{font-family:${JSON.stringify(face.family)};font-style:normal;font-weight:${face.weight};font-display:swap;src:url(${JSON.stringify((localFaces as Record<string,string>)[face.url] || face.url)});}`).join('');
 return <html lang="es" className={plex.variable} style={{'--brand-font-heading':`${JSON.stringify(branding.fontHeading)}, sans-serif`,'--brand-font-body':`${JSON.stringify(branding.fontBody)}, sans-serif`} as React.CSSProperties}><head><style>{fontCSS}</style></head><body><TooltipProvider><SessionProvider><a className="skip-link" href="#contenido">Saltar al contenido</a><Header/>{children}<Footer/></SessionProvider></TooltipProvider><script src={"https://constructor-api-git-dev-useconstructor.vercel.app/v1/projects/P-JR63X6/analytics/script.js"} defer></script><script src="/constructor-editor.js" defer/></body></html>;
}
