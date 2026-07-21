from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "extension" / "icons"
DOCS = ROOT / "docs"


def font(size: int, bold: bool = False):
    candidates = [
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def rounded_rectangle(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_icon(size: int):
    scale = size / 128
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    rounded_rectangle(draw, [0, 0, size - 1, size - 1], int(26 * scale), (20, 92, 180, 255))
    rounded_rectangle(draw, [int(8 * scale), int(8 * scale), int(120 * scale), int(120 * scale)], int(22 * scale), (25, 116, 210, 255))
    draw.polygon(
        [
            (int(86 * scale), int(8 * scale)),
            (int(120 * scale), int(8 * scale)),
            (int(120 * scale), int(42 * scale)),
        ],
        fill=(255, 194, 77, 255),
    )
    rounded_rectangle(
        draw,
        [int(28 * scale), int(24 * scale), int(88 * scale), int(98 * scale)],
        int(9 * scale),
        (246, 250, 255, 255),
    )
    draw.line(
        [(int(41 * scale), int(42 * scale)), (int(76 * scale), int(42 * scale))],
        fill=(20, 92, 180, 255),
        width=max(1, int(7 * scale)),
    )
    draw.line(
        [(int(41 * scale), int(60 * scale)), (int(72 * scale), int(60 * scale))],
        fill=(76, 138, 206, 255),
        width=max(1, int(5 * scale)),
    )
    draw.line(
        [(int(41 * scale), int(76 * scale)), (int(66 * scale), int(76 * scale))],
        fill=(76, 138, 206, 255),
        width=max(1, int(5 * scale)),
    )

    badge = [int(70 * scale), int(70 * scale), int(113 * scale), int(113 * scale)]
    rounded_rectangle(draw, badge, int(13 * scale), (22, 34, 51, 255))
    text = "W"
    fnt = font(max(10, int(31 * scale)), True)
    bbox = draw.textbbox((0, 0), text, font=fnt)
    draw.text(
        (
            (badge[0] + badge[2] - (bbox[2] - bbox[0])) / 2,
            (badge[1] + badge[3] - (bbox[3] - bbox[1])) / 2 - int(2 * scale),
        ),
        text,
        font=fnt,
        fill=(255, 255, 255, 255),
    )
    return img


def draw_cover():
    width, height = 1280, 640
    img = Image.new("RGB", (width, height), (238, 243, 247))
    draw = ImageDraw.Draw(img)

    for y in range(height):
        blue = int(247 - y * 0.025)
        draw.line([(0, y), (width, y)], fill=(blue, min(252, blue + 3), 255))

    rounded_rectangle(draw, [70, 70, 1210, 570], 36, (255, 255, 255), (216, 225, 234), 2)
    draw_icon(160).save(DOCS / "_tmp_icon.png")
    icon = Image.open(DOCS / "_tmp_icon.png")
    img.paste(icon, (126, 132), icon)

    title_font = font(62, True)
    sub_font = font(28)
    small_font = font(23)
    draw.text((330, 135), "Instant Wordbook", font=title_font, fill=(18, 32, 50))
    draw.text((333, 222), "Selection translation, local wordbook, dashboard, export.", font=sub_font, fill=(73, 86, 102))

    chips = ["Manifest V3", "IndexedDB", "Local Proxy", "CSV / XLSX / PDF"]
    x = 333
    for chip in chips:
        bbox = draw.textbbox((0, 0), chip, font=small_font)
        chip_w = bbox[2] - bbox[0] + 34
        rounded_rectangle(draw, [x, 312, x + chip_w, 360], 12, (231, 240, 255), (193, 213, 243), 1)
        draw.text((x + 17, 321), chip, font=small_font, fill=(25, 103, 210))
        x += chip_w + 14

    card_x, card_y = 820, 372
    card_w, card_h = 325, 170
    rounded_rectangle(draw, [card_x, card_y, card_x + card_w, card_y + card_h], 20, (251, 253, 255), (209, 219, 231), 2)
    draw.text((card_x + 34, card_y + 34), "wildfires", font=font(34, True), fill=(18, 32, 50))
    draw.text((card_x + 34, card_y + 86), "森林大火", font=font(25, True), fill=(18, 32, 50))
    draw.text((card_x + 34, card_y + 132), "n.", font=font(22, True), fill=(25, 103, 210))
    draw.text((card_x + 85, card_y + 130), "1. 迅速蔓延的大火\n2. 野火，森林火灾", font=font(21), fill=(43, 56, 72), spacing=9)

    draw.text((126, 482), "Select text, press Shift, save words locally.", font=small_font, fill=(90, 103, 119))
    tmp = DOCS / "_tmp_icon.png"
    if tmp.exists():
        tmp.unlink()
    return img


def main():
    ICONS.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        draw_icon(size).save(ICONS / f"icon-{size}.png")
    draw_cover().save(DOCS / "cover.png", quality=95)


if __name__ == "__main__":
    main()
