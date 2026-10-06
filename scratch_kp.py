import os, glob, re, sys
sys.stdout.reconfigure(encoding='utf-8')

for root, dirs, files in os.walk('D:\\'):
    if 'dist' in dirs and 'MAPA' in root:
        dist_assets = os.path.join(root, 'dist', 'assets')
        for f in os.listdir(dist_assets):
            if f.endswith('.js'):
                with open(os.path.join(dist_assets, f), 'r', encoding='utf-8', errors='ignore') as js_file:
                    content = js_file.read()
                idx = 0
                while True:
                    idx = content.find('kP', idx)
                    if idx == -1: break
                    print(f"=== kP at {idx} ===")
                    print(content[max(0, idx-100):min(len(content), idx+100)])
                    idx += 2
        break
