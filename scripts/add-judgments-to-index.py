"""إضافة الأحكام القضائية (بنصّها الكامل) إلى فهرس النواة المشتقّ (yemeni_law_index.db).
يجعل الشات يسترجع السوابق القضائية ويستشهد بنصّها.

- يحذف أي أحكام سبق إضافتها (b_table='yemeni_ruling') لتفادي التكرار عند إعادة التشغيل.
- يُدرج كل قاعدة كوثيقة: النص = الموضوع + النصّ الكامل.
- يعيد بناء FTS مرّة واحدة.

التشغيل: python scripts/add-judgments-to-index.py
"""
import json, sqlite3, time, os

IDX = "/home/yahya/shamela-ai/local-data/yemeni_law_index.db"
JUD = "/home/yahya/المكتبة القنونية/public/data/judgments.json"


def main():
    t0 = time.time()
    data = json.load(open(JUD, encoding="utf-8"))
    con = sqlite3.connect(IDX)

    # إزالة أي أحكام سابقة (idempotent)
    con.execute("DELETE FROM documents WHERE b_table='yemeni_ruling'")
    max_id = con.execute("SELECT COALESCE(MAX(id),0) FROM documents").fetchone()[0]

    rows = []
    nid = max_id
    for coll in data["collections"]:
        for r in coll["rules"]:
            subject = (r.get("subject") or "").strip()
            content = (r.get("content") or "").strip()
            if not subject and not content:
                continue
            nid += 1
            # النص المفهرس = الموضوع (القاعدة) + النصّ الكامل للحكم
            text = subject if not content else f"{subject}\n\n{content}"
            section = f"قاعدة ({r.get('n','')}) — قضية {r.get('case','')}".strip(" —")
            rows.append((
                nid,
                800000 + coll["issueNum"],          # book_id
                coll["collection"],                  # book_title
                "المحكمة العليا اليمنية",             # author
                None, None, None, None,
                "أحكام قضائية",                      # category_name
                "judgment",                          # source_tier
                coll["category"],                    # part = الفئة
                str(r.get("page", "")),              # page
                section,                             # section_title
                text,                                # text
                "app://judgments",                   # mdb_path
                "yemeni_ruling",                     # b_table
                None,
            ))

    con.executemany(
        """INSERT INTO documents
           (id, book_id, book_title, author, editor, publisher, publish_year,
            edition, category_name, source_tier, part, page, section_title,
            text, mdb_path, b_table, text_row_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        rows,
    )
    print(f"… أُدرج {len(rows)} حكماً — إعادة بناء FTS…", flush=True)
    con.execute("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')")
    con.commit()
    total = con.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    con.close()
    size = os.path.getsize(IDX) / 1e6
    print(f"✓ الإجمالي الآن: {total} وثيقة ({size:.0f}م) في {time.time()-t0:.0f}s")


main()
