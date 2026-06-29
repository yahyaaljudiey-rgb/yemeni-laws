#!/usr/bin/env python3
"""
تنزيل ملفات القوانين (PDF) من قناة تلجرام.

الإعداد (متغيّرات البيئة):
  TG_API_ID     من https://my.telegram.org
  TG_API_HASH   من https://my.telegram.org
  TG_CHANNEL    رابط/معرّف القناة (مثال: https://t.me/xxxx أو @xxxx أو الرابط الخاص)

أول تشغيل يطلب رقم هاتفك ورمز التحقق (يصل عبر تلجرام) — لمرة واحدة،
ثم تُحفظ الجلسة في scripts/tg.session فلا يُطلب مجدداً.

الاستخدام:
  scripts/.venv/bin/python scripts/download_from_telegram.py
"""
import os
import re
import sys
import asyncio
from pathlib import Path

from telethon import TelegramClient
from telethon.tl.types import DocumentAttributeFilename

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "telegram-pdfs"
SESSION = str(Path(__file__).resolve().parent / "tg")

API_ID = os.environ.get("TG_API_ID")
API_HASH = os.environ.get("TG_API_HASH")
CHANNEL = os.environ.get("TG_CHANNEL")


def doc_filename(message) -> str | None:
    """استخراج اسم الملف من رسالة وثيقة، إن وُجد."""
    doc = getattr(message, "document", None)
    if not doc:
        return None
    for attr in doc.attributes:
        if isinstance(attr, DocumentAttributeFilename):
            return attr.file_name
    return None


def is_pdf(message) -> bool:
    doc = getattr(message, "document", None)
    if not doc:
        return False
    if (doc.mime_type or "").lower() == "application/pdf":
        return True
    name = doc_filename(message) or ""
    return name.lower().endswith(".pdf")


def safe_name(name: str) -> str:
    name = re.sub(r"[\\/:*?\"<>|\n\r\t]+", "_", name).strip()
    return name[:180] or "law.pdf"


async def main():
    missing = [k for k, v in {
        "TG_API_ID": API_ID, "TG_API_HASH": API_HASH, "TG_CHANNEL": CHANNEL
    }.items() if not v]
    if missing:
        print("✗ متغيّرات ناقصة:", ", ".join(missing))
        print("  اضبطها ثم أعد التشغيل. انظر تعليمات الرأس في الملف.")
        sys.exit(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    client = TelegramClient(SESSION, int(API_ID), API_HASH)
    await client.start()  # تفاعلي أول مرة فقط (هاتف + رمز)

    entity = await client.get_entity(CHANNEL)
    print(f"• القناة: {getattr(entity, 'title', CHANNEL)}")
    print(f"• مجلد الحفظ: {OUT_DIR}")

    seen = 0
    saved = 0
    skipped = 0
    async for message in client.iter_messages(entity):
        if not is_pdf(message):
            continue
        seen += 1
        fname = safe_name(doc_filename(message) or f"msg_{message.id}.pdf")
        if not fname.lower().endswith(".pdf"):
            fname += ".pdf"
        # نُسبق الاسم بمعرّف الرسالة لتفادي تكرار الأسماء
        dest = OUT_DIR / f"{message.id}__{fname}"
        if dest.exists() and dest.stat().st_size > 0:
            skipped += 1
            continue
        try:
            await message.download_media(file=str(dest))
            saved += 1
            print(f"  ✓ [{saved}] {fname}")
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ فشل {fname}: {e}")

    print(f"\nانتهى. ملفات PDF موجودة: {seen} | نُزّلت الآن: {saved} | موجودة مسبقاً: {skipped}")
    print(f"المسار: {OUT_DIR}")
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
