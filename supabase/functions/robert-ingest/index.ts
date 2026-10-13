import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getDocumentProxy } from "npm:unpdf@1.8.1";
import mammoth from "npm:mammoth@1.9.1";
import { Buffer } from "node:buffer";

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_FILE_BYTES = 60 * 1024 * 1024;
const MAX_PDF_PAGES = 900;
const PDF_PAGES_PER_RUN = 20; // Se procesa un tramo por invocación.
const CHUNK_TARGET = 3200;
const CHUNK_OVERLAP = 450;
const EMBEDDING_BATCH = 32;

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

function normalizeText(input: string) {
  return input
    .replace(/\u0000/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitText(text: string, pageNumber: number | null) {
  const clean = normalizeText(text);
  if (!clean) return [];

  const paragraphs = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: Array<{ content: string; page_number: number | null }> = [];
  let current = "";

  const pushCurrent = () => {
    const value = current.trim();
    if (!value) return;
    chunks.push({ content: value, page_number: pageNumber });
    const overlap = value.slice(Math.max(0, value.length - CHUNK_OVERLAP));
    current = overlap;
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > CHUNK_TARGET) {
      if (current.trim()) pushCurrent();
      let start = 0;
      while (start < paragraph.length) {
        const end = Math.min(paragraph.length, start + CHUNK_TARGET);
        chunks.push({
          content: paragraph.slice(start, end).trim(),
          page_number: pageNumber,
        });
        if (end === paragraph.length) break;
        start = Math.max(0, end - CHUNK_OVERLAP);
      }
      current = "";
      continue;
    }

    const candidate = current ? current + "\n\n" + paragraph : paragraph;
    if (candidate.length > CHUNK_TARGET && current) {
      pushCurrent();
      current = current ? current + "\n\n" + paragraph : paragraph;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    chunks.push({ content: current.trim(), page_number: pageNumber });
  }

  return chunks.filter((c) => c.content.length >= 40);
}

async function extractPdf(arrayBuffer: ArrayBuffer, startPage = 1, limit = PDF_PAGES_PER_RUN) {
  const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new Error(`El PDF tiene ${pdf.numPages} páginas; el límite inicial es ${MAX_PDF_PAGES}.`);
  }

  const pages: Array<{ text: string; page: number }> = [];
  const endPage = Math.min(pdf.numPages, startPage + limit - 1);
  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
      .join(" ");
    pages.push({ text: normalizeText(text), page: pageNumber });
  }
  const total = pdf.numPages;
  // unpdf puede devolver un proxy sin destroy(); liberar solo si el método existe.
  if (typeof pdf.destroy === "function") await pdf.destroy();
  return { pages, pageCount: total, endPage };
}

async function extractDocx(arrayBuffer: ArrayBuffer) {
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(new Uint8Array(arrayBuffer)),
  });
  return normalizeText(result.value ?? "");
}

async function createEmbeddings(inputs: string[], apiKey: string) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
      encoding_format: "float",
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    throw new Error(`No se pudieron generar embeddings (HTTP ${res.status}): ${detail}`);
  }

  const payload = await res.json();
  const data = payload?.data;
  if (!Array.isArray(data) || data.length !== inputs.length) {
    throw new Error("La respuesta del servicio de embeddings no tiene el formato esperado.");
  }
  return data.map((item: any) => item.embedding as number[]);
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
    return json({ error: "Falta la sesión de usuario." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const publishableKey = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? secretKeys.default ?? "";

  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json({ error: "Configuración interna de Supabase incompleta." }, 500);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authHeader.slice("Bearer ".length);
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const userId = userData?.user?.id;

  if (userError || !userId) {
    return json({ error: "Sesión inválida o vencida." }, 401);
  }

  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: adminRow, error: adminError } = await userClient
    .from("site_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (adminError || !adminRow) {
    return json({ error: "Solo un administrador puede procesar documentos de Robert Shimoda." }, 403);
  }

  let documentId: string | undefined;
  let resetRequested = false;
  try {
    const body = await req.json();
    documentId = body?.document_id;
    resetRequested = body?.reset === true;
    if (!documentId || typeof documentId !== "string") {
      return json({ error: "Falta document_id." }, 400);
    }

    const { data: document, error: documentError } = await adminClient
      .from("robert_documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (documentError || !document) {
      return json({ error: "Documento no encontrado." }, 404);
    }
    if (!document.storage_path) {
      return json({ error: "El documento no tiene storage_path." }, 400);
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      await adminClient
        .from("robert_documents")
        .update({
          status: "error",
          metadata: {
            ...(document.metadata ?? {}),
            last_error: "Falta configurar OPENAI_API_KEY en Edge Function Secrets.",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);

      return json({
        error: "Falta configurar la clave del servicio de embeddings.",
        code: "OPENAI_API_KEY_MISSING",
      }, 503);
    }

    await adminClient
      .from("robert_documents")
      .update({
        status: "processing",
        metadata: { ...(document.metadata ?? {}), last_error: null },
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    const { data: file, error: downloadError } = await adminClient.storage
      .from("robert-knowledge")
      .download(document.storage_path);

    if (downloadError || !file) {
      throw new Error("No se pudo descargar el archivo desde Storage.");
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error("El archivo supera el límite de procesamiento de 60 MB. Reducí el PDF antes de reprocesar.");
    }

    const arrayBuffer = await file.arrayBuffer();
    const mime = (document.mime_type || file.type || "").toLowerCase();
    const filename = (document.original_filename || document.storage_path || "").toLowerCase();

    let pageCount: number | null = null;
    let rawChunks: Array<{ content: string; page_number: number | null }> = [];
    let isPdf = false;
    let startPage = 1;
    let endPage = 0;
    let previousChunkCount = 0;

    if (mime === "application/pdf" || filename.endsWith(".pdf")) {
      isPdf = true;
      const savedPage = Number(document.metadata?.ingest_next_page);
      const savedChunks = Number(document.metadata?.ingest_chunk_count);
      if (!resetRequested && Number.isInteger(savedPage) && savedPage > 1 && Number.isInteger(savedChunks) && savedChunks >= 0) {
        startPage = savedPage;
        previousChunkCount = savedChunks;
      }
      const parsed = await extractPdf(arrayBuffer, startPage);
      endPage = parsed.endPage;
      pageCount = parsed.pageCount;
      for (const page of parsed.pages) {
        rawChunks.push(...splitText(page.text, page.page));
      }
      const extractedCharacters = parsed.pages.reduce((sum, p) => sum + p.text.length, 0);
      if (extractedCharacters < 80) {
        throw new Error("El PDF no contiene texto extraíble suficiente. Puede ser un PDF escaneado y requerir OCR.");
      }
    } else if (
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      filename.endsWith(".docx")
    ) {
      const text = await extractDocx(arrayBuffer);
      rawChunks = splitText(text, null);
    } else if (
      mime.startsWith("text/") ||
      filename.endsWith(".txt") ||
      filename.endsWith(".md") ||
      filename.endsWith(".markdown")
    ) {
      const text = new TextDecoder("utf-8").decode(arrayBuffer);
      rawChunks = splitText(text, null);
    } else {
      throw new Error("Tipo de archivo no soportado por el procesador.");
    }

    if (!rawChunks.length) {
      throw new Error("No se obtuvo contenido suficiente para crear fragmentos.");
    }

    // Si ya hay páginas confirmadas, eliminamos solo el lote parcial del último intento.
    // Así un error de red no obliga a recalcular el manual desde la página 1.
    let cleanup = adminClient.from("robert_document_chunks").delete().eq("document_id", documentId);
    if (isPdf && startPage > 1) cleanup = cleanup.gte("chunk_index", previousChunkCount);
    const { error: cleanupError } = await cleanup;
    if (cleanupError) throw new Error("No se pudieron preparar los fragmentos: " + cleanupError.message);

    let inserted = 0;
    for (let offset = 0; offset < rawChunks.length; offset += EMBEDDING_BATCH) {
      const batch = rawChunks.slice(offset, offset + EMBEDDING_BATCH);
      const embeddings = await createEmbeddings(batch.map((c) => c.content), openaiKey);

      const rows = batch.map((chunk, index) => ({
        document_id: documentId,
        chunk_index: previousChunkCount + offset + index,
        content: chunk.content,
        page_number: chunk.page_number,
        section: null,
        token_count: Math.ceil(chunk.content.length / 4),
        metadata: {
          embedding_model: EMBEDDING_MODEL,
          source_filename: document.original_filename ?? null,
        },
        embedding: `[${embeddings[index].join(",")}]`,
      }));

      const { error: insertError } = await adminClient
        .from("robert_document_chunks")
        .insert(rows);

      if (insertError) throw new Error(`Error guardando fragmentos: ${insertError.message}`);
      inserted += rows.length;
    }

    const totalChunks = previousChunkCount + inserted;
    const complete = !isPdf || endPage >= (pageCount ?? 0);
    const nextPage = !complete && isPdf ? endPage + 1 : null;

    const { error: readyError } = await adminClient
      .from("robert_documents")
      .update({
        status: complete ? "ready" : "processing",
        page_count: pageCount,
        chunk_count: totalChunks,
        metadata: {
          ...(document.metadata ?? {}),
          last_error: null,
          embedding_model: EMBEDDING_MODEL,
          embedding_dimensions: 1536,
          processed_at: complete ? new Date().toISOString() : null,
          ingest_next_page: nextPage,
          ingest_chunk_count: complete ? null : totalChunks,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (readyError) throw new Error(`No se pudo finalizar el documento: ${readyError.message}`);

    return json({
      ok: true,
      document_id: documentId,
      status: complete ? "ready" : "processing",
      complete,
      chunks: totalChunks,
      pages: pageCount,
      processed_pages: isPdf ? endPage : null,
      next_page: nextPage,
      embedding_model: EMBEDDING_MODEL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado.";
    if (documentId) {
      try {
        const { data: current } = await adminClient
          .from("robert_documents")
          .select("metadata")
          .eq("id", documentId)
          .maybeSingle();

        await adminClient
          .from("robert_documents")
          .update({
            status: "error",
            metadata: {
              ...(current?.metadata ?? {}),
              last_error: message.slice(0, 1000),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", documentId);
      } catch {
        // Evita ocultar el error original.
      }
    }
    return json({ error: message }, 500);
  }
});
