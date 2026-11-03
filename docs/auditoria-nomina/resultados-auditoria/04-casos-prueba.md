# Casos reproducibles y evidencia de ejecución

## Qué se ejecutó

1. Desde `backend`: `node node_modules/jest/bin/jest.js src/payroll/payroll.service.spec.ts --runInBand --no-cache --silent`.
2. Resultado: **1 suite, 113 pruebas aprobadas, 0 fallidas, 8,189 s**, salida 0. Usa mocks; no conecta PostgreSQL. No equivale a 113 verificaciones normativas independientes.
3. Harness de esta página: ejecutó código real de `previewEmployeePayroll`, selección legal y cálculo anual con delegados de persistencia en memoria. Casos T01–T22, con variantes. No se creó PrismaClient ni aplicación Nest; no hubo escritura de BD. Tasas horarias del fixture del repositorio son **entrada del sistema**, no oráculo.
4. Oráculo aritmético independiente con `System.Decimal` de PowerShell y fórmulas de fuentes oficiales. No llama al servicio. Python no estaba instalado; se usó PowerShell sin instalar nada.
5. Tres escenarios técnicos en memoria: reapertura POSTED, pago pendiente desactualizado y prima PAID→PENDING.

No se ejecutaron `backend/test/payroll-advanced-audits.e2e-spec.ts` ni `payroll-payments.e2e-spec.ts`: instancian PrismaClient/AppModule y crean datos. Tampoco el script de conciliación contable contra BD. Integración, concurrencia y estado real de migraciones siguen pendientes.

**Hipótesis base:** octubre 2026, empleado particular ordinario no integral, salario fijo, 30 días, riesgoI, sin otras deducciones, empleador elegible exento salvo variación explícita. SMMLV1.750.905, auxilio 249.095. Importes de referencia antes de PILA y retención cuando se indica; un cero de retención no valida impuesto. Fechas futuras de casos preexistentes solo prueban algoritmos; no proyectan legalidad futura.

## Resultados monetarios

| Caso / entradas que cambian | Resultado real en memoria | Oráculo independiente / expectativa | Evaluación |
|---|---|---|---|
| T01 mínimo completo, exento | Bruto 2.000.000; salud 70.036; pensión 70.036; neto 1.859.928; costo 2.715.489 | Neto R(2M−1.750.905×8%)=1.859.928. Provisión exacta cesantía/prima 166.667 cada una, vacaciones 72.954, interés proyectado 20.000; costo 2.715.572 | Neto básico coincide; costo −83 por aproximaciones. No confundir provisión 20.000 con interés exigible de un solo mes 1.666,67 |
| T02 S4M, exoneración desactivada | Salud empleador 340.000; SENA 0; ICBF 0; costo 5.874.064 | Para empleador NO elegible: SENA 80.000, ICBF 120.000. Más 200.000 solo por aportes omitidos | H01 demostrado |
| T03 S4M + NS4M | IBC4M; salud/pensión 160.000 cada una; neto 7.680.000 antes retención | Exceso=4M−40%×8M=800.000; IBC4,8M; salud/pensión 192.000; neto 7.616.000 antes retención | Neto +64.000; faltan también aportes patronales derivados. No aplicar exceso a prestaciones por automatismo |
| T04 S50M | IBC50M; salud 2M; pensión 2M; FSP1M | Tope 25M=43.772.625; salud/pensión 1.750.905 cada una; FSP R(875.452,50)=875.453 | Descuento salud+pensión excede 498.190; FSP124.547 por redondeo. No se cuantifica neto final porque también falta retención |
| T05 S2M+C2M | IBC4M correcto; auxilio 249.095; neto 3.929.095 | Salario mensual devengado 4M supera 2M mínimos=3.501.810: auxilio 0, neto 3.680.000 antes retención | +249.095 neto y bases de prestaciones infladas |
| T06 ingreso 16oct / T07 retiro 15oct, contrato aún activo | d 15; salario 875.453; auxilio 124.548; neto 929.964 | Valores exactos 875.452,50 y124.547,50; bruto 1M; neto 929.963,80→929.964 | Proporción coincide. Con contrato inactivado por terminación, búsqueda del motor lo excluye: no confundir este supuesto con retiro ya liquidado |
| T08 remoto elegible, mínimo | Transporte 0; conectividad 249.095 | Uno sustituye al otro; total 249.095 si modalidad y elegibilidad acreditadas | Coincide bajo supuesto; no valida “isRemote” para todos los regímenes |
| T09 persona natural con 1 empleado, no declarante, banderas exentas | Salud/SENA/ICBF 0 | Sin exoneración por emplear menos de 2:340.000+80.000+120.000=540.000 | H01 demostrado; campos se suministran pero predicado los ignora |
| T10 riesgosI–V sobre 4M | 20.880;41.760;97.440;174.000;278.400 | 4M×0,00522/0,01044/0,02436/0,0435/0,0696 | Coincide cada tarifa inicial; selección de clase no certificada |
| T11 S=4SMMLV=7.003.620 | FSP70.036 | R(7.003.620×1%)=70.036 | Umbral 4 coincide bajo régimen N04/N16 |
| T12 Q1/Q2 mínimo | Neto 929.964/929.963; auxilio 124.548/124.547; salario 875.453 ambas | Auxilios suman 249.095; netos suman 1.859.927, mensual 1.859.928; salarios redondeados suman 1.750.906 | Diferencias de$1: falta conciliación de todos los conceptos, no solo auxilio |
| T13 extras diurnas 1h14 de julio+1h15 de julio | Total 20.370 | R(1.750.905/220×1,25+1.750.905/210×1,25)=20.370 | Vigencias diarias correctas en eventos |
| T14 ordinaria nocturna 1h | Adicional 2.918 | R(S/210×0,35)=2.918 | Correcto como adicional; vacaciones ignoran este concepto |
| T14 extra diurna 1h |10.422|R(S/210×1,25)=10.422|Correcto|
| T14 extra nocturna 1h |14.591|R(S/210×1,75)=14.591|Correcto|
| T14 descanso ordinario 1h |7.504|R(S/210×0,90)=7.504 si base trabajada ya pagada|Aritmética coincide; pago integral requiere validar compensatorio/base |
| T14 extra descanso diurna 1h |17.926|R(S/210×2,15)=17.926|Correcto factor; cliente 26.264 |
| T14 descanso nocturna 1h |10.422|R(S/210×1,25)=10.422 como adicional|Condicionado como descanso ordinario |
| T14 extra descanso nocturna 1h |22.095|R(S/210×2,65)=22.095|Correcto factor; cliente 33.351 |
| T15 períodojunio 2026 | Rechazo, mensaje dice “anteriores a agosto” | No ejecutar con parámetros actuales. El código admite julio; junio bloqueado | Histórico no disponible; mensaje/documento desactualizados |
| T16 overtimeHours agregado | Rechazo “novedad fechada” | Ruta exige evento por día | Backend consistente; formularios legacy incompatibles H18 |
| T17 Q1 overrideworkedDays 30 | Acepta salario 1.750.905/neto 1.859.928 | Rechazar exceso sobre 15 días del período | H09; duplica salario de la cuota |
| T18 evento licencia no remunerada 10d | Resultado idénticoT01; d 30 | Debe consumir licencia o rechazar como no soportada; salario por 20d=1.167.270, auxilio proporcional si procede 166.063,33 | H08: ningún efecto. No se formula neto legal completo sin reglas específicas de aportes de suspensión |
| T19 corte 1 de enero de –30jun, mínimo | d 180; cesantía 1M; interés 60.000; prima 1M; vacaciones 437.726 | B×180/360=1M; 1M×12%×180/360=60.000; S×180/720=437.726,25 | Fórmulas simples correctas. Referencia cliente interés 120.000 sería incorrecta |
| T20 inicio 1 de enero de 2025, retiro 30 de octubre de 2026, S4M, sin pagos de vacaciones | d 300; vacaciones 1.666.667; cesantías 3.333.333; intereses 333.333; prima 3.333.333 | Vacaciones por 660d:4M×660/720=3.666.666,67; falta 2025:$2M | H04. Para cesantías/prima anteriores debe conciliar pagos/fondos; no presumir que todo año anterior sigue adeudado |
| T21 S4M+C15M | IBC19M; salud patronal/SENA/ICBF 0 | Devengo 19M>10M mínimos 17.509.050;8,5%+2%+3%=2.565.000 | H01: omite 2.565.000 |
| T22 S=2SMMLV exactos | Transporte 249.095 | Transporte “hasta 2” incluye igualdad | Sistema correcto en este límite; cliente S3 incorrecto |
| T23 retención: base YA DEPURADA100UVT | Servicio siempre 0 (S:3821); no acepta base depurada | (100−95)×19%×52.374=49.755,30 | Oráculo aislado; no afirmar que el servicio calculó esa depuración. H03 |
| T24 prima semestral ya pagada 1M, casoT19 | Código resta pagos PRIMA PAID por semestre | Prima pendiente 0, otros conceptos según saldo | Inspección y unitarias existentes; no escenario adicional ejecutado |
| T25 vacaciones ya disfrutadas/pagadas | Código vacationPaid=0 | Descontar derechos ya satisfechos con soporte y no confundir pago con días disfrutados | Inspección; prueba integral pendiente |
| T26 FSP Q1 retenido 40.000, obligación mensualfinal 0 | Unitarias existentes validan Q2=0; warning NO_REFUND | Saldo a favor 40.000, debe devolverse/compensarse con trazabilidad | H15; ejecución de suite existente, no PILA real |

## Casos técnicos ejecutados

| ID | Acción sobre dobles en memoria | Resultado | Resultado esperado |
|---|---|---|---|
| TT01 | updatePayrollPeriodStatus: POSTED→OPEN | Devuelve OPEN | Rechazo o procedimiento de reversión contable separado; CLOSED sí se bloquea |
| TT02 | ensurePayrollRunPayments con pagoPENDING1000 y nuevo neto 2000 | Devuelve pago anterior 1000 | Sincronizar obligación pendiente con nuevo neto o bloquear recálculo |
| TT03 | createContractBenefitPayment prima existente PAID100, petición PENDING200 | EstadoPENDING, monto 200, paidAtnull | No reescribir pago consumado; reversión explícita conciliada |

### Casos pendientes para integración aislada futura

No ejecutarlos contra producción. Son criterios de aceptación, no resultados obtenidos:

- Dos negociosA/B: cada endpoint con identificador del otro; en especial periodId/payrollRunId/settlementId de pago de prestación. Esperado 404/403 y ninguna relación cruzada.
- Reintentar y concurrir dos lotes con misma clave/mismo payload y clave/distinto payload; máximo una salida contable. Probar rutas directas y prestaciones con NULL en año/semestre.
- Calcular con comisión 100.000, recalcular lote completo sin DTO; preservar variable. LecturaS:4354 pasa{} y S:3778 convierte ausencia en 0.
- Crear pago directo con paidAt sobre OPEN/CLOSED: debe impedirse. El servicioS:4492 no comprueba estado ni crea asiento.
- Recalcular antes/después de pago; POSTED→OPEN→recálculo; modificación de contrato y configuración con historia.
- Fechas 31 de enero, febrero 28/29, ingreso/retiro mismo día, contrato solo Q2, dos contratos en un mes, díaUTC distinto de Bogotá y cero días. El harness no valida semántica del mock de búsqueda contractual en estos extremos.
- Turno 18:00–20:00 antes/después 25 de diciembre de 2025; descanso distinto del domingo; extras 2h/día y12h/semana, excepciones legales; importeoverride 0. Debe clasificar o señalar restricciones, no certificar a partir de cantidad sin horario.
- Aportes con vacaciones/incapacidad/suspensión, salario integral, pensionados, aprendices, múltiples empleadores, mínimo proporcional y topes por subsistema.
- Históricos 2023–2025: aplicar 220/230/235/240 según fechas y jornada; recargo 75/80; noche 21/19. Hoy la ruta periódica bloquea esos períodos; no hay resultado numérico del sistema para compararlos.
- Verificar parámetros efectivos desplegados, integridad y exclusión GiST, índice parcial de rol contable, saldos pagados y aportes PILA.
- Capturar comparación con calculadora MinTrabajo cuando sea accesible; hoy **sin resultado oficial**.

## Reproducción del motor sin BD

Desde `backend`, pegar el bloque JavaScript siguiente dentro de un here-string de PowerShell y ejecutarlo así (no guarda archivo):

```powershell
@'
# Sustituir esta línea por el bloque JavaScript completo siguiente.
'@ | node -r ts-node/register/transpile-only
```

Los mocks suministran únicamente las entradas declaradas; no simulan restricciones SQL, HTTP, concurrencia ni la selección completa de contratos. El harness usa el preview; las fórmulas persistidas fueron cotejadas por lecturaS:3751–3932 y la suite unitaria, no mediante ejecución contra BD.

```javascript
const fs = require('fs');
const {parse} = require('csv-parse/sync');
const {Prisma} = require('@prisma/client');
const {PayrollService} = require('./src/payroll/payroll.service');
const {payrollRateFixtureData} = require('./test/payroll-legal-fixtures');
const D = Prisma.Decimal;
const csv = name => parse(fs.readFileSync('prisma/seed-data/'+name,'utf8'),{columns:true,skip_empty_lines:true,trim:true});
const globals = csv('payroll_global_parameters.csv').map(row => {
 const p={}; for(const [key,value] of Object.entries(row)) {
 const k=key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
 p[k]=value!=='' && !isNaN(Number(value))?new D(value):value;
 }
 p.id=p.legalCode;p.effectiveFrom=new Date(row.effective_from);p.effectiveTo=row.effective_to?new Date(row.effective_to):null;
 p.year=+row.year;p.version=+row.version;p.maxWorkedDaysMonth=+row.max_worked_days_month;return p;
});
const brackets=csv('solidaridad.csv').map(r=>({fromSmmlv:r.limite_inferior_smmlv,toSmmlv:r.limite_superior_smmlv||null,rate:r.porcentaje_decimal}));
async function scenario(id, input={}) {
 const employee={id:'e',businessId:'b',firstName:'Test',lastName:'Audit'};
 const contract={id:'c',employeeId:'e',businessId:'b',employee,salaryMonthly:new D(input.salary||1750905),startDate:new Date(input.start||'2026-01-01'),endDate:input.end?new Date(input.end):null,isActive:true,isRemote:!!input.remote,applyLaw1819:input.exempt!==false,paymentCycle:input.cycle||'MONTHLY',arlRiskClass:{rate:new D(input.arl||'.00522')}};
 const period={id:'p',businessId:'b',year:2026,month:input.month||10,paymentCycle:contract.paymentCycle,installmentNumber:input.half||1,status:'OPEN'};
 const business={applyLaw1819:input.exempt!==false,exemptEmployerHealthLaw1819:true,isIncomeTaxFiler:input.filer!==false,legalPersonType:input.person||'LEGAL_ENTITY',employeeCountForExemption:input.count||2,applySolidarityFund:true};
 const db={
 employee:{findFirst:async()=>employee},
 employeeContract:{findFirst:async()=>contract,count:async()=>business.employeeCountForExemption},
 payrollBusinessParameter:{findUnique:async()=>business},
 payrollGlobalParameter:{findFirst:async({where})=>globals.find(p=>p.effectiveFrom<=where.effectiveFrom.lte&&(!p.effectiveTo||p.effectiveTo>where.effectiveFrom.lte)),findMany:async()=>globals},
 payrollOvertimeRate:{findMany:async({where})=>payrollRateFixtureData(where.globalParameterId,!where.globalParameterId.endsWith('V1'))},
 payrollSolidarityBracket:{findMany:async()=>brackets},
 payrollEvent:{findMany:async({where})=>(input.events||[]).filter(e=>e.type===where.type).map((e,i)=>({...e,id:'ev'+i,startDate:new Date(e.startDate),quantity:new D(e.quantity),unit:'HOURS'}))},
 payrollBenefitPayment:{findMany:async()=>input.paidPrima||[]},
 payrollRun:{findFirst:async()=>input.q1||null}
 };
 const svc=new PayrollService(db);
 try {
 const r=input.settlement?await svc.calculateAnnualSettlement('b',contract,new Date(input.end),db,{salaryConceptsAmount:input.salaryConcepts||0}):await svc.previewEmployeePayroll('b','p','e',input.dto||{},period);
 const keys=input.settlement?['totalWorkedDays','severance','severanceInterest','serviceBonus','vacation','totalPayable']:['workedDays','salaryEarned','transportAllowance','connectivityAllowance','overtimeAmount','ibcAmount','employeeHealth','employeePension','solidarityFund','withholdingTax','netPay','employerHealth','employerPension','employerArl','sena','icbf','severance','severanceInterest','serviceBonus','vacation','realEmployerCost'];
 console.log(JSON.stringify({id,...Object.fromEntries(keys.map(k=>[k,r[k]?.toString()])),...(input.settlement?{keys:Object.keys(r)}:{})}));
 }catch(e){console.log(JSON.stringify({id,error:e.message}));}
}
(async()=>{
await scenario('T01');
await scenario('T02',{salary:4000000,exempt:false});
await scenario('T03',{salary:4000000,dto:{nonSalaryBonus:4000000}});
await scenario('T04',{salary:50000000});
await scenario('T05',{salary:2000000,dto:{commissions:2000000}});
await scenario('T06',{start:'2026-10-16'});
await scenario('T07',{end:'2026-10-15'});
await scenario('T08',{remote:true});
await scenario('T09',{salary:4000000,person:'NATURAL_PERSON',count:1,filer:false});
for(const [i,arl] of ['.00522','.01044','.02436','.0435','.0696'].entries())await scenario('T10-'+(i+1),{salary:4000000,arl});
await scenario('T11',{salary:7003620});
await scenario('T12-Q1',{cycle:'BIWEEKLY'});
await scenario('T12-Q2',{cycle:'BIWEEKLY',half:2,q1:{ibcAmount:new D('875453'),solidarityFund:new D(0)}});
await scenario('T13',{month:7,events:[{type:'OVERTIME',startDate:'2026-07-14',quantity:1,overtimeCode:'HORA_EXTRA_DIURNA'},{type:'OVERTIME',startDate:'2026-07-15',quantity:1,overtimeCode:'HORA_EXTRA_DIURNA'}]});
for(const code of payrollRateFixtureData('x',true).map(r=>r.code)) await scenario('T14-'+code,{events:[{type:'OVERTIME',startDate:'2026-10-18',quantity:1,overtimeCode:code}]});
await scenario('T15',{month:6});
await scenario('T16',{dto:{overtimeHours:[{type:'HORA_EXTRA_DIURNA',quantity:1}]}});
await scenario('T17',{cycle:'BIWEEKLY',dto:{workedDays:30}});
await scenario('T18',{events:[{type:'UNPAID_LEAVE',startDate:'2026-10-01',quantity:10}]});
await scenario('T19',{settlement:true,end:'2026-06-30'});
await scenario('T20',{settlement:true,start:'2025-01-01',end:'2026-10-30',salary:4000000});
await scenario('T21',{salary:4000000,dto:{commissions:15000000}});
await scenario('T22',{salary:3501810});
})().catch(e=>{console.error(e);process.exitCode=1});

```

## Oráculo independiente ejecutado

PowerShell, desde cualquier carpeta. No usa NestJS, Prisma, CSV del sistema ni su servicio de cálculo; los parámetros aquí son valores explícitos contrastados en N12–N14. Las hipótesis de exoneración y provisión anual se declaran arriba.

```powershell
function RoundAuditPeso([decimal]$v) { [decimal]::Round($v,0,[MidpointRounding]::AwayFromZero) }
[decimal]$s=1750905
[decimal]$a=249095
[decimal]$b=$s+$a
[pscustomobject]@{
net=(RoundAuditPeso ($b-$s*0.08d))
ces=(RoundAuditPeso ($b/12))
prima=(RoundAuditPeso ($b/12))
vac=(RoundAuditPeso ($s/24))
interestProvision=(RoundAuditPeso ($b/100))
cost=(RoundAuditPeso ($b+$s*0.16522d+$b/6+$b/100+$s/24))
cap=($s*25)
capHealth=(RoundAuditPeso ($s*25*0.04d))
capFsp=(RoundAuditPeso ($s*25*0.02d))
julySplit=(RoundAuditPeso ($s/220*1.25d+$s/210*1.25d))
retention100uvt=(5*0.19d*52374)
vacNight=(RoundAuditPeso (($s+$s/210*0.35d)/24))
} | ConvertTo-Json
foreach($f in @(0.35d,1.25d,1.75d,0.9d,2.15d,1.25d,2.65d)) { '{0}: {1}' -f $f,(RoundAuditPeso ($s/210*$f)) }

```

Salida verificada: net 1859928; ces 166667; prima 166667; vac 72954; interestProvision 20000; cost 2715572; cap 43772625; capHealth 1750905; capFsp 875453; julySplit 20370; retention 100uvt 49755,30; vacNight 73076. Factores:2918/10422/14591/7504/17926/10422/22095.

## Reproducción técnica en memoria

Misma invocación Node/transpile-only. Las llamadas privadas se usan solo para aislar los controles observados; no son API pública.

```javascript
const {PayrollService}=require('./src/payroll/payroll.service');
const {Prisma}=require('@prisma/client');
(async()=>{
 const period={id:'p',businessId:'b',status:'POSTED'};
 const db={payrollPeriod:{
  findFirst:async()=>period,
  update:async({data})=>({...period,...data})
 }};
 db.$transaction=async fn=>fn(db);
 const s=new PayrollService(db);
 console.log('POSTED->OPEN',await s.updatePayrollPeriodStatus('b','p',{status:'OPEN'}));
 const payment={id:'old',amount:new Prisma.Decimal(1000),status:'PENDING'};
 console.log('pending after net changes to 2000',
  await s.ensurePayrollRunPayments({id:'r',netPay:new Prisma.Decimal(2000)},
   {payrollPayment:{findMany:async()=>[payment]}}));
 s.getContractForSettlement=async()=>({
  employeeId:'e',id:'c',employee:{firstName:'A',lastName:'B'}
 });
 const old={id:'bp',status:'PAID',amount:100};
 const tx={payrollBenefitPayment:{
  findFirst:async()=>old, update:async({data})=>({...old,...data})
 }};
 db.$transaction=async fn=>fn(tx);
 console.log('benefit PAID->PENDING',await s.createContractBenefitPayment('b','c',{
  type:'PRIMA',year:2026,semester:1,amount:200,status:'PENDING'
 }));
})().catch(console.error);
```

## Calidad de pruebas existentes

`payroll.service.spec.ts:1019,1224,1397` espera exonerar SENA/ICBF por umbral sin elegibilidad. Las pruebas:958 y1465 validan tasas truncadas/provisión; :2934 y2983 aceptan liquidar solo año actual; :637 acepta excesoFSP sin devolución. Deben conservarse como evidencia de comportamiento, pero **no usarse como oráculo normativo**. Algunas pruebas leen texto de frontend o migraciones; que pasen no acredita interfaz operativa ni restricción SQL desplegada.

