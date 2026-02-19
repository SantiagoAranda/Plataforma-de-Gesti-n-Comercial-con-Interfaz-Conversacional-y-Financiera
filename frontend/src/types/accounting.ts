export type AccountingType = "ALL" | "INCOME" | "EXPENSE" | "ASSET";

export type EntrySource = "AUTO_ORDER" | "MANUAL" | "SYSTEM" | "RECURRENT";

export type AccountingKind =
    | "ASSET"
    | "LIABILITY"
    | "EQUITY"
    | "INCOME"
    | "EXPENSE";

export type AccountingEntry = {
    id: string;
    dateISO: string;
    time: string;
    pucCode: string;
    accountName: string;
    description: string;
    amount: number;
    source: EntrySource;
    kind: AccountingKind;
};
