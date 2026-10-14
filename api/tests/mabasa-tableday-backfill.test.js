const test=require('node:test');const assert=require('node:assert/strict');
const {parseCsv,parseSastTime}=require('../mabasa-tableday-backfill');
test('CSV preserves quoted names/values, zeros and blank cells and rejects unclosed quotes',()=>{
 assert.deepEqual(parseCsv('timestamp,"field,name",other\r\n2022-06-22 00:00:00,"a""b",0\r\n'),[['timestamp','field,name','other'],['2022-06-22 00:00:00','a"b','0']]);
 assert.throws(()=>parseCsv('"unterminated'),/Unclosed/);
});
test('SAST parsing preserves midnight instants and rejects calendar rollover',()=>{
 assert.equal(parseSastTime('2022-06-22 00:00:00').toISOString(),'2022-06-21T22:00:00.000Z');
 assert.equal(parseSastTime('2022-02-30 00:00:00'),null);
 assert.equal(parseSastTime('2022-06-22 24:00:00'),null);
 assert.equal(parseSastTime('########'),null);
});
