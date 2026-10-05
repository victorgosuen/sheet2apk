/**
 * Cloudflare Pages Function: /api/build
 * Dispara o workflow do GitHub Actions para compilar o APK
 */
export async function onRequestPost(context) {
    try {
        const body = await context.request.json();
        const { app_name, app_url, package_name, theme_color, icon_base64, client_token, client_repo } = body;

        if (!app_url || !app_url.startsWith('http')) {
            return new Response(JSON.stringify({ error: 'URL inválida. Deve iniciar com http:// ou https://' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Recupera credenciais do ambiente Cloudflare ou das configurações do cliente
        const token = context.env?.GITHUB_TOKEN || client_token;
        const repoFullName = context.env?.GITHUB_REPO || client_repo; // Formato: "usuario/repositorio"

        if (!token || !repoFullName) {
            return new Response(JSON.stringify({
                error: 'Configuração do GitHub ausente. Defina GITHUB_TOKEN e GITHUB_REPO no Cloudflare Pages ou na engrenagem de configurações.'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Gera um ID de build único
        const build_id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

        // O GitHub Actions limita o payload de inputs em 65KB.
        let safeIcon = icon_base64 || '';
        if (safeIcon.length > 55000) {
            safeIcon = '';
        }

        const dispatchUrl = `https://api.github.com/repos/${repoFullName}/actions/workflows/build-apk.yml/dispatches`;

        const dispatchRes = await fetch(dispatchUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'Cloudflare-Pages-Apk-Builder',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ref: 'main',
                inputs: {
                    app_name: app_name || 'Planilha App',
                    app_url: app_url.trim(),
                    package_name: package_name || 'com.sheet.app',
                    theme_color: theme_color || '#0F9D58',
                    icon_base64: safeIcon,
                    build_id: build_id
                }
            })
        });

        if (!dispatchRes.ok) {
            const errText = await dispatchRes.text();
            return new Response(JSON.stringify({
                error: `Falha ao acionar GitHub Actions (${dispatchRes.status}): ${errText}`
            }), {
                status: dispatchRes.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            success: true,
            build_id: build_id,
            repo: repoFullName,
            message: 'Compilação iniciada com sucesso no GitHub Actions!'
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message || 'Erro interno do servidor' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
