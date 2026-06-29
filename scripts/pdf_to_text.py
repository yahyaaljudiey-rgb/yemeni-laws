#!/usr/bin/env python3
"""
استخراج نص عربي نظيف من PDF باستخدام PyMuPDF.

- يحافظ على المسافات وترتيب القراءة (أفضل بكثير من unpdf مع العربية).
- يحذف تذييلات/ترويسات الصفحات المتكررة تلقائياً (أرقام الصفحات، الروابط...).

الاستخدام:
  pdf_to_text.py <ملف.pdf>              # يطبع النص على المخرج القياسي
  pdf_to_text.py <ملف.pdf> <خرج.txt>    # يكتب إلى ملف
"""
import sys
import re
from collections import Counter

import fitz  # PyMuPDF


def normalize_line(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def extract_clean(pdf_path: str) -> str:
    doc = fitz.open(pdf_path)
    pages = [doc[p].get_text("text") for p in range(doc.page_count)]

    # نحذف فقط أسطر الضجيج المعروفة (روابط، اسم المكتبة، أرقام الصفحات)
    # دون أي حذف بالتردد حتى لا نخسر رؤوس مواد حقيقية.
    drop_patterns = [
        re.compile(r"https?://", re.I),
        re.compile(r"facebook\.com", re.I),
        re.compile(r"www\.", re.I),
        re.compile(r"^//:?$"),
        re.compile(r"مكتبة\s*القاضي\s*صالح"),
        re.compile(r"^الصفحة\s*\d+\s*$"),
        re.compile(r"^من\s*\d+\s*$"),
        re.compile(r"^salah", re.I),
    ]

    out_lines = []
    for pg in pages:
        for ln in pg.splitlines():
            key = normalize_line(ln)
            if not key:
                continue
            if any(p.search(key) for p in drop_patterns):
                continue
            out_lines.append(ln)
        out_lines.append("")  # فاصل بين الصفحات

    text = "\n".join(out_lines)
    # تنظيف عام
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def main():
    if len(sys.argv) < 2:
        print("الاستخدام: pdf_to_text.py <ملف.pdf> [خرج.txt]", file=sys.stderr)
        sys.exit(1)
    text = extract_clean(sys.argv[1])
    if len(sys.argv) >= 3:
        with open(sys.argv[2], "w", encoding="utf-8") as f:
            f.write(text)
        print(f"كُتب {len(text)} حرف إلى {sys.argv[2]}", file=sys.stderr)
    else:
        sys.stdout.write(text)


if __name__ == "__main__":
    main()
