export { FALLBACK, buildSystemPrompt, buildUserContext } from './persona-core';
import type { Persona } from './persona-core';

export async function getPersona(): Promise<Persona> {
  // Attempt to load YAML via Node fs. In Edge, fall back.
  try {
    if (typeof process !== 'undefined' && (process as any).versions?.node) {
      const { loadYAML } = await import('./yaml');
      const p = await loadYAML<Persona>('src/persona/setsuna.yaml');
      return p;
    }
  } catch {}
  return (await import('./persona-core')).FALLBACK;
}
