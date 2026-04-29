import { request } from "undici";
import { sha256String } from "./sha.js";
import type { Manifest } from "../types.js";

const ENDPOINT =
  process.env.DEEPSEEK_ENDPOINT ?? "https://api.deepseek.com/v1/chat/completions";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

const SYSTEM_PROMPT = `你是专业的软件技术文档译者。任务：把英文版本更新说明翻译为简体中文。

要求：
1. 保留 Markdown 结构（标题、列表、代码块、链接）。
2. 保留版本号、命令、文件名、URL、人名、品牌名（Claude / Codex / Anthropic / OpenAI）原文不译。
3. 术语表：
   - Anthropic / OpenAI：保留原文
   - Claude Code / Claude Desktop / Codex Desktop / Codex CLI：保留原文
   - MCP → MCP（Model Context Protocol，模型上下文协议）首次出现时附中文
   - Skills → Skills（技能）首次出现时附中文
   - Cowork → Cowork
   - Computer Use → 计算机操作
   - prompt caching → 提示词缓存
   - tool use → 工具调用
4. 译文要自然、地道、专业，不要逐词翻译。
5. 只输出翻译结果，不要任何前言、解释或代码块包裹。`;

export async function translate(
  manifest: Manifest,
  textEn: string,
): Promise<string> {
  const key = sha256String(textEn);
  const cached = manifest.translations[key];
  if (cached) return cached.zh;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set.");
  }

  const res = await request(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: textEn },
      ],
    }),
  });

  if (res.statusCode >= 400) {
    const body = await res.body.text();
    throw new Error(`DeepSeek translate failed (${res.statusCode}): ${body}`);
  }

  const json = (await res.body.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const zh = json.choices?.[0]?.message?.content?.trim();
  if (!zh) throw new Error("DeepSeek returned empty translation.");

  manifest.translations[key] = { sha: key, zh };
  return zh;
}
