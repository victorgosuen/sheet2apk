/**
 * Cloudflare Pages Function: /api/status
 * Consulta o progresso do build e retorna o link direto do APK quando pronto
 */
export async function onRequestGet(context) {
    try {
        const url = new URL(context.request.url);
        const build_id = url.searchParams.get('build_id');
        const client_repo = url.searchParams.get('repo');
        const client_token = url.searchParams.get('token');

        if (!build_id) {
            return new Response(JSON.stringify({ error: 'Parâmetro build_id ausente' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const token = context.env?.GITHUB_TOKEN || client_token;
        const repoFullName = context.env?.GITHUB_REPO || client_repo;

        if (!repoFullName) {
            return new Response(JSON.stringify({ error: 'Repositório não configurado' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const headers = {
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'Cloudflare-Pages-Apk-Builder'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // 1. Tenta verificar se a Release correspondente à tag v{build_id} já existe
        const releaseUrl = `https://api.github.com/repos/${repoFullName}/releases/tags/v${build_id}`;
        const releaseRes = await fetch(releaseUrl, { headers });

        if (releaseRes.ok) {
            const releaseData = await releaseRes.json();
            const apkAsset = releaseData.assets?.find(a => a.name.endsWith('.apk'));

            if (apkAsset) {
                return new Response(JSON.stringify({
                    status: 'completed',
                    download_url: apkAsset.browser_download_url,
                    filename: apkAsset.name,
                    size: (apkAsset.size / (1024 * 1024)).toFixed(2) + ' MB',
                    release_url: releaseData.html_url
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // 2. Se a release ainda não existe, verifica o status dos runs no GitHub Actions
        const runsUrl = `https://api.github.com/repos/${repoFullName}/actions/runs?event=workflow_dispatch&per_page=5`;
        const runsRes = await fetch(runsUrl, { headers });

        if (runsRes.ok) {
            const runsData = await runsRes.json();
            const latestRun = runsData.workflow_runs?.[0];

            if (latestRun) {
                if (latestRun.status === 'in_progress' || latestRun.status === 'queued') {
                    return new Response(JSON.stringify({
                        status: 'building',
                        stage: latestRun.status === 'queued' ? 'Na fila de espera...' : 'Compilando APK com Gradle...',
                        run_url: latestRun.html_url
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                if (latestRun.conclusion === 'failure') {
                    return new Response(JSON.stringify({
                        status: 'failed',
                        error: 'A compilação falhou no GitHub Actions. Verifique os logs de execução.',
                        run_url: latestRun.html_url
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            }
        }

        // Status inicial de início
        return new Response(JSON.stringify({
            status: 'queued',
            stage: 'Inicializando máquina virtual e compilador...'
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message || 'Erro ao consultar status' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
