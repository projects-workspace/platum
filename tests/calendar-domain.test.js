'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toInstant, localTime, monthDays, shiftMonth, ics, availabilityAt } = require('../workspace-calendar-domain.js');

test('wall times convert independently of the browser zone, including fractional offsets', () => {
  assert.equal(toInstant('2026-10-20T10:30','Europe/Prague'),'2026-10-20T08:30:00.000Z');
  assert.equal(toInstant('2026-12-20T10:30','Europe/Prague'),'2026-12-20T09:30:00.000Z');
  assert.equal(toInstant('2026-10-20T10:30','Asia/Kathmandu'),'2026-10-20T04:45:00.000Z');
  assert.equal(localTime('2026-10-20T04:45:00Z','Asia/Kathmandu'),'2026-10-20T10:30');
});
test('nonexistent, repeated, malformed and invalid dates fail visibly', () => {
  assert.throws(()=>toInstant('2026-03-29T02:30','Europe/Prague'),/does not exist/);
  assert.throws(()=>toInstant('2026-10-25T02:30','Europe/Prague'),/occurs twice/);
  assert.throws(()=>toInstant('2026-04-05T01:45','Australia/Lord_Howe'),/occurs twice/);
  assert.throws(()=>toInstant('2026-02-30T12:00','UTC'),/valid date/);
  assert.throws(()=>toInstant('2026-10-20T10:30','Invalid/Zone'));
});
test('calendar starts on Monday and crosses years and leap days correctly', () => {
  const days=monthDays('2028-02');
  assert.equal(days.length,42);assert.equal(days[0].date,'2028-01-31');
  assert.equal(days.filter(d=>d.inMonth).length,29);
  assert.equal(shiftMonth('2026-12',1),'2027-01');
  assert.equal(shiftMonth('2027-01',-1),'2026-12');
});
test('ICS preserves identity, latest proposal, UTC times and cancellation with safe UTF-8 folding', () => {
  const event={id:'event-one',revision:5,current_version_id:'latest',status:'cancelled'};
  const text=ics([event],[{id:'old',title:'Old proposal'}, {id:'latest',title:'Review, next; step\\\nInjected',agenda:'і'.repeat(90),
    location:'Online',number:2,timezone:'Europe/Prague',starts_at:'2026-10-20T10:00:00+02:00',ends_at:'2026-10-20T11:00:00+02:00'}], 'Project', '2026-10-13T09:00:00Z');
  assert.match(text,/UID:event-one@platum\r\nSEQUENCE:5/);
  assert.match(text,/DTSTART:20261020T080000Z/);assert.match(text,/STATUS:CANCELLED/);
  assert.ok(!text.includes('Old proposal'));
  for(const line of text.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
  assert.ok(text.replace(/\r\n /g,'').includes('SUMMARY:Review\\, next\\; step\\\\\\nInjected'));
  assert.ok(text.endsWith('END:VCALENDAR\r\n'));
});
test('availability is advisory, zone aware and unavailable dates override weekly hours', () => {
  const av={timezone:'Europe/Prague',weekly:[{day:2,start:'09:00',end:'12:00'}],unavailable:[]};
  assert.equal(availabilityAt(av,'2026-10-20T08:00:00Z','2026-10-20T09:00:00Z'),'within_hours');
  assert.equal(availabilityAt(av,'2026-10-20T12:00:00Z','2026-10-20T13:00:00Z'),'outside_hours');
  assert.equal(availabilityAt({...av,unavailable:[{start:'2026-10-20',end:'2026-10-21'}]},'2026-10-20T08:00:00Z','2026-10-20T09:00:00Z'),'unavailable');
  assert.equal(availabilityAt({...av,weekly:[]},'2026-10-20T08:00:00Z','2026-10-20T09:00:00Z'),'unknown');
});
