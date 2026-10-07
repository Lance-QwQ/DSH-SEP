import {crc32,deflateRawSync} from 'node:zlib';
export function zipBytes(entries){
 const locals=[],central=[];let offset=0;
 for(const e of entries){const name=Buffer.from(e.name),body=Buffer.from(e.body??'{}'),compressed=e.deflate?deflateRawSync(body):body,method=e.deflate?8:0,crc=e.crc??crc32(body),size=e.size??body.length;
 const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(method,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(compressed.length,18);l.writeUInt32LE(size,22);l.writeUInt16LE(name.length,26);
 const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(0x0314,4);c.writeUInt16LE(20,6);c.writeUInt16LE(method,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(size,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(e.attributes??0,38);c.writeUInt32LE(offset,42);
 locals.push(l,name,compressed);central.push(c,name);offset+=l.length+name.length+compressed.length;}
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,cd,end]);
}
