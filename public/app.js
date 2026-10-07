/**
 * Sheet2APK - Client-side Controller & Mockup Sync
 * Suporte completo a:
 * - Arrastar pastas inteiras diretamente com compactação in-browser (JSZip)
 * - Tela de Abertura (Splash Screen) com Lottie JSON e Imagens
 * - Trava de Rotação de Tela (Auto, Retrato, Paisagem)
 * - Permissões Granulares (GPS, Câmera, Microfone)
 * - Comportamentos de Tela (Keep Screen On, Fullscreen, Pull-to-refresh)
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
    const btnUniquePackage = document.getElementById('btnUniquePackage');
    let packageManuallyEdited = false;
    const iconFileInput = document.getElementById('iconFileInput');
    const dropZone = document.getElementById('dropZone');
    const iconPreviewImg = document.getElementById('iconPreviewImg');
    const iconPlaceholder = document.getElementById('iconPlaceholder');

    // Phone Mockup Elements
    const phoneFrame = document.getElementById('phoneFrame');
    const mockupTitle = document.getElementById('mockupTitle');
    const mockupHeader = document.getElementById('mockupHeader');
    const mockupStatusBar = document.getElementById('mockupStatusBar');
    const mockupFab = document.getElementById('mockupFab');
    const mockupAppIcon = document.getElementById('mockupAppIcon');
    const btnTestSplash = document.getElementById('btnTestSplash');
    const mockupSplashOverlay = document.getElementById('mockupSplashOverlay');
    const mockupSplashAppName = document.getElementById('mockupSplashAppName');
    const mockupSplashIcon = document.getElementById('mockupSplashIcon');

    // Advanced Settings & Inputs
    const screenOrientation = document.getElementById('screenOrientation');
    const chkKeepScreenOn = document.getElementById('chkKeepScreenOn');
    const chkFullscreen = document.getElementById('chkFullscreen');
    const chkPullToRefresh = document.getElementById('chkPullToRefresh');
    const chkPermLocation = document.getElementById('chkPermLocation');
    const chkPermCamera = document.getElementById('chkPermCamera');
    const chkPermMic = document.getElementById('chkPermMic');

    // Splash Screen Elements
    const splashFileInput = document.getElementById('splashFileInput');
    const splashDropZone = document.getElementById('splashDropZone');
    const btnSelectSplash = document.getElementById('btnSelectSplash');
    const btnRemoveSplash = document.getElementById('btnRemoveSplash');
    const splashTitle = document.getElementById('splashTitle');
    const splashSub = document.getElementById('splashSub');
    const splashPreviewImg = document.getElementById('splashPreviewImg');
    const splashPlaceholder = document.getElementById('splashPlaceholder');

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

    // Modos de Origem (URL vs Pasta/Diretório)
    const tabModeUrl = document.getElementById('tabModeUrl');
    const tabModeDir = document.getElementById('tabModeDir');
    const groupUrlMode = document.getElementById('groupUrlMode');
    const groupDirMode = document.getElementById('groupDirMode');
    
    // Pasta / ZIP Dropzone
    const folderDropZone = document.getElementById('folderDropZone');
    const folderPicker = document.getElementById('folderPicker');
    const zipFileInput = document.getElementById('zipFileInput');
    const btnSelectFolder = document.getElementById('btnSelectFolder');
    const btnSelectZip = document.getElementById('btnSelectZip');
    const dirStatusTitle = document.getElementById('dirStatusTitle');
    const dirStatusSub = document.getElementById('dirStatusSub');
    const dirHelpText = document.getElementById('dirHelpText');

    let activeMode = 'url';
    let currentZipBase64 = '';
    let currentIconBase64 = '';
    let currentSplashBase64 = '';
    let currentSplashType = 'none'; // 'none', 'lottie', 'image'
    let pollInterval = null;

    // Alternar entre modo URL e modo Pasta/Diretório
    tabModeUrl.addEventListener('click', () => {
        activeMode = 'url';
        tabModeUrl.classList.add('active');
        tabModeDir.classList.remove('active');
        groupUrlMode.style.display = 'flex';
        groupDirMode.style.display = 'none';
    });

    tabModeDir.addEventListener('click', () => {
        activeMode = 'directory';
        tabModeDir.classList.add('active');
        tabModeUrl.classList.remove('active');
        groupUrlMode.style.display = 'none';
        groupDirMode.style.display = 'flex';
    });

    // ==========================================
    // 1. PROCESSAMENTO DE PASTAS DIRETAS (JSZip)
    // ==========================================
    btnSelectFolder.addEventListener('click', () => folderPicker.click());
    btnSelectZip.addEventListener('click', () => zipFileInput.click());

    folderPicker.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files.length > 0) {
            await processFileList(Array.from(e.target.files), 'Pasta Selecionada');
        }
    });

    zipFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleDirectZipFile(e.target.files[0]);
        }
    });

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>'"]/g, tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag));
    }

    async function analyzeAndAutoConfigure(files) {
        const detected = {
            geo: false,
            camera: false,
            mic: false,
            map: false,
            wakelock: false,
            iconFound: false,
            splashFound: false,
            appName: null
        };

        const textExtensions = ['.html', '.htm', '.js', '.mjs', '.json', '.geojson', '.kml'];

        for (const file of files) {
            const pathLower = (file.customRelativePath || file.webkitRelativePath || file.name).toLowerCase().replace(/\\/g, '/');

            // Ignorar pastas gigantes de dependências
            if (pathLower.includes('node_modules/') || pathLower.includes('.git/') || pathLower.includes('.vscode/')) continue;

            // 1. Detecção de Ícone automático se ainda não selecionou
            if (!currentIconBase64 && (pathLower.endsWith('icon.png') || pathLower.endsWith('icone.png') || pathLower.endsWith('logo.png') || pathLower.endsWith('favicon.png'))) {
                try {
                    handleIconFile(file);
                    detected.iconFound = true;
                } catch (e) {}
            }

            // 2. Detecção de Splash Screen automática se não selecionou
            if (currentSplashType === 'none') {
                if (pathLower.endsWith('splash.json') || pathLower.endsWith('.sheet2apk/splash.json')) {
                    try {
                        const text = await file.text();
                        const parsed = JSON.parse(text);
                        currentSplashBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(parsed))));
                        currentSplashType = 'lottie';
                        splashTitle.textContent = file.name;
                        splashSub.textContent = `✨ Splash Lottie detectada automaticamente!`;
                        btnRemoveSplash.style.display = 'flex';
                        splashDropZone.classList.add('has-file');
                        mockupSplashIcon.innerHTML = `<div style="font-size: 2.2rem;">✨</div>`;
                        detected.splashFound = true;
                    } catch (e) {}
                }
            }

            // 3. Detecção de Nome pelo <title> do index.html
            if (pathLower.endsWith('index.html')) {
                try {
                    const htmlText = await file.text();
                    const titleMatch = htmlText.match(/<title>(.*?)<\/title>/i);
                    if (titleMatch && titleMatch[1]) {
                        const cleanTitle = titleMatch[1].replace(/[•\-_]/g, ' ').replace(/\s+/g, ' ').trim();
                        if (cleanTitle && cleanTitle.length > 1) {
                            detected.appName = cleanTitle;
                        }
                    }
                } catch (e) {}
            }

            // 4. Detecção de Geometrias e KML/GeoJSON
            if (pathLower.endsWith('.kml') || pathLower.endsWith('.geojson') || pathLower.endsWith('pontos.json')) {
                detected.geo = true;
                detected.map = true;
            }

            // 5. Varredura textual em arquivos JS/HTML pequenos (< 2.5 MB)
            if (file.size < 2.5 * 1024 * 1024 && textExtensions.some(ext => pathLower.endsWith(ext))) {
                try {
                    const content = (await file.text()).toLowerCase();

                    // GPS / Localização / Mapas
                    if (['geolocation', 'getcurrentposition', 'watchposition', 'coordinates', 'latitude', 'longitude', 'pontos.json', 'gps'].some(k => content.includes(k))) {
                        detected.geo = true;
                    }
                    if (['maplibre', 'leaflet', 'mapboxgl', 'openlayers', 'google.maps', 'ol.map', 'l.map'].some(k => content.includes(k))) {
                        detected.map = true;
                        detected.geo = true;
                    }

                    // Câmera / Upload de Fotos / Seletor de Arquivos
                    if (['getusermedia', 'mediadevices', 'capture=', 'camera', 'foto', 'photo', 'picture', 'tirar foto', 'type="file"', "type='file'", 'accept="image', "accept='image", 'image/*'].some(k => content.includes(k))) {
                        detected.camera = true;
                    }

                    // Microfone / Áudio
                    if (['record_audio', 'mediarecorder', 'audiocontext', 'webkitaudiocontext', 'speechrecognition'].some(k => content.includes(k))) {
                        detected.mic = true;
                    }

                    // Manter Tela Acesa
                    if (content.includes('wakelock')) {
                        detected.wakelock = true;
                    }
                } catch (e) {}
            }
        }

        // Aplica as permissões detectadas automaticamente
        const badgesHtml = [];

        if (detected.appName && (!appNameInput.value || appNameInput.value === 'Minha Planilha' || appNameInput.value === 'Planilha App' || appNameInput.value === 'Meu App')) {
            appNameInput.value = detected.appName;
            const uniqueSlug = slugifyPackage(detected.appName);
            packageNameInput.value = uniqueSlug;
            packageManuallyEdited = true;
            badgesHtml.push(`<span class="analysis-badge active">🏷️ Nome: <b>${escapeHtml(detected.appName)}</b></span>`);
            badgesHtml.push(`<span class="analysis-badge active">📦 ID Único: <b>${escapeHtml(uniqueSlug)}</b></span>`);
        }

        if (detected.geo || detected.map) {
            chkPermLocation.checked = true;
            badgesHtml.push(`<span class="analysis-badge active">📍 Localização GPS</span>`);
        }

        if (detected.camera) {
            chkPermCamera.checked = true;
            badgesHtml.push(`<span class="analysis-badge active">📸 Câmera & Galeria</span>`);
        }

        if (detected.mic) {
            chkPermMic.checked = true;
            badgesHtml.push(`<span class="analysis-badge active">🎤 Microfone</span>`);
        }

        if (detected.wakelock) {
            chkKeepScreenOn.checked = true;
            badgesHtml.push(`<span class="analysis-badge active">⚡ Manter Tela Acesa</span>`);
        }

        if (detected.map) {
            chkPullToRefresh.checked = false;
            badgesHtml.push(`<span class="analysis-badge active">🗺️ Otimização para Mapa (Anti-conflito)</span>`);
        }

        if (detected.iconFound) {
            badgesHtml.push(`<span class="analysis-badge active">🖼️ Ícone Configurado</span>`);
        }

        if (detected.splashFound) {
            badgesHtml.push(`<span class="analysis-badge active">✨ Splash Screen Configurada</span>`);
        }

        return `
            <div class="analysis-card">
                <div class="analysis-header">
                    <span>🔍</span> Análise Automática Inteligente da Pasta:
                </div>
                <div class="analysis-badges">
                    ${badgesHtml.length ? badgesHtml.join('') : '<span class="analysis-badge">✓ Arquivos verificados com sucesso</span>'}
                </div>
                <div style="font-size:0.75rem; color:var(--text-hint); margin-top:2px;">
                    Recursos prováveis detectados. Projetos com package.json e script build serão compilados; serviços externos precisam continuar acessíveis.
                </div>
            </div>
        `;
    }

    async function handleDirectZipFile(file) {
        if (!file || !file.name.toLowerCase().endsWith('.zip')) {
            alert('Por favor, selecione um arquivo compactado no formato .ZIP');
            return;
        }
        dirStatusTitle.textContent = 'Lendo e analisando arquivo ZIP...';
        dirStatusSub.textContent = file.name;

        if (window.JSZip) {
            try {
                const zip = await JSZip.loadAsync(file);
                const fakeFiles = [];
                for (const [relPath, zipEntry] of Object.entries(zip.files)) {
                    if (zipEntry.dir) continue;
                    fakeFiles.push({
                        name: relPath.split('/').pop(),
                        customRelativePath: relPath,
                        size: 1024,
                        text: () => zipEntry.async('text'),
                        type: relPath.endsWith('.png') ? 'image/png' : 'text/plain'
                    });
                }
                const analysisReportHtml = await analyzeAndAutoConfigure(fakeFiles);
                dirHelpText.innerHTML = analysisReportHtml;
            } catch (zipErr) {
                console.warn('Não foi possível analisar o interior do ZIP:', zipErr);
            }
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            currentZipBase64 = e.target.result;
            dirStatusTitle.textContent = file.name;
            const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
            dirStatusSub.textContent = `Arquivo carregado (${sizeMb} MB) • Pronto para preparar o aplicativo!`;
            folderDropZone.classList.add('file-selected');
        };
        reader.readAsDataURL(file);
    }

    // Leitura recursiva de entradas de diretório arrastadas (webkitGetAsEntry)
    async function readEntryRecursively(entry, path = '') {
        const files = [];
        if (entry.isFile) {
            const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
            file.customRelativePath = path + file.name;
            files.push(file);
        } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            const entries = await new Promise((resolve, reject) => {
                const results = [];
                const readBatch = () => {
                    dirReader.readEntries((batch) => {
                        if (!batch.length) {
                            resolve(results);
                        } else {
                            results.push(...batch);
                            readBatch();
                        }
                    }, reject);
                };
                readBatch();
            });

            for (const childEntry of entries) {
                const nested = await readEntryRecursively(childEntry, path + entry.name + '/');
                files.push(...nested);
            }
        }
        return files;
    }

    async function processFileList(files, folderName = 'Pasta Arrastada') {
        if (!window.JSZip) {
            alert('Biblioteca JSZip ainda não foi carregada. Tente novamente em instantes.');
            return;
        }

        if (!files.length) return;

        dirStatusTitle.textContent = 'Analisando e compactando arquivos...';
        dirStatusSub.textContent = `Processando ${files.length} arquivos...`;
        folderDropZone.classList.add('drag-over');

        try {
            const zip = new JSZip();
            let hasIndexHtml = false;

            // Filtra e compacta apenas os arquivos relevantes (ignora node_modules gigantes e .git)
            for (const file of files) {
                const relPath = file.customRelativePath || file.webkitRelativePath || file.name;
                const normalized = relPath.replace(/\\/g, '/');

                if (normalized.includes('node_modules/') || normalized.includes('.git/') || normalized.includes('.vscode/')) {
                    continue;
                }

                if (normalized.toLowerCase().endsWith('index.html')) {
                    hasIndexHtml = true;
                }

                zip.file(normalized, file);
            }

            if (!hasIndexHtml) {
                dirHelpText.innerHTML = '<span style="color: #F59E0B;">⚠️ Nenhum arquivo <code>index.html</code> foi encontrado na raiz da pasta. Certifique-se de que o ponto de entrada principal exista.</span>';
            }

            // Análise Inteligente e Automática de Permissões e Recursos
            dirStatusSub.textContent = `Identificando permissões e recursos da aplicação...`;
            const analysisReportHtml = await analyzeAndAutoConfigure(files);

            // Gerar ZIP em base64 com compressão
            const zipBase64 = await zip.generateAsync({
                type: 'base64',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            }, (meta) => {
                dirStatusSub.textContent = `Compactando: ${meta.percent.toFixed(0)}%`;
            });

            currentZipBase64 = 'data:application/zip;base64,' + zipBase64;
            const approxSizeMb = ((zipBase64.length * 0.75) / (1024 * 1024)).toFixed(2);

            dirStatusTitle.textContent = folderName;
            dirStatusSub.textContent = `${files.length} arquivos compactados (${approxSizeMb} MB) • Pronto para gerar APK!`;
            folderDropZone.classList.remove('drag-over');
            folderDropZone.classList.add('file-selected');

            dirHelpText.innerHTML = analysisReportHtml;

        } catch (err) {
            console.error(err);
            dirStatusTitle.textContent = 'Erro ao processar pasta';
            dirStatusSub.textContent = err.message;
            folderDropZone.classList.remove('drag-over');
        }
    }

    // Drag and Drop para Pastas e ZIPs
    folderDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        folderDropZone.classList.add('drag-over');
    });

    folderDropZone.addEventListener('dragleave', () => {
        folderDropZone.classList.remove('drag-over');
    });

    folderDropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        folderDropZone.classList.remove('drag-over');

        const items = e.dataTransfer.items;
        if (items && items.length > 0) {
            const firstItem = items[0];
            const entry = firstItem.webkitGetAsEntry ? firstItem.webkitGetAsEntry() : null;

            if (entry && entry.isDirectory) {
                const folderFiles = await readEntryRecursively(entry);
                await processFileList(folderFiles, entry.name);
                return;
            }
        }

        // Se soltou um arquivo ZIP diretamente
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.name.toLowerCase().endsWith('.zip')) {
                handleDirectZipFile(file);
            } else {
                await processFileList(Array.from(e.dataTransfer.files), 'Arquivos Arrastados');
            }
        }
    });

    // ==========================================
    // 2. TELA DE ABERTURA / SPLASH SCREEN CUSTOM
    // ==========================================
    btnSelectSplash.addEventListener('click', () => splashFileInput.click());

    function handleSplashFile(file) {
        if (!file) return;

        const isJson = file.name.toLowerCase().endsWith('.json');
        const isImg = file.type.startsWith('image/');

        if (!isJson && !isImg) {
            alert('Por favor, selecione um arquivo JSON de animação Lottie (.json) ou imagem (.png, .jpg).');
            return;
        }

        if (isJson) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const parsed = JSON.parse(text);
                    const minified = JSON.stringify(parsed);
                    
                    // Converte para base64 UTF-8 seguro
                    currentSplashBase64 = btoa(unescape(encodeURIComponent(minified)));
                    currentSplashType = 'lottie';

                    splashTitle.textContent = file.name;
                    splashSub.textContent = `✨ Animação Lottie JSON (${(file.size / 1024).toFixed(1)} KB) configurada!`;
                    splashPlaceholder.innerHTML = `<span style="font-size:1.5rem">✨</span>`;
                    splashPreviewImg.style.display = 'none';
                    btnRemoveSplash.style.display = 'flex';
                    splashDropZone.classList.add('has-file');

                    // Atualiza ícone da splash no mockup
                    mockupSplashIcon.innerHTML = `<div style="font-size: 2.2rem;">✨</div>`;
                } catch (jsonErr) {
                    alert('Arquivo JSON inválido. Verifique o arquivo Lottie.');
                }
            };
            reader.readAsText(file);
        } else if (isImg) {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxDim = 512;
                let w = img.width;
                let h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round((h * maxDim) / w);
                        w = maxDim;
                    } else {
                        w = Math.round((w * maxDim) / h);
                        h = maxDim;
                    }
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                let base64 = canvas.toDataURL('image/png');
                if (base64.length > 35000) {
                    base64 = canvas.toDataURL('image/jpeg', 0.85);
                }

                currentSplashBase64 = base64;
                currentSplashType = 'image';

                splashPreviewImg.src = base64;
                splashPreviewImg.style.display = 'block';
                splashPlaceholder.style.display = 'none';
                splashTitle.textContent = file.name;
                splashSub.textContent = `🖼️ Imagem Estática (${w}x${h}px) configurada!`;
                btnRemoveSplash.style.display = 'flex';
                splashDropZone.classList.add('has-file');

                // Atualiza mockup
                mockupSplashIcon.innerHTML = `<img src="${base64}" alt="Splash Preview">`;
            };
            img.src = URL.createObjectURL(file);
        }
    }

    splashFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleSplashFile(e.target.files[0]);
        }
    });

    splashDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        splashDropZone.classList.add('drag-over');
    });

    splashDropZone.addEventListener('dragleave', () => {
        splashDropZone.classList.remove('drag-over');
    });

    splashDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        splashDropZone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleSplashFile(e.dataTransfer.files[0]);
        }
    });

    btnRemoveSplash.addEventListener('click', () => {
        currentSplashBase64 = '';
        currentSplashType = 'none';
        splashFileInput.value = '';
        splashTitle.textContent = 'Animação Lottie (.json) ou Imagem';
        splashSub.textContent = 'Exibida durante o carregamento inicial do aplicativo';
        splashPreviewImg.style.display = 'none';
        splashPlaceholder.style.display = 'flex';
        splashPlaceholder.innerHTML = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
        btnRemoveSplash.style.display = 'none';
        splashDropZone.classList.remove('has-file');
        mockupSplashIcon.innerHTML = `<svg viewBox="0 0 24 24" width="36" height="36" fill="white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    });

    // Testar Splash Screen no Mockup
    btnTestSplash.addEventListener('click', () => {
        mockupSplashAppName.textContent = appNameInput.value.trim() || 'Minha Planilha App';
        mockupSplashOverlay.style.background = themeColorInput.value;
        mockupSplashOverlay.classList.add('show');

        setTimeout(() => {
            mockupSplashOverlay.classList.remove('show');
        }, 2500);
    });

    // ==========================================
    // 3. SINCRONIZAÇÃO DE ROTAÇÃO E TELA
    // ==========================================
    screenOrientation.addEventListener('change', (e) => {
        if (e.target.value === 'landscape') {
            phoneFrame.classList.add('landscape-mode');
        } else {
            phoneFrame.classList.remove('landscape-mode');
        }
    });

    chkFullscreen.addEventListener('change', (e) => {
        mockupStatusBar.style.display = e.target.checked ? 'none' : 'flex';
    });

    // ==========================================
    // 4. CONFIGURAÇÕES GITHUB LOCALSTORAGE
    // ==========================================
    cfgRepoInput.value = localStorage.getItem('sheet2apk_repo') || '';
    cfgTokenInput.value = localStorage.getItem('sheet2apk_token') || '';

    btnSaveSettings.addEventListener('click', () => {
        localStorage.setItem('sheet2apk_repo', cfgRepoInput.value.trim());
        localStorage.setItem('sheet2apk_token', cfgTokenInput.value.trim());
        settingsModal.classList.remove('open');
        alert('Configurações salvas com sucesso!');
    });

    // ==========================================
    // 5. SINCRONIZAÇÃO VISUAL DO MOCKUP
    // ==========================================
    function slugifyPackage(text) {
        let slug = (text || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        if (!slug) slug = 'app';
        return `com.sheet.${slug}`;
    }

    // Inicializa o Package ID com base no nome padrão do app
    packageNameInput.value = slugifyPackage(appNameInput.value);

    packageNameInput.addEventListener('input', () => {
        packageManuallyEdited = true;
    });

    if (btnUniquePackage) {
        btnUniquePackage.addEventListener('click', () => {
            const baseSlug = slugifyPackage(appNameInput.value);
            const rand = Math.random().toString(36).substring(2, 6);
            packageNameInput.value = `${baseSlug}_${rand}`;
            packageManuallyEdited = true;
        });
    }

    appNameInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        mockupTitle.textContent = val || "Minha Planilha App";
        mockupSplashAppName.textContent = val || "Minha Planilha App";
        if (!packageManuallyEdited) {
            packageNameInput.value = slugifyPackage(val);
        }
    });

    function applyThemeColor(hex) {
        themeColorInput.value = hex;
        colorHexText.textContent = hex.toUpperCase();
        mockupHeader.style.background = hex;
        mockupFab.style.background = hex;
        mockupSplashOverlay.style.background = hex;

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

    // Ícone do App (Máx 192x192 para caber no GitHub Actions)
    function handleIconFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            alert('Por favor, selecione um arquivo de imagem válido (PNG ou JPG).');
            return;
        }

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const size = 192;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, size, size);

            let base64 = canvas.toDataURL('image/png');
            if (base64.length > 30000) {
                base64 = canvas.toDataURL('image/jpeg', 0.85);
            }

            currentIconBase64 = base64;
            iconPreviewImg.src = currentIconBase64;
            iconPreviewImg.style.display = 'block';
            iconPlaceholder.style.display = 'none';

            // Atualiza o mockup do celular
            mockupAppIcon.innerHTML = `<img src="${currentIconBase64}" alt="App Icon">`;
        };
        img.src = URL.createObjectURL(file);
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

    // Modais
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

    // ==========================================
    // 6. ENVIO DO FORMULÁRIO E DISPARO DO BUILD
    // ==========================================
    apkForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const appName = appNameInput.value.trim();
        const appUrl = appUrlInput.value.trim();
        const packageName = packageNameInput.value.trim() || 'com.app.planilha';
        const themeColor = themeColorInput.value;
        const orientation = screenOrientation.value;
        const keepScreenOn = chkKeepScreenOn.checked;
        const fullscreen = chkFullscreen.checked;
        const pullToRefresh = chkPullToRefresh.checked;
        const permLocation = chkPermLocation.checked;
        const permCamera = chkPermCamera.checked;
        const permMic = chkPermMic.checked;

        const clientRepo = localStorage.getItem('sheet2apk_repo') || '';
        const clientToken = localStorage.getItem('sheet2apk_token') || '';

        if (activeMode === 'url') {
            if (!appUrl.startsWith('http')) {
                alert('A URL deve começar com http:// ou https://');
                return;
            }
        } else if (activeMode === 'directory') {
            if (!currentZipBase64) {
                alert('Por favor, arraste sua pasta ou selecione um arquivo .ZIP antes de continuar.');
                return;
            }
        }

        // Abre o modal de progresso
        buildModal.classList.add('open');
        resetBuildUI();
        setStep(1);

        try {
            let buildData = null;

            const payload = {
                app_name: appName,
                app_url: appUrl,
                build_mode: activeMode,
                zip_base64: currentZipBase64,
                package_name: packageName,
                theme_color: themeColor,
                icon_base64: currentIconBase64,
                orientation: orientation,
                perm_location: permLocation,
                perm_camera: permCamera,
                perm_mic: permMic,
                keep_screen_on: keepScreenOn,
                fullscreen: fullscreen,
                pull_to_refresh: pullToRefresh,
                splash_base64: currentSplashBase64,
                splash_type: currentSplashType,
                client_repo: clientRepo,
                client_token: clientToken
            };

            try {
                const res = await fetch('/api/build', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
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
                    buildData = await triggerGitHubDirectly(payload);
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

    // Fallback direto via GitHub REST API
    async function triggerGitHubDirectly(params) {
        const buildId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        let source_tag = '';

        if (params.build_mode === 'directory' && params.zip_base64) {
            source_tag = `source-${buildId}`;
            const createRel = await fetch(`https://api.github.com/repos/${params.client_repo}/releases`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${params.client_token}`,
                    'Accept': 'application/vnd.github+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ tag_name: source_tag, name: `Source Code ${buildId}`, prerelease: true })
            });
            const relData = await createRel.json();
            const rawBytes = atob(params.zip_base64.split(',').pop());
            const uint8Array = new Uint8Array(rawBytes.length);
            for (let i = 0; i < rawBytes.length; i++) uint8Array[i] = rawBytes.charCodeAt(i);

            await fetch(`https://uploads.github.com/repos/${params.client_repo}/releases/${relData.id}/assets?name=source.zip`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${params.client_token}`,
                    'Accept': 'application/vnd.github+json',
                    'Content-Type': 'application/zip'
                },
                body: uint8Array
            });
        }

        const url = `https://api.github.com/repos/${params.client_repo}/actions/workflows/build-apk.yml/dispatches`;

        let safeIcon = params.icon_base64 || '';
        if (safeIcon.length > 30000) safeIcon = '';

        let safeSplash = params.splash_base64 || '';
        if (safeSplash.length > 30000) safeSplash = '';

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${params.client_token}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ref: 'main',
                inputs: {
                    app_name: params.app_name,
                    app_url: params.app_url || 'https://appassets.androidplatform.net/assets/www/index.html',
                    build_mode: params.build_mode || 'url',
                    source_tag: source_tag,
                    package_name: params.package_name,
                    theme_color: params.theme_color,
                    icon_base64: safeIcon,
                    orientation: params.orientation || 'auto',
                    perm_location: String(params.perm_location),
                    perm_camera: String(params.perm_camera),
                    perm_mic: String(params.perm_mic),
                    keep_screen_on: String(params.keep_screen_on),
                    fullscreen: String(params.fullscreen),
                    pull_to_refresh: String(params.pull_to_refresh),
                    splash_base64: safeSplash,
                    splash_type: params.splash_type || 'none',
                    build_id: buildId
                }
            })
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Falha no GitHub (${res.status}): ${err}`);
        }

        return { success: true, build_id: buildId, repo: params.client_repo };
    }

    // Consulta periódica de status
    async function checkBuildStatus(buildId, repo, token, appName) {
        try {
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
