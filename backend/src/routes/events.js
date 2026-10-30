import { Router } from 'express';
import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { listEvents, createEvent, updateEvent, deleteEvent, setFreePlan, returnFromFree } from '../services/events-service.js';
import { mutation, query } from './helpers.js';

export function createEventsRouter({ readDb = storedRead, updateDb = storedUpdate, now = () => new Date() } = {}) {
  const router = Router(), change = mutation({ updateDb, now }), read = query({ readDb, now });
  router.get('/', read((db, req) => listEvents(db, req.query)));
  router.post('/', change((db, req, options) => createEvent(db, req.body, options), 201));
  router.patch('/:id', change((db, req, options) => updateEvent(db, req.params.id, req.body, options)));
  router.delete('/:id', change((db, req, options) => deleteEvent(db, req.params.id, options)));
  router.post('/:id/free-plan', change((db, req, options) => setFreePlan(db, req.params.id, req.body, options)));
  router.post('/:id/return', change((db, req, options) => returnFromFree(db, req.params.id, options)));
  return router;
}
export default createEventsRouter();
