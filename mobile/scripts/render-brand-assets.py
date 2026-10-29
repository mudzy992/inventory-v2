#!/usr/bin/env python3
"""Rasterize Evidens brand mark into Expo icon / splash PNGs."""

from pathlib import Path

import cairo

OUT = Path(__file__).resolve().parents[1] / "assets" / "images"
BRAND = (0x4F / 255, 0x46 / 255, 0xE5 / 255)
BRAND_INK = (0x37 / 255, 0x30 / 255, 0xA3 / 255)
WHITE = (1, 1, 1)


def draw_mark(ctx: cairo.Context, cx: float, cy: float, size: float, rgb=WHITE) -> None:
    scale = size / 24.0
    ctx.save()
    ctx.translate(cx - size / 2, cy - size / 2)
    ctx.scale(scale, scale)
    ctx.set_source_rgba(*rgb, 0.96)
    ctx.move_to(12, 3.2)
    ctx.line_to(20.2, 7.4)
    ctx.line_to(12, 11.6)
    ctx.line_to(3.8, 7.4)
    ctx.close_path()
    ctx.fill()
    ctx.set_line_width(1.7)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    ctx.set_source_rgba(*rgb, 0.82)
    ctx.move_to(4.6, 11.4)
    ctx.line_to(12, 15.05)
    ctx.line_to(19.4, 11.4)
    ctx.stroke()
    ctx.move_to(4.6, 15.6)
    ctx.line_to(12, 19.25)
    ctx.line_to(19.4, 15.6)
    ctx.stroke()
    ctx.restore()


def surface(size: int) -> cairo.ImageSurface:
    return cairo.ImageSurface(cairo.FORMAT_ARGB32, size, size)


def fill(ctx: cairo.Context, size: int, rgb, alpha: float = 1.0) -> None:
    ctx.set_source_rgba(*rgb, alpha)
    ctx.rectangle(0, 0, size, size)
    ctx.fill()


def radial_brand(ctx: cairo.Context, size: int) -> None:
    grad = cairo.RadialGradient(size * 0.5, size * 0.38, size * 0.08, size * 0.5, size * 0.55, size * 0.85)
    grad.add_color_stop_rgb(0, 0x63 / 255, 0x5B / 255, 0xF0 / 255)
    grad.add_color_stop_rgb(1, *BRAND_INK)
    ctx.set_source(grad)
    ctx.rectangle(0, 0, size, size)
    ctx.fill()


def save(surf: cairo.ImageSurface, name: str) -> None:
    path = OUT / name
    surf.write_to_png(str(path))
    print(path)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    size = 1024

    icon = surface(size)
    ctx = cairo.Context(icon)
    radial_brand(ctx, size)
    draw_mark(ctx, size / 2, size / 2, 560)
    save(icon, "icon.png")

    fg = surface(size)
    ctx = cairo.Context(fg)
    draw_mark(ctx, size / 2, size / 2, 520)
    save(fg, "android-icon-foreground.png")

    bg = surface(size)
    ctx = cairo.Context(bg)
    radial_brand(ctx, size)
    save(bg, "android-icon-background.png")

    mono = surface(size)
    ctx = cairo.Context(mono)
    draw_mark(ctx, size / 2, size / 2, 520)
    save(mono, "android-icon-monochrome.png")

    splash = surface(size)
    ctx = cairo.Context(splash)
    draw_mark(ctx, size / 2, size / 2, 640)
    save(splash, "splash-icon.png")

    fav = surface(192)
    ctx = cairo.Context(fav)
    fill(ctx, 192, BRAND)
    draw_mark(ctx, 96, 96, 118)
    save(fav, "favicon.png")


if __name__ == "__main__":
    main()
