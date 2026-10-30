import { Router } from 'express';
import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { startBlock, endBlock, afterEnd, extendBlock, getProposal, acceptProposal, rejectProposal } from '../services/blocks-service.js';
import { mutation, query } from './helpers.js';

export function createBlocksRouter(options = {}) {
  const { updateDb = storedUpdate, now = () => new Date() } = options;
  const router = Router(), change = mutation({ updateDb, now });
  router.post('/:id/start', change((db, req, o) => startBlock(db, req.params.id, o)));
  router.post('/:id/end', change((db, req, o) => endBlock(db, req.params.id, req.body, o)));
  router.post('/:id/after-end', change((db, req, o) => afterEnd(db, req.params.id, req.body, o)));
  router.post('/:id/extend', change((db, req, o) => extendBlock(db, req.params.id, req.body, o)));
  return router;
}

export function createProposalsRouter({ readDb = storedRead, updateDb = storedUpdate, now = () => new Date() } = {}) {
  const router = Router(), change = mutation({ updateDb, now }), read = query({ readDb, now });
  router.get('/:id', read((db, req) => getProposal(db, req.params.id)));
  router.post('/:id/accept', change((db, req) => acceptProposal(db, req.params.id)));
  router.post('/:id/reject', change((db, req) => rejectProposal(db, req.params.id)));
  return router;
}
export const blocksRouter = createBlocksRouter();
export const proposalsRouter = createProposalsRouter();
