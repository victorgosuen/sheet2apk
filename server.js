/**
 * Servidor de Desenvolvimento Local (Zero Dependências)
 * Roda com 'node server.js' ou 'npm start'
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Endpoint Local: /api/build
    if (url.pathname === '/api/build' && req.method === 'POST') {
        let bodyStr = '';
        req.on('data', chunk => bodyStr += chunk);
        req.on('end', async () => {
            try {
                const body = JSON.parse(bodyStr || '{}');
                const token = process.env.GITHUB_TOKEN || body.client_token;
                const repo = process.env.GITHUB_REPO || body.client_repo;

                if (!token || !repo) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({
                        error: 'Configuração do GitHub ausente. Clique na engrenagem no topo do site e insira seu Repositório e Token.'
                    }));
                }

                const build_id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
                const build_mode = body.build_mode || 'url';
                let source_tag = '';

                if (build_mode === 'directory' && body.zip_base64) {
                    source_tag = `source-${build_id}`;
                    console.log(`==> [Local Dev] Criando release para source.zip: ${source_tag}`);
                    const createRel = await fetch(`https://api.github.com/repos/${repo}/releases`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/vnd.github+json',
                            'User-Agent': 'Sheet2Apk-Local-Dev',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ tag_name: source_tag, name: `Source Code ${build_id}`, prerelease: true })
                    });
                    const relData = await createRel.json();
                    const zipBuffer = Buffer.from(body.zip_base64.split(',').pop(), 'base64');
                    await fetch(`https://uploads.github.com/repos/${repo}/releases/${relData.id}/assets?name=source.zip`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/vnd.github+json',
                            'User-Agent': 'Sheet2Apk-Local-Dev',
                            'Content-Type': 'application/zip'
                        },
                        body: zipBuffer
                    });
                }

                const dispatchUrl = `https://api.github.com/repos/${repo}/actions/workflows/build-apk.yml/dispatches`;

                let safeIcon = body.icon_base64 || '';
                if (safeIcon.length > 30000) safeIcon = '';

                let safeSplash = body.splash_base64 || '';
                if (safeSplash.length > 30000) safeSplash = '';

                const ghRes = await fetch(dispatchUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github+json',
                        'User-Agent': 'Sheet2Apk-Local-Dev',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        ref: 'main',
                        inputs: {
                            app_name: body.app_name || 'Planilha App',
                            app_url: body.app_url || 'https://appassets.androidplatform.net/index.html',
                            build_mode: build_mode,
                            source_tag: source_tag,
                            package_name: body.package_name || 'com.sheet.app',
                            theme_color: body.theme_color || '#0F9D58',
                            icon_base64: safeIcon,
                            orientation: body.orientation || 'auto',
                            perm_location: String(body.perm_location || 'false'),
                            perm_camera: String(body.perm_camera || 'false'),
                            perm_mic: String(body.perm_mic || 'false'),
                            keep_screen_on: String(body.keep_screen_on || 'false'),
                            fullscreen: String(body.fullscreen || 'false'),
                            pull_to_refresh: String(body.pull_to_refresh ?? 'true'),
                            splash_base64: safeSplash,
                            splash_type: body.splash_type || 'none',
                            build_id: build_id
                        }
                    })
                });

                if (!ghRes.ok) {
                    const err = await ghRes.text();
                    res.writeHead(ghRes.status, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: `GitHub API Erro (${ghRes.status}): ${err}` }));
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, build_id, build_mode, repo }));

            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // Endpoint Local: /api/status
    if (url.pathname === '/api/status' && req.method === 'GET') {
        try {
            const build_id = url.searchParams.get('build_id');
            const repo = process.env.GITHUB_REPO || url.searchParams.get('repo');
            const token = process.env.GITHUB_TOKEN || url.searchParams.get('token');

            if (!build_id || !repo) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Parâmetros incompletos' }));
            }

            const headers = { 'User-Agent': 'Sheet2Apk-Local-Dev', 'Accept': 'application/vnd.github+json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            // Consulta Release
            const releaseRes = await fetch(`https://api.github.com/repos/${repo}/releases/tags/v${build_id}`, { headers });
            if (releaseRes.ok) {
                const releaseData = await releaseRes.json();
                const apk = releaseData.assets?.find(a => a.name.endsWith('.apk'));
                if (apk) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({
                        status: 'completed',
                        download_url: apk.browser_download_url,
                        filename: apk.name,
                        size: (apk.size / (1024 * 1024)).toFixed(2) + ' MB'
                    }));
                }
            }

            // Consulta Runs
            const runsRes = await fetch(`https://api.github.com/repos/${repo}/actions/runs?event=workflow_dispatch&per_page=5`, { headers });
            if (runsRes.ok) {
                const runsData = await runsRes.json();
                const latest = runsData.workflow_runs?.[0];
                if (latest) {
                    if (latest.status === 'in_progress' || latest.status === 'queued') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ status: 'building', run_url: latest.html_url }));
                    }
                    if (latest.conclusion === 'failure') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ status: 'failed', error: 'O build falhou no GitHub Actions', run_url: latest.html_url }));
                    }
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'queued' }));

        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Servir arquivos estáticos (HTML, CSS, JS)
    let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
    const ext = path.extname(filePath).toLowerCase();

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Erro no servidor: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Sheet2APK rodando com sucesso!`);
    console.log(`👉 Acesse no seu navegador: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
});
