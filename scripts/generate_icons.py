"""
生成 tabBar 图标（简单的彩色 PNG）
运行: python generate_icons.py
"""
import struct
import zlib
import os

def create_png(width, height, color, filepath):
    """创建一个纯色 PNG（带简单形状）"""
    # RGBA 数据
    r, g, b, a = color
    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter byte
        for x in range(width):
            # 画一个简单的圆形图标
            cx, cy = width / 2, height / 2
            dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if dist < min(width, height) / 2 - 2:
                raw += bytes([r, g, b, a])
            else:
                raw += bytes([0, 0, 0, 0])

    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
        return struct.pack('>I', len(data)) + c + crc

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(raw)

    png = sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')

    with open(filepath, 'wb') as f:
        f.write(png)
    print(f"已生成: {filepath}")


TABBAR_DIR = os.path.join(os.path.dirname(__file__), '..', 'static', 'tabbar')
os.makedirs(TABBAR_DIR, exist_ok=True)

# 图标定义: (文件名, 普通颜色, 选中颜色)
ICONS = [
    ('home', (153, 153, 153, 255), (255, 107, 53, 255)),
    ('ai', (153, 153, 153, 255), (255, 107, 53, 255)),
    ('dish', (153, 153, 153, 255), (255, 107, 53, 255)),
    ('user', (153, 153, 153, 255), (255, 107, 53, 255)),
]

for name, normal, active in ICONS:
    create_png(48, 48, normal, os.path.join(TABBAR_DIR, f'{name}.png'))
    create_png(48, 48, active, os.path.join(TABBAR_DIR, f'{name}-active.png'))

print("✅ tabBar 图标生成完成")
