const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../loggernet.js'),'utf8');
for(const endpoint of ['/api/data-availability','/api/filtered-aggregated-data-availability']){
 test(endpoint+' revalidates and reflects a completed recalculation',async()=>{
  const start=source.indexOf("app.get('"+endpoint+"'");const route=source.slice(start,source.indexOf('\napp.',start+5));
  let handler;let percentage=0;
  const query=async(sql)=>({rows:sql.includes('display_server_name')?[{display_field_name:'temp_air_avg',aggregated_timestamp:'2026-09-07',availability_percentage:percentage}]:[]});
  const client={query,release(){}};
  vm.runInNewContext(route,{app:{get:(_path,fn)=>{handler=fn;}},pool:{query,connect:async()=>client},normalizeText:x=>String(x||''),parseDateOnly:x=>new Date(x),daySpan:(a,b)=>(b-a)/86400000,process:{env:{}},console,setPublicCache(){throw Error('Stale chart caching must not be enabled');}});
  const req={query:{serverName:'Mokala National Park AWS',tableName:'daily',servers:'Mokala National Park AWS',startDate:'2026-09-07',endDate:'2026-09-09',granularity:'daily'}};
  const response=()=>({headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}});
  const before=response();await handler(req,before);assert.equal(before.body[0].availability_percentage,0);
  percentage=100;const after=response();await handler(req,after);assert.equal(after.body[0].availability_percentage,100);
  assert.equal(after.headers['Cache-Control'],'no-cache, max-age=0, must-revalidate');
 });
}
