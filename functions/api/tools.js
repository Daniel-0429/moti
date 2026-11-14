import { handleTools, methodNotAllowed } from '../../lib/worker.js';

export function onRequestGet(context) {
  return handleTools(context);
}

export function onRequestPost() {
  return methodNotAllowed('GET');
}
