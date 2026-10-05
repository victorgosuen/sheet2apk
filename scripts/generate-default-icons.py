import os
import struct
import zlib

def make_png(width, height, r, g, b, a=255):
    # Minimal pure Python PNG generator (no external dependencies required)
    line = b'\x00' + struct.pack(f'>{width*4}B', *([r, g, b, a] * width))
    raw_data = line * height
    compressed = zlib.compress(raw_data)
    
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
        return struct.pack('>I', len(data)) + c + crc

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', compressed)
    png += chunk(b'IEND', b'')
    return png

sizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

base_dir = os.path.join(os.path.dirname(__file__), '..', 'android-template', 'app', 'src', 'main', 'res')

# Google Sheets Green color: #0F9D58 (15, 157, 88)
for folder, size in sizes.items():
    folder_path = os.path.join(base_dir, folder)
    os.makedirs(folder_path, exist_ok=True)
    png_data = make_png(size, size, 15, 157, 88, 255)
    
    with open(os.path.join(folder_path, 'ic_launcher.png'), 'wb') as f:
        f.write(png_data)
    with open(os.path.join(folder_path, 'ic_launcher_round.png'), 'wb') as f:
        f.write(png_data)

print("Default launcher icons created successfully.")
