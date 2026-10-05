/**
 * Cloudflare Pages Function: /api/build
 * Dispara o workflow do GitHub Actions para compilar o APK
 * Suporta:
 * - Modo URL (Web App Google) e Modo Diretório (Pasta ZIP com HTML/JS/CSS)
 * - Trava de Orientação (Auto, Retrato, Paisagem)
 * - Permissões Granulares (GPS, Câmera, Microfone)
 * - Comportamentos de Tela (Keep Screen On, Fullscreen, Pull-to-refresh)
 * - Splash Screen Customizada (Lottie JSON ou Imagem)
 */

function base64ToUint8Array(base64) {
    const raw = atob(base64.split(',').pop());
    const uint8Array = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
        uint8Array[i] = raw.charCodeAt(i);
    }
    return uint8Array;
}

export async function onRequestPost(context) {
    try {
        const body = await context.request.json();
        const { 
            app_name, 
            app_url, 
            build_mode = 'url', 
            zip_base64, 
            package_name, 
            theme_color, 
            icon_base64,
            orientation = 'auto',
            perm_location = 'false',
            perm_camera = 'false',
            perm_mic = 'false',
            keep_screen_on = 'false',
            fullscreen = 'false',
            pull_to_refresh = 'true',
            splash_base64 = '',
            splash_type = 'none',
            client_token, 
            client_repo 
        } = body;

        // Validação conforme o modo escolhido
        if (build_mode === 'url' && (!app_url || !app_url.startsWith('http'))) {
            return new Response(JSON.stringify({ error: 'URL inválida. Deve iniciar com http:// ou https://' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (build_mode === 'directory' && (!zip_base64 || zip_base64.length < 50)) {
            return new Response(JSON.stringify({ error: 'Nenhum arquivo ou pasta foi fornecido para a compilação.' }), {
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

        let source_tag = '';

        // Se o modo for Diretório, cria uma Release temporária para hospedar o source.zip
        if (build_mode === 'directory' && zip_base64) {
            source_tag = `source-${build_id}`;
            console.log(`==> Criando pacote de código fonte em release: ${source_tag}`);

            // 1. Criar Release para os fontes
            const createRelRes = await fetch(`https://api.github.com/repos/${repoFullName}/releases`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'Cloudflare-Pages-Apk-Builder',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tag_name: source_tag,
                    name: `Source Code ${build_id}`,
                    draft: false,
                    prerelease: true
                })
            });

            if (!createRelRes.ok) {
                const err = await createRelRes.text();
                throw new Error(`Falha ao preparar envio da pasta no GitHub: ${err}`);
            }

            const relData = await createRelRes.json();
            const uploadUrl = `https://uploads.github.com/repos/${repoFullName}/releases/${relData.id}/assets?name=source.zip`;

            // 2. Fazer upload do arquivo zip binário
            const zipBytes = base64ToUint8Array(zip_base64);
            const uploadRes = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'Cloudflare-Pages-Apk-Builder',
                    'Content-Type': 'application/zip'
                },
                body: zipBytes
            });

            if (!uploadRes.ok) {
                const err = await uploadRes.text();
                throw new Error(`Falha ao carregar os arquivos compactados no GitHub: ${err}`);
            }
        }

        // O GitHub Actions limita o payload total de inputs em ~65KB.
        let safeIcon = icon_base64 || '';
        if (safeIcon.length > 30000) {
            safeIcon = '';
        }

        let safeSplash = splash_base64 || '';
        if (safeSplash.length > 30000) {
            safeSplash = '';
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
                    app_url: app_url ? app_url.trim() : 'https://appassets.androidplatform.net/assets/www/index.html',
                    build_mode: build_mode,
                    source_tag: source_tag,
                    package_name: package_name || 'com.sheet.app',
                    theme_color: theme_color || '#0F9D58',
                    icon_base64: safeIcon,
                    orientation: orientation || 'auto',
                    perm_location: String(perm_location),
                    perm_camera: String(perm_camera),
                    perm_mic: String(perm_mic),
                    keep_screen_on: String(keep_screen_on),
                    fullscreen: String(fullscreen),
                    pull_to_refresh: String(pull_to_refresh),
                    splash_base64: safeSplash,
                    splash_type: splash_type || 'none',
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
            build_mode: build_mode,
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
