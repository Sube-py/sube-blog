/**
 * Sveltia / Decap CMS 的 GitHub OAuth Broker（Cloudflare Workers 版）
 *
 * 为什么需要它：
 *   GitHub 不支持浏览器端 PKCE，纯静态站点无法直接在前端完成 OAuth 换 token，
 *   必须有一个服务端拿着 client_secret 去换。这个 Worker 就是干这个的。
 *
 * 部署：
 *   npm i -g wrangler
 *   wrangler secret put OAUTH_CLIENT_ID
 *   wrangler secret put OAUTH_CLIENT_SECRET
 *   wrangler deploy
 *   # 拿到 https://cms-auth.xxx.workers.dev，⚠️ workers.dev 国内可能被拦，
 *   # 建议在 Workers 设置里绑定自己的已备案域名（ Routes / Custom Domains ）
 *
 * 然后在 static/admin/config.yml 里写：
 *   backend:
 *     name: github
 *     repo: owner/repo
 *     branch: main
 *     base_url: https://cms-auth.yourdomain.com
 *     auth_endpoint: auth
 */

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

// 公开仓库用 'public_repo'，私有仓库必须 'repo'
const SCOPES = 'repo,user';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS },
  });
}

function randomState() {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // ---------- 健康检查 ----------
    if (path === '/health') {
      return Response.json({ ok: true, provider: 'github' }, { headers: CORS_HEADERS });
    }

    // ---------- 第一步：跳转 GitHub 授权页 ----------
    if (path === '/auth' || path === '/' || path === '/auth/') {
      const provider = url.searchParams.get('provider') || 'github';
      if (provider !== 'github') {
        return html('<h1>暂不支持</h1><p>当前仅支持 provider=github</p>', 400);
      }

      const state = randomState();
      const redirectUri = `${url.origin}/callback`;

      const authUrl =
        `${GITHUB_AUTHORIZE_URL}?client_id=${encodeURIComponent(env.OAUTH_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(SCOPES)}` +
        `&state=${encodeURIComponent(state)}`;

      return new Response(null, {
        status: 302,
        headers: {
          Location: authUrl,
          // 10 分钟有效，callback 时校验，防 CSRF
          'Set-Cookie': `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
        },
      });
    }

    // ---------- 第二步：GitHub 回调，用 code 换 token ----------
    if (path === '/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (!code) {
        return html('<h1>授权失败</h1><p>缺少 code 参数。</p>', 400);
      }

      // 校验 state
      const cookies = Object.fromEntries(
        (request.headers.get('Cookie') || '')
          .split(';')
          .map((c) => c.trim().split('='))
          .filter((p) => p.length === 2)
          .map((p) => [decodeURIComponent(p[0]), decodeURIComponent(p[1])])
      );
      if (!state || !cookies.oauth_state || cookies.oauth_state !== state) {
        return html('<h1>授权失败</h1><p>state 校验不通过，请重新登录。</p>', 401);
      }

      const tokenRes = await fetch(GITHUB_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: env.OAUTH_CLIENT_ID,
          client_secret: env.OAUTH_CLIENT_SECRET,
          code,
          redirect_uri: `${url.origin}/callback`,
        }),
      });

      const tokenJson = await tokenRes.json().catch(() => ({}));

      if (!tokenRes.ok || !tokenJson.access_token) {
        const msg = (tokenJson && (tokenJson.error_description || tokenJson.error)) || '未知错误';
        return html(`<h1>换取 token 失败</h1><p>${msg}</p>`, 502);
      }

      // Decap / Sveltia 约定的 postMessage 协议
      const payload = JSON.stringify({
        token: tokenJson.access_token,
        provider: 'github',
      });

      return html(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>授权成功</title></head>
<body>
<p style="font-family:sans-serif;text-align:center;margin-top:60px">授权成功，正在返回编辑器…</p>
<script>
(function () {
  var payload = ${JSON.stringify(`authorization:github:success:${payload}`)};
  if (window.opener) {
    window.opener.postMessage(payload, '*');
  }
  // 兼容部分版本直接读 location hash 的做法
  try { localStorage.setItem('decap-cms-oauth-response', payload); } catch (e) {}
  setTimeout(function () { window.close(); }, 800);
})();
</script>
</body></html>`);
    }

    return html('<h1>404</h1>', 404);
  },
};
