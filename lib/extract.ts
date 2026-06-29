import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

const execFileAsync = promisify(execFile);

// مسار بايثون داخل البيئة المعزولة ومُستخرِج PyMuPDF.
// نبني الجزء "scripts" وقت التشغيل (وليس نصاً ثابتاً) كي لا يحاول Turbopack
// أثناء build تتبّع/حزم مجلّد scripts/.venv الذي يحوي روابط رمزية لبايثون
// النظام (تشير خارج جذر المشروع فيفشل البناء). السلوك وقت التشغيل لا يتغيّر.
const SCRIPTS_DIR = process.env.SCRIPTS_DIR || ["scripts"].join("");
const PY = path.join(process.cwd(), SCRIPTS_DIR, ".venv", "bin", "python");
const PY_SCRIPT = path.join(process.cwd(), SCRIPTS_DIR, "pdf_to_text.py");

// استخراج نص PDF عبر PyMuPDF (جودة عربية أعلى بكثير). يُعيد null عند تعذّره.
async function extractPdfWithPyMuPDF(buffer: Buffer): Promise<string | null> {
  if (!fs.existsSync(PY) || !fs.existsSync(PY_SCRIPT)) return null;
  const tmp = path.join(
    os.tmpdir(),
    `law-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`,
  );
  try {
    await fs.promises.writeFile(tmp, buffer);
    const { stdout } = await execFileAsync(PY, [PY_SCRIPT, tmp], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const text = stdout.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    fs.promises.unlink(tmp).catch(() => {});
  }
}

// استخراج النص الخام من ملف مرفوع حسب نوعه
export async function extractTextFromFile(
  filename: string,
  buffer: Buffer,
): Promise<string> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".pdf")) {
    // الأفضل: PyMuPDF. وإن لم يتوفّر نلجأ إلى unpdf.
    const viaPy = await extractPdfWithPyMuPDF(buffer);
    if (viaPy) return viaPy;

    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }

  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (lower.endsWith(".doc")) {
    // ملفات .doc القديمة غير مدعومة مباشرة — نطلب التحويل إلى docx
    throw new Error(
      "صيغة .doc القديمة غير مدعومة. الرجاء تحويل الملف إلى .docx أو .pdf",
    );
  }

  // نعتبر أي شيء آخر نصاً عادياً (txt, md ...)
  return buffer.toString("utf-8");
}
