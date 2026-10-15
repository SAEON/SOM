const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const {parseAvailabilityMonths}=require('../availability-window');
const source=fs.readFileSync(path.join(__dirname,'../loggernet.js'),'utf8');
const start=source.indexOf("app.post('/api/background/run-availability'");
const route=source.slice(start,source.indexOf('// Schedule background work.',start));
function setup(allowed=true,busy=false){
 let handler;const runs=[];const response={statusCode:200,status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;}};
 vm.runInNewContext(route,{app:{post:(_path,fn)=>{handler=fn;}},requireTechnician:(_req,res)=>{if(!allowed)res.status(401).json({message:'Technician access required.'});return allowed;},writerRunning:busy,backgroundStatus:{writer:{}},parseAvailabilityMonths,runManualAvailabilityJob:n=>{runs.push(n);return Promise.resolve();},console});
 return{handler,response,runs};
}
test('historical windows are bounded and reject malformed values',()=>{
 assert.equal(parseAvailabilityMonths(undefined),null);assert.equal(parseAvailabilityMonths(60),60);
 for(const value of [0,-1,121,1.5,'60',null,{},NaN])assert.throws(()=>parseAvailabilityMonths(value),/integer/);
});
test('API preserves technician authorization and rejects overlapping jobs',async()=>{
 const denied=setup(false);await denied.handler({body:{monthsBack:60}},denied.response);assert.equal(denied.response.statusCode,401);assert.equal(denied.runs.length,0);
 const busy=setup(true,true);await busy.handler({body:{monthsBack:60}},busy.response);assert.equal(busy.response.statusCode,409);assert.equal(busy.runs.length,0);
});
test('API passes a one-off historical window without changing the default',async()=>{
 const full=setup();await full.handler({body:{monthsBack:60}},full.response);assert.equal(full.response.statusCode,202);assert.equal(full.runs[0],60);
 const normal=setup();await normal.handler({body:{}},normal.response);assert.equal(normal.response.statusCode,202);assert.equal(normal.runs[0],null);
 const invalid=setup();await invalid.handler({body:{monthsBack:200}},invalid.response);assert.equal(invalid.response.statusCode,400);assert.equal(invalid.runs.length,0);
});

test('period summaries are recalculated with whole-week/month/year boundaries',async()=>{
 const {refreshAvailabilityPeriods}=require('../availability-periods');const calls=[];
 await refreshAvailabilityPeriods({query:async(sql,args)=>{calls.push({sql,args});return{rowCount:1};}},60);
 assert.equal(calls.length,3);
 for(const [i,unit] of ['week','month','year'].entries()){
  assert.match(calls[i].sql,new RegExp("date>=date_trunc\\('"+unit+"'"));
  assert.match(calls[i].sql,/avg\(availability_percentage\)/);assert.match(calls[i].sql,/ON CONFLICT/);
  assert.match(calls[i].args[0],/^\d{4}-\d{2}-\d{2}$/);
 }
});
