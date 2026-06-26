import { NextResponse, type NextRequest } from 'next/server';

/**
 * POST /api/ai/chat — server-side AI advisor (DeepSeek via the out-of-Iran relay).
 * GROUNDING (acceptance-criteria §D): the model talks; tools decide every number
 * (getPrice/calcWeight/estimateProject/createLead). Never invent a price/weight.
 * This is a structured stub — the relay client + tool-calling + streaming land in the AI section.
 */
export async function POST(_req: NextRequest) {
  // const { messages } = await _req.json();
  // const stream = await deepseekRelay.chat({ messages, tools, model: process.env.DEEPSEEK_MODEL });
  // return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  return NextResponse.json(
    { error: 'not_implemented', message: 'دستیار هوشمند در بخش بعدی فعال می‌شود.' },
    { status: 501 },
  );
}
