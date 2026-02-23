import { promisify } from 'util';
import { exec } from 'child_process';
import { readdir } from 'fs/promises';
import path from 'path';

const execp = promisify(exec);

/**
 * Recursively convert every PDF under a folder to PNG images (one image per page).
 * Requires ImageMagick (`magick` CLI) installed and on PATH.
 */
async function convertDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await convertDir(full);
    } else if (e.isFile() && /\.pdf$/i.test(e.name)) {
      const nameNoExt = e.name.replace(/\.pdf$/i, '');
      const outDir = path.join(dir, nameNoExt + '_images');
      try {
        await execp(`mkdir "${outDir}"`);
      } catch (err) {
        // ignore if already exists
      }
      console.log(`converting ${full}`);
      // create one PNG per page, numbered
      await execp(`magick -density 150 "${full}" "${outDir}/${nameNoExt}-%03d.png"`);
      console.log(`converted to ${outDir}`);
    }
  }
}

(async () => {
  try {
    const base = path.resolve(process.cwd(), 'PDFs');
    console.log('starting conversion under', base);
    await convertDir(base);
    console.log('all done');
  } catch (e) {
    console.error('conversion error', e);
    process.exit(1);
  }
})();
