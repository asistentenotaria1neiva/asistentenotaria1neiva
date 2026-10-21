import { redirect } from 'next/navigation';

/** El panel de plantillas se movió a /plantillas (lo usan también los revisores) */
export default function PlantillasAdmin() {
  redirect('/plantillas');
}
