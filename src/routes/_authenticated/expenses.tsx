import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { categoryEmoji, formatEUR } from "@/lib/categories";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/expenses")({
  component: ExpensesPage,
});

function ExpensesPage() {
  const { user } = useAuth();
  const { data: expenses = [], refetch } = useQuery({
    queryKey: ["expenses-all", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("spent_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

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

  return (
    <main className="px-5 pt-8">
      <h1 className="mb-6 font-display text-2xl font-semibold">Despesas</h1>
      {expenses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Ainda sem despesas. Toca em <span className="font-medium text-primary">+</span> para adicionar.
        </p>
      ) : (
        [...groups.entries()].map(([day, items]) => {
          const total = items.reduce((s, e) => s + Number(e.price), 0);
          return (
            <section key={day} className="mb-5">
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                <span>{day}</span>
                <span className="tabular-nums">{formatEUR(total)}</span>
              </div>
              <div className="space-y-2">
                {items.map((e) => (
                  <div key={e.id} className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
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
                        {e.category}{e.location ? ` · ${e.location}` : ""}{e.quantity > 1 ? ` · ${e.quantity}${e.unit ?? ""}` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{formatEUR(Number(e.price))}</span>
                    <button onClick={() => remove(e.id)} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Apagar">
                      <Trash2 className="h-4 w-4" />
                    </button>
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
