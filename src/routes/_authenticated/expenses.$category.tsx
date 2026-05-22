import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { categoryEmoji, formatEUR } from "@/lib/categories";
import { ChevronLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/expenses/$category")({
  component: CategoryPage,
});

function CategoryPage() {
  const { category } = Route.useParams();
  const { user } = useAuth();
  const { data: expenses = [], refetch } = useQuery({
    queryKey: ["expenses-cat", user?.id, category],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("category", category)
        .order("spent_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  // group by month (YYYY-MM)
  const groups = new Map<string, typeof expenses>();
  expenses.forEach((e) => {
    const d = new Date(e.spent_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  });

  async function remove(id: string) {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Apagado"); refetch(); }
  }

  return (
    <main className="px-5 pt-8">
      <Link to="/home" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="mb-6 font-display text-2xl font-semibold">
        {categoryEmoji(category)} {category}
      </h1>

      {expenses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Sem despesas nesta categoria.
        </p>
      ) : (
        [...groups.entries()].map(([key, items]) => {
          const total = items.reduce((s, e) => s + Number(e.price), 0);
          const [y, m] = key.split("-");
          const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
          return (
            <section key={key} className="mb-5">
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                <span>{label}</span>
                <span className="tabular-nums">{formatEUR(total)}</span>
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
                          {new Date(e.spent_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })}
                          {e.subcategory ? ` · ${e.subcategory}` : ""}
                          {e.location ? ` · ${e.location}` : ""}
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
