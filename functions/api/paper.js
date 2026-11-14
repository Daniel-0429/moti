import { handlePaper, methodNotAllowed } from '../../lib/worker.js';

export function onRequestPost(context) {
  return handlePaper(context);
}

export function onRequestGet() {
  return methodNotAllowed('POST');
}
