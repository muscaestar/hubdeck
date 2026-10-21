"""离线检查中文文档：python scripts/check-docs.py。

只读工作区，不联网、不调用产品、不打开 HID。检查任务清单里的翻译映射、中文
Markdown 本地链接及锚点、原文代码块、源码覆盖表。代码块只允许明确列出的翻译
例外；文件覆盖代表存在研究索引，不证明语义无误或硬件已验证。
"""

from collections import Counter
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs" / "中文"
SOURCE_SUFFIXES = {
    ".rs", ".m", ".ts", ".tsx", ".js", ".mjs", ".py", ".ps1", ".sh",
    ".css", ".html", ".nsh", ".toml", ".json", ".yml", ".yaml", ".xml",
}
LOCKFILES = {"package-lock.json", "pnpm-lock.yaml"}
# 目录树/命令帮助中的说明和示例注释已译；README 原始围栏另做人工核对。
# 仅豁免指定块，不放过同一文档的 JSON/HTTP 示例。
BLOCK_EXCEPTIONS = {
    "README.md": {0}, "ARCHITECTURE.md": {0, 1},
    "docs/CLI.md": {0, 1}, "docs/SHARING.md": {0},
}


def source_files():
    raw = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
    )
    return sorted({
        p for p in raw.decode("utf-8").split("\0") if p
        and Path(p).suffix in SOURCE_SUFFIXES
        and Path(p).name not in LOCKFILES
        and not p.startswith("docs/")
    })


def prose(text):
    """屏蔽围栏和行内代码，防止把示例里的链接当正文。"""
    text = re.sub(r"^(`{3,}|~{3,})[^\n]*\n.*?^\1[^\n]*$", "", text, flags=re.M | re.S)
    return re.sub(r"`[^`\n]+`", "", text)


def anchors(text):
    found = set(re.findall(r'<a\s+id=["\']([^"\']+)', text))
    seen = Counter()
    for title in re.findall(r"^#{1,6}\s+(.+?)\s*#*\s*$", prose(text), re.M):
        title = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", title)
        title = re.sub(r"<[^>]+>", "", title).replace("*", "").replace("_", "")
        slug = re.sub(r"[^\w\- ]", "", title.lower()).replace(" ", "-")
        n = seen[slug]
        seen[slug] += 1
        found.add(f"{slug}-{n}" if n else slug)
    return found


def blocks(text):
    return re.findall(r"^```[^\n]*\n(.*?)^```[^\n]*$", text, re.M | re.S)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    errors = []
    task = (DOCS / "任务清单.md").read_text(encoding="utf-8")
    pairs = re.findall(r"\| \[x\] \| `([^`]+)` \| \[[^\]]+\]\(([^)]+)\)", task)
    covered_docs = {src for src, _ in pairs}
    originals = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode("utf-8").split("\0")
    for name in originals:
        if (name.endswith(".md") and not name.startswith("docs/中文/")) or name.endswith(("LICENSE", "LICENSE.txt", "OFL.txt", "assistant-rules.txt")) or name in {"LICENSE-MIT", "LICENSE-APACHE"}:
            if name not in covered_docs:
                errors.append(f"没有翻译映射: {name}")
    code_count = 0
    for source, dest in pairs:
        a, b = ROOT / source, DOCS / dest
        if not a.is_file() or not b.is_file():
            errors.append(f"翻译文件缺失: {source} -> {dest}")
            continue
        expected = blocks(a.read_text(encoding="utf-8"))
        actual = blocks(b.read_text(encoding="utf-8"))
        for index, block in enumerate(expected):
            if index in BLOCK_EXCEPTIONS.get(source, set()):
                continue
            code_count += 1
            if block not in actual:
                errors.append(f"代码示例未保留: {source} -> {dest}")
    local_count = 0
    docs = sorted(DOCS.glob("*.md"))
    for p in docs:
        text = p.read_text(encoding="utf-8")
        if "\ufffd" in text or re.search(r"<!-- [^:]+:\d+ -->", text):
            errors.append(f"编码替换符或未展开占位符: {p.name}")
        if len(re.findall(r"^```", text, re.M)) % 2:
            errors.append(f"代码围栏不成对: {p.name}")
        body = prose(text)
        links = re.findall(r"!?\[[^\]\n]*\]\(([^\n]+?)\)", body)
        links += re.findall(r'(?:src|href)="([^"\n]+)"', body)
        for link in links:
            link = link.strip().removeprefix("<").removesuffix(">")
            if urlsplit(link).scheme or link.startswith("//"):
                continue
            path, _, fragment = unquote(link).partition("#")
            target = (p.parent / path).resolve() if path else p
            local_count += 1
            if not target.exists():
                errors.append(f"链接目标不存在: {p.name}: {link}")
            elif fragment and target.suffix == ".md" and fragment not in anchors(target.read_text(encoding="utf-8")):
                errors.append(f"锚点不存在: {p.name}: {link}")
    coverage = (DOCS / "源码覆盖清单.md").read_text(encoding="utf-8")
    listed = re.findall(r"^\| \[([^\]]+)\]\(\.\./\.\./[^)]+\) \|", coverage, re.M)
    sources = source_files()
    for name in sorted(set(sources) - set(listed)):
        errors.append(f"源码没有研究索引: {name}")
    for name in sorted(set(listed) - set(sources)):
        errors.append(f"索引中的源码不存在或不在范围: {name}")
    for name, count in Counter(listed).items():
        if count != 1:
            errors.append(f"源码索引重复: {name}")
    print(f"翻译映射 {len(pairs)} 项；中文 Markdown {len(docs)} 篇；本地链接 {local_count} 个；原样代码块 {code_count} 个；源码/工程文件 {len(sources)} 个。")
    if errors:
        for error in errors:
            print("FAIL:", error)
        return 1
    print("PASS: 离线文档检查通过（不代表运行或硬件验收）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
