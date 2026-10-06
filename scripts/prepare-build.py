#!/usr/bin/env python3
"""
Script de preparação e injeção de parâmetros no projeto Android.
Executado antes do ./gradlew assembleRelease no GitHub Actions.
Suporta:
- Nome, URL, Pacote, Cor de Tema, Ícone Customizado
- Modo Diretório (Offline com WebViewAssetLoader)
- Tela de Abertura Customizada (Lottie JSON ou Imagem PNG/JPG)
- Trava de Rotação de Tela (Auto, Retrato, Paisagem)
- Permissões Granulares (Localização/GPS, Câmera, Microfone)
- Comportamentos de Tela (Keep Screen On, Tela Cheia Imersiva, Pull-to-refresh)
"""

import argparse
import base64
import json
import os
import re
import shutil
import sys
import xml.sax.saxutils as saxutils
import zipfile

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

def str_to_bool(val):
    if isinstance(val, bool):
        return val
    return str(val).lower() in ("true", "1", "yes", "sim")

def update_bools_xml(bools_path, bool_values):
    if not os.path.exists(bools_path):
        return
    with open(bools_path, 'r', encoding='utf-8') as f:
        content = f.read()

    for name, val in bool_values.items():
        val_str = "true" if val else "false"
        pattern = rf'<bool name="{name}">.*?</bool>'
        if re.search(pattern, content):
            content = re.sub(pattern, f'<bool name="{name}">{val_str}</bool>', content)
        else:
            content = content.replace('</resources>', f'    <bool name="{name}">{val_str}</bool>\n</resources>')

    with open(bools_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"[OK] bools.xml atualizado com valores: {bool_values}")

def main():
    parser = argparse.ArgumentParser(description="Configura os parâmetros do app Android")
    parser.add_argument("--app-name", default="Planilha App", help="Nome do Aplicativo")
    parser.add_argument("--app-url", default="https://script.google.com/", help="URL do Web App ou local")
    parser.add_argument("--build-mode", default="url", choices=["url", "directory"], help="Modo: url ou directory")
    parser.add_argument("--zip-file", default="", help="Caminho do arquivo ZIP da pasta")
    parser.add_argument("--package-name", default="com.sheet.app", help="Package Name (applicationId)")
    parser.add_argument("--theme-color", default="#0F9D58", help="Cor primária em hexadecimal")
    parser.add_argument("--icon-base64", default="", help="Ícone do app em formato Base64 PNG/JPG")
    
    # Novos parâmetros avançados
    parser.add_argument("--orientation", default="auto", choices=["auto", "portrait", "landscape"], help="Orientação de tela")
    parser.add_argument("--perm-location", default="false", help="Permissão de Localização GPS")
    parser.add_argument("--perm-camera", default="false", help="Permissão de Câmera")
    parser.add_argument("--perm-mic", default="false", help="Permissão de Microfone")
    parser.add_argument("--keep-screen-on", default="false", help="Manter tela sempre acesa")
    parser.add_argument("--fullscreen", default="false", help="Modo tela cheia imersivo")
    parser.add_argument("--pull-to-refresh", default="true", help="Puxar para atualizar tela")
    parser.add_argument("--splash-base64", default="", help="Conteúdo Base64 da Splash Screen")
    parser.add_argument("--splash-type", default="none", choices=["none", "lottie", "image"], help="Tipo de Splash")

    args = parser.parse_args()

    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'android-template'))
    app_res = os.path.join(root_dir, 'app', 'src', 'main', 'res')
    assets_main = os.path.join(root_dir, 'app', 'src', 'main', 'assets')
    os.makedirs(assets_main, exist_ok=True)
    os.makedirs(os.path.join(app_res, 'drawable'), exist_ok=True)
    
    print(f"==> Configurando projeto em: {root_dir}")
    print(f"==> Modo de Build: {args.build_mode}")
    print(f"==> Nome do App: {args.app_name}")
    print(f"==> Pacote: {args.package_name}")
    print(f"==> Orientação: {args.orientation}")

    final_url = args.app_url
    has_splash = False
    splash_is_lottie = False

    # Se o modo for Diretório/Pasta, descompacta os arquivos em assets/www
    if args.build_mode == "directory" or args.zip_file:
        assets_dir = os.path.join(assets_main, 'www')
        os.makedirs(assets_dir, exist_ok=True)

        if args.zip_file and os.path.exists(args.zip_file):
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

            # Se o projeto possui uma pasta compilada 'dist' ou 'build' com index.html, prioriza a pasta compilada
            for compiled_name in ['dist', 'build']:
                compiled_folder = os.path.join(assets_dir, compiled_name)
                if os.path.isdir(compiled_folder) and os.path.exists(os.path.join(compiled_folder, 'index.html')):
                    print(f"[OK] Detectada pasta compilada '{compiled_name}'! Promovendo para a raiz do aplicativo.")
                    temp_dir = os.path.join(assets_main, 'temp_compiled')
                    if os.path.exists(temp_dir):
                        shutil.rmtree(temp_dir)
                    shutil.move(compiled_folder, temp_dir)
                    shutil.rmtree(assets_dir)
                    shutil.move(temp_dir, assets_dir)
                    break

            print("[OK] Arquivos do diretório preparados com sucesso.")

            # Detecção automática de recursos usados pelo código do projeto
            try:
                scan_exts = ('.js', '.mjs', '.html', '.htm')
                found = {'geo': False, 'cam': False, 'mic': False, 'map': False}
                for dp, _dn, fns in os.walk(assets_dir):
                    for fn in fns:
                        if not fn.lower().endswith(scan_exts):
                            continue
                        try:
                            with open(os.path.join(dp, fn), 'r', encoding='utf-8', errors='ignore') as sf:
                                txt = sf.read()
                        except Exception:
                            continue
                        if 'geolocation' in txt:
                            found['geo'] = True
                        if 'getUserMedia' in txt or 'mediaDevices' in txt or 'capture=' in txt:
                            found['cam'] = True
                            if 'audio' in txt and 'getUserMedia' in txt:
                                found['mic'] = True
                        if 'maplibre' in txt.lower() or 'leaflet' in txt.lower() or 'mapboxgl' in txt.lower():
                            found['map'] = True
                if found['geo'] and not str_to_bool(args.perm_location):
                    args.perm_location = 'true'
                    print("[AUTO] Código usa geolocation -> permissão de Localização habilitada.")
                if found['cam'] and not str_to_bool(args.perm_camera):
                    args.perm_camera = 'true'
                    print("[AUTO] Código usa câmera -> permissão de Câmera habilitada.")
                if found['mic'] and not str_to_bool(args.perm_mic):
                    args.perm_mic = 'true'
                    print("[AUTO] Código usa microfone -> permissão de Microfone habilitada.")
                if found['map'] and str_to_bool(args.pull_to_refresh):
                    args.pull_to_refresh = 'false'
                    print("[AUTO] Biblioteca de mapa detectada -> Puxar para atualizar desativado (conflita com arrastar o mapa).")
            except Exception as scan_err:
                print(f"! Aviso: falha na detecção automática ({scan_err})")

            # Verifica se o ZIP inclui arquivo de splash empacotado (.sheet2apk/splash.json ou splash.json)
            possible_lotties = [
                os.path.join(assets_dir, '.sheet2apk', 'splash.json'),
                os.path.join(assets_dir, 'splash.json')
            ]
            for pl in possible_lotties:
                if os.path.exists(pl):
                    shutil.copyfile(pl, os.path.join(assets_main, 'splash.json'))
                    has_splash = True
                    splash_is_lottie = True
                    print("[OK] Splash Lottie JSON detectada e configurada a partir dos arquivos do projeto.")
                    break

            possible_images = [
                os.path.join(assets_dir, '.sheet2apk', 'splash.png'),
                os.path.join(assets_dir, 'splash.png'),
                os.path.join(assets_dir, 'splash.jpg')
            ]
            for pi in possible_images:
                if os.path.exists(pi) and not has_splash:
                    shutil.copyfile(pi, os.path.join(app_res, 'drawable', 'splash_custom.png'))
                    has_splash = True
                    splash_is_lottie = False
                    print("[OK] Splash Imagem detectada e configurada a partir dos arquivos do projeto.")
                    break
        
        final_url = "https://appassets.androidplatform.net/assets/www/index.html"

    print(f"==> URL Final configurada: {final_url}")

    # Processamento de Splash Screen via parâmetro direto
    if args.splash_base64 and len(args.splash_base64.strip()) > 10:
        try:
            raw_base64 = args.splash_base64.split(',')[-1]
            splash_bytes = base64.b64decode(raw_base64)

            if args.splash_type == "lottie":
                # Salvar como splash.json em assets
                splash_json_path = os.path.join(assets_main, 'splash.json')
                with open(splash_json_path, 'wb') as f:
                    f.write(splash_bytes)
                has_splash = True
                splash_is_lottie = True
                print("[OK] Splash Screen Lottie JSON gravada com sucesso.")
            elif args.splash_type == "image":
                # Salvar como splash_custom.png em res/drawable
                splash_img_path = os.path.join(app_res, 'drawable', 'splash_custom.png')
                with open(splash_img_path, 'wb') as f:
                    f.write(splash_bytes)
                has_splash = True
                splash_is_lottie = False
                print("[OK] Splash Screen Imagem gravada com sucesso em drawable/splash_custom.png.")
        except Exception as e:
            print(f"! Erro ao processar splash screen ({e}).")

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

    # 3. Atualizar bools.xml (Comportamentos da Tela e Splash)
    bools_path = os.path.join(app_res, 'values', 'bools.xml')
    bool_values = {
        'keep_screen_on': str_to_bool(args.keep_screen_on),
        'fullscreen': str_to_bool(args.fullscreen),
        'pull_to_refresh': str_to_bool(args.pull_to_refresh),
        'has_splash': has_splash,
        'splash_is_lottie': splash_is_lottie
    }
    update_bools_xml(bools_path, bool_values)

    # 4. Atualizar AndroidManifest.xml (Permissões Granulares e Trava de Orientação)
    manifest_path = os.path.join(root_dir, 'app', 'src', 'main', 'AndroidManifest.xml')
    if os.path.exists(manifest_path):
        with open(manifest_path, 'r', encoding='utf-8') as f:
            m_content = f.read()

        # Configuração de Orientação da Activity
        orientation_attr = ''
        if args.orientation == "portrait":
            orientation_attr = 'android:screenOrientation="portrait"'
        elif args.orientation == "landscape":
            orientation_attr = 'android:screenOrientation="landscape"'
        else:
            orientation_attr = 'android:screenOrientation="unspecified"'

        # Substitui ou insere android:screenOrientation no MainActivity
        if 'android:screenOrientation=' in m_content:
            m_content = re.sub(r'android:screenOrientation="[^"]*"', orientation_attr, m_content)
        else:
            m_content = m_content.replace(
                'android:name=".MainActivity"',
                f'android:name=".MainActivity"\n            {orientation_attr}'
            )

        # Montagem das Permissões Granulares
        permissions_xml = [
            '    <uses-permission android:name="android.permission.INTERNET" />',
            '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
            '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
            '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />',
            '    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />'
        ]

        if str_to_bool(args.perm_camera):
            permissions_xml.extend([
                '    <uses-permission android:name="android.permission.CAMERA" />',
                '    <uses-feature android:name="android.hardware.camera" android:required="false" />',
                '    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />'
            ])
            print("[OK] Permissão de Câmera habilitada.")

        if str_to_bool(args.perm_location):
            permissions_xml.extend([
                '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
                '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
                '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />'
            ])
            print("[OK] Permissão de Localização GPS habilitada.")

        if str_to_bool(args.perm_mic):
            permissions_xml.extend([
                '    <uses-permission android:name="android.permission.RECORD_AUDIO" />',
                '    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
                '    <uses-feature android:name="android.hardware.microphone" android:required="false" />'
            ])
            print("[OK] Permissão de Microfone habilitada.")

        permissions_block = "\n".join(permissions_xml)

        # Substitui todo o bloco de permissões antes do <application
        m_content = re.sub(
            r'(<manifest[^>]*>).*?(<application)',
            rf'\1\n\n{permissions_block}\n\n    \2',
            m_content,
            flags=re.DOTALL
        )

        with open(manifest_path, 'w', encoding='utf-8') as f:
            f.write(m_content)
        print("[OK] AndroidManifest.xml atualizado com orientacao e permissoes granulares.")

    # 5. Atualizar app/build.gradle (applicationId)
    build_gradle_path = os.path.join(root_dir, 'app', 'build.gradle')
    if os.path.exists(build_gradle_path):
        with open(build_gradle_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Validação robusta de applicationId para Android
        raw_pkg = args.package_name.strip() if args.package_name else ""
        clean_parts = []
        for part in raw_pkg.split('.'):
            p = re.sub(r'[^a-zA-Z0-9_]', '', part).strip('_')
            if p and p[0].isdigit():
                p = f"app_{p}"
            if p:
                clean_parts.append(p)

        if len(clean_parts) < 2:
            safe_slug = re.sub(r'[^a-zA-Z0-9_]', '', args.app_name.lower().replace(' ', '_')).strip('_')
            if safe_slug and safe_slug[0].isdigit():
                safe_slug = f"app_{safe_slug}"
            if not safe_slug:
                safe_slug = "app"
            pkg = f"com.sheet.{safe_slug}"
        else:
            pkg = ".".join(clean_parts)

        content = re.sub(
            r'applicationId\s+["\'][^"\']+["\']',
            f'applicationId "{pkg}"',
            content
        )

        with open(build_gradle_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"[OK] app/build.gradle atualizado com pacote: {pkg}")

    # 6. Processar Ícone (se enviado em base64)
    if args.icon_base64 and len(args.icon_base64.strip()) > 50:
        try:
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

    # 7. Gerar nome de arquivo seguro para o APK
    safe_filename = re.sub(r'[^a-zA-Z0-9_\-]', '_', args.app_name).strip('_')
    if not safe_filename:
        safe_filename = "app-release"

    github_output = os.getenv('GITHUB_OUTPUT')
    if github_output:
        with open(github_output, 'a') as f:
            f.write(f"safe_app_name={safe_filename}\n")
    print(f"[OK] Nome do arquivo APK seguro: {safe_filename}.apk")

if __name__ == "__main__":
    main()
