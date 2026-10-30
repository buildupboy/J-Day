import test from 'node:test';import assert from 'node:assert/strict';
import express from 'express';import {once} from 'node:events';
import {createTaskEstimator} from '../src/services/task-estimate.js';
import {createTasksRouter} from '../src/routes/tasks.js';
const result=()=>({type:'report',baseEstimatedMinutes:95,rangeMinutes:[70,130],subtasks:[{title:'조사',estimatedMinutes:35},{title:'작성',estimatedMinutes:60}],assumptions:['학부생 기준']});
const input={title:'짧은 보고서',description:'사례 2개를 2쪽으로 정리',files:[{name:'안내.txt',text:'참고문헌 포함'}]};

test('추천은 한 번의 AI 호출: 범위·합계·파일 내용 전달, 동시 중복 및 캐시 재사용',async()=>{
 let calls=0,now=0;
 const estimator=createTaskEstimator({clock:()=>now,completeFn:async request=>{calls++;assert.equal(request.name,'task_estimate');const data=JSON.parse(request.messages[0].content);assert.equal(data.files[0].text,'참고문헌 포함');return JSON.stringify(result());}});
 const [a,b]=await Promise.all([estimator(input),estimator(input)]);assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.source,'ai');
 a.subtasks[0].title='mutated';assert.equal((await estimator(input)).subtasks[0].title,'조사');assert.equal(calls,1);
 now=300001;await estimator(input);assert.equal(calls,2);await estimator({...input,description:'5쪽으로 변경'});assert.equal(calls,3);
});
test('없는 입력·과도한 첨부는 호출 전 거부, 잘못된 AI 합계·범위는 캐시하지 않음',async()=>{
 let calls=0;const estimator=createTaskEstimator({completeFn:async()=>{calls++;return JSON.stringify({...result(),baseEstimatedMinutes:96});}});
 for(const value of [{},{title:'x',files:Array(4).fill({name:'a',text:'a'})},{title:'x',description:'x'.repeat(12001)}])await assert.rejects(estimator(value),{status:400});
 assert.equal(calls,0);await assert.rejects(estimator(input),{status:502});await assert.rejects(estimator(input),{status:502});assert.equal(calls,2);
});
test('추천 API는 DB·스케줄러를 읽거나 호출하지 않고 분 단위 결과만 반환',async t=>{
 let calls=0;const app=express();app.use(express.json());
 app.use('/tasks',createTasksRouter({readDb:()=>assert.fail('DB read'),updateDb:()=>assert.fail('DB write'),planner:()=>assert.fail('schedule'),estimateTask:createTaskEstimator({completeFn:async()=>{calls++;return JSON.stringify(result());}})}));
 app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const response=await fetch(`http://127.0.0.1:${server.address().port}/tasks/estimate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
 assert.equal(response.status,200);assert.equal((await response.json()).baseEstimatedMinutes,95);assert.equal(calls,1);
});


test('AI가 큰 단계 4개보다 많이 분해한 응답은 적용하지 않음',async()=>{
 const estimator=createTaskEstimator({completeFn:async()=>JSON.stringify({...result(),baseEstimatedMinutes:100,rangeMinutes:[80,120],subtasks:Array.from({length:5},(_,i)=>({title:`단계 ${i}`,estimatedMinutes:20}))})});
 await assert.rejects(estimator(input),{status:502});
});
