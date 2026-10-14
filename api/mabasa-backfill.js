const crypto=require('node:crypto');
const {getRawBackfillFields,compareBackfillReadings}=require('./raw-backfill');
const {insertMissingBackfillValues}=require('./backfill-insert');
const config=require('./mabasa-backfill-config.json');
const TARGETS=config.targets;

function parseCsv(text) {
 const rows=[];let row=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"' && text[i+1]==='"'){value+='"';i++;}else if(c==='"')quoted=false;else value+=c;}
  else if(c==='"'){if(value)throw new Error('Unexpected CSV quote');quoted=true;}
  else if(c===','){row.push(value);value='';}
  else if(c==='\n'){row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value='';}
  else if(c!=='\r')value+=c;
 }
 if(quoted)throw new Error('Unclosed CSV quote');
 if(value||row.length){row.push(value);rows.push(row);}
 return rows;
}

function parseSastTime(text) {
 const m=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.exec(text);
 if(!m)return null;
 const parts=m.slice(1,7).map(v=>Number(v||0));
 const calendar=new Date(Date.UTC(parts[0],parts[1]-1,parts[2],parts[3],parts[4],parts[5]));
 if(calendar.getUTCFullYear()!==parts[0]||calendar.getUTCMonth()+1!==parts[1]||calendar.getUTCDate()!==parts[2]||calendar.getUTCHours()!==parts[3]||calendar.getUTCMinutes()!==parts[4]||calendar.getUTCSeconds()!==parts[5])return null;
 const date=new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]||'00'}${m[7]||''}${m[8]||'+02:00'}`);
 return Number.isNaN(date.getTime())?null:date;
}

async function validateMabasa(client, buffer, manifest, fileName, tableName, onProgress = null) {
 const TARGET=TARGETS[tableName];
 if(!TARGET)throw new Error('Unsupported Mabasa raw table.');
 const sha=crypto.createHash('sha256').update(buffer).digest('hex');
 if((manifest.outputs?.[fileName] || manifest.batches?.[fileName])!==sha)throw new Error('Masterfile checksum does not match its preparation manifest.');
 const table=manifest.tables?.find(t=>t.table===tableName);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(manifest.as_of||''))throw new Error('Preparation cutoff missing from manifest.');
 if(table?.table_id!==TARGET.tableId||manifest.timezone_offset!=='+02:00'||!manifest.expected_serials?.includes('6456'))throw new Error('Manifest does not identify the selected Mabasa raw table / serial 6456 / SAST.');
 const fields=await getRawBackfillFields(client,TARGET.serverName,TARGET.tableName,TARGET.tableId);
 for(const [key,expected] of Object.entries(config.unitRules)){
  if(!key.startsWith(tableName+'.'))continue;
  const rule=manifest.unit_rules?.[key];
  if(JSON.stringify(rule)!==JSON.stringify(expected))throw new Error('Missing reviewed unit rule: '+key);
  const field=key.slice(tableName.length+1);
  if(fields.find(f=>f.display_field_name===field)?.units!==expected.target_unit)throw new Error('Database unit changed: '+field);
 }
 for(const [key,expected] of Object.entries(config.exclusions)){
  if(key.startsWith(tableName+'.') && JSON.stringify(manifest.cell_exclusions?.[key])!==JSON.stringify(expected))throw new Error('Missing reviewed unit exclusion: '+key);
 }
 const rows=parseCsv(buffer.toString('utf8').replace(/^\uFEFF/,''));
 if(rows.length<2||rows.length>20001)throw new Error('Expected 1–20,000 timestamp rows.');
 const headers=rows.shift();
 if(headers[0]!=='timestamp'||new Set(headers).size!==headers.length)throw new Error('Invalid/duplicate CSV headers.');
 const byName=new Map(fields.map(f=>[f.display_field_name,f]));
 if(headers.length!==fields.length+1||headers.slice(1).some(h=>!byName.has(h)))throw new Error('CSV must contain exactly the selected raw table fields, plus timestamp.');
 const seen=new Set();const valueRows=[];
 for(const [i,row] of rows.entries()){
  if(row.length!==headers.length)throw new Error(`Row ${i+2}: incorrect cell count.`);
  const time=parseSastTime(row[0]);if(!time)throw new Error(`Row ${i+2}: invalid timestamp.`);
  const sast=new Date(time.getTime()+7200000);
  if((sast.getUTCHours()*3600+sast.getUTCMinutes()*60+sast.getUTCSeconds())%TARGET.interval||sast.getUTCMilliseconds())throw new Error(`Row ${i+2}: timestamp is off the raw table interval.`);
  if(sast.toISOString().slice(0,10)>manifest.as_of)throw new Error(`Row ${i+2}: timestamp is after the preparation cutoff.`);
  if(seen.has(time.toISOString()))throw new Error(`Row ${i+2}: duplicate timestamp.`);seen.add(time.toISOString());
  for(let j=1;j<headers.length;j++){
   const value=row[j].trim();if(!value)continue;
   if(['NA','NAN','NULL','INF','INFINITY','-INF','-INFINITY'].includes(value.toUpperCase())||/^#+$/.test(value))throw new Error(`Row ${i+2}, ${headers[j]}: invalid missing marker.`);
   const field=byName.get(headers[j]);
   const exclusion=config.exclusions[tableName+'.'+headers[j]];
   if(exclusion && sast.toISOString().slice(0,19).replace('T',' ')<exclusion.before)throw new Error(`Row ${i+2}: unconfirmed pressure value in excluded period.`);
   if(['xsd:float','xsd:double','xsd:int'].includes(field.data_type)&&(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)||!Number.isFinite(Number(value))||(field.data_type==='xsd:int'&&!Number.isInteger(Number(value)))))throw new Error(`Row ${i+2}, ${headers[j]}: invalid number.`);
   if(field.data_type==='xsd:dateTime'&&!parseSastTime(value))throw new Error(`Row ${i+2}, ${headers[j]}: invalid event time.`);
   if(value.length>1000)throw new Error('Value exceeds import length cap.');
   valueRows.push({fieldId:field.field_id,timestamp:time,value,status:'backfilled'});
  }
 }
 if(!valueRows.length||valueRows.length>250000)throw new Error('Expected 1–250,000 values.');
 return {sha,rowCount:rows.length,valueCount:valueRows.length,valueRows,fields,counts:await compareBackfillReadings(client,valueRows,onProgress)};
}
module.exports={TARGETS,parseCsv,parseSastTime,validateMabasa,insertMissingBackfillValues};
