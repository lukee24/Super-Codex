import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const supplied = process.argv.find(arg => arg.startsWith('--sharp='))?.slice(8);
const { default: sharp } = supplied ? await import(pathToFileURL(path.resolve(supplied)).href) : await import('sharp');
const svg = await fs.readFile('build/icon.svg');
await fs.writeFile('public/favicon.svg', svg);
await sharp(svg).png().toFile('public/icon.png');
const sizes = [16,24,32,48,64,128,256];
const images = await Promise.all(sizes.map(size => sharp(svg).resize(size,size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length*16);
header.writeUInt16LE(1,2); header.writeUInt16LE(sizes.length,4);
let offset=header.length;
for(let i=0;i<sizes.length;i++){
  const at=6+i*16; header[at]=sizes[i]===256?0:sizes[i];header[at+1]=header[at];
  header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);
  header.writeUInt32LE(images[i].length,at+8);header.writeUInt32LE(offset,at+12);offset+=images[i].length;
}
await fs.writeFile('build/icon.ico',Buffer.concat([header,...images]));
console.log(`Generated Super Codex icon: ${sizes.join(', ')}px ICO, PNG and SVG.`);
