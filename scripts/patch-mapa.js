const fs = require('fs');

const mapaDir = 'D:/0D\uA789/4 - \u2022MAPA';

// 1. Atualizar vite.config.js com base: './'
const viteConfig = `import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: 'es2022' }
});
`;
fs.writeFileSync(mapaDir + '/vite.config.js', viteConfig, 'utf-8');
console.log('[OK] vite.config.js atualizado com base: ./');

// 2. Patch main.js a partir do main.js.bak limpo
let code = fs.readFileSync(mapaDir + '/src/main.js.bak', 'utf-8');

// A. Substituir bloco de montarCamadas e atualizarMapa
const lines = code.split('\n');

// Localizar os índices exatos de montarCamadas
const montarStart = lines.findIndex(l => l.includes('function montarCamadas()'));
const montarEnd = lines.findIndex(l => l.includes('function aplicarFiltro()'));

if (montarStart !== -1 && montarEnd !== -1) {
  const newMontarBlock = [
    `function montarCamadas() {`,
    `  for (const [k, v] of Object.entries(CATEGORIAS)) if (!map.hasImage(k)) map.addImage(k, pin(v.cor, v.letra), { pixelRatio: 2 });`,
    `  if (!map.getSource('rota')) {`,
    `    map.addSource('rota', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });`,
    `    map.addLayer({ id: 'rota-casing', type: 'line', source: 'rota', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0f172a', 'line-width': 8, 'line-opacity': 0.85 } });`,
    `    map.addLayer({ id: 'rota-line', type: 'line', source: 'rota', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 5 } });`,
    `  }`,
    `  if (!map.getSource('pontos')) {`,
    `    map.addSource('pontos', { type: 'geojson', data: geojson() });`,
    `  } else {`,
    `    map.getSource('pontos').setData(geojson());`,
    `  }`,
    `  if (!map.getSource('gps')) {`,
    `    map.addSource('gps', { type: 'geojson', data: gpsGeo() });`,
    `  } else {`,
    `    map.getSource('gps').setData(gpsGeo());`,
    `  }`,
    `  const cor = ['match', ['get', 'cat'], ...Object.entries(CATEGORIAS).flatMap(([k, v]) => [k, v.cor]), '#ef4444'];`,
    `  if (!map.getLayer('gps-acc')) map.addLayer({ id: 'gps-acc', type: 'fill', source: 'gps', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.12 } });`,
    `  if (!map.getLayer('p-dot')) map.addLayer({ id: 'p-dot', type: 'circle', source: 'pontos', maxzoom: 14.5, paint: {`,
    `    'circle-color': cor, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14.5, 6],`,
    `    'circle-stroke-width': 1.2, 'circle-stroke-color': '#fff',`,
    `    'circle-opacity': 1 } });`,
    `  if (!map.getLayer('p-pin')) map.addLayer({ id: 'p-pin', type: 'symbol', source: 'pontos', minzoom: 14.5, layout: {`,
    `    'icon-image': ['get', 'cat'], 'icon-anchor': 'bottom', 'icon-allow-overlap': true,`,
    `    'icon-size': ['interpolate', ['linear'], ['zoom'], 14.5, 0.75, 18, 1.1],`,
    `    'symbol-sort-key': ['case', ['==', ['get', 'cat'], 'consolidado'], 2, ['==', ['get', 'cat'], 'com_pendencia'], 1, 0] } });`,
    `  if (!map.getLayer('gps-halo')) map.addLayer({ id: 'gps-halo', type: 'circle', source: 'gps', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 16, 'circle-color': '#ef4444', 'circle-opacity': 0.25 } });`,
    `  if (!map.getLayer('gps-dot')) map.addLayer({ id: 'gps-dot', type: 'circle', source: 'gps', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#ef4444', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } });`,
    `  aplicarFiltro(); aplicarBase();`,
    `}`,
    ``,
    `if (map.loaded()) montarCamadas();`,
    `else {`,
    `  map.on('load', montarCamadas);`,
    `  map.on('style.load', montarCamadas);`,
    `}`,
    ``,
    `const atualizarMapa = () => {`,
    `  const s = map.getSource('pontos');`,
    `  if (s) {`,
    `    s.setData(geojson());`,
    `  } else {`,
    `    montarCamadas();`,
    `  }`,
    `};`,
    ``
  ];

  lines.splice(montarStart, (montarEnd - montarStart), ...newMontarBlock);
  console.log('[OK] Bloco montarCamadas substituído com sucesso.');
} else {
  console.error('[ERRO] Não encontrou montarCamadas ou aplicarFiltro!');
}

// B. Localizar e substituir bloco de GPS
const gpsStart = lines.findIndex(l => l.includes('let seguir = false;'));
const gpsEnd = lines.findIndex(l => l.includes('// ---------------- Bússola'));

if (gpsStart !== -1 && gpsEnd !== -1) {
  const newGpsBlock = [
    `let seguir = false;`,
    `const atualizarPosicao = (p) => {`,
    `  const coords = p?.coords || p;`,
    `  if (!coords || coords.latitude === undefined || coords.longitude === undefined) return;`,
    `  gps = coords;`,
    `  map.getSource('gps')?.setData(gpsGeo());`,
    `  $('#gps-chip')?.classList.remove('hidden');`,
    `  const chipSpan = $('#gps-chip span');`,
    `  if (chipSpan) chipSpan.textContent = \`GPS ±\${Math.round(coords.accuracy || 10)} m\`;`,
    `  if (seguir) {`,
    `    map.easeTo({ center: [coords.longitude, coords.latitude], zoom: Math.max(map.getZoom(), 17) });`,
    `    seguir = false;`,
    `  }`,
    `  if (rotaAtiva) {`,
    `    const dMetros = distMetros(coords.latitude, coords.longitude, rotaAtiva.destLat, rotaAtiva.destLng);`,
    `    const navDist = $('#nav-dist');`,
    `    if (navDist) navDist.textContent = formatDist(dMetros);`,
    `    if (dMetros <= 35) {`,
    `      const dest = rotaAtiva.destino;`,
    `      soarChegada();`,
    `      toast('🎯 Você chegou ao ponto de parada! Abrindo vistoria...', true);`,
    `      encerrarRota();`,
    `      abrir(dest.id);`,
    `    }`,
    `  }`,
    `};`,
    `window.atualizarPosicao = atualizarPosicao;`,
    ``,
    `function solicitarLocalizacao(sucesso, erro) {`,
    `  // 1. Aciona o Bridge Nativo Android se disponível no APK`,
    `  if (window.AndroidBridge?.requestLocation) {`,
    `    try { window.AndroidBridge.requestLocation(); } catch (_) {}`,
    `  }`,
    ``,
    `  // 2. Busca via Geolocation HTML5 com enableHighAccuracy: false para compatibilidade total no Android 12+`,
    `  if (navigator.geolocation) {`,
    `    navigator.geolocation.getCurrentPosition(`,
    `      (p) => {`,
    `        atualizarPosicao(p);`,
    `        if (sucesso) sucesso(p);`,
    `      },`,
    `      (e) => {`,
    `        console.warn('Geolocation fallback:', e);`,
    `        if (erro) erro(e);`,
    `      },`,
    `      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }`,
    `    );`,
    `  }`,
    `}`,
    ``,
    `// 1. Tenta obter posição rápida imediatamente (via Nativo Android e Geolocation)`,
    `solicitarLocalizacao(null, null);`,
    ``,
    `// 2. Monitora em tempo real por satélite (com timeout para não travar em ambientes fechados)`,
    `navigator.geolocation?.watchPosition(`,
    `  atualizarPosicao,`,
    `  (e) => console.warn('GPS aviso:', e.message),`,
    `  { enableHighAccuracy: false, timeout: 15000, maximumAge: 5000 }`,
    `);`,
    ``,
    `$('#btn-gps').onclick = () => {`,
    `  seguir = true;`,
    `  if (gps) {`,
    `    map.flyTo({ center: [gps.longitude, gps.latitude], zoom: Math.max(map.getZoom(), 17) });`,
    `    if (window.AndroidBridge?.requestLocation) {`,
    `      try { window.AndroidBridge.requestLocation(); } catch (_) {}`,
    `    }`,
    `  } else {`,
    `    toast('Buscando sua localização…');`,
    `    solicitarLocalizacao(`,
    `      (p) => {`,
    `        map.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: Math.max(map.getZoom(), 17) });`,
    `        toast('Localização encontrada!');`,
    `      },`,
    `      (e) => {`,
    `        if (!gps && !window.AndroidBridge) {`,
    `          toast('GPS: ' + (e.message || 'Verifique se a localização está ativa no celular'));`,
    `        }`,
    `      }`,
    `    );`,
    `  }`,
    `};`,
    ``
  ];

  lines.splice(gpsStart, (gpsEnd - gpsStart), ...newGpsBlock);
  console.log('[OK] Bloco GPS substituído com sucesso.');
} else {
  console.error('[ERRO] Não encontrou bloco de GPS!');
}

// C. Gravar main.js
const finalCode = lines.join('\n');
fs.writeFileSync(mapaDir + '/src/main.js', finalCode, 'utf-8');
console.log('[OK] src/main.js salvo com sucesso! Linhas:', lines.length, 'Tamanho:', finalCode.length);
