"""Download the exact SVG assets returned by the approved Figma design context."""
import concurrent.futures
import json
import pathlib
import re
import subprocess

source = pathlib.Path('design/redesign-050/34-18828.txt').read_text()
base = re.search(r'const assetPathPrefix = "([^"]+)"', source).group(1)
assets = re.findall(r'const (img\w+) = `\$\{assetPathPrefix\}/([^`]+)`', source)
root = pathlib.Path('public/assets/figma-050')
root.mkdir(exist_ok=True)

def download(asset):
    symbol, name = asset
    target = root / name
    if not target.exists():
        subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', base + '/' + name, '--output', str(target)], check=True)
    tag = re.search(r'<svg\b[^>]*>', target.read_text()).group(0)
    return {'symbol': symbol, 'file': str(target), 'size': target.stat().st_size, 'root': tag}

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    manifest = list(pool.map(download, assets))
pathlib.Path('design/redesign-050/assets.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
print(json.dumps(manifest, ensure_ascii=False, indent=2))
