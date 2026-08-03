from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
SCALE = 3


PALETTE = {
    "transparent": (0, 0, 0, 0),
    "outer": (7, 13, 13, 255),
    "bronze": (100, 82, 52, 255),
    "bronze_light": (143, 120, 77, 255),
    "inner_edge": (30, 48, 44, 255),
    "jade": (17, 38, 40, 255),
    "jade_alt": (19, 43, 45, 255),
    "wood": (48, 39, 29, 255),
    "wood_alt": (54, 43, 31, 255),
    "bottom_shadow": (8, 21, 22, 255),
}


def clipped_rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], cut: int, fill):
    x0, y0, x1, y1 = box
    draw.polygon(
        [
            (x0 + cut, y0),
            (x1 - cut, y0),
            (x1, y0 + cut),
            (x1, y1 - cut),
            (x1 - cut, y1),
            (x0 + cut, y1),
            (x0, y1 - cut),
            (x0, y0 + cut),
        ],
        fill=fill,
    )


def make_button(width: int, height: int, fill: str) -> Image.Image:
    image = Image.new("RGBA", (width, height), PALETTE["transparent"])
    draw = ImageDraw.Draw(image)

    # A compact three-pixel frame: dark silhouette, one bronze rule, then the inset.
    # Nothing protrudes beyond the rectangular control bounds.
    clipped_rect(draw, (0, 0, width - 1, height - 1), 2, PALETTE["outer"])
    clipped_rect(draw, (1, 1, width - 2, height - 2), 1, PALETTE["bronze"])
    clipped_rect(draw, (2, 2, width - 3, height - 3), 1, PALETTE["inner_edge"])
    clipped_rect(draw, (3, 3, width - 4, height - 4), 0, PALETTE[fill])

    alt = PALETTE[f"{fill}_alt"]
    for y in range(6, height - 5, 7):
        draw.line((5, y, width - 6, y), fill=alt)

    # A single restrained highlight and a single bottom shadow replace bevel stacks.
    draw.line((5, 3, width - 6, 3), fill=PALETTE["bronze_light"])
    draw.line((5, height - 4, width - 6, height - 4), fill=PALETTE["bottom_shadow"])

    # One-pixel corner ticks retain the KunWu bronze language without becoming end caps.
    tick = PALETTE["bronze_light"]
    draw.point((3, 3), fill=tick)
    draw.point((width - 4, 3), fill=tick)
    draw.point((3, height - 4), fill=PALETTE["bronze"])
    draw.point((width - 4, height - 4), fill=PALETTE["bronze"])
    return image


def upscale(image: Image.Image) -> Image.Image:
    return image.resize((image.width * SCALE, image.height * SCALE), Image.Resampling.NEAREST)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    font_path = Path(__file__).resolve().parents[4] / "assets/fonts/ark-pixel-12px-proportional-zh_cn.ttf"
    try:
        return ImageFont.truetype(font_path, size=size)
    except OSError:
        return ImageFont.load_default()


def centered_text(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, font, fill):
    left, top, right, bottom = box
    text_box = draw.textbbox((0, 0), text, font=font)
    text_width = text_box[2] - text_box[0]
    text_height = text_box[3] - text_box[1]
    x = left + (right - left - text_width) // 2
    y = top + (bottom - top - text_height) // 2 - text_box[1]
    draw.text((x, y), text, font=font, fill=fill)


def make_preview(inline: Image.Image, footer: Image.Image) -> Image.Image:
    width, height = 1125, 900
    preview = Image.new("RGBA", (width, height), (15, 23, 22, 255))
    draw = ImageDraw.Draw(preview)
    font_title = load_font(54)
    font_label = load_font(39)
    font_button = load_font(42)
    text_main = (226, 219, 194, 255)
    text_muted = (151, 164, 151, 255)

    draw.rectangle((36, 36, width - 37, height - 37), fill=(38, 32, 25, 255), outline=(107, 86, 55, 255), width=3)
    draw.rectangle((48, 48, width - 49, height - 49), outline=(28, 51, 48, 255), width=3)
    draw.text((75, 72), "通用按钮重设计｜轻薄矩形系统", font=font_title, fill=text_main)
    draw.text((75, 145), "细边框 · 无侧柱 · 无底座 · 无阶梯外轮廓", font=font_label, fill=text_muted)

    draw.text((75, 235), "行内按钮  72×28", font=font_label, fill=text_muted)
    for x, label in [(75, "升级"), (321, "选择"), (567, "取消")]:
        preview.alpha_composite(inline, (x, 295))
        centered_text(draw, (x, 295, x + inline.width, 295 + inline.height), label, font_button, text_main)

    draw.line((75, 420, width - 76, 420), fill=(88, 72, 47, 255), width=3)
    draw.text((75, 465), "底部按钮  132×44", font=font_label, fill=text_muted)
    for x, label in [(75, "确认"), (489, "返回")]:
        preview.alpha_composite(footer, (x, 530))
        centered_text(draw, (x, 530, x + footer.width, 530 + footer.height), label, font_button, text_main)

    draw.text((75, 710), "普通态只保留一张 PNG", font=font_label, fill=text_muted)
    draw.text((75, 765), "按下、禁用与主次层级由运行时 Tint / Tween 表达", font=font_label, fill=text_muted)
    return preview


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    inline_logical = make_button(72, 28, "jade")
    footer_logical = make_button(132, 44, "wood")
    inline = upscale(inline_logical)
    footer = upscale(footer_logical)

    inline.save(ROOT / "ui_common_button_inline_redesign_v2.png")
    footer.save(ROOT / "ui_common_button_footer_redesign_v2.png")
    make_preview(inline, footer).save(ROOT / "common_button_redesign_preview.png")


if __name__ == "__main__":
    main()
