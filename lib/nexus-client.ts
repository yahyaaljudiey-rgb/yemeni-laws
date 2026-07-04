export type NexusRole = "user" | "assistant";

export interface NexusMessage {
  role: NexusRole;
  content: string;
}

export interface NexusReply {
  content: string;
  model: string;
  latencyMs: number;
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
): Promise<NexusReply> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 125_000);
  try {
    const response = await fetch(endpoint(baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.slice(-12),
        system: LEGAL_SYSTEM,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => null)) as {
      content?: string;
      model?: string;
      latency_ms?: number;
      detail?: string;
    } | null;
    if (!response.ok) {
      throw new Error(data?.detail || `رفض خادم Nexus الطلب (${response.status})`);
    }
    if (!data?.content?.trim()) throw new Error("أعاد Nexus إجابة فارغة");
    return {
      content: data.content.trim(),
      model: data.model || "Nexus",
      latencyMs: data.latency_ms ?? 0,
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
