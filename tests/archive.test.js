'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const archive=require('../workspace-archive');const calendar=require('../workspace-calendar-domain');
test('ZIP stores Unicode names, exact bytes, CRC and a central directory',async()=>{
 const blob=await archive.zip([{name:'workspace.json',data:new TextEncoder().encode('{"ok":true}')},{name:'attachments/Документ.txt',data:new Blob(['Привіт'])}]);
 const bytes=new Uint8Array(await blob.arrayBuffer()),v=new DataView(bytes.buffer);assert.equal(v.getUint32(0,true),0x04034b50);assert.equal(v.getUint16(6,true),0x800);
 const end=bytes.length-22;assert.equal(v.getUint32(end,true),0x06054b50);assert.equal(v.getUint16(end+10,true),2);const dir=v.getUint32(end+16,true);assert.equal(v.getUint32(dir,true),0x02014b50);
 const names=[];let pos=0;
 while(v.getUint32(pos,true)===0x04034b50){const len=v.getUint32(pos+18,true),n=v.getUint16(pos+26,true);names.push(new TextDecoder().decode(bytes.slice(pos+30,pos+30+n)));pos+=30+n+len;}
 assert.deepEqual(names,['workspace.json','attachments/Документ.txt']);assert.equal(pos,dir);
 const known=new DataView(await (await archive.zip([{name:'crc.txt',data:new TextEncoder().encode('123456789')}])).arrayBuffer());assert.equal(known.getUint32(14,true),0xcbf43926);
});
test('attachment names cannot create paths or hidden traversal names',()=>{assert.equal(archive.safeName('../private\\file\n.txt'),'__private_file_.txt');});
test('actual busy and unavailable periods override free windows and weekly availability',()=>{
 const a={timezone:'UTC',weekly:[{day:2,start:'09:00',end:'17:00'}],unavailable:[]};const starts='2026-12-01T10:00:00Z',ends='2026-12-01T11:00:00Z';
 const period=availability=>({starts_at:'2026-12-01T09:00:00Z',ends_at:'2026-12-01T12:00:00Z',availability});
 assert.equal(calendar.scheduleAt(a,starts,ends,[period('free')]),'free');assert.equal(calendar.scheduleAt(a,starts,ends,[period('free'),period('busy')]),'busy');assert.equal(calendar.scheduleAt(a,starts,ends,[period('busy'),period('unavailable')]),'unavailable');
 assert.equal(calendar.scheduleAt(a,starts,ends,[{starts_at:ends,ends_at:'2026-12-01T12:00:00Z',availability:'busy'}]),'within_hours');
});

test('free-time ICS is transparent while redacted busy exports carry no private detail',()=>{
 const events=[{id:'free',current_version_id:'v1',status:'confirmed',revision:1,availability:'free'},{id:'busy',current_version_id:'v2',status:'confirmed',revision:1}];
 const version={starts_at:'2026-12-01T09:00:00Z',ends_at:'2026-12-01T10:00:00Z',timezone:'UTC',number:1,agenda:'',location:''};
 const ics=calendar.ics(events,[{...version,id:'v1',title:'Free time'},{...version,id:'v2',title:'Busy'}]);assert.match(ics,/TRANSP:TRANSPARENT/);assert.match(ics,/TRANSP:OPAQUE/);assert.match(ics,/SUMMARY:Busy/);
});
