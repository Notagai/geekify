import { rm, mkdir, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('.');
const dest = resolve(root, 'dist');
await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
for (const path of ['index.html', 'styles.css', 'src']) {
  await cp(resolve(root, path), resolve(dest, path), { recursive: true });
}
console.log('Built static site in dist/');
