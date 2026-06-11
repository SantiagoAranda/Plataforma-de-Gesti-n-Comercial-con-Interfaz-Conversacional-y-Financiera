"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import AppHeader from "@/src/components/layout/AppHeader";
import { api } from "@/src/lib/api";
import { useNotification } from "@/src/components/ui/NotificationProvider";

type FooterPhone = {
  id: string;
  label: string;
  value: string;
};

type FooterSocial = {
  id: string;
  type: string;
  label: string;
  value: string;
};

type StoreFooterSettings = {
  description?: string | null;
  email?: string | null;
  phones?: Array<Omit<FooterPhone, "id">> | null;
  socials?: Array<Omit<FooterSocial, "id">> | null;
};

const SOCIAL_TYPES = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X/Twitter" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "website", label: "Sitio Web" },
];

function getSocialLabel(type: string) {
  return SOCIAL_TYPES.find((item) => item.value === type)?.label ?? type;
}

function normalizeSocialValue(type: string, value: string) {
  const clean = value.trim();
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;

  const handle = clean.replace(/^@/, "");

  if (type === "instagram") return `https://instagram.com/${handle}`;
  if (type === "facebook") return `https://facebook.com/${handle}`;
  if (type === "youtube") return `https://youtube.com/${handle}`;
  if (type === "tiktok") return `https://tiktok.com/@${handle}`;
  if (type === "linkedin") return `https://linkedin.com/in/${handle}`;
  if (type === "x") return `https://x.com/${handle}`;
  if (type === "whatsapp") return `https://wa.me/${clean.replace(/\D/g, "")}`;
  if (type === "website") return `https://${clean}`;

  return clean;
}

function createLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function withPhoneIds(phones: StoreFooterSettings["phones"]): FooterPhone[] {
  return Array.isArray(phones)
    ? phones.map((phone) => ({ ...phone, id: createLocalId() }))
    : [];
}

function withSocialIds(socials: StoreFooterSettings["socials"]): FooterSocial[] {
  return Array.isArray(socials)
    ? socials.map((social) => ({ ...social, id: createLocalId() }))
    : [];
}

export default function ConfiguracionPage() {
  const { notify } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [phones, setPhones] = useState<FooterPhone[]>([]);
  const [socials, setSocials] = useState<FooterSocial[]>([]);
  const loadErrorShownRef = useRef(false);
  const notifyRef = useRef(notify);

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  useEffect(() => {
    let alive = true;

    api<StoreFooterSettings | null>("/businesses/store-footer-settings")
      .then((data) => {
        if (!alive) return;
        setDescription(data?.description ?? "");
        setEmail(data?.email ?? "");
        setPhones(withPhoneIds(data?.phones ?? []));
        setSocials(withSocialIds(data?.socials ?? []));
      })
      .catch((error) => {
        console.error(error);
        if (!loadErrorShownRef.current) {
          loadErrorShownRef.current = true;
          notifyRef.current({
            type: "error",
            message: "No se pudo cargar la configuracion",
          });
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const addPhone = () => {
    setPhones((prev) => [...prev, { id: createLocalId(), label: "Principal", value: "" }]);
  };

  const addSocial = () => {
    setSocials((prev) => [
      ...prev,
      { id: createLocalId(), type: "instagram", label: "Instagram", value: "" },
    ]);
  };

  const save = async () => {
    setSaving(true);

    const payload = {
      description: description.trim() || null,
      email: email.trim() || null,
      phones: phones
        .map((phone) => ({
          label: phone.label.trim() || "Telefono",
          value: phone.value.trim(),
        }))
        .filter((phone) => phone.value),
      socials: socials
        .map((social) => {
          const type = social.type;
          return {
            type,
            label: social.label.trim() || getSocialLabel(type),
            value: normalizeSocialValue(type, social.value),
          };
        })
        .filter((social) => social.value),
    };

    try {
      const saved = await api<StoreFooterSettings>(
        "/businesses/store-footer-settings",
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );

      setDescription(saved.description ?? "");
      setEmail(saved.email ?? "");
      setPhones(withPhoneIds(saved.phones));
      setSocials(withSocialIds(saved.socials));
      notify({ type: "success", message: "Footer guardado" });
    } catch (error) {
      console.error(error);
      notify({ type: "error", message: "No se pudo guardar el footer" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-white">
      <AppHeader
        title="Configuracion"
        subtitle="Ajustes del sistema"
        showBack
        hrefBack="/home"
      />

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-10">
        <div className="mx-auto w-full max-w-xl">
          <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  Footer de tienda publica
                </p>
                <p className="mt-2 text-sm text-neutral-500">
                  Configura la informacion visible en el pie de pagina de tu tienda.
                </p>
              </div>
              <button
                type="button"
                onClick={save}
                disabled={saving || loading}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-2xl bg-emerald-600 px-4 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Guardando" : "Guardar"}
              </button>
            </div>

            <div className="mt-5 space-y-5">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Descripcion
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm outline-none transition focus:border-emerald-500"
                />
              </label>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Telefonos
                  </span>
                  <button
                    type="button"
                    onClick={addPhone}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-100 px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-200"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar telefono
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {phones.map((phone, index) => (
                    <div key={phone.id} className="grid grid-cols-[1fr_1fr_36px] gap-2">
                      <input
                        value={phone.label}
                        onChange={(event) =>
                          setPhones((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, label: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="Principal"
                        className="h-10 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-emerald-500"
                      />
                      <input
                        value={phone.value}
                        onChange={(event) =>
                          setPhones((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, value: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="+54 ..."
                        className="h-10 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPhones((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                        }
                        className="grid h-10 place-items-center rounded-xl text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label="Eliminar telefono"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Redes sociales
                  </span>
                  <button
                    type="button"
                    onClick={addSocial}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-100 px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-200"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar red social
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {socials.map((social, index) => (
                    <div key={social.id} className="grid grid-cols-[130px_1fr_36px] gap-2">
                      <select
                        value={social.type}
                        onChange={(event) => {
                          const type = event.target.value;
                          setSocials((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, type, label: getSocialLabel(type) }
                                : item,
                            ),
                          );
                        }}
                        className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-emerald-500"
                      >
                        {SOCIAL_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={social.value}
                        onChange={(event) =>
                          setSocials((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, value: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="URL o usuario"
                        className="h-10 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setSocials((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                        }
                        className="grid h-10 place-items-center rounded-xl text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label="Eliminar red social"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
