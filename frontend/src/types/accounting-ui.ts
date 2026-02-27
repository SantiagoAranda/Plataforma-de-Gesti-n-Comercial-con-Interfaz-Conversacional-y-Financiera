export type UiAccountingEntry = {
    id: string;       // lineId
    entryId: string;  // para editar/eliminar
    dateISO: string;
    time: string;

    pucCode: string;
    accountName: string;

    description: string;
    amount: number; // signed

    source: "MANUAL" | "AUTO_ORDER" | "SYSTEM" | "RECURRENT";
    kind: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

    status: "DRAFT" | "POSTED" | "VOID";

    pucLevel: "CUENTA" | "SUBCUENTA";

};