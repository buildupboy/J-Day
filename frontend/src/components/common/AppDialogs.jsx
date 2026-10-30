import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';

const DialogContext = createContext(null);

function MessageDialog({ request, onFinish }) {
  const element = useRef(null);
  const titleId = useId();
  const messageId = useId();
  useEffect(() => {
    const dialog = element.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={element} className="my-dialog app-message-dialog" role="alertdialog" aria-labelledby={titleId} aria-describedby={messageId}
    onCancel={(event) => { event.preventDefault(); if (request.cancelable) onFinish(false); }}>
    <h2 id={titleId}>{request.cancelable ? '확인해 주세요' : '알림'}</h2>
    <p id={messageId}>{request.message}</p>
    <div className="app-message-actions">
      {request.cancelable && <button type="button" className="d-btn d-btn-line" autoFocus onClick={() => onFinish(false)}>취소</button>}
      <button type="button" className="d-btn d-btn-dark" autoFocus={!request.cancelable} onClick={() => onFinish(true)}>확인</button>
    </div>
  </dialog>;
}

export function AppDialogsProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolver = useRef(null);
  const requestId = useRef(0);
  useEffect(() => () => { resolver.current?.(false); resolver.current = null; }, []);
  function show(message, cancelable) {
    resolver.current?.(false);
    return new Promise((resolve) => {
      resolver.current = resolve;
      setRequest({ id: ++requestId.current, message, cancelable });
    });
  }
  function finish(accepted) {
    const resolve = resolver.current;
    resolver.current = null;
    setRequest(null);
    resolve?.(accepted);
  }
  return <DialogContext.Provider value={{ confirm: (message) => show(message, true), alert: (message) => show(message, false) }}>
    {children}
    {request && <MessageDialog key={request.id} request={request} onFinish={finish} />}
  </DialogContext.Provider>;
}

export function useAppDialogs() {
  return useContext(DialogContext);
}
