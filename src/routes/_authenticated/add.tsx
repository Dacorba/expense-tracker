import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { analyzeItemPhoto } from "@/lib/expenses.functions";
import { CATEGORIES, categoryEmoji } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Sparkles, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/add")({
  component: AddPage,
});

function AddPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const analyze = useServerFn(analyzeItemPhoto);
  const fileRef = useRef<HTMLInputElement>(null);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState<string>("Outro");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [calories, setCalories] = useState("");
  const [notes, setNotes] = useState("");

  async function onPickPhoto(file: File) {
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
      setPhotoUrl(data.publicUrl);
      setAnalyzing(true);
      try {
        const res = await analyze({ data: { imageUrl: data.publicUrl } }) as {
          item_name?: string;
          category?: string;
          quantity?: number;
          unit?: string | null;
          estimated_price_eur?: number | null;
          protein_g?: number | null;
          calories?: number | null;
          notes?: string;
        };
        if (res.item_name) setItemName(res.item_name);
        if (res.category) setCategory(res.category);
        if (res.quantity) setQuantity(String(res.quantity));
        if (res.unit) setUnit(res.unit);
        if (res.estimated_price_eur != null) setPrice(String(res.estimated_price_eur));
        if (res.protein_g != null) setProteinG(String(res.protein_g));
        if (res.calories != null) setCalories(String(res.calories));
        if (res.notes) setNotes(res.notes);
        toast.success("Item identificado pela AI");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "AI falhou — preenche manualmente");
      } finally {
        setAnalyzing(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload falhou");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!user) return;
    if (!itemName.trim() || !price) {
      toast.error("Item e preço são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("expenses").insert({
        user_id: user.id,
        item_name: itemName.trim(),
        category,
        price: Number(price),
        quantity: Number(quantity || 1),
        unit: unit || null,
        location: location || null,
        photo_url: photoUrl,
        protein_g: proteinG ? Number(proteinG) : null,
        calories: calories ? Number(calories) : null,
        notes: notes || null,
      });
      if (error) throw error;
      toast.success("Despesa guardada");
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
        <button onClick={() => navigate({ to: "/home" })} className="rounded-full p-2 hover:bg-muted" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-display text-xl font-semibold">Nova despesa</h1>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => e.target.files?.[0] && onPickPhoto(e.target.files[0])}
      />

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading || analyzing}
        className="relative flex h-48 w-full items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-border bg-card transition hover:border-primary"
      >
        {photoUrl ? (
          <img src={photoUrl} alt="item" className="h-full w-full object-cover" />
        ) : (
          <div className="text-center">
            <Camera className="mx-auto mb-2 h-8 w-8 text-primary" />
            <p className="text-sm font-medium">Tirar / escolher foto do item</p>
            <p className="text-xs text-muted-foreground">A AI identifica e categoriza</p>
          </div>
        )}
        {(uploading || analyzing) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="mt-2 text-xs font-medium text-foreground">
              {uploading ? "A enviar foto..." : "A AI a analisar..."}
            </p>
          </div>
        )}
      </button>

      {analyzing === false && photoUrl && (
        <p className="mt-2 flex items-center gap-1 text-xs text-primary">
          <Sparkles className="h-3 w-3" /> Sugestões preenchidas — revê e ajusta
        </p>
      )}

      <div className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="item">Item</Label>
          <Input id="item" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Ex: Leite meio gordo 1L" />
        </div>

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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="price">Preço (€)</Label>
            <Input id="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loc">Local</Label>
            <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Pingo Doce" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="qty">Quantidade</Label>
            <Input id="qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="unit">Unidade</Label>
            <Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg, un, L" />
          </div>
        </div>

        <details className="rounded-2xl border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Nutrição (opcional)</summary>
          <div className="grid grid-cols-2 gap-3 px-4 pb-4">
            <div className="space-y-1.5">
              <Label htmlFor="prot">Proteína (g)</Label>
              <Input id="prot" inputMode="decimal" value={proteinG} onChange={(e) => setProteinG(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cal">Calorias</Label>
              <Input id="cal" inputMode="decimal" value={calories} onChange={(e) => setCalories(e.target.value)} />
            </div>
          </div>
        </details>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <Button onClick={save} disabled={saving || uploading || analyzing} className="w-full" size="lg">
          {saving ? "A guardar..." : `Guardar ${categoryEmoji(category)}`}
        </Button>
      </div>
    </main>
  );
}
