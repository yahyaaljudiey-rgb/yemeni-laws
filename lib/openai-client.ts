import type { ClientHit } from "./client-search";
import type { NexusMessage } from "./nexus-client";

export interface OpenAIReply {
  content: string;
  model: string;
}

export async function openAIChat(
  proxyUrl: string,
  messages: NexusMessage[],
  hits: ClientHit[],
  calculatorContext?: string,
  appKnowledge?: string,
  userName?: string,
): Promise<OpenAIReply> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.slice(-10),
        hits: hits.slice(0, 8),
        calculatorContext,
        appKnowledge,
        userName,
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null) as {
      content?: string;
      model?: string;
      error?: string;
      detail?: string;
    } | null;
    if (!response.ok) {
      throw new Error(data?.error || data?.detail || `رفض ChatGPT الطلب (${response.status})`);
    }
    const content = data?.content?.trim();
    if (!content) throw new Error("أعاد ChatGPT إجابة فارغة");
    return { content, model: data?.model || "ChatGPT" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("انتهت مهلة الاتصال بـChatGPT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
