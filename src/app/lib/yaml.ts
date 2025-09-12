// Server-only YAML loader. Avoid using in Edge runtime.
import type { ParsedUrlQueryInput } from 'querystring';

export async function loadYAML<T = any>(relPath: string): Promise<T> {
  // Dynamic imports to avoid bundling in Edge
  const [{ readFile }, YAML] = await Promise.all([
    import('fs/promises'),
    import('yaml'),
  ]);
  const path = (await import('path')).default;
  const abs = path.isAbsolute(relPath) ? relPath : path.join(process.cwd(), relPath);
  const content = await readFile(abs, 'utf8');
  return YAML.parse(content) as T;
}

