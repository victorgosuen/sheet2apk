"""Prepare a static web distribution; never silently package development sources."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile
import re
from urllib.parse import unquote, urlsplit


MODULE_TOKENS = re.compile(
    r'''(?P<comment>//[^\n]*|/\*[\s\S]*?\*/)|'''
    r'''(?P<string>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|'''
    r'''(?P<template>`(?:\\.|[^`\\])*`)|'''
    r'''(?P<word>[A-Za-z_$][\w$]*)|(?P<punct>[^\s])'''
)


def module_references(text):
    previous = []
    for token in MODULE_TOKENS.finditer(text):
        if token.lastgroup == 'comment':
            continue
        value = token.group()
        if token.lastgroup == 'string':
            if previous[-1:] in (['from'], ['import']) or previous[-2:] == ['import', '(']:
                reference = value[1:-1]
                if reference.startswith(('./', '../')):
                    yield reference
        previous = (previous + [value])[-2:]


def complete_module_dependencies(project_root, distribution):
    """Restore siblings of raw npm modules emitted as URL assets by a bundler.

    Vite's ?url copies a module verbatim, without bundling its relative imports.
    Find the exact original by content, then copy its dependencies recursively.
    Never choose an unrelated file just because its basename matches.
    """
    project_root, distribution = Path(project_root).resolve(), Path(distribution).resolve()
    pending = [path for extension in ('*.js', '*.mjs', '*.cjs')
               for path in distribution.rglob(extension)
               if not {'node_modules', '.git'}.intersection(path.relative_to(distribution).parts)]
    visited = set()
    originals = None
    copied = []
    while pending:
        module = pending.pop()
        if module in visited:
            continue
        visited.add(module)
        content = module.read_bytes()
        text = content.decode('utf-8', errors='replace')
        for reference in module_references(text):
            relative = unquote(urlsplit(reference).path)
            target = (module.parent / relative).resolve()
            if not target.is_relative_to(distribution.resolve()):
                raise ValueError(f'Import fora da distribuição: {module.name}: {reference}')
            if target.is_file():
                continue
            if originals is None:
                originals = []
                dependencies = project_root / 'node_modules'
                if dependencies.is_dir():
                    for folder, dirs, files in os.walk(dependencies):
                        dirs[:] = [d for d in dirs if d not in ('.cache', '.git')]
                        originals.extend(Path(folder) / name for name in files
                                         if name.endswith(('.js', '.mjs', '.cjs')))
            matches = [candidate for candidate in originals
                       if candidate.stat().st_size == len(content) and candidate.read_bytes() == content]
            if not matches:
                raise ValueError(f'Módulo incompleto: {module.relative_to(distribution)} importa {reference}, '
                                 'mas a dependência não foi incluída. Compile o worker com ?worker&url '
                                 'ou envie todas as dependências da distribuição.')
            sources = [(candidate.parent / relative).resolve() for candidate in matches]
            sources = [source for source in sources if source.is_relative_to(project_root.resolve()) and source.is_file()]
            if not sources or any(source.read_bytes() != sources[0].read_bytes() for source in sources[1:]):
                raise ValueError(f'Dependência ausente ou ambígua: {module.name}: {reference}')
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(sources[0], target)
            copied.append(target.relative_to(distribution).as_posix())
            if target.suffix in ('.js', '.mjs', '.cjs'):
                pending.append(target)
    return copied


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
        restored = complete_module_dependencies(root, selected)
        for name in restored:
            print(f'[OK] Dependência de módulo incluída: {name}')
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(selected, destination)
        # Preserve converter metadata even when selecting dist/build/out.
        metadata = root / '.sheet2apk'
        if metadata.is_dir() and selected != root:
            shutil.copytree(metadata, destination / '.sheet2apk', dirs_exist_ok=True)
        return selected.name
