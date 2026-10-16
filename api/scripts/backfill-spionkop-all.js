#!/usr/bin/env node
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const args={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i].startsWith('--')||!process.argv[i+1])throw new Error('Use --name value pairs');args[process.argv[i].slice(2)]=process.argv[i+1];}
if(!args.prepared||!args.reports||!args.operator||!args['confirm-database'])throw new Error('Required: --prepared FOLDER --reports FOLDER --operator NAME --confirm-database DATABASE');
const metadata=args.metadata||'defer';if(!['refresh','defer'].includes(metadata))throw new Error('--metadata must be refresh or defer');
const manifest=path.join(args.prepared,'preparation-report.json');const m=JSON.parse(fs.readFileSync(manifest));
fs.mkdirSync(args.reports,{recursive:true});
const run=Date.now().toString();let completed=0;
for(const table of ['TableDay','daily','TableHour','hourly','Table10m','TableSolarCharger10m','five_min']){
 const files=Object.keys(m.batches).filter(f=>f.startsWith(table+'_batches/')).sort();
 if(!files.length)throw new Error('No validated batches for '+table);
 for(const file of files){
  console.log(`Starting ${table}/${path.basename(file)}; ${completed} files completed this run`);
  const report=path.join(args.reports,`${run}-${table}-${path.basename(file,'.csv')}.json`);
  const r=spawnSync(process.execPath,[path.join(__dirname,'backfill-spionkop.js'),'--table',table,'--file',path.join(args.prepared,file),'--manifest',manifest,'--report',report,'--mode','import','--confirm-database',args['confirm-database'],'--operator',args.operator,'--metadata',metadata],{stdio:'inherit'});
  if(r.error||r.status!==0){console.error('Stopped at '+file+'. Saved batches remain. Rerun this command to resume.');process.exit(r.status||1);}
  completed++;
 }
}
console.log((metadata==='defer'?'All seven Spionkop observation imports completed; availability refresh is still required. Files: ':'All seven Spionkop tables completed. Files: ')+completed);
