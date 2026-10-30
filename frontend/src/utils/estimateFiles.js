import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
export async function readEstimateFile(file) {
  if (file.size > 2 * 1024 * 1024) throw new Error('첨부는 파일당 2MB 이하로 선택해 주세요.');
  let text;
  if (/\.txt$/i.test(file.name)) text = await file.text();
  else if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const loading = pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
    try {
      const document = await loading.promise;
      if(document.numPages>20)throw new Error('PDF는 20페이지 이하로 선택해 주세요.');
      const parts=[];
      for(let i=1;i<=document.numPages;i++) {
        const page=await document.getPage(i),content=await page.getTextContent();
        parts.push(content.items.map(item=>item.str??'').join(' '));page.cleanup();
        if(parts.join('\n').length>12000)throw new Error('첨부 내용은 파일당 12000자 이하로 줄여 주세요.');
      }
      text=parts.join('\n');
    } catch(error) {
      if(error.name==='PasswordException')throw new Error('암호가 없는 PDF를 선택해 주세요.');
      throw error;
    } finally { await loading.destroy(); }
  } else throw new Error('PDF 또는 TXT 파일을 선택해 주세요.');
  text=text.trim();
  if(!text)throw new Error('텍스트를 읽지 못했어요. 스캔 PDF라면 과제 내용을 직접 붙여 넣어 주세요.');
  if(text.length>12000)throw new Error('첨부 내용은 파일당 12000자 이하로 줄여 주세요.');
  return {name:file.name,text};
}
