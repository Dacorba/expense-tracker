import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateInsights } from "@/lib/expenses.functions";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/insights")({
  component: InsightsPage,
});

function InsightsPage() {
  const run = useServerFn(generateInsights);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string>("");

  async function go() {
    setLoading(true);
    try {
      const res = await run({ data: undefined }) as { insights: string };
      setText(res.insights);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="px-5 pt-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">AI</p>
        <h1 className="font-display text-2xl font-semibold">Insights pessoais</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hábitos, custo/proteína, inflação pessoal, previsões e otimização de compras.
        </p>
      </header>

      <Button onClick={go} disabled={loading} className="w-full gap-2" size="lg">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? "A analisar últimos 90 dias..." : text ? "Recalcular" : "Gerar análise"}
      </Button>

      {text && (
        <article className="prose prose-sm mt-6 max-w-none rounded-3xl border border-border bg-card p-5 text-foreground">
          <MarkdownLite text={text} />
        </article>
      )}
    </main>
  );
}

function MarkdownLite({ text }: { text: string }) {
  // Lightweight markdown-ish rendering for ## headings, **bold**, lists, paragraphs
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        if (block.startsWith("## ")) {
          return (
            <h2 key={i} className="mt-5 mb-2 font-display text-base font-semibold text-primary first:mt-0">
              {block.replace(/^##\s*/, "")}
            </h2>
          );
        }
        if (/^[-*]\s/m.test(block)) {
          return (
            <ul key={i} className="my-2 space-y-1 pl-4 text-sm">
              {block.split("\n").filter(Boolean).map((line, j) => (
                <li key={j} className="list-disc" dangerouslySetInnerHTML={{ __html: inline(line.replace(/^[-*]\s*/, "")) }} />
              ))}
            </ul>
          );
        }
        return <p key={i} className="my-2 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: inline(block) }} />;
      })}
    </>
  );
}

function inline(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-xs">$1</code>');
}
