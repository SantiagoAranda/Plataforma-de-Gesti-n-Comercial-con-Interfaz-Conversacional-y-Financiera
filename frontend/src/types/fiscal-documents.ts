export type FiscalDocumentStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUBMITTED_PENDING_DIAN"
  | "VALIDATED"
  | "RETRYABLE_FAILURE"
  | "LOCAL_PERSISTENCE_FAILURE"
  | "REJECTED"
  | "CREDITED";

export type FiscalDocumentType = "INVOICE" | "CREDIT_NOTE";

export type FiscalDocumentAttemptSummary = {
  id: string;
  result: "STARTED" | "SUCCEEDED" | "RETRYABLE_FAILURE" | "LOCAL_PERSISTENCE_FAILURE" | "REJECTED";
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  completedAt: string | null;
};

export type FiscalDocumentArtifact = {
  id: string;
  kind: string;
  checksum: string;
  sizeBytes: number;
};

export type FiscalDocument = {
  id: string;
  orderId: string;
  parentDocumentId: string | null;
  type: FiscalDocumentType;
  status: FiscalDocumentStatus;
  referenceCode: string;
  factusNumber: string | null;
  cufeOrCude: string | null;
  dianValidatedAt: string | null;
  total: number | string;
  reversalRequestedAt: string | null;
  reversalAppliedAt: string | null;
  providerErrors?: unknown;
  attempts: FiscalDocumentAttemptSummary[];
  artifacts: FiscalDocumentArtifact[];
  createdAt: string;
  updatedAt: string;
  order: {
    id: string;
    customerName: string | null;
    total: number | string;
    status: "DRAFT" | "SENT" | "COMPLETED" | "CANCELLED";
    createdAt: string;
  };
};

export type FactusConfigurationView = {
  enabled: boolean;
  configured: boolean;
  environment: "sandbox" | "production";
  invoiceRangeId: number | null;
  creditNoteRangeId: number | null;
  updatedAt: string | null;
  lastVerifiedAt: null;
};

export type FiscalMunicipality = {
  code: string;
  name: string;
  department: { code: string; name: string };
};
