import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { createJsonStore } from '../src/store/index.js';
import { createTasksRouter } from '../src/routes/tasks.js';
import { createScheduleRouter } from '../src/routes/schedule.js';
import { createMissedMonitor } from '../src/scheduler/missed-monitor.js';

const time = '2026-10-30T15:00:30+09:00';
function fixture() { return { user:{settings:{dayStart:'07:00',dayEnd:'24:00',minSlotMinutes:30,maxBlockMinutes:90,breakMinutes:10}},tasks:[],fixedBlocks:[{id:'class',kind:'class',title:'수업',dayOfWeek:[5],start:'10:00',end:'13:00'}],scheduledBlocks:[],history:[{id:'h1',type:'coding',taskTitle:'old',estimatedMinutes:100,actualMinutes:150,completedAt:time}] }; }
const input = (extra={}) => ({id:'task',title:'과제',type:'coding',deadline:'2026-11-04T23:59:00+09:00',baseEstimatedMinutes:100,subtasks:[{id:'s1',title:'설계',estimatedMinutes:50},{id:'s2',title:'구현',estimatedMinutes:50}],...extra});
async function setup(t, data=fixture()) {
 const dir=await mkdtemp(path.join(os.tmpdir(),'j-day-flow-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const dbPath=path.join(dir,'db.json'),seedPath=path.join(dir,'seed.json');
 await writeFile(seedPath,JSON.stringify(data));
 const store=createJsonStore({dbPath,seedPath});
 await store.initStore();
 let current=new Date(time);
 const now=()=>new Date(current);
 const app=express();app.use(express.json());
 app.use('/api/tasks',createTasksRouter({...store,now}));
 app.use('/api/schedule',createScheduleRouter({...store,now}));
 app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 async function request(method,url,body) {
  const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
 }
 return {store,request,dbPath,now,setNow:value=>{current=new Date(value);}};
}

test('미수행 주기 확인: 변화 없을 때 저장 안 함, 겹친 실행 합치고 missed 저장',async t=>{
 const {store,request,setNow,now}=await setup(t);
 let updates=0;
 const monitor=createMissedMonitor({...store,now,updateDb:updater=>{updates++;return store.updateDb(updater);}});
 assert.equal(await monitor.check(),null);assert.equal(updates,0);
 await request('POST','/tasks',input());
 setNow('2026-10-31T09:00:00+09:00');
 const results=await Promise.all([monitor.check(),monitor.check()]);
 assert.equal(updates,1);assert.deepEqual(results[0],results[1]);
 assert.ok((await store.readDb()).scheduledBlocks.some(b=>b.status==='missed'));
 assert.equal(await monitor.check(),null);assert.equal(updates,1);
});

test('주기 확인의 시작·중지, 오류 후 다음 실행 복구',async t=>{
 const {store,request,setNow,now}=await setup(t);
 await request('POST','/tasks',input());setNow('2026-10-31T09:00:00+09:00');
 let callback,cleared=0,fail=true;
 const errors=[];
 const timer={unref(){}};
 const monitor=createMissedMonitor({...store,now,onError:error=>errors.push(error),
  updateDb:updater=>{if(fail) return Promise.reject(new Error('disk'));return store.updateDb(updater);},
  setIntervalFn:(fn,ms)=>{callback=fn;assert.equal(ms,60000);return timer;},clearIntervalFn:actual=>{assert.equal(actual,timer);cleared++;}});
 monitor.start();monitor.start();callback();
 await assert.rejects(monitor.check(),/disk/);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(errors.length,1);
 fail=false;assert.ok(await monitor.check());
 monitor.stop();monitor.stop();assert.equal(cleared,1);
});
