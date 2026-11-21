import type { ReactNode } from "react";
import type { CartaSpec, Col } from "./CartaDocument";
import { addDays, amountInWords, documentTotals, formatCop, formatDateLong, formatDateShort, formatTime } from "./format";
import type { CommercialDocumentData, DocLine, TicketWidth } from "./types";

const PRICE_ASK = "Consultar precio";

const nitLabel = (b: CommercialDocumentData["business"]) => (b.nit ? `NIT ${b.nit}` : "");

const Hero = ({ kicker, sub, name }: { kicker: string; sub: string; name: string }) => (
  <div className="cv-hero">
    <div className="cv-logobox">
      <div className="cv-mark">{name.charAt(0)}</div>
      <div className="cv-markname">{name}</div>
    </div>
    <div className="cv-title" style={{ fontSize: kicker.length <= 10 ? 30 : kicker.length <= 16 ? 26 : 22 }}>
      {kicker}
    </div>
    <div className="cv-subtitle">{sub}</div>
  </div>
);

const Parties = ({ toLabel, d, withAddress }: { toLabel: string; d: CommercialDocumentData; withAddress: boolean }) => {
  const { customer: c, business: b } = d;
  const address = [c.address, c.city].filter(Boolean);
  return (
    <div className="cv-parties">
      <div>
        <div className="cv-plbl">{toLabel}</div>
        <div className="cv-pname">{c.name}</div>
        {c.document && <div className="cv-psub">{c.document}</div>}
        {withAddress && address.length > 0 && (
          <>
            <div className="cv-pk">Dirección</div>
            <div className="cv-pt">{address.join(", ")}</div>
          </>
        )}
        {c.phone && <div className="cv-pt sp"><b>T :</b> {c.phone}</div>}
        {c.email && <div className={c.phone ? "cv-pt" : "cv-pt sp"}><b>E :</b> {c.email}</div>}
      </div>
      <div>
        <div className="cv-plbl">Emitido por:</div>
        <div className="cv-pname">{b.legalName}</div>
        <div className="cv-psub">{[nitLabel(b), b.regime].filter(Boolean).join(" · ")}</div>
      </div>
    </div>
  );
};

const SideSection = ({ title, rows, children }: { title?: string; rows?: [string, string | undefined][]; children?: ReactNode }) => (
  <div className="cv-sec">
    {title && <div className="cv-st">{title}</div>}
    {rows?.filter(([, v]) => v).map(([l, v]) => (
      <div key={l}>
        <div className="cv-sl">{l} :</div>
        <div className="cv-sv">{v}</div>
      </div>
    ))}
    {children}
  </div>
);

const Lines = ({ n }: { n: number }) => (
  <>
    {Array.from({ length: n }, (_, i) => <div key={i} className="cv-line" />)}
  </>
);

const BigSide = ({ label, value }: { label: string; value: string }) => (
  <>
    <div className="cv-sl" style={{ marginTop: 0 }}>{label} :</div>
    <div className="cv-sbig">{value}</div>
  </>
);

const Totals = ({ lines, vat, label, words }: { lines: DocLine[]; vat: number; label: string; words: boolean }) => {
  const t = documentTotals(lines, vat);
  return (
    <div className="cv-tot">
      <div className="cv-trow"><span>Subtotal</span><span>{formatCop(t.subtotal)}</span></div>
      <div className="cv-trow"><span>IVA</span><span>{formatCop(t.vat)}</span></div>
      {t.unpriced > 0 && (
        <div className="cv-trow"><span>Productos con precio por consultar</span><span>{t.unpriced}</span></div>
      )}
      <div className="cv-grand"><span className="t">{label}</span><span className="a">{formatCop(t.total)}</span></div>
      {words && (
        <div className="cv-words">
          <div className="cv-bt">Valor en letras</div>
          <div className="cv-wt">{amountInWords(t.total)}</div>
        </div>
      )}
    </div>
  );
};

const Bottom = ({ d, mid, sign }: { d: CommercialDocumentData; mid: ReactNode; sign: ReactNode[] }) => {
  const b = d.business;
  return (
    <div className="cv-bottom">
      <div>
        <div className="cv-bt">Contacto</div>
        <div className="cv-btx">{[b.address, b.city].filter(Boolean).join(", ")}</div>
        <div className="cv-btx sp">
          {[b.phone, b.email, b.web].filter(Boolean).map((v) => <div key={v}>{v}</div>)}
        </div>
      </div>
      <div>{mid}</div>
      <div className="cv-signs">{sign.map((s, i) => <div key={i} className="cv-sg">{s}</div>)}</div>
    </div>
  );
};

const Thanks = ({ title, text }: { title: string; text: string }) => (
  <div className="cv-thanks"><b>{title}</b>{text}</div>
);

function lineRows(lines: DocLine[], opts: { prices: boolean; check?: boolean }) {
  return lines.map((l, i) => {
    const sub = [l.code ? `Cód. ${l.code}` : "", l.detail].filter(Boolean).join(" · ");
    return (
      <tr key={i}>
        {opts.check && <td className="k"><span className="cv-check" /></td>}
        <td className="d">
          <div className="cv-prod">{l.description}</div>
          {sub && <div className="cv-det">{sub}</div>}
        </td>
        <td className="c">{l.quantity}</td>
        {opts.prices && <td className="r">{l.unitPrice === null ? PRICE_ASK : formatCop(l.unitPrice)}</td>}
        {opts.prices && <td className="r">{l.unitPrice === null ? "—" : formatCop(l.quantity * l.unitPrice)}</td>}
      </tr>
    );
  });
}

const COLS_PRICES: Col[] = [
  { t: "Descripción" },
  { t: "Cant.", kind: "c", w: "11%" },
  { t: "Valor unit.", kind: "r", w: "21%" },
  { t: "Total", kind: "r", w: "21%" },
];
const COLS_NOPRICE: Col[] = [{ t: "Descripción" }, { t: "Cant.", kind: "c", w: "14%" }];
const COL_CHECK: Col = { t: "", kind: "k", w: "6%" };

export function quotationSpec(d: CommercialDocumentData): CartaSpec {
  const days = d.validityDays ?? 15;
  const total = documentTotals(d.lines, d.vatAmount).total;
  return {
    title: `Cotización N.º ${d.number}`,
    businessName: d.business.name,
    head: (
      <>
        <Hero kicker="Cotización" sub={`N.º ${d.number} · Válida por ${days} días`} name={d.business.name} />
        <Parties toLabel="Preparada para:" d={d} withAddress />
      </>
    ),
    side: (
      <>
        <SideSection title="Vigencia" rows={[["Válida por", `${days} días`], ["Hasta", formatDateLong(addDays(d.issuedAt, days))]]} />
        <SideSection title="Detalles de la cotización" rows={[["Cotización N.º", d.number], ["Fecha", formatDateLong(d.issuedAt)], ["Hora", formatTime(d.issuedAt)]]} />
        <SideSection><BigSide label="Total cotizado" value={`COP ${formatCop(total)}`} /></SideSection>
      </>
    ),
    sideC: <SideSection title="Detalles de la cotización" rows={[["Cotización N.º", d.number], ["Fecha", formatDateShort(d.issuedAt)]]} />,
    cols: COLS_PRICES,
    rows: lineRows(d.lines, { prices: true }),
    totals: <Totals lines={d.lines} vat={d.vatAmount ?? 0} label="Total cotizado" words />,
    bottom: (
      <Bottom
        d={d}
        mid={
          <>
            <div className="cv-bt">Condiciones</div>
            <div className="cv-btx">Precios sujetos a cambio después de la fecha de vigencia. La cotización no compromete la venta.</div>
            <Thanks title="Será un gusto atenderle" text="Quedamos atentos a su respuesta" />
          </>
        }
        sign={[<><b>{d.business.legalName}</b>Firma autorizada</>]}
      />
    ),
    footL: [d.business.legalName, nitLabel(d.business)].filter(Boolean).join(" · "),
    footR: "Cotización informativa · No constituye factura",
  };
}

export function deliveryOrderSpec(d: CommercialDocumentData, showPrices: boolean): CartaSpec {
  const t = documentTotals(d.lines, d.vatAmount);
  const sub = d.reference ? `N.º ${d.number} · Ref. ${d.reference}` : `N.º ${d.number}`;
  const details: [string, string | undefined][] = [["Orden N.º", d.number], ["Fecha", formatDateLong(d.issuedAt)], ["Referencia", d.reference]];
  return {
    title: `Orden de entrega N.º ${d.number}`,
    businessName: d.business.name,
    head: (
      <>
        <Hero kicker="Orden de entrega" sub={sub} name={d.business.name} />
        <Parties toLabel="Entregar a:" d={d} withAddress={false} />
      </>
    ),
    side: (
      <>
        <SideSection title="Dirección de entrega"><Lines n={2} /></SideSection>
        <SideSection title="Fecha de entrega"><Lines n={1} /><div className="cv-sub">día / mes / año</div></SideSection>
        <SideSection title="Detalles de la orden" rows={details} />
        <SideSection><BigSide label="Unidades a entregar" value={String(t.units)} /></SideSection>
      </>
    ),
    sideC: <SideSection title="Detalles de la orden" rows={[["Orden N.º", d.number], ["Fecha", formatDateShort(d.issuedAt)]]} />,
    cols: [COL_CHECK, ...(showPrices ? COLS_PRICES : COLS_NOPRICE)],
    rows: lineRows(d.lines, { prices: showPrices, check: true }),
    totals: showPrices ? (
      <Totals lines={d.lines} vat={d.vatAmount ?? 0} label="Total" words={false} />
    ) : (
      <div className="cv-tot">
        <div className="cv-trow"><span>Ítems</span><span>{d.lines.length}</span></div>
        <div className="cv-grand"><span className="t">Unidades a entregar</span><span className="a">{t.units}</span></div>
      </div>
    ),
    bottom: (
      <Bottom
        d={d}
        mid={
          <>
            <div className="cv-bt">Observaciones</div>
            <Lines n={3} />
            <Thanks title="Gracias por su preferencia" text="Revise la mercancía al recibirla" />
          </>
        }
        sign={["Entregado por", <>Recibido conforme<br />(nombre, C.C. y firma)</>]}
      />
    ),
    footL: [d.business.legalName, nitLabel(d.business)].filter(Boolean).join(" · "),
    footR: "Documento de entrega · No válido como factura",
  };
}

export function TicketDocument({
  kind, d, width, showPrices,
}: {
  kind: "quotation" | "delivery";
  d: CommercialDocumentData;
  width: TicketWidth;
  showPrices: boolean;
}) {
  const b = d.business;
  const t = documentTotals(d.lines, d.vatAmount);
  const prices = kind === "quotation" || showPrices;
  return (
    <div className={`sheet-ticket${width === 58 ? " w58" : ""}`}>
      <div className="c b" style={{ fontSize: 16 }}>{b.name}</div>
      <div className="c">
        {[b.web, nitLabel(b), [b.address, b.city].filter(Boolean).join(", "), b.phone].filter(Boolean).map((v) => <div key={v}>{v}</div>)}
      </div>
      <div className="line" />
      <div className="c b">{kind === "quotation" ? "COTIZACIÓN" : "ORDEN DE ENTREGA"} No. {d.number}</div>
      <div className="f"><span>Fecha:</span><span>{formatDateShort(d.issuedAt)} {formatTime(d.issuedAt)}</span></div>
      <div className="f"><span>Cliente:</span><span>{d.customer.name}</span></div>
      {kind === "quotation" && <div className="f"><span>Vigencia:</span><span>{d.validityDays ?? 15} días</span></div>}
      {kind === "delivery" && d.reference && <div className="f"><span>Ref.:</span><span>{d.reference}</span></div>}
      <div className="line" />
      {d.lines.map((l, i) => (
        <div key={i}>
          <div className="b">{l.description}</div>
          {prices ? (
            <div className="f">
              <span>{l.quantity} x {l.unitPrice === null ? PRICE_ASK : formatCop(l.unitPrice)}</span>
              <span>{l.unitPrice === null ? "—" : formatCop(l.quantity * l.unitPrice)}</span>
            </div>
          ) : (
            <div className="f"><span>Cantidad</span><span>x{l.quantity}</span></div>
          )}
        </div>
      ))}
      <div className="line" />
      {prices && (
        <>
          <div className="f"><span>Subtotal</span><span>{formatCop(t.subtotal)}</span></div>
          <div className="f"><span>IVA</span><span>{formatCop(t.vat)}</span></div>
          <div className="f big"><span>TOTAL</span><span>{formatCop(t.total)}</span></div>
          <div className="line" />
        </>
      )}
      {kind === "delivery" && (
        <>
          <div className="c" style={{ marginTop: 26, borderTop: "1px solid #000", paddingTop: 3 }}>Recibido por (nombre y firma)</div>
          <div className="c" style={{ marginTop: 22, borderTop: "1px solid #000", paddingTop: 3 }}>C.C.</div>
          <div className="line" />
        </>
      )}
      <div className="c">No válido como factura</div>
    </div>
  );
}
