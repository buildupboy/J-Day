/** 저장소 읽기·쓰기와 현재 시각을 주입해 테스트에서 바꿔 끼울 수 있게 하는 라우트 도우미. */
export function mutation({ updateDb, now }) {
  return (handler, status = 200) => async (req, res, next) => {
    try {
      let result;
      await updateDb(db => {
        result = handler(db, req, { now: now() });
        return db;
      });
      res.status(status).json(result);
    } catch (err) { next(err); }
  };
}

export function query({ readDb, now }) {
  return handler => async (req, res, next) => {
    try { res.json(await handler(await readDb(), req, { now: now() })); } catch (err) { next(err); }
  };
}
