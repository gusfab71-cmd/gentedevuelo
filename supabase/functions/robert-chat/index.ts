import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CHAT_MODEL = "gpt-5.4-mini";
const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_QUESTION_CHARS = 1800;
const MAX_ANSWER_WORDS = 20;
const MATCH_THRESHOLD = 0.35;
const MATCH_COUNT = 7;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// La respuesta y las referencias se muestran por separado. Un límite en el servidor
// garantiza que ninguna respuesta textual supere las 20 palabras.
function limitAnswer(text: string): string {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  if (words.length <= MAX_ANSWER_WORDS) return words.join(" ");
  return words.slice(0, MAX_ANSWER_WORDS).join(" ").replace(/[,:;—–-]+$/u, "").trim() + "…";
}

async function embeddingFor(text: string, apiKey: string) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      encoding_format: "float",
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    throw new Error(`Embedding HTTP ${res.status}: ${detail}`);
  }

  const payload = await res.json();
  const vector = payload?.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length !== 1536) {
    throw new Error("El embedding de la pregunta no tiene el formato esperado.");
  }
  return vector as number[];
}

function extractResponseText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of payload?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content?.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Método no permitido." }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Tenés que iniciar sesión en Gente de Vuelo para usar a Robert Shimoda." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const publishableKey = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? secretKeys.default ?? "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

  if (!supabaseUrl || !publishableKey || !secretKey || !openaiKey) {
    return json({ error: "Configuración interna incompleta." }, 500);
  }

  const token = authHeader.slice("Bearer ".length);
  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    return json({ error: "La sesión venció. Volvé a ingresar." }, 401);
  }

  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const configRes = await adminClient
    .from("robert_daily_config")
    .select("chat_enabled")
    .eq("singleton", true)
    .maybeSingle();

  if (configRes.error) {
    return json({ error: "No se pudo comprobar el estado de Robert Shimoda." }, 500);
  }

  if (configRes.data?.chat_enabled === false) {
    return json({
      ok: true,
      disabled: true,
      assistant: "Robert Shimoda — Asistente de Gente de Vuelo",
      answer: "Robert Shimoda está temporalmente desactivado por el administrador.",
      sources: [],
      grounded: false,
      retrieved_chunks: 0,
    });
  }

  let question = "";
  try {
    const body = await req.json();
    question = typeof body?.question === "string" ? body.question.trim() : "";

    if (question.length < 3) {
      return json({ error: "Escribí una pregunta para Robert Shimoda." }, 400);
    }
    if (question.length > MAX_QUESTION_CHARS) {
      return json({ error: `La pregunta es demasiado larga. Máximo ${MAX_QUESTION_CHARS} caracteres.` }, 400);
    }

    const queryVector = await embeddingFor(question, openaiKey);

    const { data: matches, error: matchError } = await adminClient.rpc(
      "match_robert_chunks",
      {
        query_embedding: `[${queryVector.join(",")}]`,
        match_threshold: MATCH_THRESHOLD,
        match_count: MATCH_COUNT,
      },
    );

    if (matchError) {
      throw new Error(`Falló la búsqueda RAG: ${matchError.message}`);
    }

    const chunks = Array.isArray(matches) ? matches : [];
    if (!chunks.length) {
      const answer = "No encontré información suficiente en los documentos cargados para responder con una fuente confiable. Probá con otra pregunta.";
      await adminClient.from("robert_chat_logs").insert({
        user_id: userId,
        question,
        answer,
        sources: [],
        retrieved_chunks: 0,
        model: null,
        status: "no_context",
      });
      return json({
        ok: true,
        answer,
        sources: [],
        grounded: false,
      });
    }

    const context = chunks.map((chunk: any, i: number) => {
      const page = chunk.page_number ? ` · página ${chunk.page_number}` : "";
      return [
        `[FUENTE ${i + 1}] ${chunk.document_title}${page}`,
        chunk.content,
      ].join("\n");
    }).join("\n\n---\n\n");

    const instructions = `
Sos Robert Shimoda — Asistente de Gente de Vuelo.
Respondés en español rioplatense neutro, con tono cercano, claro, didáctico, respetuoso y apasionado por la aviación.
Nunca afirmes ser piloto real ni inventes experiencias personales.

REGLAS RAG:
- Tu fuente primaria y obligatoria es únicamente el CONTEXTO DOCUMENTAL suministrado.
- No agregues datos técnicos, históricos, reglamentarios u operacionales que no estén respaldados por ese contexto.
- Si el contexto no alcanza, decilo claramente.
- No inventes citas, páginas, normas ni fuentes.
- Cuando uses un dato factual, indicá la fuente con [1], [2], etc., usando los números provistos.
- Podés explicar conceptos con palabras sencillas, pero sin cambiar el sentido técnico.
- Si la pregunta involucra seguridad de vuelo, procedimientos operacionales o normativa, aclarà cuando el material puede requerir verificación con documentación oficial vigente.
- No uses Markdown con tablas salvo que sea indispensable.
- REGLA ESTRICTA: la respuesta completa debe contener como máximo 20 palabras, incluidos números y referencias [n].
- Idealmente respondé en 12 a 17 palabras. Usá una sola oración, con una fuente [n] breve cuando corresponda.
- Priorizá precisión, claridad y la idea principal; no incluyas introducciones, listas ni explicaciones complementarias.
- El límite de 20 palabras es obligatorio incluso si el usuario pide una respuesta extensa.
- Ante información insuficiente, respondé en una frase breve. Para seguridad operacional, no afirmes datos no respaldados.
`.trim();

    const userPrompt = `
PREGUNTA DEL USUARIO:
${question}

CONTEXTO DOCUMENTAL:
${context}

Respondé la pregunta usando exclusivamente el contexto anterior. Incluí las referencias [n] dentro de la respuesta.
`.trim();

    const aiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        instructions,
        input: userPrompt,
        reasoning: { effort: "low" },
        max_output_tokens: 160,
      }),
    });

    if (!aiRes.ok) {
      const detail = (await aiRes.text()).slice(0, 700);
      throw new Error(`Modelo HTTP ${aiRes.status}: ${detail}`);
    }

    const ai = await aiRes.json();
    const answer = limitAnswer(extractResponseText(ai));
    if (!answer) {
      throw new Error("El modelo no devolvió texto.");
    }

    const uniqueSources = [];
    const seen = new Set<string>();
    for (const chunk of chunks) {
      const key = `${chunk.document_id}:${chunk.page_number ?? "na"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueSources.push({
        document_id: chunk.document_id,
        title: chunk.document_title,
        filename: chunk.original_filename,
        page: chunk.page_number,
        similarity: Math.round(Number(chunk.similarity ?? 0) * 1000) / 1000,
      });
    }

    const usage = ai?.usage ?? {};
    await adminClient.from("robert_chat_logs").insert({
      user_id: userId,
      question,
      answer,
      sources: uniqueSources,
      retrieved_chunks: chunks.length,
      model: CHAT_MODEL,
      input_tokens: usage.input_tokens ?? null,
      output_tokens: usage.output_tokens ?? null,
      status: "ok",
    });

    return json({
      ok: true,
      assistant: "Robert Shimoda — Asistente de Gente de Vuelo",
      answer,
      sources: uniqueSources,
      grounded: true,
      retrieved_chunks: chunks.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado.";
    try {
      await adminClient.from("robert_chat_logs").insert({
        user_id: userId,
        question: question || "(sin pregunta)",
        answer: null,
        sources: [],
        retrieved_chunks: 0,
        model: CHAT_MODEL,
        status: "error",
      });
    } catch {
      // No ocultar el error original.
    }
    return json({ error: message }, 500);
  }
});
