#!/usr/bin/env python3
"""Optimize repository images in place, or check whether they need optimization."""

from __future__ import annotations

import argparse
import io
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGE_DIR = ROOT / "images"
SUPPORTED = {".png", ".jpg", ".jpeg", ".webp"}
INSTALL_HINT = "python -m pip install -r scripts/requirements-dev.txt"


def human(size: int) -> str:
    return f"{size / 1024:.1f} KB"


def optimize_png(data: bytes, level: int) -> bytes:
    try:
        import oxipng
    except ImportError as exc:
        raise RuntimeError(f"缺少 oxipng，请先执行: {INSTALL_HINT}") from exc
    return bytes(oxipng.optimize_from_memory(data, level=level))


def optimize_jpeg(data: bytes, quality: int) -> bytes:
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(f"缺少 Pillow，请先执行: {INSTALL_HINT}") from exc
    with Image.open(io.BytesIO(data)) as image:
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=quality, optimize=True, progressive=True)
    return output.getvalue()


def optimize_webp(data: bytes, quality: int) -> bytes:
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(f"缺少 Pillow，请先执行: {INSTALL_HINT}") from exc
    with Image.open(io.BytesIO(data)) as image:
        output = io.BytesIO()
        image.save(output, format="WEBP", quality=quality, method=6)
    return output.getvalue()


def collect_files(candidates: list[str]) -> list[Path]:
    if candidates:
        paths = [Path(p) if Path(p).is_absolute() else ROOT / p for p in candidates]
    else:
        paths = [p for p in IMAGE_DIR.rglob("*") if p.is_file()]

    result: list[Path] = []
    for path in paths:
        resolved = path.resolve()
        if not resolved.is_file() or resolved.suffix.lower() not in SUPPORTED:
            continue
        if not resolved.is_relative_to(ROOT):
            print(f"跳过仓库外文件: {resolved}", file=sys.stderr)
            continue
        result.append(resolved)
    return sorted(set(result))


def optimize_bytes(path: Path, data: bytes, args: argparse.Namespace) -> bytes | None:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return optimize_png(data, args.level)
    if args.lossy_other and suffix in (".jpg", ".jpeg"):
        return optimize_jpeg(data, args.jpeg_quality)
    if args.lossy_other and suffix == ".webp":
        return optimize_webp(data, args.webp_quality)
    return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="*", help="要处理的文件；不传则扫描 images/ 下全部图片")
    parser.add_argument("--all", action="store_true", help="显式扫描 images/ 下全部图片")
    parser.add_argument("--check", action="store_true", help="只检测，不写盘；发现可优化图片时退出码为 1")
    parser.add_argument("--level", type=int, default=4, help="oxipng 压缩级别 0-6，默认 4")
    parser.add_argument("--min-savings", type=float, default=5.0, help="收益低于该百分比时跳过，默认 5")
    parser.add_argument("--jpeg-quality", type=int, default=85, help="JPEG 重编码质量，默认 85")
    parser.add_argument("--webp-quality", type=int, default=82, help="WebP 重编码质量，默认 82")
    parser.add_argument("--lossy-other", action="store_true", help="可选：重编码 JPEG/WebP（有损）；PNG 始终无损")
    parser.add_argument("--changed-files-out", help="把实际改动的文件路径按行写入指定文件，供 pre-commit 重新 add")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    files = collect_files(args.files)

    if not files:
        print("没有找到需要处理的图片。")
        return 0

    changed: list[Path] = []
    saved = 0

    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        original = path.read_bytes()
        optimized = optimize_bytes(path, original, args)

        if optimized is None:
            print(f"{rel}: 跳过（PNG 无损优化；JPEG/WebP 需 --lossy-other）")
            continue
        if len(optimized) >= len(original):
            print(f"{rel}: 跳过（优化后没有变小）")
            continue

        savings = (len(original) - len(optimized)) / len(original) * 100
        if savings < args.min_savings:
            print(f"{rel}: 跳过（收益 {savings:.1f}% 低于阈值 {args.min_savings}%）")
            continue

        detail = f"{human(len(original))} -> {human(len(optimized))} (-{savings:.1f}%)"
        if args.check:
            print(f"[需优化] {rel}: {detail}")
            changed.append(path)
            saved += len(original) - len(optimized)
            continue

        temp = path.with_name(f".{path.name}.opt.tmp")
        try:
            temp.write_bytes(optimized)
            os.replace(temp, path)
        finally:
            if temp.exists():
                temp.unlink()
        print(f"{rel}: {detail}")
        changed.append(path)
        saved += len(original) - len(optimized)

    if args.changed_files_out:
        output = Path(args.changed_files_out)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(
            "".join(p.relative_to(ROOT).as_posix() + "\n" for p in changed).encode("utf-8")
        )

    if changed:
        verb = "需要优化" if args.check else "已优化"
        print(f"\n{verb} {len(changed)} 个文件，预计节省 {human(saved)}。")
        if args.check:
            print("请运行: python scripts/optimize_images.py && git add -A && git commit -m 'chore: optimize images'")
            return 1
    else:
        print("\n所有图片都已处于优化状态。")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as exc:
        print(f"错误: {exc}", file=sys.stderr)
        sys.exit(2)
