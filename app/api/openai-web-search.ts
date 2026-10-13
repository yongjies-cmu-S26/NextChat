import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "../config/server";
import { OPENAI_BASE_URL, ServiceProvider } from "../constant";
import { isModelNotavailableInServer } from "../utils/model";
import { FREE_TIER_MODELS } from "./common";

// Web search through OpenAI's built-in `web_search` tool (Responses API).
// The browser keeps talking the Chat Completions streaming format; this
// handler calls /v1/responses and translates the stream back, so the rest of
// the app does not need to change.

type ChatPart = {
  type: string;
  text?: string;
  image_url?: { url: string };
};

type ChatMessage = {
  role: string;
  content: string | ChatPart[];
};

function toResponsesInput(messages: ChatMessage[]) {
  return messages.map((m) => {
    const role = m.role === "system" ? "developer" : m.role;
    if (typeof m.content === "string") {
      return { role, content: m.content };
    }
    if (role === "assistant") {
      // assistant history is passed back as plain text
      return {
        role,
        content: m.content
          .filter((p) => p.type === "text")
          .map((p) => p.text ?? "")
          .join("\n"),
      };
    }
    return {
      role,
      content: m.content
        .map((p) => {
          if (p.type === "text") return { type: "input_text", text: p.text };
          if (p.type === "image_url" && p.image_url?.url)
            return { type: "input_image", image_url: p.image_url.url };
          return null;
        })
        .filter(Boolean),
    };
  });
}

function chunk(delta: Record<string, string>) {
  return `data: ${JSON.stringify({
    choices: [{ index: 0, delta }],
  })}\n\n`;
}

export async function requestOpenaiWebSearch(req: NextRequest) {
  const serverConfig = getServerSideConfig();

  let body: { model?: string; messages?: ChatMessage[] };
  try {
    body = JSON.parse(await req.text());
  } catch (e) {
    return NextResponse.json(
      { error: true, message: "invalid request body" },
      { status: 400 },
    );
  }

  const model = body.model ?? "";

  // same model restrictions as normal chat requests
  if (
    req.headers.get("x-free-key-applied") === "1" &&
    !FREE_TIER_MODELS.has(model)
  ) {
    return NextResponse.json(
      {
        error: true,
        message: `${model} is not covered by the free key, switch to the paid key or pick a free model`,
      },
      { status: 403 },
    );
  }
  if (
    serverConfig.customModels &&
    isModelNotavailableInServer(serverConfig.customModels, model, [
      ServiceProvider.OpenAI,
      ServiceProvider.Azure,
      model,
    ])
  ) {
    return NextResponse.json(
      { error: true, message: `you are not allowed to use ${model} model` },
      { status: 403 },
    );
  }

  let baseUrl = serverConfig.baseUrl || OPENAI_BASE_URL;
  if (!baseUrl.startsWith("http")) baseUrl = `https://${baseUrl}`;
  if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

  const upstream = await fetch(`${baseUrl}/v1/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers.get("Authorization") ?? "",
      ...(serverConfig.openaiOrgId && {
        "OpenAI-Organization": serverConfig.openaiOrgId,
      }),
    },
    body: JSON.stringify({
      model,
      stream: true,
      tools: [{ type: "web_search" }],
      input: toResponsesInput(body.messages ?? []),
    }),
    signal: req.signal,
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  const sources = new Map<string, string>();
  let announcedSearch = false;

  const addSource = (a: any) => {
    const c = a?.url_citation ?? a;
    if (c?.url && !sources.has(c.url)) sources.set(c.url, c.title || c.url);
  };

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      const handle = (event: any) => {
        switch (event?.type) {
          case "response.web_search_call.in_progress":
          case "response.web_search_call.searching":
            if (!announcedSearch) {
              announcedSearch = true;
              controller.enqueue(
                encoder.encode(chunk({ reasoning_content: "正在联网搜索…\n" })),
              );
            }
            break;
          case "response.output_text.delta":
            if (event.delta) {
              controller.enqueue(
                encoder.encode(chunk({ content: event.delta })),
              );
            }
            break;
          case "response.output_text.annotation.added":
            addSource(event.annotation);
            break;
          case "response.completed":
            for (const item of event.response?.output ?? []) {
              for (const part of item?.content ?? []) {
                for (const a of part?.annotations ?? []) addSource(a);
              }
            }
            break;
          case "response.failed":
          case "error": {
            const msg =
              event.response?.error?.message ??
              event.error?.message ??
              event.message ??
              "web search request failed";
            controller.enqueue(
              encoder.encode(chunk({ content: `\n\n[error] ${msg}` })),
            );
            break;
          }
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const data = t.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              handle(JSON.parse(data));
            } catch (e) {}
          }
        }
        if (sources.size > 0) {
          const list = [...sources.entries()]
            .map(([url, title], i) => `${i + 1}. [${title}](${url})`)
            .join("\n");
          controller.enqueue(
            encoder.encode(chunk({ content: `\n\n**来源**\n${list}` })),
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        console.error("[OpenAI Web Search]", e);
      } finally {
        controller.close();
      }
    },
    cancel() {
      reader.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
