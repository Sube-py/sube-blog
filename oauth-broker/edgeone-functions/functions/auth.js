/**
 * OAuth 第一步：把用户送去 GitHub 授权页
 * 部署后路由为 https://<你的域名>/auth
 *
 * 环境变量（在 EdgeOne Pages 控制台 → 项目设置 → 环境变量 里配）：
 *   OAUTH_CLIENT_ID
 *   OAUTH_CLIENT_SECRET
 */
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const SCOPES = 'repo,user'; // 公开仓库可用 public_repo

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') || 'github';

  if (provider !== 'github') {
    return new Response('仅支持 provider=github', { status: 400 });
  }
  if (!env.OAUTH_CLIENT_ID) {
    return new Response('服务端未配置 OAUTH_CLIENT_ID', { status: 500 });
  }

  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
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
      'Set-Cookie': `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}
