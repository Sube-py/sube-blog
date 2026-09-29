#!/bin/bash
#
# 用 GitHub 头像生成全套网站图标（macOS / Linux 通用）
# 只依赖 curl 和 python3 标准库，不需要 sips / PIL / ImageMagick
#
# 原理：avatars.githubusercontent.com/u/<id>?s=<n> 支持任意尺寸，
#       直接下载 5 种尺寸即可，无需本地缩放。
#
# 用法：
#   1. 放到博客仓库根目录
#   2. chmod +x gen-favicon.sh
#   3. ./gen-favicon.sh          （默认用你的 ID 53138073）
#      或 ./gen-favicon.sh 12345 （换 ID）
#   4. 生成的文件自动放进 static/，然后 git add . && git push
#

set -e

USER_ID="${1:-53138073}"
BASE="https://avatars.githubusercontent.com/u/${USER_ID}"
OUT="static"
TMP=$(mktemp -d)

echo "==> GitHub 用户 ID : $USER_ID"
echo "==> 输出目录       : $OUT"
echo

# ---------- 1. 下载各尺寸 ----------
echo "==> 下载头像（6 个尺寸）..."
for s in 16 32 48 64 180 460; do
  code=$(curl -sSL -m 30 -o "$TMP/s$s.png" -w "%{http_code}" "$BASE?s=$s" 2>/dev/null || echo "000")
  sz=$(stat -f%z "$TMP/s$s.png" 2>/dev/null || stat -c%s "$TMP/s$s.png" 2>/dev/null || echo 0)
  if [ "$code" != "200" ] || [ "$sz" -lt 100 ]; then
    echo "    ❌ ${s}px 下载失败 (HTTP $code, ${sz} 字节)"
    echo "       请确认浏览器能打开：$BASE?s=$s"
    echo "       若你的网络访问 GitHub 不畅，可手动下载图片放到 static/ 后跳过本脚本"
    exit 1
  fi
  echo "    ${s}x${s}  ✓  (${sz} 字节)"
done

# ---------- 2. 落位 PNG ----------
cp "$TMP/s180.png" "$OUT/apple-touch-icon.png"
cp "$TMP/s64.png"  "$OUT/favicon.png"
cp "$TMP/s32.png"  "$OUT/favicon-32.png"
echo
echo "    → apple-touch-icon.png (180)"
echo "    → favicon.png (64)"
echo "    → favicon-32.png (32)"

# ---------- 3. 合成 favicon.ico（16+32+48 合一，纯 Python 标准库） ----------
echo
echo "==> 合成 favicon.ico ..."
TMP="$TMP" OUT="$OUT" python3 - <<'PYEOF'
import struct, os

tmp = os.environ['TMP']; out = os.environ['OUT']
sizes = [16, 32, 48]

blobs = []
for s in sizes:
    with open(os.path.join(tmp, f's{s}.png'), 'rb') as f:
        blobs.append(f.read())

n = len(blobs)
offset = 6 + 16 * n
header = struct.pack('<HHH', 0, 1, n)      # reserved, type=1(icon), count

entries, datas = b'', b''
for s, blob in zip(sizes, blobs):
    dim = 0 if s >= 256 else s             # 尺寸 >=256 时记录为 0
    entries += struct.pack('<BBBBHHII', dim, dim, 0, 0, 1, 32, len(blob), offset)
    datas += blob
    offset += len(blob)

path = os.path.join(out, 'favicon.ico')
with open(path, 'wb') as f:
    f.write(header + entries + datas)
print(f"    → favicon.ico  ({n} 尺寸合一, {os.path.getsize(path)} 字节)")
PYEOF

# ---------- 4. 生成 favicon.svg（圆形裁剪 + 内嵌 460px 头像） ----------
echo "==> 生成 favicon.svg（圆形裁剪）..."
TMP="$TMP" OUT="$OUT" python3 - <<'PYEOF'
import base64, os

tmp = os.environ['TMP']; out = os.environ['OUT']
with open(os.path.join(tmp, 's460.png'), 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <clipPath id="avatarClip">
      <circle cx="32" cy="32" r="32"/>
    </clipPath>
  </defs>
  <g clip-path="url(#avatarClip)">
    <image x="0" y="0" width="64" height="64" xlink:href="data:image/png;base64,{b64}"/>
  </g>
</svg>
'''

path = os.path.join(out, 'favicon.svg')
with open(path, 'w') as f:
    f.write(svg)
print(f"    → favicon.svg  ({len(svg)} 字符)")
PYEOF

rm -rf "$TMP"

echo
echo "✅ 全部完成，生成在 $OUT/ ："
echo
ls -la "$OUT"/favicon.svg "$OUT"/favicon.ico "$OUT"/favicon.png "$OUT"/favicon-32.png "$OUT"/apple-touch-icon.png 2>/dev/null
echo
echo "接下来："
echo "   git add static/ && git commit -m 'chore: 用头像作网站图标' && git push"
echo
echo "⚠️  提醒：16x16 的真人头像会比较糊，这是位图的物理限制，不是脚本问题。"
echo "    浏览器标签页上大概率只能看到一个色块轮廓。"
echo "    若觉得难认，可在 baseof.html 里把 favicon 那几行改回字母标志，"
echo "    只让 apple-touch-icon（180px，iOS 主屏幕）用头像。"
