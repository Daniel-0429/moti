import { handleEditions, methodNotAllowed } from '../../lib/worker.js';

export function onRequestGet(context) {
  return handleEditions(context);
}

export function onRequestPost() {
  return methodNotAllowed('GET');
}
