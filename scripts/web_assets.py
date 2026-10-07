"""Prepare a static web distribution; never silently package development sources."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile


def prepare_web_assets(zip_path, destination, build=True):
    destination = Path(destination)
    with tempfile.TemporaryDirectory(prefix='sheet2apk-') as work:
        root = Path(work)
        with zipfile.ZipFile(zip_path) as archive:
            for entry in archive.infolist():
                name = entry.filename.replace('\\', '/')
                target = (root / name).resolve()
                if not target.is_relative_to(root.resolve()) or ':' in name:
                    raise ValueError(f'Caminho inválido no ZIP: {name}')
                if entry.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.open(entry) as source, target.open('wb') as output:
                        shutil.copyfileobj(source, output)
        while True:
            items = [p for p in root.iterdir() if p.name != '__MACOSX']
            if len(items) != 1 or not items[0].is_dir():
                break
            root = items[0]

        package_path = root / 'package.json'
        package = json.loads(package_path.read_text(encoding='utf-8-sig')) if package_path.exists() else {}
        has_build = bool(package.get('scripts', {}).get('build'))
        if has_build and build:
            npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
            if not npm:
                raise RuntimeError('Node.js/npm é necessário para compilar esta pasta.')
            # Remove old outputs so a failed or misconfigured build cannot use stale files.
            for name in ('dist', 'build', 'out'):
                output = root / name
                if output.is_dir():
                    shutil.rmtree(output)
            subprocess.run([npm, 'ci' if (root / 'package-lock.json').exists() else 'install'], cwd=root, check=True)
            subprocess.run([npm, 'run', 'build'], cwd=root, check=True)

        config_path = root / '.sheet2apk' / 'config.json'
        config = json.loads(config_path.read_text(encoding='utf-8-sig')) if config_path.exists() else {}
        configured = config.get('web_dir')
        if configured:
            selected = (root / configured).resolve()
            if not selected.is_relative_to(root.resolve()):
                raise ValueError('web_dir deve ficar dentro da pasta do projeto.')
        else:
            selected = next((root / name for name in ('dist', 'build', 'out')
                             if (root / name / 'index.html').is_file()), root)
        if not (selected / 'index.html').is_file():
            raise ValueError('Pasta web sem index.html. Configure .sheet2apk/config.json com web_dir para a saída estática.')
        if has_build and selected == root:
            raise ValueError('O build não produziu uma distribuição estática. Configure web_dir; projetos com servidor precisam de hospedagem.')
        html = (selected / 'index.html').read_text(encoding='utf-8-sig')
        if '"/src/' in html or "'/src/" in html:
            raise ValueError('index.html ainda aponta para /src/. Envie uma distribuição compilada ou um projeto com script build.')
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(selected, destination)
        # Preserve converter metadata even when selecting dist/build/out.
        metadata = root / '.sheet2apk'
        if metadata.is_dir() and selected != root:
            shutil.copytree(metadata, destination / '.sheet2apk', dirs_exist_ok=True)
        return selected.name
