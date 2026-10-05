/**
 * Sheet2APK - Client-side Controller & Mockup Sync
 */

document.addEventListener('DOMContentLoaded', () => {
    // Form Elements
    const apkForm = document.getElementById('apkForm');
    const appNameInput = document.getElementById('appName');
    const appUrlInput = document.getElementById('appUrl');
    const themeColorInput = document.getElementById('themeColor');
    const colorHexText = document.getElementById('colorHexText');
    const colorPresets = document.querySelectorAll('.color-preset');
    const packageNameInput = document.getElementById('packageName');
    const iconFileInput = document.getElementById('iconFileInput');
    const dropZone = document.getElementById('dropZone');
    const iconPreviewImg = document.getElementById('iconPreviewImg');
    const iconPlaceholder = document.getElementById('iconPlaceholder');

    // Phone Mockup Elements
    const mockupTitle = document.getElementById('mockupTitle');
    const mockupHeader = document.getElementById('mockupHeader');
    const mockupStatusBar = document.getElementById('mockupStatusBar');
    const mockupFab = document.getElementById('mockupFab');
    const mockupAppIcon = document.getElementById('mockupAppIcon');

    // Modals & Buttons
    const btnHelp = document.getElementById('btnHelp');
    const helpModal = document.getElementById('helpModal');
    const btnCloseHelp = document.getElementById('btnCloseHelp');

    const btnSettings = document.getElementById('btnSettings');
    const settingsModal = document.getElementById('settingsModal');
    const btnCloseSettings = document.getElementById('btnCloseSettings');
    const btnSaveSettings = document.getElementById('btnSaveSettings');
    const cfgRepoInput = document.getElementById('cfgRepo');
    const cfgTokenInput = document.getElementById('cfgToken');

    const buildModal = document.getElementById('buildModal');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const loaderBox = document.getElementById('loaderBox');
    const successBox = document.getElementById('successBox');
    const errorBox = document.getElementById('errorBox');
    const btnDownloadApk = document.getElementById('btnDownloadApk');
    const qrCodeImg = document.getElementById('qrCodeImg');
    const apkDetailsText = document.getElementById('apkDetailsText');
    const errorMessage = document.getElementById('errorMessage');
    const errorLogsLink = document.getElementById('errorLogsLink');

    let currentIconBase64 = "";
    let pollInterval = null;

    // 1. Carregar Configurações salvas do LocalStorage
    cfgRepoInput.value = localStorage.getItem('sheet2apk_repo') || '';
    cfgTokenInput.value = localStorage.getItem('sheet2apk_token') || '';

    btnSaveSettings.addEventListener('click', () => {
        localStorage.setItem('sheet2apk_repo', cfgRepoInput.value.trim());
        localStorage.setItem('sheet2apk_token', cfgTokenInput.value.trim());
        settingsModal.classList.remove('open');
        alert('Configurações salvas com sucesso!');
    });

    // 2. Sincronização ao Vivo do Mockup
    appNameInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        mockupTitle.textContent = val || "Minha Planilha App";
    });

    function applyThemeColor(hex) {
        themeColorInput.value = hex;
        colorHexText.textContent = hex.toUpperCase();
        mockupHeader.style.background = hex;
        mockupFab.style.background = hex;

        // Calcula tom mais escuro para a status bar
        const darkened = darkenColor(hex, 0.75);
        mockupStatusBar.style.background = darkened;
    }

    themeColorInput.addEventListener('input', (e) => {
        applyThemeColor(e.target.value);
        colorPresets.forEach(btn => btn.classList.remove('active'));
    });

    colorPresets.forEach(btn => {
        btn.addEventListener('click', () => {
            colorPresets.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const color = btn.getAttribute('data-color');
            applyThemeColor(color);
        });
    });

    function darkenColor(hex, factor) {
        let cleanHex = hex.replace('#', '');
        if (cleanHex.length === 3) {
            cleanHex = cleanHex.split('').map(c => c + c).join('');
        }
        const num = parseInt(cleanHex, 16);
        const r = Math.max(0, Math.floor(((num >> 16) & 255) * factor));
        const g = Math.max(0, Math.floor(((num >> 8) & 255) * factor));
        const b = Math.max(0, Math.floor((num & 255) * factor));
        return `rgb(${r}, ${g}, ${b})`;
    }

    // 3. Processamento e Preview do Ícone
    function handleIconFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            alert('Por favor, selecione um arquivo de imagem válido (PNG ou JPG).');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            currentIconBase64 = e.target.result;
            iconPreviewImg.src = currentIconBase64;
            iconPreviewImg.style.display = 'block';
            iconPlaceholder.style.display = 'none';

            // Atualiza o mockup
            mockupAppIcon.innerHTML = `<img src="${currentIconBase64}" alt="App Icon">`;
        };
        reader.readAsDataURL(file);
    }

    iconFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleIconFile(e.target.files[0]);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleIconFile(e.dataTransfer.files[0]);
        }
    });

    // 4. Modais
    btnHelp.addEventListener('click', () => helpModal.classList.add('open'));
    btnCloseHelp.addEventListener('click', () => helpModal.classList.remove('open'));

    btnSettings.addEventListener('click', () => settingsModal.classList.add('open'));
    btnCloseSettings.addEventListener('click', () => settingsModal.classList.remove('open'));

    btnCloseModal.addEventListener('click', () => {
        if (pollInterval) clearInterval(pollInterval);
        buildModal.classList.remove('open');
    });

    window.addEventListener('click', (e) => {
        if (e.target === helpModal) helpModal.classList.remove('open');
        if (e.target === settingsModal) settingsModal.classList.remove('open');
    });

    // 5. Envio do Formulário e Disparo do Build
    apkForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const appName = appNameInput.value.trim();
        const appUrl = appUrlInput.value.trim();
        const packageName = packageNameInput.value.trim() || 'com.app.planilha';
        const themeColor = themeColorInput.value;
        const clientRepo = localStorage.getItem('sheet2apk_repo') || '';
        const clientToken = localStorage.getItem('sheet2apk_token') || '';

        if (!appUrl.startsWith('http')) {
            alert('A URL deve começar com http:// ou https://');
            return;
        }

        // Abre o modal de progresso
        buildModal.classList.add('open');
        resetBuildUI();
        setStep(1);

        try {
            // Tenta chamar a API do Cloudflare Pages (/api/build)
            // Se falhar ou estiver em servidor local estático, tenta fallback direto para o GitHub se tiver token
            let buildData = null;

            try {
                const res = await fetch('/api/build', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        app_name: appName,
                        app_url: appUrl,
                        package_name: packageName,
                        theme_color: themeColor,
                        icon_base64: currentIconBase64,
                        client_repo: clientRepo,
                        client_token: clientToken
                    })
                });

                if (res.ok) {
                    buildData = await res.json();
                } else {
                    const err = await res.json().catch(() => ({ error: 'Erro na resposta do servidor' }));
                    throw new Error(err.error || `Erro HTTP ${res.status}`);
                }
            } catch (apiErr) {
                // Fallback Direto para GitHub API se o usuário tiver configurado Token no navegador
                if (clientRepo && clientToken) {
                    console.log("Executando fallback direto via GitHub API...");
                    buildData = await triggerGitHubDirectly({
                        app_name: appName,
                        app_url: appUrl,
                        package_name: packageName,
                        theme_color: themeColor,
                        icon_base64: currentIconBase64,
                        repo: clientRepo,
                        token: clientToken
                    });
                } else {
                    throw apiErr;
                }
            }

            if (!buildData || !buildData.build_id) {
                throw new Error('Falha ao obter ID de compilação');
            }

            const buildId = buildData.build_id;
            const targetRepo = buildData.repo || clientRepo;

            setStep(2);

            // Inicia verificação periódica de status
            let startTime = Date.now();
            pollInterval = setInterval(async () => {
                const elapsedSec = Math.floor((Date.now() - startTime) / 1000);

                if (elapsedSec > 18) {
                    setStep(3); // Compilando com Gradle
                }

                await checkBuildStatus(buildId, targetRepo, clientToken, appName);
            }, 5000);

        } catch (err) {
            showError("Erro ao iniciar compilação", err.message);
        }
    });

    // Fallback direto via GitHub REST API para testes locais
    async function triggerGitHubDirectly(params) {
        const buildId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        const url = `https://api.github.com/repos/${params.repo}/actions/workflows/build-apk.yml/dispatches`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${params.token}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ref: 'main',
                inputs: {
                    app_name: params.app_name,
                    app_url: params.app_url,
                    package_name: params.package_name,
                    theme_color: params.theme_color,
                    icon_base64: params.icon_base64,
                    build_id: buildId
                }
            })
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Falha no GitHub (${res.status}): ${err}`);
        }

        return { success: true, build_id: buildId, repo: params.repo };
    }

    // Consulta periódica de status
    async function checkBuildStatus(buildId, repo, token, appName) {
        try {
            // Tenta consultar via /api/status ou diretamente no GitHub
            let data = null;

            try {
                const res = await fetch(`/api/status?build_id=${buildId}&repo=${encodeURIComponent(repo)}&token=${encodeURIComponent(token || '')}`);
                if (res.ok) {
                    data = await res.json();
                }
            } catch (e) {
                // Fallback direto ao GitHub
            }

            if (!data) {
                // Consulta direta à Release do GitHub
                const releaseUrl = `https://api.github.com/repos/${repo}/releases/tags/v${buildId}`;
                const rRes = await fetch(releaseUrl, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });

                if (rRes.ok) {
                    const rData = await rRes.json();
                    const apkAsset = rData.assets?.find(a => a.name.endsWith('.apk'));
                    if (apkAsset) {
                        data = {
                            status: 'completed',
                            download_url: apkAsset.browser_download_url,
                            filename: apkAsset.name,
                            size: (apkAsset.size / (1024 * 1024)).toFixed(2) + ' MB'
                        };
                    }
                }
            }

            if (data && data.status === 'completed' && data.download_url) {
                clearInterval(pollInterval);
                setStep(4);
                showSuccess(data, appName);
            } else if (data && data.status === 'failed') {
                clearInterval(pollInterval);
                showError("Compilação Falhou", data.error || "O processo de compilação falhou no Gradle.", data.run_url);
            }

        } catch (err) {
            console.warn("Aguardando compilação...", err);
        }
    }

    function setStep(stepNum) {
        for (let i = 1; i <= 4; i++) {
            const el = document.getElementById(`step${i}`);
            if (i < stepNum) {
                el.classList.remove('active');
                el.classList.add('completed');
                el.querySelector('.step-bullet').innerHTML = '✓';
            } else if (i === stepNum) {
                el.classList.add('active');
                el.classList.remove('completed');
                el.querySelector('.step-bullet').innerHTML = i;
            } else {
                el.classList.remove('active', 'completed');
                el.querySelector('.step-bullet').innerHTML = i;
            }
        }
    }

    function resetBuildUI() {
        loaderBox.style.display = 'flex';
        document.querySelector('.build-steps').style.display = 'flex';
        successBox.style.display = 'none';
        errorBox.style.display = 'none';
        document.getElementById('modalTitle').textContent = "Compilando seu Aplicativo";
    }

    function showSuccess(data, appName) {
        loaderBox.style.display = 'none';
        document.querySelector('.build-steps').style.display = 'none';
        successBox.style.display = 'block';
        document.getElementById('modalTitle').textContent = "APK Gerado com Sucesso!";

        btnDownloadApk.href = data.download_url;
        apkDetailsText.textContent = `${data.filename || appName + '.apk'} • Tamanho: ${data.size || 'Nativo'}`;

        // Gera QR Code via serviço público leve
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data.download_url)}`;
        qrCodeImg.src = qrUrl;
    }

    function showError(title, msg, runUrl) {
        loaderBox.style.display = 'none';
        document.querySelector('.build-steps').style.display = 'none';
        errorBox.style.display = 'block';
        document.getElementById('modalTitle').textContent = "Ocorreu um Problema";

        document.getElementById('errorTitle').textContent = title;
        errorMessage.textContent = msg;

        if (runUrl) {
            errorLogsLink.href = runUrl;
            errorLogsLink.style.display = 'inline-block';
        } else {
            errorLogsLink.style.display = 'none';
        }
    }
});
