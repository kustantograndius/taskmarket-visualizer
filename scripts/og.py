#!/usr/bin/env python3
"""Taskmarket Live Market Visualizer — OG image generator.

Renders 1200x630 social images from data/dashboard.json (written by
scripts/fetch.mjs). Deterministic: same input file -> byte-identical PNGs.

Usage (from the project root):
    python3 scripts/og.py [--data PATH] [--out-dir PATH]

Outputs (into <out-dir>, default public/):
    og.png         overview: open tasks / active agents 7d / rewards paid 7d
    og-flow.png    flow: rewards put up 7d / rewards paid 7d / settlements 7d
    og-market.png  market: tasks created 7d / tasks completed 7d / open tasks
    og-posters.png posters: distinct posters this week / last week / top share

Rules enforced here (from the Taskmarket brand kit):
  * one lockup per image, used as-is, top-left, >= 30% of frame width
  * one magenta italic word per headline, never a magenta background
  * only brand fonts (Instrument Serif / Inter Tight / Departure Mono)
  * no invented numbers: every figure comes from data.json; a missing
    field omits that stat line instead of showing a made-up value.
    Headline/flow are read per chain (never summed: the API returns
    platform-wide figures on each chain); posters use the busier chain
    and the card says which one.
  * no banned words (profit, returns, guaranteed, passive income, ...)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA = ROOT / "data" / "dashboard.json"
DEFAULT_OUT = ROOT / "public"

W, H = 1200, 630
MARGIN = 48
RIGHT = W - MARGIN

# Brand tokens (Taskmarket kit).
GROUND = (0x12, 0x10, 0x0E)
MAROON = (0x3A, 0x14, 0x20)
PANEL = (0x22, 0x1E, 0x1A)
LINE = (0x45, 0x3E, 0x37)
CREAM = (0xEF, 0xE9, 0xE2)
PAPER = (0xFF, 0xF6, 0xE8)
MUTED = (0xB0, 0xA7, 0x9D)
MAGENTA = (0xE7, 0x40, 0x79)
SALMON = (0xD9, 0xA0, 0x97)

PLATE = ROOT / "public" / "img" / "plate-converge-landscape.jpg"
LOCKUP = ROOT / "public" / "img" / "taskmarket-lockup.png"


def load_font(filename: str, fallback: str, size: int, wght: int | None = None):
    """Prefer the shipped subsetted woff2; fall back to the kit original."""
    for path in (ROOT / "public" / "fonts" / filename,
                 ROOT / "brand-kit" / fallback):
        if path.exists():
            font = ImageFont.truetype(str(path), size)
            if wght is not None:
                try:
                    font.set_variation_by_axes([wght])
                except Exception:
                    pass
            return font
    raise FileNotFoundError(f"no font found: {filename} / {fallback}")


def fonts():
    return {
        "serif": load_font("InstrumentSerif-Regular.woff2",
                           "InstrumentSerif-Regular.ttf", 70),
        "serif_it": load_font("InstrumentSerif-Italic.woff2",
                              "InstrumentSerif-Italic.ttf", 70),
        "sans": load_font("InterTight-Variable.woff2",
                          "InterTight-Variable.ttf", 19, wght=600),
        "sans_body": load_font("InterTight-Variable.woff2",
                               "InterTight-Variable.ttf", 20, wght=400),
        "mono": load_font("DepartureMono-Regular.woff2",
                          "DepartureMono-Regular.otf", 42),
        "mono_sm": load_font("DepartureMono-Regular.woff2",
                             "DepartureMono-Regular.otf", 17),
        "mono_tag": load_font("DepartureMono-Regular.woff2",
                              "DepartureMono-Regular.otf", 20),
    }


def fmt_count(value) -> str | None:
    if value is None:
        return None
    try:
        return f"{int(value):,}"
    except (TypeError, ValueError):
        return None


def fmt_money(micro) -> str | None:
    """Micro units (1 USDC = 1,000,000 micro) -> $ figure, no invented precision."""
    if micro is None:
        return None
    try:
        dollars = int(micro) / 1_000_000
    except (TypeError, ValueError):
        try:
            dollars = float(micro) / 1_000_000
        except (TypeError, ValueError):
            return None
    if dollars >= 1000:
        return f"${dollars:,.0f}"
    return f"${dollars:,.2f}"


def fmt_pct(value) -> str | None:
    if value is None:
        return None
    try:
        return f"{float(value):.1f}%"
    except (TypeError, ValueError):
        return None


def short_addr(addr: str | None) -> str | None:
    if not addr or len(addr) < 10:
        return addr
    return f"{addr[:6]}…{addr[-4:]}"


def background() -> Image.Image:
    """Plate image, centre-cropped to 1200x630 and darkened for type."""
    plate = Image.open(PLATE).convert("RGB")
    # Centre-crop to the 1200:630 aspect, then resize exactly.
    target_ratio = W / H
    pw, ph = plate.size
    if pw / ph > target_ratio:
        nw = int(ph * target_ratio)
        x0 = (pw - nw) // 2
        plate = plate.crop((x0, 0, x0 + nw, ph))
    else:
        nh = int(pw / target_ratio)
        y0 = (ph - nh) // 2
        plate = plate.crop((0, y0, pw, y0 + nh))
    plate = plate.resize((W, H), Image.LANCZOS)
    plate = ImageEnhance.Brightness(plate).enhance(0.5)
    plate = ImageEnhance.Color(plate).enhance(0.85)

    # Darken overall, more towards the bottom where the stats sit.
    overlay = Image.new("RGBA", (W, H), GROUND + (0,))
    grad = Image.new("L", (1, H))
    grad.putdata([int(70 + (215 - 70) * (y / (H - 1))) for y in range(H)])
    alpha = grad.resize((W, H))
    overlay.putalpha(alpha)
    return Image.alpha_composite(plate.convert("RGBA"), overlay).convert("RGB")


def draw_runs(draw: ImageDraw.ImageDraw, x: int, y: int,
              runs, f: dict) -> int:
    """Draw [(text, accent_bool), ...] left to right; return end x."""
    for text, accent in runs:
        font = f["serif_it"] if accent else f["serif"]
        colour = MAGENTA if accent else CREAM
        draw.text((x, y), text, font=font, fill=colour)
        x += int(font.getlength(text))
    return x


def render(view: str, lines, stats, tag: str, out_path: Path, f: dict) -> None:
    """lines: list of run-lists; stats: list of (label, value, sub|None)."""
    img = background()
    draw = ImageDraw.Draw(img)

    # Lockup top-left, as-is, 360 px wide = 30% of the frame.
    lockup = Image.open(LOCKUP).convert("RGBA")
    lw = 360
    lh = round(lw * lockup.height / lockup.width)
    lockup = lockup.resize((lw, lh), Image.LANCZOS)
    img.paste(lockup, (MARGIN, 40), lockup)

    # View tag top-right in mono.
    draw.text((RIGHT, 56), tag, font=f["mono_tag"], fill=MUTED, anchor="ra")

    # Serif headline, one magenta italic word per piece.
    y = 168
    for runs in lines:
        draw_runs(draw, MARGIN, y, runs, f)
        y += 82

    # Stats row (only the stats we actually have).
    stats = [s for s in stats if s[1] is not None]
    if stats:
        draw.line([(MARGIN, 396), (RIGHT, 396)], fill=LINE, width=1)
        col_w = (RIGHT - MARGIN) / len(stats)
        for i, (label, value, sub) in enumerate(stats):
            x = MARGIN + int(i * col_w)
            draw.text((x, 416), label, font=f["sans"], fill=MUTED)
            draw.text((x, 444), value, font=f["mono"], fill=CREAM)
            if sub:
                draw.text((x, 502), sub, font=f["mono_sm"], fill=MUTED)

    # Footer.
    draw.text((MARGIN, 576), "Live market data · taskmarket.dev",
              font=f["sans_body"], fill=MUTED)

    img.save(out_path, "PNG", optimize=True)


def chain_sections(data: dict):
    """Headline/flow/posters as the fetch script actually writes them.

    Spec schema (top-level headline/flow/posters) is honoured first.
    The real data/dashboard.json nests them per chain under
    chains.<id>.headline / .flow / .postersPerWeek / .topPosters, and the
    API returns platform-wide headline/flow figures, identical on both
    chains for every field used here -- so read one chain (Base 8453,
    then Tempo 4217) and never sum across chains: summing would
    double-count the same platform totals. Poster counts ARE
    chain-specific, so the posters view uses the busier chain (most
    distinct posters this week) and says which chain in its tag.
    """
    headline = data.get("headline") or {}
    flow = data.get("flow") or {}
    posters = data.get("posters") or {}
    chains = data.get("chains") or {}

    if not headline:
        for cid in ("8453", "4217"):
            headline = (chains.get(cid) or {}).get("headline") or {}
            if headline:
                break
    if not flow:
        for cid in ("8453", "4217"):
            flow = (chains.get(cid) or {}).get("flow") or {}
            if flow:
                break

    poster_chain = None
    if not posters:
        best = None
        for cid in ("4217", "8453"):
            ch = chains.get(cid) or {}
            weeks = sorted(ch.get("postersPerWeek") or [],
                           key=lambda w: w.get("week", ""))
            if len(weeks) < 1:
                continue
            this_week = weeks[-1].get("distinct")
            last_week = weeks[-2].get("distinct") if len(weeks) >= 2 else None
            top = (ch.get("topPosters") or [None])[0] or {}
            cand = {"distinctThisWeek": this_week,
                    "distinctLastWeek": last_week,
                    "top": [top] if top else []}
            if best is None or (this_week or 0) > (best[0] or 0):
                best = (this_week or 0, cand, cid)
        if best is not None:
            posters = best[1]
            poster_chain = best[2]
    return headline, flow, posters, poster_chain


CHAIN_LABEL = {"4217": "TEMPO", "8453": "BASE"}


def build_views(data: dict):
    """Return {filename: (headline_lines, stats, tag)} from data.json."""
    headline, flow, posters, poster_chain = chain_sections(data)
    top = (posters.get("top") or [None])[0] or {}

    put_up = flow.get("putUp7d", headline.get("rewardsPutUp7d"))
    paid = flow.get("paid7d", headline.get("rewardsPaid7d"))

    top_sub = None
    if top.get("displayName") or top.get("requester"):
        bits = [top.get("displayName") or short_addr(top.get("requester"))]
        if top.get("tasks") is not None:
            bits.append(f"{fmt_count(top['tasks'])} tasks")
        top_sub = " · ".join(b for b in bits if b)

    poster_tag = "POSTERS"
    if poster_chain:
        poster_tag = f"POSTERS · {CHAIN_LABEL.get(poster_chain, poster_chain)}"

    return {
        "og.png": (
            [[("Paid work for ", False)],
             [("agents,", True), (" live.", False)]],
            [("OPEN TASKS", fmt_count(headline.get("openTasks")), None),
             ("ACTIVE AGENTS · 7D", fmt_count(headline.get("activeAgents7d")), None),
             ("REWARDS PAID · 7D", fmt_money(headline.get("rewardsPaid7d")), None)],
            "OVERVIEW",
        ),
        "og-flow.png": (
            [[("Rewards put up,", False)],
             [("rewards ", False), ("paid.", True)]],
            [("PUT UP · 7D", fmt_money(put_up), None),
             ("PAID · 7D", fmt_money(paid), None),
             ("SETTLEMENTS · 7D", fmt_count(flow.get("settlements7d")), None)],
            "FLOW",
        ),
        "og-market.png": (
            [[("Tasks created,", False)],
             [("tasks ", False), ("completed.", True)]],
            [("CREATED · 7D", fmt_count(headline.get("tasksCreated7d")), None),
             ("COMPLETED · 7D", fmt_count(headline.get("completedTasks7d")), None),
             ("OPEN TASKS", fmt_count(headline.get("openTasks")), None)],
            "MARKET",
        ),
        "og-posters.png": (
            [[("The people", False)],
             [("behind the ", False), ("work.", True)]],
            [("POSTERS THIS WEEK", fmt_count(posters.get("distinctThisWeek")), None),
             ("POSTERS LAST WEEK", fmt_count(posters.get("distinctLastWeek")), None),
             ("TOP POSTER SHARE", fmt_pct(top.get("sharePct")), top_sub)],
            poster_tag,
        ),
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--data", default=str(DEFAULT_DATA))
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT))
    args = ap.parse_args(argv)

    data_path = Path(args.data)
    out_dir = Path(args.out_dir)
    if not data_path.exists():
        print(f"error: data file not found: {data_path}\n"
              "run scripts/fetch.mjs first to produce data/dashboard.json",
              file=sys.stderr)
        return 2
    try:
        data = json.loads(data_path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(f"error: cannot read {data_path}: {exc}", file=sys.stderr)
        return 2

    f = fonts()
    out_dir.mkdir(parents=True, exist_ok=True)
    for filename, (lines, stats, tag) in build_views(data).items():
        render(filename, lines, stats, tag, out_dir / filename, f)
        print(f"wrote {out_dir / filename}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
