export type NexusRole = "user" | "assistant";

export interface NexusMessage {
  role: NexusRole;
  content: string;
}

export interface NexusCitation {
  ref: number;
  source: string;
  documentId: string;
  chunkId: string;
  score: number;
  // Phase 14 (اختياري، إضافي): مصدرية/تعاضد الدليل عبر مصادر المعرفة
  provenance?: Record<string, unknown>;
}

export interface NexusReply {
  content: string;
  model: string;
  latencyMs: number;
  citations: NexusCitation[];
}

// خيارات الاستدعاء: مفتاح المصادقة (لخادم مُستضاف) ومعرّف الجلسة (يفعّل ذاكرة Nexus عبر الجلسات)
export interface NexusOptions {
  apiKey?: string;
  sessionId?: string;
}

const LEGAL_SYSTEM = `أنت المستشار القانوني لتطبيق القوانين اليمنية. اعتمد على قاعدة المعرفة القانونية في NEXUS، واستشهد باسم القانون ورقم المادة متى توفر ذلك. إذا لم تجد نصاً كافياً فقل ذلك صراحةً ولا تخترع حكماً أو مادة. ميّز بوضوح أي قانون أو تعديل صادر بعد 2014 بوصفه غير معترف به في هذا التطبيق. أجب بالعربية بوضوح، واعتبر الإجابة شرحاً استرشادياً لا بديلاً عن النص الرسمي أو المختص القانوني.`;

function endpoint(baseUrl: string): string {
  const raw = baseUrl.trim().replace(/\/+$/, "");
  if (!raw) throw new Error("عنوان خادم Nexus غير مضبوط");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("عنوان خادم Nexus غير صحيح");
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("يجب أن يستخدم خادم Nexus اتصال HTTPS آمناً");
  }
  return `${raw}/chat`;
}

export async function nexusChat(
  baseUrl: string,
  messages: NexusMessage[],
  opts: NexusOptions = {},
): Promise<NexusReply> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 125_000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // المصادقة لخادم مُستضاف (auth مفعّل عند ضبط NEXUS_API_KEYS)
    if (opts.apiKey?.trim()) headers["X-API-Key"] = opts.apiKey.trim();
    const response = await fetch(endpoint(baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: messages.slice(-12),
        system: LEGAL_SYSTEM,
        temperature: 0.2,
        // معرّف الجلسة يفعّل ذاكرة Nexus عبر الجلسات (المرحلة 9)
        ...(opts.sessionId ? { session_id: opts.sessionId } : {}),
      }),
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => null)) as {
      content?: string;
      model?: string;
      latency_ms?: number;
      detail?: string;
      citations?: {
        ref: number; source: string; document_id: string; chunk_id: string; score: number;
        provenance?: Record<string, unknown>;
      }[];
    } | null;
    if (!response.ok) {
      throw new Error(data?.detail || `رفض خادم Nexus الطلب (${response.status})`);
    }
    if (!data?.content?.trim()) throw new Error("أعاد Nexus إجابة فارغة");
    return {
      content: data.content.trim(),
      model: data.model || "Nexus",
      latencyMs: data.latency_ms ?? 0,
      citations: (data.citations ?? []).map((c) => ({
        ref: c.ref,
        source: c.source,
        documentId: c.document_id,
        chunkId: c.chunk_id,
        score: c.score,
        provenance: c.provenance,
      })),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("انتهت مهلة الاتصال بخادم Nexus");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// بثّ الأجوبة (SSE): تُستدعى onToken لكل مقطع نصّي فور وصوله (تأثير «يكتب الآن»).
// تُرجع الجواب الكامل + الاستشهادات عند الانتهاء.
export async function nexusChatStream(
  baseUrl: string,
  messages: NexusMessage[],
  onToken: (delta: string) => void,
  opts: NexusOptions = {},
): Promise<NexusReply> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 125_000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.apiKey?.trim()) headers["X-API-Key"] = opts.apiKey.trim();
    const response = await fetch(endpoint(baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: messages.slice(-12),
        system: LEGAL_SYSTEM,
        temperature: 0.2,
        stream: true,
        ...(opts.sessionId ? { session_id: opts.sessionId } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      const data = (await response.json().catch(() => null)) as { detail?: string } | null;
      throw new Error(data?.detail || `رفض خادم Nexus الطلب (${response.status})`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let model = "Nexus";
    let citations: NexusCitation[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let event = "message";
        let dataStr = "";
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
        }
        if (!dataStr) continue;
        let data: { content?: string; model?: string; detail?: string;
          citations?: { ref: number; source: string; document_id: string; chunk_id: string; score: number;
            provenance?: Record<string, unknown> }[] };
        try { data = JSON.parse(dataStr); } catch { continue; }
        if (event === "token" && data.content) {
          content += data.content;
          onToken(data.content);
        } else if (event === "done") {
          model = data.model || model;
          citations = (data.citations ?? []).map((c) => ({
            ref: c.ref, source: c.source, documentId: c.document_id,
            chunkId: c.chunk_id, score: c.score, provenance: c.provenance,
          }));
        } else if (event === "error") {
          throw new Error(data.detail || "خطأ من خادم Nexus");
        }
      }
    }
    if (!content.trim()) throw new Error("أعاد Nexus إجابة فارغة");
    return { content: content.trim(), model, latencyMs: 0, citations };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("انتهت مهلة الاتصال بخادم Nexus");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
