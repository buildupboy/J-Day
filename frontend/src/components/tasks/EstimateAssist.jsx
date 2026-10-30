import { useEffect, useRef, useState } from 'react';
import { ChevronUpIcon, NoteIcon, CloseIcon, PaperclipIcon } from '../common/Icons.jsx';
import { api } from '../../api/client.js';
import { formatDuration } from '../../utils/time.js';
import { readEstimateFile } from '../../utils/estimateFiles.js';

export default function EstimateAssist({ title, onApply }) {
  const [open,setOpen]=useState(true),[content,setContent]=useState(''),[files,setFiles]=useState([]);
  const [result,setResult]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[reading,setReading]=useState(false);
  const request=useRef(null),revision=useRef(0),busy=useRef(false);
  useEffect(()=>{
    revision.current++;request.current?.abort();busy.current=false;setLoading(false);setResult(null);setError('');
  },[title,content,files]);
  useEffect(()=>()=>request.current?.abort(),[]);
  const ask=async()=>{
    if(busy.current||reading)return;
    busy.current=true;const current=revision.current,controller=new AbortController();request.current=controller;
    setLoading(true);setError('');setResult(null);
    try{
      const estimate=await api.estimateTask({title,description:content,files:files.map(({name,text})=>({name,text}))},{signal:controller.signal});
      if(!controller.signal.aborted&&current===revision.current)setResult(estimate);
    }catch(err){if(err.name!=='AbortError'&&current===revision.current)setError(err.message);}
    finally{if(request.current===controller){busy.current=false;setLoading(false);}}
  };
  const addFiles=async list=>{
    const selected=Array.from(list);
    if(files.length+selected.length>3){setError('첨부는 최대 3개입니다.');return;}
    setReading(true);setError('');
    try{
      const parsed=await Promise.all(selected.map(readEstimateFile));
      setFiles(previous=>[...previous,...parsed.map((file,index)=>({...file,id:`${Date.now()}-${index}-${file.name}`}))]);
    }catch(err){setError(err.message);}
    finally{setReading(false);}
  };
  const canAsk=Boolean(title.trim()||content.trim()||files.length)&&!loading&&!reading;
  return <section className="assist" aria-label="AI 예상 시간 추천">
    <button type="button" className="assist-head" onClick={()=>setOpen(value=>!value)} aria-expanded={open}>예상 시간을 모르겠어요<span className={open?'':'is-closed'}><ChevronUpIcon size={18}/></span></button>
    {open&&<>
      <div className="assist-field"><label htmlFor="task-content">과제 내용</label><textarea id="task-content" rows={3} maxLength={12000} value={content} onChange={event=>setContent(event.target.value)} placeholder="예: 고유값·고유벡터 문제 8개, 증명 2개. 풀이 과정까지 손글씨로 제출"/></div>
      <div className="assist-files">{files.map(file=><span key={file.id} className="file-chip"><NoteIcon size={16}/>{file.name}<button type="button" disabled={reading} onClick={()=>setFiles(previous=>previous.filter(item=>item.id!==file.id))} aria-label={`${file.name} 첨부 삭제`}><CloseIcon size={16}/></button></span>)}
        <label className="file-add-chip"><PaperclipIcon size={16}/>파일 첨부<input type="file" accept=".pdf,.txt,application/pdf,text/plain" multiple hidden disabled={reading||loading} onChange={event=>{const selected=Array.from(event.target.files);event.target.value='';addFiles(selected);}}/></label>
      </div>
      {reading&&<p className="assist-note" role="status">첨부 내용을 읽는 중이에요…</p>}
      <button type="button" className="d-btn d-btn-blue" disabled={!canAsk} onClick={ask}>{loading?'과제 내용을 분석하고 있어요…':error?'다시 추천받기':'예상 시간 추천받기'}</button>
      {error&&<p className="d-error" role="alert">{error}</p>}
      {result&&<div className="assist-result"><div className="assist-title"><span className="j-mark" aria-hidden="true">J</span><div>
        <p className="assist-main">약 <strong>{formatDuration(result.baseEstimatedMinutes)}</strong> 걸릴 것 같아요</p>
        <p className="assist-detail">범위 {formatDuration(result.rangeMinutes[0])}~{formatDuration(result.rangeMinutes[1])} · {result.subtasks.map(item=>`${item.title} ${formatDuration(item.estimatedMinutes)}`).join(', ')}</p>
        {result.assumptions?.length>0&&<ul className="assist-detail">{result.assumptions.map((item,index)=><li key={index}>{item}</li>)}</ul>}
      </div></div><button type="button" className="apply-chip" onClick={()=>onApply(result)}>{formatDuration(result.baseEstimatedMinutes)}으로 적용</button></div>}
      <p className="assist-note">제목·설명·첨부 텍스트로 AI가 추정해요. 추천만으로 저장하거나 일정을 배치하지 않아요. PDF·TXT 최대 3개, 파일당 2MB · 텍스트 PDF 20페이지 이하. 스캔 PDF는 내용을 직접 입력해 주세요.</p>
    </>}
  </section>;
}
