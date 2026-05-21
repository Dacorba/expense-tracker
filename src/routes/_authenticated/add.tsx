import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { analyzeReceipt } from "@/lib/expenses.functions";
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
import { Camera, Sparkles, Loader2, ArrowLeft, Trash2 } from "lucide-react";
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
  const fileRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<string>("Renda");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // supermarket flow
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [items, setItems] = useState<ReceiptItem[]>([]);

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

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      if (isSupermarket) {
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
        disabled={saving || uploading || analyzing}
        className="mt-6 w-full"
        size="lg"
      >
        {saving
          ? "A guardar..."
          : isSupermarket
            ? `Guardar ${items.length} items · ${formatEUR(itemsTotal)}`
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
}: {
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
}) {
  return (
    <div className="mt-5 space-y-4">
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
