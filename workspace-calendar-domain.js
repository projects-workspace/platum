(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PLATUM_CALENDAR = api;
})(typeof window === 'undefined' ? globalThis : window, () => {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  function parts(value, zone) {
    const values = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
    return Object.fromEntries(values.filter(v => v.type !== 'literal').map(v => [v.type, v.value]));
  }
  function localTime(value, zone) {
    const p = parts(value, zone);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  function toInstant(local, zone) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Choose a complete date and time.');
    const nominal = Date.parse(local + ':00Z');
    if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 16) !== local) throw new Error('Choose a valid date and time.');
    // Derive possible offsets from both sides of a clock change. Comparing the
    // full wall time catches gaps and folds, including half-hour DST transitions.
    const offsets = new Set();
    for (let hours = -36; hours <= 36; hours += 6) {
      const time = nominal + hours * 3600000;
      const p = parts(time, zone);
      offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`) - time);
    }
    const candidates = [...offsets].map(offset => nominal - offset).filter(time => localTime(time, zone) === local);
    if (!candidates.length) throw new Error('This time does not exist because the clocks change. Choose another time.');
    if (candidates.length > 1) throw new Error('This time occurs twice because the clocks change. Choose a time outside that repeated hour.');
    return new Date(candidates[0]).toISOString();
  }
  function monthDays(month) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid calendar month.');
    const start = new Date(month + '-01T12:00:00Z');
    if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 7) !== month) throw new Error('Invalid calendar month.');
    const offset = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const day = new Date(start.getTime() + i * 86400000);
      return { date: day.toISOString().slice(0, 10), number: day.getUTCDate(), inMonth: day.toISOString().startsWith(month) };
    });
  }
  function shiftMonth(month, delta) {
    const date = new Date(month + '-01T12:00:00Z');
    date.setUTCMonth(date.getUTCMonth() + delta);
    return date.toISOString().slice(0, 7);
  }
  const escapeText = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  function fold(line) {
    const encoder = new TextEncoder();
    let output = '', current = '', bytes = 0;
    for (const character of line) {
      const size = encoder.encode(character).length;
      if (bytes + size > 75) { output += current + '\r\n'; current = ' '; bytes = 1; }
      current += character; bytes += size;
    }
    return output + current;
  }
  function ics(events, versions, name = 'Platum collaboration', generatedAt = new Date()) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Platum//Collaboration//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + escapeText(name)];
    for (const event of events) {
      const v = versions.find(version => version.id === event.current_version_id);
      if (!v) continue;
      lines.push('BEGIN:VEVENT', 'UID:' + event.id + '@platum', 'SEQUENCE:' + Number(event.revision),
        'DTSTAMP:' + stamp(generatedAt), 'DTSTART:' + stamp(v.starts_at), 'DTEND:' + stamp(v.ends_at),
        'SUMMARY:' + escapeText(v.title), 'DESCRIPTION:' + escapeText(v.agenda + '\nProposal ' + v.number + ' · ' + event.status + '\nOriginal time zone: ' + v.timezone),
        'LOCATION:' + escapeText(v.location), 'STATUS:' + (['cancelled', 'declined'].includes(event.status) ? 'CANCELLED' : event.status === 'proposed' ? 'TENTATIVE' : 'CONFIRMED'),
        'TRANSP:' + (['cancelled', 'declined'].includes(event.status)||event.availability==='free' ? 'TRANSPARENT' : 'OPAQUE'), 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }
  function availabilityAt(availability, startsAt, endsAt) {
    const start = localTime(startsAt, availability.timezone), end = localTime(endsAt, availability.timezone);
    const first = start.slice(0, 10), last = end.slice(0, 10);
    if ((availability.unavailable || []).some(range => first <= range.end && last >= range.start)) return 'unavailable';
    if (!(availability.weekly || []).length) return 'unknown';
    const day = new Date(first + 'T12:00:00Z').getUTCDay();
    return first === last && availability.weekly.some(slot => Number(slot.day) === day && start.slice(11) >= slot.start && end.slice(11) <= slot.end) ? 'within_hours' : 'outside_hours';
  }
  function scheduleAt(availability,startsAt,endsAt,periods=[]){
    const start=Date.parse(startsAt),end=Date.parse(endsAt);
    const overlap=periods.filter(p=>Date.parse(p.starts_at)<end&&Date.parse(p.ends_at)>start);
    if(overlap.some(p=>p.availability==='unavailable'))return 'unavailable';
    if(overlap.some(p=>p.availability==='busy'))return 'busy';
    if(overlap.some(p=>p.availability==='free'&&Date.parse(p.starts_at)<=start&&Date.parse(p.ends_at)>=end))return 'free';
    return availabilityAt(availability,startsAt,endsAt);
  }
  return Object.freeze({ localTime, toInstant, monthDays, shiftMonth, ics, availabilityAt, scheduleAt });
});
