import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { NtExecutable, NtExecutableResource, Resource } from 'resedit';
const digest = data => crypto.createHash('sha256').update(Buffer.from(data)).digest('hex');
const ico = await fs.readFile('build/icon.ico');
assert.equal(ico.readUInt16LE(2), 1);
const count=ico.readUInt16LE(4), expected=[];
for(let i=0;i<count;i++){
 const at=6+i*16, length=ico.readUInt32LE(at+8), offset=ico.readUInt32LE(at+12);
 expected.push({size:ico[at]||256,hash:digest(ico.subarray(offset,offset+length))});
}
const reports=[];
for(const file of process.argv.slice(2)){
 const exe=NtExecutable.from(await fs.readFile(file));
 const resources=NtExecutableResource.from(exe);
 const groups=Resource.IconGroupEntry.fromEntries(resources.entries);
 const matches=groups.map(group=>({id:group.id,lang:group.lang,sizes:group.icons.map(icon=>icon.width),matched:group.icons.filter(icon=>{
  const entry=resources.entries.find(item=>item.type===3&&item.id===icon.iconID&&item.lang===group.lang);
  return entry&&expected.some(image=>image.hash===digest(entry.bin));
 }).length}));
 assert.ok(matches.some(group=>group.matched===expected.length), `${file} must embed every size of the requested icon`);
 reports.push({file,matched:true,groups:matches});
}
await fs.mkdir('artifacts/icon-verification',{recursive:true});
await fs.writeFile('artifacts/icon-verification/results.json',JSON.stringify({expected,reports},null,2));
console.log(JSON.stringify(reports,null,2));
