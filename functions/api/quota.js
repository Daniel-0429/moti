import { handleQuota, methodNotAllowed } from '../../lib/worker.js';

export function onRequestGet(context) {
  return handleQuota(context);
}

export function onRequestPost() {
  return methodNotAllowed('GET');
}
