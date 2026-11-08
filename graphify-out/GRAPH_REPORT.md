# Graph Report - Plataforma-de-Gesti-n-Comercial-con-Interfaz-Conversacional-y-Financiera  (2026-11-08)

## Corpus Check
- 641 files · ~410,170 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 20 file(s) not represented in the graph (top: .csv 10, (none) 4, .example 1)

## Summary
- 4517 nodes · 11656 edges · 204 communities (133 shown, 71 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 375 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3d450b42`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- PayrollService
- payroll.service.ts
- inventory.ts
- react
- ItemOptionsService
- class-validator
- @nestjs/common
- SettingsService
- cn
- rut-impuestos/page.tsx
- PayrollController
- PublicController
- mi-negocio/page.tsx
- PushNotificationsService
- auth.controller.ts
- venta/page.tsx
- ReservationsController
- usePushNotifications.ts
- PublicStoreClient.tsx
- common/guards/business-active.guard.ts
- app.module.ts
- BusinessesController
- BusinessesService
- sales.service.ts
- getSessionContext
- perfil/page.tsx
- SettingsService
- react
- factusEntitlement.test.cjs
- payroll/api.ts
- RecipesService
- web-push.transport.ts
- SimpleTaxService
- ManualPaidOutflowSheet.tsx
- SaleCard.tsx
- accounting.service.ts
- InventoryController
- InventoryService
- PaySimpleTaxAnnualReturnDto
- SalesService
- FiscalDocumentService
- ItemsController
- AppHeader
- lucide-react
- TaxPreviewDto
- AccountingChatComposer.tsx
- devDependencies
- MovementsService
- moduleActivity.ts
- nomina/page.tsx
- CreateEmployeeContractDto
- regimen-simple/page.tsx
- ReservationSlotPicker.tsx
- businesses.service.ts
- public.service.ts
- password-recovery.service.ts
- tienda/page.tsx
- fiscal-document.service.ts
- contabilidad/page.tsx
- HomeAgenda.tsx
- SaleCreateModal.tsx
- SaleReceiptModal.tsx
- AccountingController
- payroll.service.spec.ts
- SalesController
- dependencies
- seed.ts
- AccountingService
- businessProfile.test.cjs
- SimpleProductDetailSheet.tsx
- IngredientsController
- EmployeePayrollEditorSheet
- types/sales.ts
- CreateInventoryAdjustmentDto
- AvailabilityService
- accounting.service.spec.ts
- IngredientsService
- reserva/[id]/page.tsx
- businessDate.ts
- frontend/package.json
- inventory.service.ts
- inventario/page.tsx
- cn
- movements-ui.ts
- ProductsController
- compilerOptions
- UpsertPurchasePresentationDto
- movimientos/page.tsx
- FiscalDocumentsController
- Verificación independiente de Etapa 1 — 30 de octubre de 2026
- LoginForm.tsx
- PublicService
- scripts
- auth.service.ts
- UpdateItemDto
- PayrollNewsSheet
- availability.service.ts
- RecoveryForms.test.cjs
- fiscal-document.service.spec.ts
- password-recovery.e2e-spec.ts
- FactusProvider
- CreatePublicOrderDto
- SessionBoundary.test.cjs
- compilerOptions
- DayPickerCalendar.tsx
- push-notifications.controller.ts
- SimpleTaxController
- WhatsappComposer.tsx
- tsconfig.build.json
- app/layout.tsx
- AppService
- ListIngredientsQueryDto
- CalculatePayrollDto
- InventoryKardexQueryDto
- CreatePayrollEventDto
- jest
- CreatePayrollAdjustmentDto
- lifecycle.test.cjs
- StorageService
- RegisterPushSubscriptionDto
- sales-price-history.spec.ts
- RegisterForm.tsx
- UpdateBusinessConfigDto
- SaleTaxPanel.tsx
- CreateIngredientDto
- UpdateIngredientDto
- proxy-address-security.test.cjs
- nest-cli.json
- AccountingMovementsQueryDto
- run-auth-stage2-isolated.cjs
- ServiceIngredientItemDto
- simple-tax.service.ts
- availability.service.spec.ts
- temp-logic-test.js
- UpsertSimpleTaxConfigDto
- CreateItemDto
- ItemsService
- types.ts
- 📊 Resumen de la Auditoría Actual
- config
- RegisterBusinessDto
- SimpleTaxCalculateDto
- BusinessDetailPage.tsx
- session.test.cjs
- backend/README.md
- Altos
- proxy-address-security.test.cjs
- AddItemImageDto
- backend/eslint.config.mjs
- InventoryKardexGlobalQueryDto
- Casos reproducibles y evidencia de ejecución
- Hallazgos priorizados
- Política de contraseñas nuevas (solicitud del cliente)
- Etapa 1 — Validación funcional en navegador (30 de octubre de 2026)
- Etapa 2 — Recuperación y contraseñas
- Verificación final de Etapa 2
- Plataforma de Gestión Comercial
- UpdateOrderDto
- Medios
- CreateInventoryInitialDto
- UpdateOrderItemDto
- .applyInventoryMovement
- users.module.ts
- tsconfig.spec.json
- Plan de correcciones propuesto — sin implementar
- PostgreSQL desechable para validar Etapa 1
- ColorPickerPopover.tsx
- migrate-item-images-to-r2.ts
- RecoveryMailService
- @nestjs/passport
- CreateAccountingMovementDto
- Inventario funcional — Nómina Colombia
- Etapa 2: registro local y presentación de contraseñas
- frontend/README.md
- Etapa 2: identificadores públicos reservados
- temp-db-query.js
- Matriz normativa y vigencias
- Comparación de fórmulas: sistema, cliente y norma
- CreateManualPaidOutflowDto
- parseAccountingDate
- Etapa 3: dirección pública durante el registro
- BusinessesService
- Etapa 4: cambio único de identificador y redirecciones permanentes
- UpdateBusinessProfileDto
- PERIODIC_PAYROLL_LIMITATIONS.md
- CLAUDE.md
- parseFactusDateTime

## God Nodes (most connected - your core abstractions)
1. `api()` - 159 edges
2. `PayrollService` - 138 edges
3. `@nestjs/common` - 128 edges
4. `react` - 119 edges
5. `cn()` - 111 edges
6. `@prisma/client` - 101 edges
7. `PrismaService` - 96 edges
8. `lucide-react` - 93 edges
9. `InventoryService` - 80 edges
10. `class-validator` - 69 edges

## Surprising Connections (you probably didn't know these)
- `Cambios y compatibilidad` --references--> `jwtSecret()`  [INFERRED]
  docs/AUTH_STAGE1_IMPLEMENTATION.md → backend/src/auth/jwt.config.ts
- `Eliminado` --references--> `validateNewPassword()`  [INFERRED]
  docs/AUTH_PASSWORD_POLICY_CLIENT_CHANGE.md → backend/src/auth/password-policy.ts
- `Contratos y flujo` --references--> `validateCustomBusinessSlug()`  [INFERRED]
  docs/BUSINESS_SLUG_STAGE3.md → backend/src/common/utils/business-slug.ts
- `[MODIFY] [order-line-input.dto.ts](file:///c:/Users/I-MAG/Desktop/Proyecto%20de%20Gestion%20Workana/backend/src/sales/dto/order-line-input.dto.ts)` --references--> `SalesOrderLineInputDto`  [INFERRED]
  implementation_plan.md → backend/src/sales/dto/order-line-input.dto.ts
- `Correcciones adicionales realizadas al retomar` --references--> `deleteBusinessFixtures()`  [INFERRED]
  docs/BUSINESS_SLUG_STAGE2_VERIFICATION.md → backend/test/business-fixtures.ts

## Import Cycles
- None detected.

## Communities (204 total, 71 thin omitted)

### Community 1 - "payroll.service.ts"
Cohesion: 0.04
Nodes (30): CreateComplementaryPayrollRunDto, CreateContractSettlementDto, CreatePayrollPeriodDto, CreateEmployeeDto, UpdateEmployeeDto, ConfirmPayrollPaymentDto, CreatePayrollBenefitPaymentDto, CreatePayrollPaymentBatchDto (+22 more)

### Community 2 - "inventory.ts"
Cohesion: 0.06
Nodes (67): EditarIngredientePage(), NuevoIngredientePage(), DependencyList(), IngredientDeactivationImpactModal(), Props, emptyPresentationForm, IngredientDetailSheet(), PresentationEditorMode (+59 more)

### Community 3 - "react"
Cohesion: 0.09
Nodes (18): InactiveBusinessesPage(), ActiveBusinessesPage(), AdminBusinessThread(), Business, Props, Business, BusinessChatItem(), Props (+10 more)

### Community 4 - "ItemOptionsService"
Cohesion: 0.06
Nodes (9): CreateItemOptionDto, CreateOptionGroupDto, UpdateItemOptionDto, UpdateOptionGroupDto, ItemOptionsController, ItemOptionsService, OptionSelectionActionInput, createService() (+1 more)

### Community 5 - "class-validator"
Cohesion: 0.09
Nodes (17): normalizeDecimalString(), normalizeIngredientUnit(), InventorySummaryQueryDto, ReplaceServiceConsumptionDto, ApplyInventoryMovementInput, InventoryRequirement, ItemSellability, ItemSellabilityRequest (+9 more)

### Community 6 - "@nestjs/common"
Cohesion: 0.06
Nodes (26): p, prisma, prisma, prisma, WEEKDAYS, prisma, BackfillSummary, prisma (+18 more)

### Community 7 - "SettingsService"
Cohesion: 0.06
Nodes (3): CreateIcaRateDto, CreateTaxRuleDto, SettingsController

### Community 8 - "cn"
Cohesion: 0.06
Nodes (64): ConsumptionHistoryTab(), formatOccurredAt(), Props, DraftRecipeLine, ExpandableRecipeCard(), formatQuantity(), formatQuantityInput(), inferInitialStep() (+56 more)

### Community 9 - "rut-impuestos/page.tsx"
Cohesion: 0.11
Nodes (31): BUSINESS_PROFILE_OPTIONS, decimalToPerThousand(), deriveBusinessProfile(), deriveIncomeTaxDeclarant(), DianBadge(), normalizeCodes(), parsePerThousand(), RESPONSIBILITY_LABELS (+23 more)

### Community 12 - "mi-negocio/page.tsx"
Cohesion: 0.12
Nodes (37): compressImageFile(), MiNegocioPage(), MiNegocioPageContent(), ItemCard, BADGE_PRESET_COLORS, BadgeColorSelect(), ItemFormContent(), ItemFormContentProps (+29 more)

### Community 14 - "auth.controller.ts"
Cohesion: 0.09
Nodes (4): AuthController, ForgotPasswordDto, LoginDto, ResetPasswordDto

### Community 15 - "venta/page.tsx"
Cohesion: 0.08
Nodes (45): CarritoPage(), CartCard(), CartItem, CheckoutSummary(), MOCK_CART, Row(), formatDisplayMoney(), getCalendarBusinessDayKey() (+37 more)

### Community 17 - "usePushNotifications.ts"
Cohesion: 0.09
Nodes (45): ActivatePushResult, ACTIVATION_MESSAGES, ActivationCoordinatorEvent, ActivationFailure, createBrowserSubscription(), debugActivationTimeout(), deviceIdForUser(), emitActivationState() (+37 more)

### Community 18 - "PublicStoreClient.tsx"
Cohesion: 0.06
Nodes (54): decodeSlug(), FALLBACK_METADATA, generateMetadata(), getStoreItems(), Page(), Props, resolveStore, SearchParams (+46 more)

### Community 19 - "common/guards/business-active.guard.ts"
Cohesion: 0.07
Nodes (16): AuthenticatedRequest, BusinessesController, UpdateBusinessSlugDto, Roles(), ROLES_KEY, BusinessActiveGuard, JwtAuthGuard, RolesGuard (+8 more)

### Community 20 - "app.module.ts"
Cohesion: 0.09
Nodes (18): AccountingModule, AvailabilityModule, BusinessesModule, CommonModule, FiscalDocumentsModule, IngredientsModule, InventoryModule, ItemOptionsModule (+10 more)

### Community 22 - "BusinessesService"
Cohesion: 0.16
Nodes (13): BUSINESS_SLUG_PATTERN, businessSlugChangeUsed(), businessSlugTaken(), generateBusinessSlug(), RESERVED_BUSINESS_SLUGS, retryBusinessSlugTransaction(), validateCustomBusinessSlug(), generateSlug() (+5 more)

### Community 23 - "sales.service.ts"
Cohesion: 0.06
Nodes (10): AddOrderItemDto, BuyerFiscalContextDto, CreateOrderDto, OrderOptionSelectionInputDto, SalesOrderLineInputDto, ReverseOrderDto, UpdateOrderItemOptionalsDto, UnifiedSaleDto (+2 more)

### Community 24 - "getSessionContext"
Cohesion: 0.14
Nodes (21): HomeLayout(), getToken(), handleSessionExpired(), CREATED_LOGIN_REQUIRED, registerAccount(), Registration, REGISTRATION_UNCONFIRMED, Result (+13 more)

### Community 25 - "perfil/page.tsx"
Cohesion: 0.10
Nodes (38): HomePage(), MODULE_ICONS, CardHeader(), createLocalId(), EmailSource, FooterPhone, FooterSocial, getSocialLabel() (+30 more)

### Community 26 - "SettingsService"
Cohesion: 0.11
Nodes (8): SIMPLE_REGIME_NOT_AVAILABLE, SIMPLE_REGIME_NOT_AVAILABLE_MESSAGE, SimpleRegimeNotAvailableException, UpsertTaxProfileDto, FiscalMunicipality, getFactusMunicipalities(), deriveIncomeTaxDeclarant(), SettingsService

### Community 27 - "react"
Cohesion: 0.06
Nodes (43): inventoryMeta(), ItemCardComponent(), Props, IngredientOption, inventoryMeta(), Item, ItemDetailModal(), ItemDetailModalProps (+35 more)

### Community 28 - "factusEntitlement.test.cjs"
Cohesion: 0.13
Nodes (11): assert, cardModule, filename, fs, Module, off, path, React (+3 more)

### Community 29 - "payroll/api.ts"
Cohesion: 0.06
Nodes (38): ArlRiskClass, CalculatePayrollPayload, Contract, CreateContractPayload, CreateEmployeePayload, CreatePayrollEventPayload, CreatePayrollPeriodPayload, CreateSettlementPayload (+30 more)

### Community 30 - "RecipesService"
Cohesion: 0.08
Nodes (7): RecipeLineDto, ReplaceRecipeDto, RecipesBulkController, RecipesController, RecipesModule, RecipesService, createService()

### Community 31 - "web-push.transport.ts"
Cohesion: 0.08
Nodes (19): web-push@3.6.7, incrementCounter(), key(), mac(), PUSH_PROOF_TTL_MS, PushProofClaims, signPushProof(), verifyPushProof() (+11 more)

### Community 33 - "ManualPaidOutflowSheet.tsx"
Cohesion: 0.08
Nodes (34): calendarDateFromKey(), copFormatter, createInitialForm(), ExpensePucSearchOption, formatAmount(), FormState, ManualPaidOutflowSheet(), ManualPaidOutflowSheetProps (+26 more)

### Community 34 - "SaleCard.tsx"
Cohesion: 0.12
Nodes (25): FiscalDocumentDetailModal(), FiscalDocumentMenu(), Props, FILTERS, FiscalDocumentsView(), FiscalViewFilter, matches(), calcTotal() (+17 more)

### Community 35 - "accounting.service.ts"
Cohesion: 0.11
Nodes (18): AccountingItemType, EXPENSE_GROUPS, ExpenseGroupDefinition, MANUAL_PAID_OUTFLOW_DEFAULTS, MovementWithPucRelations, ORDER_ACCOUNTING_DEFAULTS, OrderForPosting, PostingLine (+10 more)

### Community 37 - "InventoryService"
Cohesion: 0.11
Nodes (3): InventoryService, createService(), createServiceWithAccounting()

### Community 42 - "AppHeader"
Cohesion: 0.10
Nodes (37): IngredienteDetailPage(), KardexPage(), KardexPageContent(), InventoryChatActionBar(), formatUnitSymbol(), getStockUnitSymbol(), ALL_ACTIONS, isPositiveDecimal() (+29 more)

### Community 43 - "lucide-react"
Cohesion: 0.09
Nodes (27): AdminHomePage(), AppLayout(), AppLayoutContent(), LogoutButton(), HOME_THREADS, HomeThread, accentStyles, Props (+19 more)

### Community 45 - "AccountingChatComposer.tsx"
Cohesion: 0.07
Nodes (31): AccountingChatComposer(), AccountingFormErrors, NatureFilter, Props, SEARCH_MODES, SearchFilters, SearchMode, AccountingExpandableForm() (+23 more)

### Community 46 - "devDependencies"
Cohesion: 0.05
Nodes (55): author, description, devDependencies, eslint@^9.18.0, eslint-config-prettier@^10.0.1, @eslint/eslintrc@^3.2.0, jest@^30.0.0, @nestjs/cli@^11.0.0 (+47 more)

### Community 47 - "MovementsService"
Cohesion: 0.09
Nodes (7): CreateMovementDto, MovementType, EXPENSE, INCOME, MovementsController, MovementsModule, MovementsService

### Community 48 - "moduleActivity.ts"
Cohesion: 0.14
Nodes (30): accentStyles, MainModuleCard(), Props, DesktopModulePanel(), getBusinessNameServerSnapshot(), getBusinessNameSnapshot(), MODULE_ICONS, ModuleItem (+22 more)

### Community 49 - "nomina/page.tsx"
Cohesion: 0.08
Nodes (34): ActivePayrollCycle, AdjustmentsDraft, canPreparePayrollPeriod(), choosePayrollPeriod(), ContractDraft, createContractOnlyTabs, createEmployeeOnlyTabs, createEmployeeTabs (+26 more)

### Community 51 - "regimen-simple/page.tsx"
Cohesion: 0.08
Nodes (46): formatCurrency(), formatRate(), formatUvt(), Metric(), PERIODS, RegimenSimplePage(), api(), messageFromErrorBody() (+38 more)

### Community 52 - "ReservationSlotPicker.tsx"
Cohesion: 0.11
Nodes (27): Item, ItemType, ProductCard(), PublicStorePage(), cn(), ReservationData, ReservationDrawer(), handleConfirm() (+19 more)

### Community 53 - "businesses.service.ts"
Cohesion: 0.12
Nodes (27): ADMIN_FACTUS_SELECT, ALLOWED_LOGO_MIME_TYPES, ALLOWED_SOCIAL_TYPES, BUSINESS_PROFILE_SELECT, cleanOptionalHexColor(), cleanOptionalString(), extractFooterColor(), extractFooterLogoFlag() (+19 more)

### Community 54 - "public.service.ts"
Cohesion: 0.06
Nodes (16): Args, BusinessActiveGuard, FeatureFlagsService, parseBooleanFlag(), PrismaService, FOOTER_META_TYPES, getFooterColorMetaValue(), getFooterMetaValue() (+8 more)

### Community 55 - "password-recovery.service.ts"
Cohesion: 0.10
Nodes (18): cooldownMinutes(), Db, integer(), mailQuotaLimits, recordMailOutcome(), reserveMailSlot(), PasswordRecoveryService, Abuso de correo (+10 more)

### Community 56 - "tienda/page.tsx"
Cohesion: 0.16
Nodes (18): AdminProductCard(), FOOTER_SOCIAL_TYPES, formatCop(), isHexColor(), Item, MiTiendaPage(), normalizeFooterPhones(), normalizeFooterSocials() (+10 more)

### Community 57 - "fiscal-document.service.ts"
Cohesion: 0.18
Nodes (16): Tx, assertInvoiceHistory(), buyerIdentityState(), finiteAmount(), INVOICE_CLOSE_SNAPSHOT_VERSION, invoiceCloseSnapshot(), nonEmpty(), requiresLegacyInvoiceWarning() (+8 more)

### Community 58 - "contabilidad/page.tsx"
Cohesion: 0.13
Nodes (23): AccountingFormErrors, buildPucPayload(), buildSelectedPucFromMovement(), ContabilidadPage(), emptyForm, formatCurrency(), getMovementAmount(), MONTH_NAMES (+15 more)

### Community 59 - "HomeAgenda.tsx"
Cohesion: 0.16
Nodes (21): AgendaEventRow(), formatTimeLabel(), FullScreenPlaceholder(), getInitial(), HomeAgenda(), renderCategoryContent(), HomeCategoryFilter, INITIAL_SUPPLIERS (+13 more)

### Community 60 - "SaleCreateModal.tsx"
Cohesion: 0.09
Nodes (25): AppointmentLookupModal(), formatCurrency(), formatDate(), minutesToTime(), Props, PublicReservationItem, StatusBadge(), BusinessItem (+17 more)

### Community 61 - "SaleReceiptModal.tsx"
Cohesion: 0.13
Nodes (23): calcTotal(), consumerTaxLabels, downloadFile(), formatDate(), formatMoney(), formatReceiptNumber(), formatTime(), getLineTotal() (+15 more)

### Community 63 - "payroll.service.spec.ts"
Cohesion: 0.18
Nodes (13): csv-parse@^6.1.0, createPrismaMock(), defaultContract(), defaultEmployee(), defaultGlobalParameter(), defaultPeriod(), enabledPeriodicPayrollPeriod(), globalParameterForReference() (+5 more)

### Community 65 - "dependencies"
Cohesion: 0.07
Nodes (29): dependencies, argon2@^0.45.2, bcrypt@^6.0.0, class-transformer@^0.5.1, class-validator@^0.14.3, @nestjs/common@^11.0.1, @nestjs/config@^4.0.3, @nestjs/jwt@^11.0.2 (+21 more)

### Community 66 - "seed.ts"
Cohesion: 0.20
Nodes (23): main(), normalizeCode(), parseCSV(), prisma, Row, seedAdmin(), seedArlRiskClasses(), seedCiiu() (+15 more)

### Community 68 - "businessProfile.test.cjs"
Cohesion: 0.08
Nodes (19): assert, dom, form(), fs, { JSDOM }, login(), Module, notices (+11 more)

### Community 69 - "SimpleProductDetailSheet.tsx"
Cohesion: 0.24
Nodes (13): KardexList(), movementMeta(), purchaseModeBadge(), isValidDecimalString(), normalizeDecimalInput(), Props, SimpleProductDetailSheet(), TabType (+5 more)

### Community 71 - "EmployeePayrollEditorSheet"
Cohesion: 0.20
Nodes (23): BigInput(), ContractFormSection(), ContractManagementSheet(), EmployeeFormSection(), EmployeeFormSheet(), employeeName(), EmployeePayrollEditorSheet(), FieldBlock() (+15 more)

### Community 72 - "types/sales.ts"
Cohesion: 0.14
Nodes (18): formatMoney(), SaleDetailsModal(), formatMoney(), SaleFiscalSummary(), getSaleOriginLabel(), getSaleOriginStyles(), ApiOrder, PaymentMethod (+10 more)

### Community 75 - "AvailabilityService"
Cohesion: 0.14
Nodes (4): AvailabilityService, formatDateKey(), createRoutes(), ReservationsService

### Community 76 - "accounting.service.spec.ts"
Cohesion: 0.22
Nodes (10): clase(), createManualService(), createService(), createSummaryService(), cuenta(), grupo(), pucCuenta(), pucSubcuenta() (+2 more)

### Community 77 - "IngredientsService"
Cohesion: 0.15
Nodes (4): setup(), IngredientsService, createService(), createHarness()

### Community 78 - "reserva/[id]/page.tsx"
Cohesion: 0.10
Nodes (19): CancelReservationButton(), CancelReservationButtonProps, capitalize(), formatDate(), formatPrice(), generateMetadata(), getReservation(), InfoRow() (+11 more)

### Community 79 - "businessDate.ts"
Cohesion: 0.12
Nodes (30): todayISO(), AccountingMovementCard(), badgeForNature(), categoryFromPuc(), categoryStyles, formatCurrency(), getIconStyles(), getReadableDetail() (+22 more)

### Community 80 - "frontend/package.json"
Cohesion: 0.05
Nodes (48): eslintConfig, dependencies, html2canvas-pro@^2.0.2, jspdf@^4.1.0, jspdf-autotable@^5.0.7, lucide-react@^0.564.0, next@16.4.4, react@19.2.3 (+40 more)

### Community 81 - "inventory.service.ts"
Cohesion: 0.16
Nodes (11): IngredientOperationalState, isIngredientOperational(), deriveItemOptionValidity(), isItemOptionStructurallyOperational(), OptionGroupState, OptionIngredientState, OptionState, deriveRecipeValidity() (+3 more)

### Community 82 - "inventario/page.tsx"
Cohesion: 0.09
Nodes (33): formatInventoryTotal, InventarioPage(), InventarioPageContent(), SaveBarContext, UITab, IngredientList(), Metric(), Props (+25 more)

### Community 83 - "cn"
Cohesion: 0.10
Nodes (21): PayrollEmployeeHeader(), PayrollEmployeeSheetShell(), PayrollEmployeeTabs(), SummaryCard(), Action, InventoryQuickActions(), colors, Item (+13 more)

### Community 84 - "movements-ui.ts"
Cohesion: 0.13
Nodes (17): MovementBreakdownList(), formatARS(), formatPct(), MovementFormulaAccordion(), OPTIONS, mapMovementMetrics(), safeNum(), formatLocalDate() (+9 more)

### Community 85 - "ProductsController"
Cohesion: 0.15
Nodes (3): ProductsController, ProductsModule, ProductsService

### Community 86 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 88 - "movimientos/page.tsx"
Cohesion: 0.13
Nodes (25): ConfiguracionPage(), formatCop(), formatLocalISO(), formatRate(), isTodayLocal(), MONTH_NAMES, MonthPickerPopover(), MovimientosPage() (+17 more)

### Community 90 - "Verificación independiente de Etapa 1 — 30 de octubre de 2026"
Cohesion: 0.08
Nodes (22): Cambios y compatibilidad, Despliegue seguro (no ejecutado), Etapa 1 — Implementación y validación, Inventario de archivos, Pruebas pendientes y aceptación en staging, Pruebas realizadas, Rate limiting: contrato y activación, Riesgos residuales (+14 more)

### Community 91 - "LoginForm.tsx"
Cohesion: 0.19
Nodes (13): LoginPage(), EyeIcon(), EyeSlashIcon(), getSettleDuration(), LoginForm(), translateError(), LoginStoreHint(), NavigationTransitionBackdrop() (+5 more)

### Community 93 - "scripts"
Cohesion: 0.12
Nodes (16): scripts, build, fiscal:reconcile-accepted, format, lint, migrate:images:r2, prisma:backfill:item-stock, start (+8 more)

### Community 94 - "auth.service.ts"
Cohesion: 0.20
Nodes (9): AuthService, UserData, hashNewPassword(), validateNewPassword(), verifyPassword(), passwordV2Enabled(), UsersService, bcrypt (+1 more)

### Community 96 - "PayrollNewsSheet"
Cohesion: 0.17
Nodes (25): activePayrollCycleLabel(), createIdempotencyKey(), DetailPanel(), EmployeeCarousel(), employeeRole(), EmployeeStandaloneCard(), formatOneDecimalComma(), formatSettlementDate() (+17 more)

### Community 97 - "availability.service.ts"
Cohesion: 0.11
Nodes (14): ALLOWED_SLOT_INTERVALS, BlockRange, computeSlots(), Db, formatSlotTime(), LEGACY_STEP_OPTIONS, legacySlotInterval(), mergeWindows() (+6 more)

### Community 98 - "RecoveryForms.test.cjs"
Cohesion: 0.10
Nodes (13): AppApiError, assert, dom, fs, { JSDOM }, Module, navigation, notices (+5 more)

### Community 99 - "fiscal-document.service.spec.ts"
Cohesion: 0.14
Nodes (4): order(), FiscalDocumentRecoveryService, setup(), setupRetryFlow()

### Community 100 - "password-recovery.e2e-spec.ts"
Cohesion: 0.09
Nodes (20): AUTH_ACTION, AuthAction(), AuthActionName, authActionOf(), handlerFor(), AuthModule, AuthRateLimitGuard, Counter (+12 more)

### Community 102 - "CreatePublicOrderDto"
Cohesion: 0.23
Nodes (3): CreatePublicOrderDto, OptionSelectionInput, OrderItemInput

### Community 103 - "SessionBoundary.test.cjs"
Cohesion: 0.08
Nodes (27): Autenticación: `/admin`, T7.a y estado final de las Etapas 1 y 2, Causas raíz y correcciones, Estado de las Etapas, No verificado (requiere navegador real), Pruebas, Recomendaciones para staging, Riesgos pendientes, AdminLayout() (+19 more)

### Community 104 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, incremental, module, outDir, skipLibCheck (+5 more)

### Community 105 - "DayPickerCalendar.tsx"
Cohesion: 0.21
Nodes (9): buildMonthGrid(), DayPickerCalendar(), endOfMonth(), formatDayPillLabel(), MONTHS_ES, Props, sameDay(), startOfMonth() (+1 more)

### Community 106 - "push-notifications.controller.ts"
Cohesion: 0.11
Nodes (9): @nestjs/throttler@^6.5.0, AuthorizePushDto, PushStatusDto, TestPushDto, UnregisterPushSubscriptionDto, UpdatePushPreferencesDto, AuthenticatedRequest, PushNotificationsController (+1 more)

### Community 108 - "WhatsappComposer.tsx"
Cohesion: 0.12
Nodes (16): PayrollComposerFooterBar(), PayrollSheetFooter(), InventoryChatActionBarProps, InventoryChatMenuAction, MENU, Options, PayrollChatActionBar(), Props (+8 more)

### Community 109 - "tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, exclude, extends, include, ./tsconfig.json

### Community 110 - "app/layout.tsx"
Cohesion: 0.27
Nodes (8): metadata, RootLayout(), viewport, getInternalSaleUrl(), PushForegroundListener(), PushMessage, ToastLimitListener(), react-hot-toast

### Community 117 - "jest"
Cohesion: 0.22
Nodes (9): jest, collectCoverageFrom, coverageDirectory, moduleFileExtensions, rootDir, testEnvironment, testRegex, transform (+1 more)

### Community 119 - "lifecycle.test.cjs"
Cohesion: 0.16
Nodes (11): assert, fs, loader(), load(), logoutHarness(), path, sandboxWith(), swHarness() (+3 more)

### Community 121 - "RegisterPushSubscriptionDto"
Cohesion: 0.18
Nodes (3): BrowserPushSubscriptionDto, PushSubscriptionKeysDto, RegisterPushSubscriptionDto

### Community 122 - "sales-price-history.spec.ts"
Cohesion: 0.43
Nodes (7): createSalesService(), fn(), mockAccountingService(), mockInventoryService(), mockItemOptionsService(), mockPrisma(), mockTaxService()

### Community 123 - "RegisterForm.tsx"
Cohesion: 0.11
Nodes (27): Frontend, ForgotPasswordPage(), RegisterPage(), ResetPasswordPage(), Availability, BusinessSlugField(), customSlugError(), Props (+19 more)

### Community 125 - "SaleTaxPanel.tsx"
Cohesion: 0.06
Nodes (60): ApiBusinessItem, BusinessItem, deriveSaleConceptFromItems(), EditableItem, fallbackConceptForType(), formatMoney(), normalizeQty(), panelInputClass() (+52 more)

### Community 129 - "proxy-address-security.test.cjs"
Cohesion: 0.25
Nodes (4): assert, test, assert, test

### Community 130 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 132 - "run-auth-stage2-isolated.cjs"
Cohesion: 0.15
Nodes (12): bcrypt, command(), crypto, docker(), fs, os, password, path (+4 more)

### Community 134 - "simple-tax.service.ts"
Cohesion: 0.14
Nodes (8): SimpleTaxPaymentMethod, BANK, CASH, CalculationInput, ELECTRONIC_PAYMENTS_DISCOUNT_RATE, IncludedSale, SimpleTaxActivityGroupMappingRow, SimpleTaxGroupResolution

### Community 135 - "availability.service.spec.ts"
Cohesion: 0.26
Nodes (12): weekdayOf(), WEEKDAYS, win(), ANCHOR_RESERVATION_ID, BUSINESS_ID, createFakePrisma(), day(), Fixture (+4 more)

### Community 136 - "temp-logic-test.js"
Cohesion: 0.50
Nodes (4): getWeekday(), main(), prisma, { PrismaClient }

### Community 138 - "CreateItemDto"
Cohesion: 0.16
Nodes (3): BadgeInput, CreateItemDto, ScheduleInput

### Community 141 - "📊 Resumen de la Auditoría Actual"
Cohesion: 0.25
Nodes (8): Backend, 🛠️ Cambios Propuestos, Frontend, [MODIFY] [order-line-input.dto.ts](file:///c:/Users/I-MAG/Desktop/Proyecto%20de%20Gestion%20Workana/backend/src/sales/dto/order-line-input.dto.ts), [MODIFY] [SaleCreateModal.tsx](file:///c:/Users/I-MAG/Desktop/Proyecto%20de%20Gestion%20Workana/frontend/src/components/sales/SaleCreateModal.tsx), [MODIFY] [sales.service.ts](file:///c:/Users/I-MAG/Desktop/Proyecto%20de%20Gestion%20Workana/backend/src/sales/sales.service.ts), [MODIFY] [SalesChatComposer.tsx](file:///c:/Users/I-MAG/Desktop/Proyecto%20de%20Gestion%20Workana/frontend/src/components/sales/SalesChatComposer.tsx), [NEW] [sales-price-history.spec.ts](file:///c:/Users/I-MAG/Desktop/Proyecto%20de%20Gestion%20Workana/backend/src/sales/sales-price-history.spec.ts)

### Community 153 - "RegisterBusinessDto"
Cohesion: 0.21
Nodes (3): BusinessSlugQueryDto, IsBusinessSlug(), RegisterBusinessDto

### Community 154 - "SimpleTaxCalculateDto"
Cohesion: 0.26
Nodes (3): SimpleTaxCalculateDto, SimpleTaxPayPeriodDto, SimpleTaxUpdatePeriodDto

### Community 155 - "BusinessDetailPage.tsx"
Cohesion: 0.32
Nodes (8): BusinessPage(), BusinessDetail, BusinessDetailPage(), DetailItem(), Props, FactusEntitlementCard(), AdminFactus, saveFactusEntitlement()

### Community 156 - "session.test.cjs"
Cohesion: 0.15
Nodes (9): assert, fs, harness(), load(), input, path, test, ts (+1 more)

### Community 157 - "backend/README.md"
Cohesion: 0.18
Nodes (10): Compile and run the project, Deployment, Description, License, Project setup, Resources, Run tests, Stay in touch (+2 more)

### Community 158 - "Altos"
Cohesion: 0.18
Nodes (11): Altos, H05 — Recálculo y pago pendiente desactualizado, H06 — Reapertura de contabilizadas, H07 — Prima pagada mutable, H08 — Novedades sin efecto, H09 — Días fuera del período, H10 — Pérdida de comisiones/bonos/deducciones al recalcular, H11 — Auxilios (+3 more)

### Community 159 - "proxy-address-security.test.cjs"
Cohesion: 0.11
Nodes (9): @nestjs/core@^11.0.1, authProxyTrust(), RolesGuard, bootstrap(), assert, proxyAddress, test, Diferencias y límites detectados antes de ampliar pruebas (+1 more)

### Community 161 - "backend/eslint.config.mjs"
Cohesion: 0.22
Nodes (8): @eslint/js@^9.18.0, eslint-plugin-prettier@^5.2.2, globals@^16.0.0, typescript-eslint@^8.20.0, @eslint/js, eslint-plugin-prettier, globals, typescript-eslint

### Community 163 - "Casos reproducibles y evidencia de ejecución"
Cohesion: 0.22
Nodes (9): Calidad de pruebas existentes, Casos pendientes para integración aislada futura, Casos reproducibles y evidencia de ejecución, Casos técnicos ejecutados, Oráculo independiente ejecutado, Qué se ejecutó, Reproducción del motor sin BD, Reproducción técnica en memoria (+1 more)

### Community 164 - "Hallazgos priorizados"
Cohesion: 0.22
Nodes (9): Bajo, Controles favorables y límites del dictamen, Críticos, H01 — Exoneraciones, H02 — IBC, H03 — Retención, H04 — Liquidación contractual incompleta, H22 — Históricos y documentación (+1 more)

### Community 165 - "Política de contraseñas nuevas (solicitud del cliente)"
Cohesion: 0.22
Nodes (8): Decisión del cliente, Eliminado, Frontend, Política de contraseñas nuevas (solicitud del cliente), Política vigente (registro y restablecimiento), Pruebas, Riesgos residuales, Sin cambios

### Community 166 - "Etapa 1 — Validación funcional en navegador (30 de octubre de 2026)"
Cohesion: 0.22
Nodes (8): Aprobadas, Entorno aislado, Etapa 1 — Validación funcional en navegador (30 de octubre de 2026), Fallidas, Hallazgos y observaciones (sin corregir; requieren autorización), Limpieza, No ejecutadas, Resultados

### Community 167 - "Etapa 2 — Recuperación y contraseñas"
Cohesion: 0.22
Nodes (8): Activación segura, Archivos de esta etapa, Correo y configuración, Despliegue y rollback propuestos — no ejecutados, Estado y compatibilidad, Etapa 2 — Recuperación y contraseñas, Migración y validación, Política y endpoints

### Community 168 - "Verificación final de Etapa 2"
Cohesion: 0.22
Nodes (8): Archivos de implementación y pruebas, Comprobaciones, Conclusión, Correcciones adicionales realizadas al retomar, Entorno y migración, Fallos ampliados: clasificación y evidencia, Límites pendientes, Verificación final de Etapa 2

### Community 169 - "Plataforma de Gestión Comercial"
Cohesion: 0.22
Nodes (8): Autor, Cómo correrlo, Decisiones de diseño, Estado, Estructura, Plataforma de Gestión Comercial, Qué resuelve, Stack

### Community 171 - "Medios"
Cohesion: 0.25
Nodes (8): H14 — Provisiones y pagos efectivos, H15 — Solidaridad sin devolución, H16 — Jornada, noche y descanso, H17 — Versiones modificables, H18 — Interfaz inconsistente, H19 — PILA ausente, H21 — Redondeos y contabilidad, Medios

### Community 175 - "users.module.ts"
Cohesion: 0.33
Nodes (3): UsersController, UsersModule, Auditoría sin cambios necesarios

### Community 176 - "tsconfig.spec.json"
Cohesion: 0.29
Nodes (6): compilerOptions, types, exclude, extends, include, ./tsconfig.json

### Community 177 - "Plan de correcciones propuesto — sin implementar"
Cohesion: 0.29
Nodes (7): Decisiones jurídicas y de producto que deben quedar documentadas, Diseño recomendado para la futura corrección, Entregables de esta etapa y condición de cierre, Plan de correcciones propuesto — sin implementar, Plan de pruebas posterior, Reparación histórica futura, Secuencia y criterios de aceptación

### Community 178 - "PostgreSQL desechable para validar Etapa 1"
Cohesion: 0.29
Nodes (6): 1. Crear y comprobar aislamiento, 2. Preparar el esquema, sin usar DATABASE_URL habitual, 3. Ejecutar las cinco pruebas, 4. Finalizar el entorno de prueba, PostgreSQL desechable para validar Etapa 1, Si se prefiere PostgreSQL nativo local

### Community 179 - "ColorPickerPopover.tsx"
Cohesion: 0.36
Nodes (6): ColorPickerPopover(), ColorPickerPopoverProps, getColorAt(), getHueRgb(), PRESET_COLORS, rgbToHex()

### Community 180 - "migrate-item-images-to-r2.ts"
Cohesion: 0.29
Nodes (5): @aws-sdk/client-s3@^3.1063.0, sharp@^0.34.5, prisma, @aws-sdk/client-s3, sharp

### Community 182 - "RecoveryMailService"
Cohesion: 0.16
Nodes (8): mailErrorCode(), RecoveryMailService, Auditoría del servicio existente (sin reescritura), Condiciones para staging, Etapa 2: correo de recuperación por SMTP (Brevo Free), Pendiente cuando haya credenciales autorizadas (distinguir tres niveles), Variables (Railway / `.env`; ver `backend/.env.example`), Verificación realizada

### Community 183 - "@nestjs/passport"
Cohesion: 0.40
Nodes (3): @nestjs/passport@^11.0.5, JwtAuthGuard, @nestjs/passport

### Community 185 - "Inventario funcional — Nómina Colombia"
Cohesion: 0.40
Nodes (5): Alcance y nivel de evidencia, Controles técnicos: qué está probado, Inventario funcional — Nómina Colombia, Inventario por concepto, Parámetros y esquema

### Community 186 - "Etapa 2: registro local y presentación de contraseñas"
Cohesion: 0.40
Nodes (4): Diagnóstico y configuración local, Etapa 2: registro local y presentación de contraseñas, Presentación y sesión, Verificación

### Community 187 - "frontend/README.md"
Cohesion: 0.40
Nodes (4): Deploy on Vercel, Getting Started, Learn More, Web Push

### Community 188 - "Etapa 2: identificadores públicos reservados"
Cohesion: 0.29
Nodes (6): Estado y alcance, Etapa 2: identificadores públicos reservados, Futuro despliegue Railway — documentación, no ejecución, Migración y evidencia local, Reproducción segura, Resultados y diagnóstico

### Community 190 - "Matriz normativa y vigencias"
Cohesion: 0.50
Nodes (4): Matriz normativa y vigencias, Registro de fuentes, Reglas contrastadas, Reservas de interpretación concretas

### Community 191 - "Comparación de fórmulas: sistema, cliente y norma"
Cohesion: 0.50
Nodes (4): Comparación de fórmulas: sistema, cliente y norma, Devengos, descuentos y aportes, Errores de la referencia del cliente que no deben implementarse, Prestaciones, liquidaciones y costo

### Community 193 - "parseAccountingDate"
Cohesion: 0.60
Nodes (4): businessDateAtCurrentTime(), CivilDateTime, dateTimeParts(), parseAccountingDate()

### Community 194 - "Etapa 3: dirección pública durante el registro"
Cohesion: 0.33
Nodes (5): Archivos, Base utilizada y límites, Contratos y flujo, Etapa 3: dirección pública durante el registro, Verificación ejecutada

### Community 196 - "BusinessesService"
Cohesion: 0.16
Nodes (4): setup(), technicalConfiguration, adminFactusView(), BusinessesService

### Community 197 - "Etapa 4: cambio único de identificador y redirecciones permanentes"
Cohesion: 0.40
Nodes (4): Datos, Etapa 4: cambio único de identificador y redirecciones permanentes, Integración posterior en la base principal local (no ejecutado), Verificación

## Knowledge Gaps
- **10 isolated node(s):** `EXPENSE`, `COST`, `CASH`, `TRANSFER`, `INCOME` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1437 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **71 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@nestjs/common` connect `common/guards/business-active.guard.ts` to `payroll.service.ts`, `ItemOptionsService`, `class-validator`, `@nestjs/common`, `availability.service.spec.ts`, `simple-tax.service.ts`, `PushNotificationsService`, `app.module.ts`, `BusinessesService`, `sales.service.ts`, `RegisterBusinessDto`, `SettingsService`, `RecipesService`, `proxy-address-security.test.cjs`, `web-push.transport.ts`, `accounting.service.ts`, `devDependencies`, `MovementsService`, `users.module.ts`, `businesses.service.ts`, `public.service.ts`, `@nestjs/passport`, `RecoveryMailService`, `fiscal-document.service.ts`, `payroll.service.spec.ts`, `dependencies`, `BusinessesService`, `ProductsController`, `auth.service.ts`, `availability.service.ts`, `fiscal-document.service.spec.ts`, `password-recovery.e2e-spec.ts`, `push-notifications.controller.ts`, `AppService`, `sales-price-history.spec.ts`?**
  _High betweenness centrality (0.195) - this node is a cross-community bridge._
- **What connects `EXPENSE`, `COST`, `CASH` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PayrollService` be split into smaller, more focused modules?**
  _Cohesion score 0.0527868343424934 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `inventory.ts`, `cn`, `rut-impuestos/page.tsx`, `mi-negocio/page.tsx`, `venta/page.tsx`, `usePushNotifications.ts`, `PublicStoreClient.tsx`, `getSessionContext`, `perfil/page.tsx`, `BusinessDetailPage.tsx`, `react`, `factusEntitlement.test.cjs`, `ManualPaidOutflowSheet.tsx`, `SaleCard.tsx`, `AppHeader`, `lucide-react`, `AccountingChatComposer.tsx`, `moduleActivity.ts`, `nomina/page.tsx`, `regimen-simple/page.tsx`, `ReservationSlotPicker.tsx`, `ColorPickerPopover.tsx`, `tienda/page.tsx`, `contabilidad/page.tsx`, `HomeAgenda.tsx`, `SaleCreateModal.tsx`, `SaleReceiptModal.tsx`, `businessProfile.test.cjs`, `SimpleProductDetailSheet.tsx`, `types/sales.ts`, `reserva/[id]/page.tsx`, `frontend/package.json`, `inventario/page.tsx`, `cn`, `movements-ui.ts`, `movimientos/page.tsx`, `LoginForm.tsx`, `RecoveryForms.test.cjs`, `SessionBoundary.test.cjs`, `DayPickerCalendar.tsx`, `WhatsappComposer.tsx`, `app/layout.tsx`, `RegisterForm.tsx`, `SaleTaxPanel.tsx`?**
  _High betweenness centrality (0.183) - this node is a cross-community bridge._
- **Should `payroll.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.043922369765066395 - nodes in this community are weakly interconnected._
- **Why does `@prisma/client` connect `@nestjs/common` to `payroll.service.ts`, `ItemOptionsService`, `class-validator`, `simple-tax.service.ts`, `temp-logic-test.js`, `common/guards/business-active.guard.ts`, `BusinessesService`, `sales.service.ts`, `SettingsService`, `RecipesService`, `web-push.transport.ts`, `accounting.service.ts`, `devDependencies`, `CreateEmployeeContractDto`, `migrate-item-images-to-r2.ts`, `businesses.service.ts`, `public.service.ts`, `fiscal-document.service.ts`, `temp-db-query.js`, `payroll.service.spec.ts`, `dependencies`, `seed.ts`, `accounting.service.spec.ts`, `IngredientsService`, `inventory.service.ts`, `auth.service.ts`, `availability.service.ts`, `password-recovery.e2e-spec.ts`, `CreatePayrollEventDto`, `CreatePayrollAdjustmentDto`, `RegisterPushSubscriptionDto`, `sales-price-history.spec.ts`, `UpdateBusinessConfigDto`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Should `inventory.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.061088485746019994 - nodes in this community are weakly interconnected._