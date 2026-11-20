"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  ArrowDown,
  PackagePlus,
  Plus,
} from "lucide-react";
import AppHeader from "@/src/components/layout/AppHeader";
import { EmptyStateCard } from "@/src/components/shared/EmptyStateCard";
import { api } from "@/src/lib/api";
import { getCached, getInstantCache, invalidateCache } from "@/src/lib/cache";
import { readBusinessProfile } from "@/src/lib/businessProfile";
import { getBusinessProfile } from "@/src/lib/businessLogo";
import { ItemCard } from "@/src/components/mi-negocio/ItemCard";
import ItemDetailModal from "@/src/components/mi-negocio/ItemDetailModal";
import { MiNegocioChatComposer } from "@/src/components/mi-negocio/MiNegocioChatComposer";
import { useItemForm } from "@/src/hooks/useItemForm";
import { ItemFormContent } from "@/src/components/mi-negocio/ItemFormContent";
import {
  Item,
} from "@/src/types/item";
import {
  timeToMinutes,
} from "@/src/lib/itemHelpers";
import { getRecipesBulk } from "@/src/services/inventory";
import { DateSeparator } from "@/src/components/shared/DateSeparator";
import {
  formatBusinessDateTime,
  getRelativeBusinessDayLabel,
} from "@/src/lib/businessDate";

function MiNegocioPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [businessName, setBusinessName] = useState("Mi Negocio");
  const [businessLogoUrl, setBusinessLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    const profile = readBusinessProfile();
    if (profile.name) setBusinessName(profile.name);

    getBusinessProfile()
      .then((res) => {
        if (res?.name) setBusinessName(res.name);
        if (res?.logoUrl) setBusinessLogoUrl(res.logoUrl);
      })
      .catch(() => {});
  }, []);

  const [items, setItems] = useState<Item[]>([]);
  const [recipeLineCounts, setRecipeLineCounts] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(true);
  const [itemForDetail, setItemForDetail] = useState<Item | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const shouldStickToBottomRef = useRef(true);
  const isInitialLoadRef = useRef(true);

  const form = useItemForm((savedItem) => {
    setItems((prev) => prev.some((item) => item.id === savedItem.id)
      ? prev.map((item) => item.id === savedItem.id ? savedItem : item)
      : [savedItem, ...prev]);
    shouldStickToBottomRef.current = true;
  }, setToast);
  const { composerMode, type, description, setDescription, week, isSubmitting, handleToggleComposer, handleStartEdit, handleSend } = form;
  const hasModalSurfaceOpen = Boolean(itemForDetail || deleteId);

  const fetchItems = useCallback(async (isInitial = false) => {
    try {
      const dbStatus = "ACTIVE";
      const key = `mi-negocio:items:${dbStatus}`;
      const hasInstant = !!getInstantCache<Item[]>(key, 60_000);

      if (!hasInstant && isInitial) {
        setLoading(true);
      }

      const data = await getCached(key, 60_000, () =>
        api<Item[]>(`/items?status=${dbStatus}&lightweight=true`),
      );

      const sorted = [...data].sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      );
      setItems(sorted);

      const recipeItems = sorted.filter(
        (item) =>
          item.type === "PRODUCT" && item.inventoryMode === "RECIPE_BASED",
      );
      const recipesByItemId = await getRecipesBulk(
        recipeItems.map((item) => item.id),
      );
      setRecipeLineCounts(
        Object.fromEntries(
          recipeItems.map((item) => [
            item.id,
            recipesByItemId[item.id]?.length ?? 0,
          ]),
        ),
      );
    } catch (err) {
      console.error(err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setVisibleCount(12);
    fetchItems(true);
  }, [fetchItems]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      (item.description && item.description.toLowerCase().includes(query))
    );
  });

  const editId = searchParams.get("itemId") ?? searchParams.get("editItem") ?? searchParams.get("edit");
  useEffect(() => {
    if (!editId) return;
    void handleStartEdit({ id: editId } as Item);
    router.replace("/mi-negocio", { scroll: false });
  }, [editId, handleStartEdit, router]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    setIsAtBottom(true);
    setShowScrollBottom(false);

    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
    } else {
      const el = scrollRef.current;
      if (!el) return;
      window.requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior });
      });
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!items.length) return;

    if (isInitialLoadRef.current) {
      scrollToBottom("auto");
      isInitialLoadRef.current = false;
      return;
    }

    if (shouldStickToBottomRef.current) {
      scrollToBottom("smooth");
    }
  }, [items.length, loading, scrollToBottom]);

  const handleDelete = async (item: Item) => {
    try {
      await api(`/items/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "INACTIVE" }),
      });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      invalidateCache("mi-negocio:items:ACTIVE");
      invalidateCache("home:businessActivity");
      setToast({ message: "Item eliminado", type: "success" });
    } catch (err) {
      console.error(err);
      setToast({ message: "Error al eliminar", type: "error" });
    }
  };

  useEffect(() => {
    const target = messagesEndRef.current;
    const container = scrollRef.current;
    if (!target || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          const atBottom = entry.isIntersecting;
          shouldStickToBottomRef.current = atBottom;
          setIsAtBottom(atBottom);
          setShowScrollBottom(!atBottom);
        }
      },
      {
        root: container,
        threshold: 0.1,
      }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const groupedItems = useMemo(() => {
    const groups: { dateLabel: string; items: Item[] }[] = [];
    const itemsToGroup = filteredItems.slice(0, visibleCount);

    itemsToGroup.forEach((item) => {
      const date = new Date(item.createdAt || Date.now());
      const relativeLabel = getRelativeBusinessDayLabel(date, "es-AR");

      let label =
        relativeLabel === "Hoy"
          ? "HOY"
          : relativeLabel === "Ayer"
          ? "AYER"
          : formatBusinessDateTime(date, "es-AR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
              .replace(/\./g, "")
              .toUpperCase();

      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.dateLabel === label) {
        lastGroup.items.push(item);
      } else {
        groups.push({ dateLabel: label, items: [item] });
      }
    });
    return groups;
  }, [filteredItems, visibleCount]);


  const hasScheduleOverlap = type === "SERVICE" && week.some((day) => {
    if (!day.active || day.ranges.length !== 2) return false;
    const m1s = timeToMinutes(day.ranges[0].start);
    const m1e = timeToMinutes(day.ranges[0].end);
    const m2s = timeToMinutes(day.ranges[1].start);
    const m2e = timeToMinutes(day.ranges[1].end);
    const first = m1s <= m2s ? { s: m1s, e: m1e } : { s: m2s, e: m2e };
    const second = m1s <= m2s ? { s: m2s, e: m2e } : { s: m1s, e: m1e };
    return first.e >= second.s;
  });

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-white">
      <AppHeader
        title={businessName}
        subtitle="Catálogo"
        showLogo={true}
        logoUrl={businessLogoUrl}
        showBack={true}
        hrefBack="/home"
      />

      <main
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col-reverse gap-8 pb-4"
      >
        <div ref={messagesEndRef} className="h-12 w-full shrink-0" />


        {groupedItems.map((group) => (
          <div key={group.dateLabel} className="space-y-4">
            <DateSeparator labelOverride={group.dateLabel} />

            <div className="flex flex-col-reverse gap-4">
              {group.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onEdit={() => handleStartEdit(item)}
                  onDelete={() => setDeleteId(item.id)}
                  onView={() => setItemForDetail(item)}
                  recipeLineCount={recipeLineCounts[item.id] ?? 0}
                />
              ))}
            </div>
          </div>
        ))}

        {filteredItems.length > visibleCount && (
          <div className="flex justify-center pb-8 pt-2">
            <button
              onClick={() => setVisibleCount((prev) => prev + 12)}
              className="px-6 py-2.5 bg-white border border-neutral-100 text-neutral-500 font-bold rounded-full shadow-sm active:scale-95 transition text-[10px] uppercase tracking-widest"
            >
              Cargar más
            </button>
          </div>
        )}

        {composerMode === "closed" &&
          searchQuery.trim() !== "" &&
          filteredItems.length === 0 && (
            <div className="text-center py-20 px-6 animate-in fade-in zoom-in-95 duration-300 flex flex-col justify-center items-center">
              <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mb-4 border border-neutral-100/50">
                <Search className="h-6 w-6 text-neutral-300" />
              </div>
              <h3 className="text-neutral-900 font-bold text-sm mb-1">
                No se encontraron productos o servicios
              </h3>
              <p className="text-neutral-400 text-xs font-medium leading-relaxed">
                Probá con otro nombre o descripción
              </p>
            </div>
          )}

        {!loading && items.length === 0 && (
          <div className="py-6 px-2">
            <EmptyStateCard
              icon={PackagePlus}
              title="Aún no hay productos ni servicios"
              description="Crea tu primer producto o servicio desde la barra inferior para armar tu catálogo."
              actionLabel="Crear producto o servicio"
              actionIcon={Plus}
              onAction={() => { void handleStartEdit(null); }}
            />
          </div>
        )}

        {loading && (
          <div className="text-center py-20 text-neutral-400 font-bold text-[10px] uppercase tracking-widest animate-pulse">
            Cargando...
          </div>
        )}
      </main>

      {!hasModalSurfaceOpen && <MiNegocioChatComposer
        mode={composerMode}
        onToggle={handleToggleComposer}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        description={description}
        onDescriptionChange={setDescription}
        onSubmit={handleSend}
        isSubmitting={isSubmitting}
        type={type}
        submitDisabled={hasScheduleOverlap || form.isLoadingDetail}
      >
        {form.isLoadingDetail ? <p role="status">Cargando detalle...</p> : <fieldset disabled={isSubmitting}><ItemFormContent {...form.contentProps} /></fieldset>}
      </MiNegocioChatComposer>}

      <ItemDetailModal
        item={itemForDetail}
        open={!!itemForDetail}
        onClose={() => setItemForDetail(null)}
        onEdit={(i) => {
          setItemForDetail(null);
          handleStartEdit(i);
        }}
        onDelete={(i) => {
          setItemForDetail(null);
          setDeleteId(i.id);
        }}
        recipeLineCount={
          itemForDetail ? (recipeLineCounts[itemForDetail.id] ?? 0) : 0
        }
      />

      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">
              ¿Eliminar item?
            </h3>
            <p className="text-xs text-neutral-500 mb-6 font-medium leading-relaxed">
              Esta acción ocultará el item de tu catálogo activo.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const target = items.find((i) => i.id === deleteId);
                  if (target) handleDelete(target);
                  setDeleteId(null);
                }}
                className="w-full py-3 rounded-xl bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-100 active:scale-95 transition"
              >
                Eliminar
              </button>
              <button
                onClick={() => setDeleteId(null)}
                className="w-full py-3 rounded-xl bg-neutral-100 text-neutral-500 text-xs font-bold active:scale-95 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}


      {showScrollBottom && composerMode === "closed" && !itemForDetail && !deleteId && (
        <button
          onClick={() => scrollToBottom("smooth")}
          className="fixed bottom-28 right-6 md:bottom-36 z-20 bg-[#0B3F64] border border-[#0B3F64] text-white rounded-full w-12 h-12 flex items-center justify-center shadow-[0_8px_30px_rgba(11,63,100,0.3)] animate-in fade-in slide-in-from-bottom-4 duration-300 active:scale-95 hover:bg-[#072D49] transition-colors"
          aria-label="Ir al final"
        >
          <ArrowDown size={20} strokeWidth={2.5} />
        </button>
      )}

      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 text-white text-[10px] font-bold uppercase tracking-widest px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-bottom-4 duration-300 z-[10001] ${toast.type === "success" ? "bg-green-600 shadow-green-100" : "bg-red-600 shadow-red-100"
            }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default function MiNegocioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col min-h-screen bg-white">
          <AppHeader
            title="Mi negocio"
            subtitle="Catálogo"
            showLogo={true}
            showBack={true}
            hrefBack="/home"
          />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-neutral-400 font-medium text-[10px] uppercase tracking-widest animate-pulse">
              Cargando mi negocio...
            </div>
          </main>
        </div>
      }
    >
      <MiNegocioPageContent />
    </Suspense>
  );
}
