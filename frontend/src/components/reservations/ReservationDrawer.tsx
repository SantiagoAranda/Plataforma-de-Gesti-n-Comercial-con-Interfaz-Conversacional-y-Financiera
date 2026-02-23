// "use client";

// import React, { useEffect, useMemo, useState } from "react";

// /** ===== Types ===== */
// type ItemType = "PRODUCT" | "SERVICE";

// type Service = {
//   id: string;
//   type: "SERVICE";
//   name: string;
//   price: number;
//   durationMinutes: number; // requerido para agenda
// };

// type Product = {
//   id: string;
//   type: "PRODUCT";
//   name: string;
//   price: number;
// };

// type Item = Service | Product;

// type BusinessSchedule = {
//   timezone: string; // "America/Argentina/Buenos_Aires"
//   workDays: number[]; // 0=Dom ... 6=Sáb. Ej: Lun-Vie => [1,2,3,4,5]
//   startTime: string; // "09:00"
//   endTime: string;   // "17:00"
//   bufferMinutes: number; // ej 0, 10, 15
// };

// type Booking = {
//   id: string;
//   serviceId: string;
//   startISO: string; // fecha/hora inicio
//   endISO: string;   // fecha/hora fin
//   customerName: string;
//   whatsapp: string;
// };

// type CartLine =
//   | { kind: "PRODUCT"; productId: string; name: string; price: number; qty: number }
//   | { kind: "SERVICE_BOOKING"; serviceId: string; name: string; price: number; startISO: string; endISO: string; customerName: string; whatsapp: string };

// /** ===== Demo schedule + existing bookings (reemplazar por API) ===== */
// const BUSINESS_SCHEDULE: BusinessSchedule = {
//   timezone: "America/Argentina/Buenos_Aires",
//   workDays: [1, 2, 3, 4, 5],
//   startTime: "09:00",
//   endTime: "17:00",
//   bufferMinutes: 0,
// };

// // Reservas existentes para bloquear slots (mock)
// const EXISTING_BOOKINGS: Booking[] = [
//   {
//     id: "b1",
//     serviceId: "svc-1",
//     startISO: new Date(2026, 1, 24, 10, 0, 0).toISOString(), // 24 Feb 2026 10:00
//     endISO: new Date(2026, 1, 24, 11, 0, 0).toISOString(),
//     customerName: "Ana",
//     whatsapp: "+54 9 11 1111 1111",
//   },
// ];

// /** ===== Helpers (date/time) ===== */
// function pad2(n: number) {
//   return String(n).padStart(2, "0");
// }

// function startOfMonth(d: Date) {
//   return new Date(d.getFullYear(), d.getMonth(), 1);
// }

// function endOfMonth(d: Date) {
//   return new Date(d.getFullYear(), d.getMonth() + 1, 0);
// }

// function isSameDay(a: Date, b: Date) {
//   return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
// }

// function addMinutes(date: Date, minutes: number) {
//   return new Date(date.getTime() + minutes * 60_000);
// }

// function parseHHmm(hhmm: string) {
//   const [h, m] = hhmm.split(":").map(Number);
//   return { h, m };
// }

// function setTimeOnDate(day: Date, hhmm: string) {
//   const { h, m } = parseHHmm(hhmm);
//   return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
// }

// function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
//   return aStart < bEnd && bStart < aEnd;
// }

// function formatMonthTitle(d: Date) {
//   const months = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
//   return `${months[d.getMonth()]} ${d.getFullYear()}`;
// }

// function formatTimeLabel(d: Date) {
//   // 12h como el mock
//   let h = d.getHours();
//   const m = pad2(d.getMinutes());
//   const ampm = h >= 12 ? "PM" : "AM";
//   h = h % 12;
//   if (h === 0) h = 12;
//   return `${pad2(h)}:${m} ${ampm}`;
// }

// /** ===== Calendar grid ===== */
// function buildMonthGrid(viewDate: Date) {
//   const first = startOfMonth(viewDate);
//   const last = endOfMonth(viewDate);

//   // grid starts on Sunday (0). Your UI shows D L M M J V S.
//   const start = new Date(first);
//   start.setDate(first.getDate() - first.getDay());

//   const end = new Date(last);
//   end.setDate(last.getDate() + (6 - last.getDay()));

//   const days: Date[] = [];
//   const cur = new Date(start);
//   while (cur <= end) {
//     days.push(new Date(cur));
//     cur.setDate(cur.getDate() + 1);
//   }
//   return { days, first, last };
// }

// /** ===== Reservation Drawer ===== */
// function ReservationDrawer(props: {
//   open: boolean;
//   service: Service | null;
//   schedule: BusinessSchedule;
//   existingBookings: Booking[];
//   onClose: () => void;
//   onConfirm: (line: CartLine) => void;
// }) {
//   const { open, service, schedule, existingBookings, onClose, onConfirm } = props;

//   const [viewDate, setViewDate] = useState(() => new Date());
//   const [selectedDay, setSelectedDay] = useState<Date | null>(null);
//   const [selectedSlotStart, setSelectedSlotStart] = useState<Date | null>(null);
//   const [customerName, setCustomerName] = useState("");
//   const [whatsapp, setWhatsapp] = useState("");

//   useEffect(() => {
//     if (!open) return;
//     // reset form on open
//     setViewDate(new Date());
//     setSelectedDay(null);
//     setSelectedSlotStart(null);
//     setCustomerName("");
//     setWhatsapp("");
//   }, [open]);

//   const month = useMemo(() => buildMonthGrid(viewDate), [viewDate]);

//   const workDaysSet = useMemo(() => new Set(schedule.workDays), [schedule.workDays]);

//   const isDaySelectable = (d: Date) => {
//     // dentro del mes visible, y es día hábil
//     const inMonth = d.getMonth() === viewDate.getMonth();
//     const isWorkDay = workDaysSet.has(d.getDay());
//     // opcional: bloquear pasado
//     const today = new Date();
//     const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
//     const startD = new Date(d.getFullYear(), d.getMonth(), d.getDate());
//     const notPast = startD >= startToday;
//     return inMonth && isWorkDay && notPast;
//   };

//   const slots = useMemo(() => {
//     if (!service || !selectedDay) return [];

//     const dayStart = setTimeOnDate(selectedDay, schedule.startTime);
//     const dayEnd = setTimeOnDate(selectedDay, schedule.endTime);

//     const duration = service.durationMinutes;
//     const buffer = schedule.bufferMinutes;

//     const results: { start: Date; end: Date; disabled: boolean }[] = [];

//     let cursor = new Date(dayStart);
//     while (true) {
//       const slotStart = new Date(cursor);
//       const slotEnd = addMinutes(slotStart, duration);

//       if (slotEnd > dayEnd) break;

//       // chequear solapamiento con reservas existentes para el mismo servicio (o si querés, para todo el negocio)
//       const disabled = existingBookings.some((b) => {
//         // si querés bloquear por servicio específico:
//         if (b.serviceId !== service.id) return false;
//         const bStart = new Date(b.startISO);
//         const bEnd = new Date(b.endISO);
//         return intervalsOverlap(slotStart, slotEnd, bStart, bEnd);
//       });

//       results.push({ start: slotStart, end: slotEnd, disabled });

//       cursor = addMinutes(slotStart, duration + buffer);
//     }

//     return results;
//   }, [service, selectedDay, schedule.startTime, schedule.endTime, schedule.bufferMinutes, existingBookings]);

//   const canConfirm =
//     !!service &&
//     !!selectedDay &&
//     !!selectedSlotStart &&
//     customerName.trim().length >= 2 &&
//     whatsapp.trim().length >= 8;

//   if (!open || !service) return null;

//   const onPickSlot = (s: { start: Date; end: Date; disabled: boolean }) => {
//     if (s.disabled) return;
//     setSelectedSlotStart(s.start);
//   };

//   const handleConfirm = () => {
//     if (!canConfirm || !selectedSlotStart) return;

//     const start = selectedSlotStart;
//     const end = addMinutes(start, service.durationMinutes);

//     onConfirm({
//       kind: "SERVICE_BOOKING",
//       serviceId: service.id,
//       name: service.name,
//       price: service.price,
//       startISO: start.toISOString(),
//       endISO: end.toISOString(),
//       customerName: customerName.trim(),
//       whatsapp: whatsapp.trim(),
//     });

//     onClose();
//   };

//   return (
//     <div className="fixed inset-0 z-50">
//       {/* backdrop */}
//       <button
//         type="button"
//         className="absolute inset-0 bg-black/25"
//         onClick={onClose}
//         aria-label="Cerrar"
//       />
//       {/* sheet */}
//       <div className="absolute inset-x-0 bottom-0 top-0 mx-auto w-full max-w-md bg-white">
//         {/* header */}
//         <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white/80 px-4 py-4 backdrop-blur">
//           <button
//             type="button"
//             className="rounded-full p-2 hover:bg-gray-100"
//             onClick={onClose}
//             aria-label="Volver"
//           >
//             ←
//           </button>
//           <div className="flex-1 text-center text-lg font-semibold">Reservar Servicio</div>
//           <div className="w-10" />
//         </div>

//         <div className="px-4 pb-28 pt-5">
//           {/* Fecha */}
//           <div className="text-xl font-semibold">Selecciona una fecha</div>
//           <div className="mt-1 text-sm text-gray-500">Disponibilidad para el mes actual</div>

//           <div className="mt-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
//             <div className="flex items-center justify-between">
//               <button
//                 type="button"
//                 className="rounded-full p-2 hover:bg-gray-100"
//                 onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
//                 aria-label="Mes anterior"
//               >
//                 ‹
//               </button>
//               <div className="text-base font-semibold">{formatMonthTitle(viewDate)}</div>
//               <button
//                 type="button"
//                 className="rounded-full p-2 hover:bg-gray-100"
//                 onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
//                 aria-label="Mes siguiente"
//               >
//                 ›
//               </button>
//             </div>

//             <div className="mt-4 grid grid-cols-7 text-center text-xs font-medium text-gray-400">
//               <div>D</div><div>L</div><div>M</div><div>M</div><div>J</div><div>V</div><div>S</div>
//             </div>

//             <div className="mt-2 grid grid-cols-7 gap-y-2 text-center">
//               {month.days.map((d) => {
//                 const inMonth = d.getMonth() === viewDate.getMonth();
//                 const selectable = isDaySelectable(d);
//                 const selected = selectedDay && isSameDay(d, selectedDay);

//                 const base =
//                   "mx-auto flex h-10 w-10 items-center justify-center rounded-full text-sm";
//                 const styles = selected
//                   ? "bg-emerald-400 text-white"
//                   : selectable
//                     ? "text-gray-900 hover:bg-gray-100"
//                     : "text-gray-300";

//                 return (
//                   <button
//                     key={d.toISOString()}
//                     type="button"
//                     className={`${base} ${styles}`}
//                     disabled={!selectable}
//                     onClick={() => {
//                       setSelectedDay(d);
//                       setSelectedSlotStart(null);
//                     }}
//                     aria-label={`Día ${d.getDate()}`}
//                   >
//                     <span className={inMonth ? "" : "opacity-40"}>{d.getDate()}</span>
//                   </button>
//                 );
//               })}
//             </div>
//           </div>

//           {/* Horarios */}
//           <div className="mt-6 text-xl font-semibold">Selecciona un horario</div>

//           <div className="mt-3 grid grid-cols-3 gap-3">
//             {slots.length === 0 ? (
//               <div className="col-span-3 rounded-2xl border border-gray-200 p-4 text-sm text-gray-500">
//                 {selectedDay ? "No hay horarios disponibles para este día." : "Seleccioná una fecha para ver horarios."}
//               </div>
//             ) : (
//               slots.map((s) => {
//                 const selected = selectedSlotStart && s.start.getTime() === selectedSlotStart.getTime();
//                 const cls =
//                   "rounded-full border px-3 py-3 text-center text-sm font-medium transition " +
//                   (s.disabled
//                     ? "border-gray-200 text-gray-300"
//                     : selected
//                       ? "border-emerald-300 bg-emerald-100 text-emerald-900"
//                       : "border-gray-200 text-gray-900 hover:bg-gray-50");

//                 return (
//                   <button
//                     key={s.start.toISOString()}
//                     type="button"
//                     className={cls}
//                     disabled={s.disabled}
//                     onClick={() => onPickSlot(s)}
//                   >
//                     {formatTimeLabel(s.start)}
//                   </button>
//                 );
//               })
//             )}
//           </div>

//           {/* Contacto */}
//           <div className="mt-8 text-xl font-semibold">Datos de contacto</div>

//           <div className="mt-4 space-y-4">
//             <div>
//               <label className="mb-2 block text-sm font-medium text-gray-700">Nombre completo</label>
//               <input
//                 className="w-full rounded-2xl border border-gray-200 px-4 py-4 text-base outline-none focus:border-emerald-400"
//                 placeholder="Ej. Juan Pérez"
//                 value={customerName}
//                 onChange={(e) => setCustomerName(e.target.value)}
//               />
//             </div>

//             <div>
//               <label className="mb-2 block text-sm font-medium text-gray-700">WhatsApp</label>
//               <input
//                 className="w-full rounded-2xl border border-gray-200 px-4 py-4 text-base outline-none focus:border-emerald-400"
//                 placeholder="+54 9 11 1234 5678"
//                 value={whatsapp}
//                 onChange={(e) => setWhatsapp(e.target.value)}
//                 inputMode="tel"
//               />
//             </div>
//           </div>
//         </div>

//         {/* bottom fixed CTA */}
//         <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-gray-200 bg-white/85 px-4 py-4 backdrop-blur">
//           <button
//             type="button"
//             disabled={!canConfirm}
//             onClick={handleConfirm}
//             className={
//               "w-full rounded-2xl py-4 text-base font-semibold shadow-sm transition " +
//               (canConfirm
//                 ? "bg-emerald-400 text-black hover:bg-emerald-500"
//                 : "bg-gray-200 text-gray-500")
//             }
//           >
//             Confirmar Reserva ✓
//           </button>
//           <div className="mt-2 text-center text-xs text-gray-400">
//             Al confirmar, recibirás un mensaje de confirmación por WhatsApp.
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }

// /** ===== Example: page usage ===== */
// export default function StoreServiceExample() {
//   // items mock
//   const items: Item[] = [
//     { id: "svc-1", type: "SERVICE", name: "Sesión de masaje", price: 15000, durationMinutes: 60 },
//     { id: "svc-2", type: "SERVICE", name: "Consulta kinesiología", price: 12000, durationMinutes: 45 },
//     { id: "prd-1", type: "PRODUCT", name: "Banda elástica", price: 8000 },
//   ];

//   const [cart, setCart] = useState<CartLine[]>([]);
//   const [drawerOpen, setDrawerOpen] = useState(false);
//   const [selectedService, setSelectedService] = useState<Service | null>(null);

//   const openReservation = (service: Service) => {
//     setSelectedService(service);
//     setDrawerOpen(true);
//   };

//   const addProductToCart = (p: Product) => {
//     setCart((prev) => {
//       const idx = prev.findIndex((x) => x.kind === "PRODUCT" && x.productId === p.id);
//       if (idx >= 0) {
//         const copy = [...prev];
//         const line = copy[idx] as Extract<CartLine, { kind: "PRODUCT" }>;
//         copy[idx] = { ...line, qty: line.qty + 1 };
//         return copy;
//       }
//       return [...prev, { kind: "PRODUCT", productId: p.id, name: p.name, price: p.price, qty: 1 }];
//     });
//   };

//   const handleAddToCart = (item: Item) => {
//     if (item.type === "SERVICE") {
//       openReservation(item);
//       return;
//     }
//     addProductToCart(item);
//   };

//   const handleConfirmBooking = (line: CartLine) => {
//     setCart((prev) => [...prev, line]);
//     // acá normalmente llamás a tu API para crear Reservation (y/o Order draft) y luego redirigir a WhatsApp si aplica
//   };

//   return (
//     <div className="min-h-screen bg-gray-50">
//       <div className="mx-auto w-full max-w-md px-4 py-6">
//         <div className="text-lg font-semibold">Tienda</div>
//         <div className="mt-4 space-y-3">
//           {items.map((it) => (
//             <div key={it.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
//               <div className="flex items-start justify-between gap-3">
//                 <div>
//                   <div className="font-semibold">{it.name}</div>
//                   <div className="mt-1 text-sm text-gray-500">
//                     ${it.price.toLocaleString("es-AR")}
//                     {it.type === "SERVICE" ? ` · ${it.durationMinutes} min` : ""}
//                   </div>
//                 </div>

//                 <button
//                   type="button"
//                   onClick={() => handleAddToCart(it)}
//                   className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90"
//                 >
//                   Cargar al carrito
//                 </button>
//               </div>
//             </div>
//           ))}
//         </div>

//         <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-4">
//           <div className="font-semibold">Carrito</div>
//           <div className="mt-3 space-y-2 text-sm">
//             {cart.length === 0 ? (
//               <div className="text-gray-500">Vacío</div>
//             ) : (
//               cart.map((c, i) => {
//                 if (c.kind === "PRODUCT") {
//                   return (
//                     <div key={i} className="flex justify-between">
//                       <div>{c.name} × {c.qty}</div>
//                       <div>${(c.price * c.qty).toLocaleString("es-AR")}</div>
//                     </div>
//                   );
//                 }
//                 return (
//                   <div key={i} className="space-y-1">
//                     <div className="flex justify-between">
//                       <div>{c.name}</div>
//                       <div>${c.price.toLocaleString("es-AR")}</div>
//                     </div>
//                     <div className="text-xs text-gray-500">
//                       {new Date(c.startISO).toLocaleString("es-AR")} · {c.customerName} · {c.whatsapp}
//                     </div>
//                   </div>
//                 );
//               })
//             )}
//           </div>
//         </div>
//       </div>

//       <ReservationDrawer
//         open={drawerOpen}
//         service={selectedService}
//         schedule={BUSINESS_SCHEDULE}
//         existingBookings={EXISTING_BOOKINGS}
//         onClose={() => setDrawerOpen(false)}
//         onConfirm={handleConfirmBooking}
//       />
//     </div>
//   );
// }