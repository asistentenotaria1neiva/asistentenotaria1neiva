import { redirect } from 'next/navigation';

/** El panel de plantillas se movió a /plantillas (lo usan también los revisores) */
export default async function PlantillasAdmin({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams;
  redirect(tipo ? `/plantillas?tipo=${encodeURIComponent(tipo)}` : '/plantillas');
}
