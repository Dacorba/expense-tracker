import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { analyzeReceipt, parseSupermarketVoice } from "@/lib/expenses.functions";
import {
  CATEGORIES,
  SUPERMARKET_SUBCATEGORIES,
  categoryEmoji,
  formatEUR,
} from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Sparkles, Loader2, ArrowLeft, Trash2, Mic, Pencil, Square } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/add")({
  component: AddPage,
});

type ReceiptItem = {
  name: string;
  price: string;
  subcategory: string;
};

function AddPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const analyze = useServerFn(analyzeReceipt);
  const parseVoice = useServerFn(parseSupermarketVoice);
  const fileRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<string>("Renda");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // supermarket flow
  const [superMode, setSuperMode] = useState<"photo" | "manual">("photo");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [items, setItems] = useState<ReceiptItem[]>([]);

  // manual supermarket subcategory totals
  const [subTotals, setSubTotals] = useState<Record<string, string>>(
    Object.fromEntries(SUPERMARKET_SUBCATEGORIES.map((s) => [s, ""])),
  );
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [parsingVoice, setParsingVoice] = useState(false);
  const recogRef = useRef<any>(null);

  const isSupermarket = category === "Supermercado";

  async function onPickReceipt(file: File) {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("item-photos").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("item-photos").getPublicUrl(path);
      setReceiptUrl(data.publicUrl);
      setAnalyzing(true);
      try {
        const res = await analyze({ data: { imageUrl: data.publicUrl } });
        if (res.store && !location) setLocation(res.store);
        const parsed: ReceiptItem[] = (res.items ?? []).map((i) => ({
          name: i.name,
          price: String(i.price ?? ""),
          subcategory: SUPERMARKET_SUBCATEGORIES.includes(
            i.subcategory as (typeof SUPERMARKET_SUBCATEGORIES)[number],
          )
            ? i.subcategory
            : "Outro",
        }));
        setItems(parsed);
        toast.success(`${parsed.length} items identificados`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "AI falhou");
      } finally {
        setAnalyzing(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload falhou");
    } finally {
      setUploading(false);
    }
  }

  function updateItem(i: number, patch: Partial<ReceiptItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addEmptyItem() {
    setItems((prev) => [...prev, { name: "", price: "", subcategory: "Comida" }]);
  }

  const itemsTotal = items.reduce((acc, it) => acc + (Number(it.price) || 0), 0);
  const manualTotal = Object.values(subTotals).reduce((a, v) => a + (Number(v) || 0), 0);

  function startListening() {
    const SR: any =
      (typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
      null;
    if (!SR) {
      toast.error("O teu browser não suporta ditado por voz. Escreve manualmente.");
      return;
    }
    const r = new SR();
    r.lang = "pt-PT";
    r.continuous = true;
    r.interimResults = true;
    let finalText = "";
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript + " ";
        else interim += res[0].transcript;
      }
      setTranscript((finalText + interim).trim());
    };
    r.onerror = () => setListening(false);
    r.onend = () => {
      setListening(false);
      const txt = finalText.trim();
      if (txt) runVoiceParse(txt);
    };
    recogRef.current = r;
    setListening(true);
    setTranscript("");
    r.start();
  }
  function stopListening() {
    try { recogRef.current?.stop(); } catch {}
    setListening(false);
  }
  async function runVoiceParse(textOverride?: string) {
    const txt = (textOverride ?? transcript).trim();
    if (!txt) {
      toast.error("Grava algo primeiro");
      return;
    }

    setParsingVoice(true);
    try {
      const res = await parseVoice({ data: { transcript: txt } });
      if (res.location) setLocation(res.location);
      const subs = res.subcategories ?? {};
      setSubTotals((prev) => {
        const next = { ...prev };
        for (const k of SUPERMARKET_SUBCATEGORIES) {
          const v = Number(subs[k]);
          if (v > 0) next[k] = String(v);
        }
        return next;
      });
      toast.success("Dados preenchidos pela AI");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI falhou");
    } finally {
      setParsingVoice(false);
    }
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      if (isSupermarket && superMode === "photo") {
        const rows = items
          .filter((it) => it.name.trim() && Number(it.price) > 0)
          .map((it) => ({
            user_id: user.id,
            item_name: it.name.trim(),
            category: "Supermercado",
            subcategory: it.subcategory,
            price: Number(it.price),
            location: location || null,
            notes: notes || null,
            photo_url: receiptUrl,
          }));
        if (rows.length === 0) {
          toast.error("Adiciona pelo menos um item válido");
          setSaving(false);
          return;
        }
        const { error } = await supabase.from("expenses").insert(rows);
        if (error) throw error;
        toast.success(`${rows.length} items guardados`);
      } else if (isSupermarket && superMode === "manual") {
        if (!location.trim()) {
          toast.error("Indica o supermercado");
          setSaving(false);
          return;
        }
        const rows = SUPERMARKET_SUBCATEGORIES
          .map((s) => ({ s, v: Number(subTotals[s]) }))
          .filter((x) => x.v > 0)
          .map((x) => ({
            user_id: user.id,
            item_name: x.s,
            category: "Supermercado",
            subcategory: x.s,
            price: x.v,
            location: location.trim(),
            notes: notes || null,
          }));
        if (rows.length === 0) {
          toast.error("Indica pelo menos um valor por subcategoria");
          setSaving(false);
          return;
        }
        const { error } = await supabase.from("expenses").insert(rows);
        if (error) throw error;
        toast.success(`${rows.length} subcategorias guardadas`);
      } else {
        if (!price || Number(price) <= 0) {
          toast.error("Preço é obrigatório");
          setSaving(false);
          return;
        }
        if (!location.trim()) {
          toast.error("Local é obrigatório");
          setSaving(false);
          return;
        }
        const { error } = await supabase.from("expenses").insert({
          user_id: user.id,
          item_name: location.trim(),
          category,
          price: Number(price),
          location: location.trim(),
          notes: notes || null,
        });
        if (error) throw error;
        toast.success("Despesa guardada");
      }
      navigate({ to: "/home" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro a guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="px-5 pt-6">
      <header className="mb-5 flex items-center gap-2">
        <button
          onClick={() => navigate({ to: "/home" })}
          className="rounded-full p-2 hover:bg-muted"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-display text-xl font-semibold">Nova despesa</h1>
      </header>

      <div className="space-y-1.5">
        <Label>Categoria</Label>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={`rounded-xl border px-2 py-2 text-xs font-medium transition ${
                category === c.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary/40"
              }`}
            >
              <div className="text-lg leading-none">{c.emoji}</div>
              <div className="mt-1 truncate">{c.key}</div>
            </button>
          ))}
        </div>
      </div>

      {isSupermarket ? (
        <SupermarketFlow
          mode={superMode}
          setMode={setSuperMode}
          fileRef={fileRef}
          receiptUrl={receiptUrl}
          uploading={uploading}
          analyzing={analyzing}
          items={items}
          itemsTotal={itemsTotal}
          location={location}
          setLocation={setLocation}
          notes={notes}
          setNotes={setNotes}
          onPick={onPickReceipt}
          updateItem={updateItem}
          removeItem={removeItem}
          addEmptyItem={addEmptyItem}
          subTotals={subTotals}
          setSubTotal={(k, v) => setSubTotals((p) => ({ ...p, [k]: v }))}
          manualTotal={manualTotal}
          transcript={transcript}
          setTranscript={setTranscript}
          listening={listening}
          parsingVoice={parsingVoice}
          startListening={startListening}
          stopListening={stopListening}
          runVoiceParse={runVoiceParse}
        />
      ) : (
        <SimpleFlow
          price={price}
          setPrice={setPrice}
          location={location}
          setLocation={setLocation}
          notes={notes}
          setNotes={setNotes}
        />
      )}

      <Button
        onClick={save}
        disabled={saving || uploading || analyzing || parsingVoice}
        className="mt-6 w-full"
        size="lg"
      >
        {saving
          ? "A guardar..."
          : isSupermarket
            ? superMode === "photo"
              ? `Guardar ${items.length} items · ${formatEUR(itemsTotal)}`
              : `Guardar · ${formatEUR(manualTotal)}`
            : `Guardar ${categoryEmoji(category)}`}
      </Button>
    </main>
  );
}

function SimpleFlow({
  price,
  setPrice,
  location,
  setLocation,
  notes,
  setNotes,
}: {
  price: string;
  setPrice: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="price">Preço (€)</Label>
          <Input
            id="price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="loc">Local</Label>
          <Input
            id="loc"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Calvin Klein"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Ex: calças pretas, camisola lã..."
        />
      </div>
    </div>
  );
}

function SupermarketFlow({
  mode,
  setMode,
  fileRef,
  receiptUrl,
  uploading,
  analyzing,
  items,
  itemsTotal,
  location,
  setLocation,
  notes,
  setNotes,
  onPick,
  updateItem,
  removeItem,
  addEmptyItem,
  subTotals,
  setSubTotal,
  manualTotal,
  transcript,
  setTranscript,
  listening,
  parsingVoice,
  startListening,
  stopListening,
  runVoiceParse,
}: {
  mode: "photo" | "manual";
  setMode: (m: "photo" | "manual") => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  receiptUrl: string | null;
  uploading: boolean;
  analyzing: boolean;
  items: ReceiptItem[];
  itemsTotal: number;
  location: string;
  setLocation: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  onPick: (f: File) => void;
  updateItem: (i: number, patch: Partial<ReceiptItem>) => void;
  removeItem: (i: number) => void;
  addEmptyItem: () => void;
  subTotals: Record<string, string>;
  setSubTotal: (k: string, v: string) => void;
  manualTotal: number;
  transcript: string;
  setTranscript: (v: string) => void;
  listening: boolean;
  parsingVoice: boolean;
  startListening: () => void;
  stopListening: () => void;
  runVoiceParse: () => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setMode("photo")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition ${
            mode === "photo" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          <Camera className="h-4 w-4" /> Fatura
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition ${
            mode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          <Pencil className="h-4 w-4" /> Manual / Voz
        </button>
      </div>

      {mode === "photo" ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || analyzing}
            className="relative flex h-44 w-full items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-border bg-card transition hover:border-primary"
          >
            {receiptUrl ? (
              <img src={receiptUrl} alt="fatura" className="h-full w-full object-cover" />
            ) : (
              <div className="text-center">
                <Camera className="mx-auto mb-2 h-8 w-8 text-primary" />
                <p className="text-sm font-medium">Foto da fatura</p>
                <p className="text-xs text-muted-foreground">A AI separa items por subcategoria</p>
              </div>
            )}
            {(uploading || analyzing) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="mt-2 text-xs font-medium">
                  {uploading ? "A enviar..." : "A AI a ler fatura..."}
                </p>
              </div>
            )}
          </button>

          <div className="space-y-1.5">
            <Label htmlFor="loc">Supermercado</Label>
            <Input
              id="loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Pingo Doce"
            />
          </div>

          {items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-primary" /> Items ({items.length})
                </Label>
                <span className="text-sm font-semibold">{formatEUR(itemsTotal)}</span>
              </div>
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex gap-2">
                      <Input
                        value={it.name}
                        onChange={(e) => updateItem(i, { name: e.target.value })}
                        placeholder="Nome"
                        className="flex-1"
                      />
                      <Input
                        value={it.price}
                        onChange={(e) => updateItem(i, { price: e.target.value })}
                        inputMode="decimal"
                        placeholder="0.00"
                        className="w-20"
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                        aria-label="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {SUPERMARKET_SUBCATEGORIES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => updateItem(i, { subcategory: s })}
                          className={`rounded-full border px-2.5 py-1 text-xs transition ${
                            it.subcategory === s
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:border-primary/40"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button type="button" variant="outline" onClick={addEmptyItem} className="w-full">
            + Adicionar item manualmente
          </Button>
        </>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Mic className="h-4 w-4 text-primary" /> Ditar por voz
              </Label>
              {listening && (
                <span className="flex items-center gap-1 text-xs text-primary">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> a ouvir
                </span>
              )}
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Ex: "Fui ao Pingo Doce, gastei 65€ no total, cerca de 40€ em comida, 10€ em bebidas e 15€ em higiene."
            </p>
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={3}
              placeholder="Carrega no microfone ou escreve aqui..."
            />
            <div className="mt-2 flex gap-2">
              {listening ? (
                <Button type="button" variant="destructive" onClick={stopListening} className="flex-1">
                  <Square className="mr-1 h-4 w-4" /> Parar
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={startListening} className="flex-1">
                  <Mic className="mr-1 h-4 w-4" /> Gravar
                </Button>
              )}
              <Button
                type="button"
                onClick={runVoiceParse}
                disabled={parsingVoice || !transcript.trim()}
                className="flex-1"
              >
                {parsingVoice ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-4 w-4" />
                )}
                Preencher com AI
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="loc">Supermercado</Label>
            <Input
              id="loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Pingo Doce"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Valor estimado por subcategoria</Label>
              <span className="text-sm font-semibold">{formatEUR(manualTotal)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SUPERMARKET_SUBCATEGORIES.map((s) => (
                <div key={s} className="rounded-xl border border-border bg-card p-2.5">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">{s}</div>
                  <Input
                    value={subTotals[s] ?? ""}
                    onChange={(e) => setSubTotal(s, e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00 €"
                    className="h-9"
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>
    </div>
  );
}
