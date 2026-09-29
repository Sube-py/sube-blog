/**
 * OAuth 第二步：GitHub 回调，用 code 换 access_token，再 postMessage 回编辑器
 * 部署后路由为 https://<你的域名>/callback
 */
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code) return html('<h1>授权失败</h1><p>缺少 code 参数</p>', 400);

  // 校验 state（防 CSRF）
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/oauth_state=([^;]+)/);
  const saved = match ? decodeURIComponent(match[1]) : null;
  if (!state || !saved || saved !== state) {
    return html('<h1>授权失败</h1><p>state 校验不通过，请重新登录</p>', 401);
  }

  const res = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.OAUTH_CLIENT_ID,
      client_secret: env.OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/callback`,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    const msg = json.error_description || json.error || '未知错误';
    return html(`<h1>换取 token 失败</h1><p>${msg}</p>`, 502);
  }

  const message =
    'authorization:github:success:' +
    JSON.stringify({ token: json.access_token, provider: 'github' });

  return html(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>授权成功</title></head>
<body>
<p style="font-family:sans-serif;text-align:center;margin-top:60px">授权成功，正在返回编辑器…</p>
<script>
(function () {
  var payload = ${JSON.stringify(message)};
  if (window.opener) { window.opener.postMessage(payload, '*'); }
  try { localStorage.setItem('decap-cms-oauth-response', payload); } catch (e) {}
  setTimeout(function () { window.close(); }, 800);
})();
</script>
</body></html>`);
}
