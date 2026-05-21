import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SUBCATS = ["Comida", "Bebidas", "Higiene", "Limpeza", "Casa", "Outro"];

export const analyzeReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { imageUrl: string }) =>
    z.object({ imageUrl: z.string().url() }).parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const sys = `És um assistente que lê faturas de supermercado em português.
Extrai TODOS os items comprados e responde APENAS com JSON válido neste formato exato:
{
  "store": "nome do supermercado ou string vazia",
  "total": número (total da fatura) ou null,
  "items": [
    {
      "name": "nome do produto",
      "price": número em euros,
      "subcategory": "uma de: ${SUBCATS.join(", ")}"
    }
  ]
}
Regras para subcategoria:
- Comida: alimentos sólidos, frescos, mercearia, charcutaria, padaria, congelados
- Bebidas: água, sumos, refrigerantes, álcool, café, chá
- Higiene: higiene pessoal, cosméticos, fraldas
- Limpeza: detergentes, produtos de limpeza da casa
- Casa: utensílios, pilhas, lâmpadas, papel
- Outro: tudo o resto
Sem texto extra. Sem markdown.`;

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrai todos os items desta fatura." },
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
      return JSON.parse(cleaned) as {
        store?: string;
        total?: number | null;
        items?: { name: string; price: number; subcategory: string }[];
      };
    } catch {
      return { store: "", total: null, items: [] };
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
      .select("item_name,category,subcategory,price,location,notes,spent_at")
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
          `${e.spent_at?.slice(0, 10)} | ${e.category}${e.subcategory ? "/" + e.subcategory : ""} | ${e.item_name} | ${e.price}€ | ${e.location ?? ""}`,
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
            content: `És um coach financeiro pessoal. Em português de Portugal, analisa os dados e responde em markdown com secções curtas:
## Hábitos de consumo
## Distribuição por categoria e subcategoria (supermercado)
## Inflação pessoal e padrões mensais
## Previsão para o próximo mês
## Otimização de compras (3 ações concretas)

Sê específico, usa números dos dados, frases curtas. Sem boilerplate.`,
          },
          { role: "user", content: `Despesas dos últimos 90 dias (uma por linha):\n${summary}` },
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
