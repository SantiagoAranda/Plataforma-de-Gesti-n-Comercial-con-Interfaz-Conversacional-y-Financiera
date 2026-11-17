"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import "./commercial-documents.css";
import { paginate, type PagePlan } from "./paginate";

export type Col = { t: string; kind?: "r" | "c" | "k"; w?: string };

export type CartaSpec = {
  title: string;
  businessName: string;
  head: ReactNode;
  side: ReactNode;
  sideC: ReactNode;
  cols: Col[];
  /** Filas `<tr>`; deben traer `key`. */
  rows: ReactNode[];
  totals: ReactNode;
  bottom: ReactNode;
  footL: string;
  footR: string;
};

export const CartaBody = ({ side, children }: { side?: ReactNode; children?: ReactNode }) => (
  <div className="cv-body">
    <div className="cv-side">{side}</div>
    <div className="cv-col">{children}</div>
  </div>
);

export const CartaTable = ({ cols, rows }: { cols: Col[]; rows: ReactNode[] }) => (
  <table className="cv-table">
    <thead>
      <tr>
        {cols.map((c, i) => (
          <th key={i} className={c.kind ?? "d"} style={c.w ? { width: c.w } : undefined}>
            {c.t}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>
);

const Chead = ({ name, title }: { name: string; title: string }) => (
  <div className="cv-chead">
    <b>{name}</b>
    <span>{title}</span>
  </div>
);

const Foot = ({ l, r, page }: { l: string; r: string; page?: string }) => (
  <div className="cv-foot">
    <span className="l">{l}</span>
    <span className="r">{page ? `${r} · ${page}` : r}</span>
  </div>
);

const M = ({ k, children }: { k: string; children: ReactNode }) => (
  <div data-m={k} style={{ display: "flow-root" }}>
    {children}
  </div>
);

/** Reparte el documento en hojas carta midiendo los bloques en el DOM. */
export default function CartaDocument({ spec }: { spec: CartaSpec }) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [plan, setPlan] = useState<PagePlan[] | null>(null);

  useLayoutEffect(() => {
    let live = true;
    const run = () => {
      const el = measureRef.current;
      if (!live || !el) return;
      const h = (k: string) => (el.querySelector(`[data-m="${k}"]`) as HTMLElement).offsetHeight;
      const base = h("base");
      setPlan(
        paginate({
          head: h("head"),
          chead: h("chead"),
          base,
          side1: h("side1"),
          sideC: h("sideC"),
          th: h("th") - base,
          totals: h("totals") - base,
          bottom: h("bottom"),
          foot: h("foot"),
          rows: Array.from(el.querySelectorAll<HTMLElement>('[data-m="rows"] tbody tr')).map((r) => r.offsetHeight),
        }),
      );
    };
    run();
    // La medición cambia cuando cargan las fuentes.
    document.fonts?.ready.then(run);
    return () => {
      live = false;
    };
  }, [spec]);

  const chead = <Chead name={spec.businessName} title={spec.title} />;

  return (
    <>
      <div className="cd-measure" aria-hidden="true" ref={measureRef}>
        <div className="sheet-carta">
          <div className="cv-main" style={{ flex: "none", padding: "0 48px" }}>
            <M k="head">{spec.head}</M>
            <M k="chead">{chead}</M>
            <M k="base"><CartaBody /></M>
            <M k="side1"><CartaBody side={spec.side} /></M>
            <M k="sideC"><CartaBody side={spec.sideC} /></M>
            <M k="th"><CartaBody><CartaTable cols={spec.cols} rows={[]} /></CartaBody></M>
            <M k="totals"><CartaBody>{spec.totals}</CartaBody></M>
            <M k="bottom">{spec.bottom}</M>
            <M k="foot"><Foot l={spec.footL} r={spec.footR} page="Página 1 de 1" /></M>
            <M k="rows"><CartaBody><CartaTable cols={spec.cols} rows={spec.rows} /></CartaBody></M>
          </div>
        </div>
      </div>
      {plan && (
        <div className="cv-pages">
          {plan.map((p, k) => (
            <div className="sheet-carta" key={k}>
              <div className="cv-main">
                {p.first ? spec.head : chead}
                <CartaBody side={p.first ? spec.side : spec.sideC}>
                  {!p.noTable && <CartaTable cols={spec.cols} rows={spec.rows.slice(p.a, p.b)} />}
                  {p.tail && spec.totals}
                </CartaBody>
                {p.tail && spec.bottom}
                <Foot l={spec.footL} r={spec.footR} page={plan.length > 1 ? `Página ${k + 1} de ${plan.length}` : undefined} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
