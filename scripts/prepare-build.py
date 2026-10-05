#!/usr/bin/env python3
"""
Script de preparação e injeção de parâmetros no projeto Android.
Executado antes do ./gradlew assembleRelease no GitHub Actions.
"""

import argparse
import base64
import os
import re
import sys
import xml.sax.saxutils as saxutils

# Garantir suporte UTF-8 no stdout
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def escape_xml(text):
    return saxutils.escape(text, {'"': '&quot;', "'": "\\'"})

def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 3:
        hex_str = ''.join([c*2 for c in hex_str])
    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))

def darken_color(hex_str, factor=0.8):
    try:
        r, g, b = hex_to_rgb(hex_str)
        r = max(0, min(255, int(r * factor)))
        g = max(0, min(255, int(g * factor)))
        b = max(0, min(255, int(b * factor)))
        return f"#{r:02X}{g:02X}{b:02X}"
    except Exception:
        return "#0B8043"

def main():
    parser = argparse.ArgumentParser(description="Configura os parâmetros do app Android")
    parser.add_argument("--app-name", default="Planilha App", help="Nome do Aplicativo")
    parser.add_argument("--app-url", default="https://script.google.com/", help="URL do Web App ou local")
    parser.add_argument("--build-mode", default="url", choices=["url", "directory"], help="Modo: url ou directory")
    parser.add_argument("--zip-file", default="", help="Caminho do arquivo ZIP da pasta")
    parser.add_argument("--package-name", default="com.sheet.app", help="Package Name (applicationId)")
    parser.add_argument("--theme-color", default="#0F9D58", help="Cor primária em hexadecimal")
    parser.add_argument("--icon-base64", default="", help="Ícone do app em formato Base64 PNG/JPG")
    
    args = parser.parse_args()

    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'android-template'))
    app_res = os.path.join(root_dir, 'app', 'src', 'main', 'res')
    
    print(f"==> Configurando projeto em: {root_dir}")
    print(f"==> Modo de Build: {args.build_mode}")
    print(f"==> Nome do App: {args.app_name}")
    print(f"==> Pacote: {args.package_name}")

    final_url = args.app_url

    # Se o modo for Diretório/Pasta, descompacta os arquivos em assets/www
    if args.build_mode == "directory" or args.zip_file:
        assets_dir = os.path.join(root_dir, 'app', 'src', 'main', 'assets', 'www')
        os.makedirs(assets_dir, exist_ok=True)

        if args.zip_file and os.path.exists(args.zip_file):
            import zipfile
            import shutil

            print(f"==> Extraindo arquivos locais para: {assets_dir}")
            with zipfile.ZipFile(args.zip_file, 'r') as zf:
                zf.extractall(assets_dir)

            # Se todos os arquivos ficaram dentro de uma subpasta única, achata para a raiz
            items = os.listdir(assets_dir)
            if len(items) == 1 and os.path.isdir(os.path.join(assets_dir, items[0])):
                subfolder = os.path.join(assets_dir, items[0])
                for subitem in os.listdir(subfolder):
                    shutil.move(os.path.join(subfolder, subitem), os.path.join(assets_dir, subitem))
                os.rmdir(subfolder)

            print("[OK] Arquivos do diretório descompactados com sucesso.")
        
        final_url = "https://appassets.androidplatform.net/assets/www/index.html"

    print(f"==> URL Final configurada: {final_url}")

    # 1. Atualizar strings.xml (app_name e app_url)
    strings_path = os.path.join(app_res, 'values', 'strings.xml')
    if os.path.exists(strings_path):
        with open(strings_path, 'r', encoding='utf-8') as f:
            content = f.read()

        safe_name = escape_xml(args.app_name)
        safe_url = escape_xml(final_url)

        content = re.sub(
            r'<string name="app_name">.*?</string>',
            f'<string name="app_name">{safe_name}</string>',
            content
        )
        content = re.sub(
            r'<string name="app_url">.*?</string>',
            f'<string name="app_url">{safe_url}</string>',
            content
        )

        with open(strings_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("[OK] strings.xml atualizado.")

    # 2. Atualizar colors.xml (Tema)
    colors_path = os.path.join(app_res, 'values', 'colors.xml')
    if os.path.exists(colors_path) and args.theme_color:
        theme_hex = args.theme_color if args.theme_color.startswith('#') else f"#{args.theme_color}"
        theme_dark = darken_color(theme_hex, 0.8)

        with open(colors_path, 'r', encoding='utf-8') as f:
            content = f.read()

        content = re.sub(r'<color name="primary">.*?</color>', f'<color name="primary">{theme_hex}</color>', content)
        content = re.sub(r'<color name="primary_dark">.*?</color>', f'<color name="primary_dark">{theme_dark}</color>', content)
        content = re.sub(r'<color name="accent">.*?</color>', f'<color name="accent">{theme_hex}</color>', content)

        with open(colors_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("[OK] colors.xml atualizado.")

    # 3. Atualizar app/build.gradle (applicationId)
    build_gradle_path = os.path.join(root_dir, 'app', 'build.gradle')
    if os.path.exists(build_gradle_path):
        with open(build_gradle_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Validação básica de applicationId
        pkg = re.sub(r'[^a-zA-Z0-9._]', '', args.package_name)
        if not pkg or '.' not in pkg:
            pkg = "com.sheet.app"

        content = re.sub(
            r'applicationId\s+["\'][^"\']+["\']',
            f'applicationId "{pkg}"',
            content
        )

        with open(build_gradle_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"[OK] app/build.gradle atualizado com pacote: {pkg}")

    # 4. Processar Ícone (se enviado em base64)
    if args.icon_base64 and len(args.icon_base64.strip()) > 50:
        try:
            # Remover header de data url caso exista (ex: data:image/png;base64,...)
            raw_base64 = args.icon_base64.split(',')[-1]
            icon_bytes = base64.b64decode(raw_base64)

            sizes = {
                'mipmap-mdpi': 48,
                'mipmap-hdpi': 72,
                'mipmap-xhdpi': 96,
                'mipmap-xxhdpi': 144,
                'mipmap-xxxhdpi': 192,
            }

            try:
                from PIL import Image
                import io

                img = Image.open(io.BytesIO(icon_bytes)).convert("RGBA")
                for folder, size in sizes.items():
                    target_dir = os.path.join(app_res, folder)
                    os.makedirs(target_dir, exist_ok=True)
                    resized = img.resize((size, size), Image.Resampling.LANCZOS)
                    resized.save(os.path.join(target_dir, 'ic_launcher.png'), "PNG")
                    resized.save(os.path.join(target_dir, 'ic_launcher_round.png'), "PNG")
                print("[OK] Ícones redimensionados com sucesso via Pillow.")
            except ImportError:
                # Fallback sem Pillow: escreve o binário original em todos os diretórios
                for folder in sizes.keys():
                    target_dir = os.path.join(app_res, folder)
                    os.makedirs(target_dir, exist_ok=True)
                    with open(os.path.join(target_dir, 'ic_launcher.png'), 'wb') as f:
                        f.write(icon_bytes)
                    with open(os.path.join(target_dir, 'ic_launcher_round.png'), 'wb') as f:
                        f.write(icon_bytes)
                print("[OK] Ícone gravado (modo direto).")
        except Exception as e:
            print(f"! Aviso: Não foi possível processar o ícone personalizado ({e}). Mantendo padrão.")

    # 5. Gerar nome de arquivo seguro para o APK
    safe_filename = re.sub(r'[^a-zA-Z0-9_\-]', '_', args.app_name).strip('_')
    if not safe_filename:
        safe_filename = "app-release"

    # Exportar variáveis para o GitHub Actions se disponível
    github_output = os.getenv('GITHUB_OUTPUT')
    if github_output:
        with open(github_output, 'a') as f:
            f.write(f"safe_app_name={safe_filename}\n")
    print(f"[OK] Nome do arquivo APK seguro: {safe_filename}.apk")

if __name__ == "__main__":
    main()
