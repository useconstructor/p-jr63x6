import { Suspense } from 'react';
import { NotesWorkspace } from '@/components/notes/workspace';
import { Loading } from '@/components/notes/shared';
export const metadata = {title:'Notas'};
export default function NotesPage() { return <Suspense fallback={<Loading/>}><NotesWorkspace/></Suspense>; }
