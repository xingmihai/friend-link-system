// functions/pub/friends.js
// 中转 /pub/friends 到 /api/links-qexo

export async function onRequestGet(ctx) {
  const url = new URL(ctx.request.url);
  url.pathname = '/api/links-qexo';
  return fetch(url.toString());
}

export const onRequestPost = onRequestGet;
export const onRequestOptions = onRequestGet;