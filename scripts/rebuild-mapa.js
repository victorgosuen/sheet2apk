const fs = require('fs');
const { execSync } = require('child_process');

const mapaDir = 'D:/0D\uA789/4 - \u2022MAPA';
const mainJs = mapaDir + '/src/main.js';
let content = fs.readFileSync(mainJs, 'utf-8');

if (!content.includes('window.__lastKnownLocation')) {
  content = content.replace(
    'window.atualizarPosicao = atualizarPosicao;',
    'window.atualizarPosicao = atualizarPosicao;\nif (window.__lastKnownLocation) {\n  atualizarPosicao(window.__lastKnownLocation);\n}'
  );
  fs.writeFileSync(mainJs, content, 'utf-8');
  console.log('[OK] window.__lastKnownLocation adicionado a main.js');
} else {
  console.log('window.__lastKnownLocation já presente.');
}

console.log('Reconstruindo dist com npm run build...');
const out = execSync('npm run build', { cwd: mapaDir, encoding: 'utf-8' });
console.log('[OK] Build concluído com sucesso:\n', out);
