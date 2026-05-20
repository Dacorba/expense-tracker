import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const CATEGORY_LIST = [
  "Supermercado",
  "Restaurante",
  "Renda",
  "Transporte",
  "Saúde",
  "Lazer",
  "Vestuário",
  "Serviços",
  "Outro",
];

export const analyzeItemPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { imageUrl: string }) =>
    z.object({ imageUrl: z.string().url() }).parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const sys = `És um assistente que identifica items de despesa a partir de uma foto.
Responde APENAS com JSON válido neste formato exato:
{
  "item_name": "nome curto em português",
  "category": "uma de: ${CATEGORY_LIST.join(", ")}",
  "quantity": número (1 se desconhecido),
  "unit": "kg" | "g" | "L" | "ml" | "un" | null,
  "estimated_price_eur": número ou null,
  "protein_g": proteína estimada por unidade em gramas ou null,
  "calories": calorias estimadas por unidade em kcal ou null,
  "notes": "nota curta opcional ou string vazia"
}
Sem texto extra. Sem markdown.`;

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: [
              { type: "text", text: "Identifica o item nesta foto." },
              { type: "image_url", image_url: { url: data.imageUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${txt}`);
    }
    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";
    const cleaned = content.replace(/```json|```/g, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      return { item_name: "", category: "Outro", quantity: 1, unit: null };
    }
  });

export const generateInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const { data: expenses, error } = await supabase
      .from("expenses")
      .select("item_name,category,price,quantity,unit,protein_g,calories,location,spent_at")
      .gte("spent_at", since.toISOString())
      .order("spent_at", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);
    if (!expenses || expenses.length === 0) {
      return { insights: "Ainda não há dados suficientes. Adiciona algumas despesas para começares a ver padrões." };
    }

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const summary = expenses
      .map(
        (e) =>
          `${e.spent_at?.slice(0, 10)} | ${e.category} | ${e.item_name} | ${e.quantity}${e.unit ?? ""} | ${e.price}€ | prot:${e.protein_g ?? "?"}g | kcal:${e.calories ?? "?"} | ${e.location ?? ""}`,
      )
      .join("\n");

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `És um coach financeiro e nutricional pessoal. Em português de Portugal, analisa os dados e responde em markdown com secções curtas:
## Hábitos de consumo
## Saúde alimentar e custo/proteína
## Inflação pessoal e padrões mensais
## Previsão para o próximo mês
## Otimização de compras (3 ações concretas)

Sê específico, usa números dos dados, frases curtas. Sem boilerplate.`,
          },
          {
            role: "user",
            content: `Despesas dos últimos 90 dias (uma por linha):\n${summary}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${txt}`);
    }
    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    return { insights: content };
  });
