import { handleStatus, methodNotAllowed } from '../../lib/worker.js';

export function onRequestGet(context) {
  return handleStatus(context);
}

export function onRequestPost() {
  return methodNotAllowed('GET');
}
