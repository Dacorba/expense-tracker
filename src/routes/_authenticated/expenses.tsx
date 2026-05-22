import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CATEGORIES, categoryEmoji, formatEUR } from "@/lib/categories";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Period = "day" | "week" | "month" | "year" | "all";

type Search = {
  category?: string;
  period?: Period;
};

export const Route = createFileRoute("/_authenticated/expenses")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    category: typeof s.category === "string" ? s.category : undefined,
    period: (["day", "week", "month", "year", "all"] as const).includes(s.period as Period)
      ? (s.period as Period)
      : "month",
  }),
  component: ExpensesPage,
});

function startOfPeriod(p: Period): Date | null {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (p === "day") return d;
  if (p === "week") {
    const day = d.getDay() || 7; // monday start
    d.setDate(d.getDate() - (day - 1));
    return d;
  }
  if (p === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  if (p === "year") return new Date(d.getFullYear(), 0, 1);
  return null;
}

const PERIOD_LABEL: Record<Period, string> = {
  day: "Hoje",
  week: "Semana",
  month: "Mês",
  year: "Ano",
  all: "Tudo",
};

function ExpensesPage() {
  const { user } = useAuth();
  const { category, period = "month" } = Route.useSearch();
  const navigate = useNavigate({ from: "/expenses" });

  const since = startOfPeriod(period);

  const { data: expenses = [], refetch } = useQuery({
    queryKey: ["expenses-all", user?.id, category, period],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("expenses").select("*").order("spent_at", { ascending: false }).limit(500);
      if (category) q = q.eq("category", category);
      if (since) q = q.gte("spent_at", since.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = expenses.reduce((s, e) => s + Number(e.price), 0);

  // group by day
  const groups = new Map<string, typeof expenses>();
  expenses.forEach((e) => {
    const day = new Date(e.spent_at).toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short" });
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(e);
  });

  async function remove(id: string) {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Apagado"); refetch(); }
  }

  function setPeriod(p: Period) {
    navigate({ search: (prev) => ({ ...prev, period: p }) });
  }
  function setCategory(c: string | undefined) {
    navigate({ search: (prev) => ({ ...prev, category: c }) });
  }

  return (
    <main className="px-5 pt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-semibold">Despesas</h1>
        <span className="text-sm font-medium tabular-nums text-muted-foreground">{formatEUR(total)}</span>
      </div>

      {/* Period filter */}
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              period === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="mb-5 flex gap-1 overflow-x-auto">
        <button
          onClick={() => setCategory(undefined)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
            !category ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70",
          )}
        >
          Todas
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              category === c.key ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {c.emoji} {c.key}
          </button>
        ))}
      </div>

      {category ? (
        <button
          onClick={() => setCategory(undefined)}
          className="mb-3 inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
        >
          {categoryEmoji(category)} {category} <X className="h-3 w-3" />
        </button>
      ) : null}

      {expenses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Sem despesas neste período.
        </p>
      ) : (
        [...groups.entries()].map(([day, items]) => {
          const dayTotal = items.reduce((s, e) => s + Number(e.price), 0);
          return (
            <section key={day} className="mb-5">
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                <span>{day}</span>
                <span className="tabular-nums">{formatEUR(dayTotal)}</span>
              </div>
              <div className="space-y-2">
                {items.map((e) => (
                  <div key={e.id} className="group rounded-2xl border border-border bg-card p-3">
                    <div className="flex items-center gap-3">
                      {e.photo_url ? (
                        <img src={e.photo_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-xl">
                          {categoryEmoji(e.category)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{e.item_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {e.category}{e.subcategory ? ` · ${e.subcategory}` : ""}{e.location ? ` · ${e.location}` : ""}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{formatEUR(Number(e.price))}</span>
                      <button onClick={() => remove(e.id)} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Apagar">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {e.notes ? (
                      <p className="mt-2 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
                        {e.notes}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}
    </main>
  );
}
