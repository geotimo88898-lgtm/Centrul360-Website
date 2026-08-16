#!/usr/bin/env python3
"""
Generează Catalog-Rezultate-Centrul360.pdf din catalog.html (A4 landscape, fonturi locale).

Rulare:
    python3 build_pdf.py

Necesită Chromium (Playwright). Pe acest mediu, Chromium e deja instalat la
/opt/pw-browsers — scriptul îl folosește direct, fără să încerce un download.
"""
import glob
import pathlib

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
SOURCE_HTML = HERE / "catalog.html"
OUTPUT_PDF = HERE / "Catalog-Rezultate-Centrul360.pdf"


def find_chromium_executable() -> str:
    candidates = sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome"))
    if not candidates:
        raise SystemExit("Nu găsesc Chromium în /opt/pw-browsers — verifică instalarea Playwright.")
    return candidates[-1]


def main() -> None:
    executable_path = find_chromium_executable()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=executable_path)
        page = browser.new_page()
        page.goto(SOURCE_HTML.as_uri())
        page.emulate_media(media="print")
        page.pdf(
            path=str(OUTPUT_PDF),
            print_background=True,
            prefer_css_page_size=True,
        )
        browser.close()
    print(f"OK -> {OUTPUT_PDF}")


if __name__ == "__main__":
    main()
