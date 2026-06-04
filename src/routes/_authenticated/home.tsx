import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { categoryEmoji, formatEUR } from "@/lib/categories";
import { Sparkles, Plus, LogOut, List, PieChart as PieIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const PIE_COLORS = ["#c9a84c", "#4f46e5", "#2dd4a8", "#ff6b6b", "#f7931e", "#a78bfa", "#5cbdb9", "#e84393"];

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

function HomePage() {
  const { user } = useAuth();

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 60);
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("spent_at", since.toISOString())
        .order("spent_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const today = new Date(); today.setHours(0,0,0,0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const todayTotal = expenses.filter(e => new Date(e.spent_at) >= today).reduce((s, e) => s + Number(e.price), 0);
  const monthTotal = expenses.filter(e => new Date(e.spent_at) >= monthStart).reduce((s, e) => s + Number(e.price), 0);

  const byCategory = new Map<string, number>();
  expenses.filter(e => new Date(e.spent_at) >= monthStart).forEach(e => {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.price));
  });
  const topCats = [...byCategory.entries()].sort((a,b) => b[1]-a[1]).slice(0, 4);
  const maxCat = topCats[0]?.[1] ?? 1;

  return (
    <main className="px-5 pt-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Olá</p>
          <h1 className="font-display text-2xl font-semibold">{user?.user_metadata?.full_name || "bem-vindo"}</h1>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Sair"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <section className="rounded-3xl bg-primary p-6 text-primary-foreground shadow-elegant">
        <p className="text-xs uppercase tracking-widest opacity-70">Este mês</p>
        <p className="mt-1 font-display text-4xl font-bold tabular-nums">{formatEUR(monthTotal)}</p>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="opacity-80">Hoje</span>
          <span className="font-medium tabular-nums">{formatEUR(todayTotal)}</span>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Por categoria · este mês
        </h2>
        {topCats.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Sem despesas este mês.
          </p>
        ) : (
          <div className="space-y-2">
            {topCats.map(([cat, total]) => (
              <Link
                key={cat}
                to="/expenses"
                search={{ category: cat, period: "month" }}
                className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">{categoryEmoji(cat)} {cat}</span>
                  <span className="tabular-nums text-foreground">{formatEUR(total)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${(total / maxCat) * 100}%` }} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recentes</h2>
          <Link to="/expenses" className="text-xs font-medium text-primary">Ver tudo</Link>
        </div>
        <div className="space-y-2">
          {expenses.slice(0, 5).map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
              {e.photo_url ? (
                <img src={e.photo_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-xl">
                  {categoryEmoji(e.category)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.item_name}</p>
                <p className="truncate text-xs text-muted-foreground">{e.category}{e.location ? ` · ${e.location}` : ""}</p>
              </div>
              <span className="text-sm font-semibold tabular-nums">{formatEUR(Number(e.price))}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 mb-4 grid grid-cols-2 gap-3">
        <Link to="/add">
          <Button variant="default" className="w-full gap-2"><Plus className="h-4 w-4" /> Adicionar</Button>
        </Link>
        <Link to="/insights">
          <Button variant="outline" className="w-full gap-2"><Sparkles className="h-4 w-4" /> Insights AI</Button>
        </Link>
      </section>
    </main>
  );
}
