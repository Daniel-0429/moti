import { handleKnowledge, methodNotAllowed } from '../../lib/worker.js';

export function onRequestGet(context) {
  return handleKnowledge(context);
}

export function onRequestPost() {
  return methodNotAllowed('GET');
}
