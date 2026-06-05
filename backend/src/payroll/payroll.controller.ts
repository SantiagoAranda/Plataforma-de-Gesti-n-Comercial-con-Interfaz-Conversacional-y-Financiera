import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PayrollService } from './payroll.service';
import { UpdateGlobalConfigDto } from './dto/update-global-config.dto';
import { UpdateBusinessConfigDto } from './dto/update-business-config.dto';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import {
  CreateEmployeeContractDto,
  UpdateEmployeeContractDto,
} from './dto/contract.dto';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { UpdatePayrollPeriodStatusDto } from './dto/update-payroll-period-status.dto';
import { CreatePayrollAdjustmentDto } from './dto/create-payroll-adjustment.dto';
import { CalculatePayrollDto } from './dto/calculate-payroll.dto';
import { CreateComplementaryPayrollRunDto } from './dto/create-complementary-payroll-run.dto';
import { CreateContractSettlementDto } from './dto/create-contract-settlement.dto';
import { SimulateContractSettlementDto } from './dto/simulate-contract-settlement.dto';
import { QueryContractSettlementsDto } from './dto/query-contract-settlements.dto';
import {
  CreatePayrollBenefitPaymentDto,
  CreatePayrollPaymentDto,
  UpdatePayrollPaymentStatusDto,
} from './dto/payroll-payment.dto';

@UseGuards(JwtAuthGuard, BusinessActiveGuard, RolesGuard)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  private getBusinessId(req: any) {
    const businessId = req.user?.businessId;
    if (!businessId) {
      throw new ForbiddenException('Business user must have businessId');
    }
    return businessId;
  }

  @Get('config/global/:year')
  @Roles('ADMIN')
  getGlobalConfig(@Param('year') year: string) {
    return this.payrollService.getGlobalConfig(year);
  }

  @Patch('config/global/:year')
  @Roles('ADMIN')
  updateGlobalConfig(
    @Req() req: any,
    @Param('year') year: string,
    @Body() dto: UpdateGlobalConfigDto,
  ) {
    return this.payrollService.updateGlobalConfig(year, req.user?.userId, dto);
  }

  @Get('config/business/:year')
  @Roles('BUSINESS')
  getBusinessConfig(@Req() req: any, @Param('year') year: string) {
    return this.payrollService.getBusinessConfig(
      this.getBusinessId(req),
      year,
    );
  }

  @Patch('config/business/:year')
  @Roles('BUSINESS')
  updateBusinessConfig(
    @Req() req: any,
    @Param('year') year: string,
    @Body() dto: UpdateBusinessConfigDto,
  ) {
    return this.payrollService.updateBusinessConfig(
      this.getBusinessId(req),
      year,
      dto,
    );
  }

  @Get('ciiu')
  @Roles('ADMIN', 'BUSINESS')
  listCiiu(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.payrollService.listCiiu(q, limit);
  }

  @Get('arl-risks')
  @Roles('ADMIN', 'BUSINESS')
  listArlRisks() {
    return this.payrollService.listArlRisks();
  }

  @Get('overtime-rates/:year')
  @Roles('ADMIN', 'BUSINESS')
  listOvertimeRates(@Param('year') year: string) {
    return this.payrollService.listOvertimeRates(year);
  }

  @Get('solidarity-brackets/:year')
  @Roles('ADMIN', 'BUSINESS')
  listSolidarityBrackets(@Param('year') year: string) {
    return this.payrollService.listSolidarityBrackets(year);
  }

  @Post('employees')
  @Roles('BUSINESS')
  createEmployee(@Req() req: any, @Body() dto: CreateEmployeeDto) {
    return this.payrollService.createEmployee(this.getBusinessId(req), dto);
  }

  @Get('employees')
  @Roles('BUSINESS')
  listEmployees(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.payrollService.listEmployees(
      this.getBusinessId(req),
      q,
      isActive,
    );
  }

  @Get('employees/:id')
  @Roles('BUSINESS')
  getEmployee(@Req() req: any, @Param('id') id: string) {
    return this.payrollService.getEmployee(this.getBusinessId(req), id);
  }

  @Patch('employees/:id')
  @Roles('BUSINESS')
  updateEmployee(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.payrollService.updateEmployee(
      this.getBusinessId(req),
      id,
      dto,
    );
  }

  @Delete('employees/:id')
  @Roles('BUSINESS')
  deleteEmployee(@Req() req: any, @Param('id') id: string) {
    return this.payrollService.deleteEmployee(this.getBusinessId(req), id);
  }

  @Delete('employees/:id/hard')
  @Roles('BUSINESS')
  hardDeleteEmployee(@Req() req: any, @Param('id') id: string) {
    return this.payrollService.hardDeleteEmployee(this.getBusinessId(req), id);
  }

  @Post('employees/:employeeId/contracts')
  @Roles('BUSINESS')
  createContract(
    @Req() req: any,
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateEmployeeContractDto,
  ) {
    return this.payrollService.createContract(
      this.getBusinessId(req),
      employeeId,
      dto,
    );
  }

  @Get('employees/:employeeId/contracts')
  @Roles('BUSINESS')
  listContracts(@Req() req: any, @Param('employeeId') employeeId: string) {
    return this.payrollService.listContracts(
      this.getBusinessId(req),
      employeeId,
    );
  }

  @Get('contracts/:contractId')
  @Roles('BUSINESS')
  getContract(@Req() req: any, @Param('contractId') contractId: string) {
    return this.payrollService.getContract(
      this.getBusinessId(req),
      contractId,
    );
  }

  @Patch('contracts/:contractId')
  @Roles('BUSINESS')
  updateContract(
    @Req() req: any,
    @Param('contractId') contractId: string,
    @Body() dto: UpdateEmployeeContractDto,
  ) {
    return this.payrollService.updateContract(
      this.getBusinessId(req),
      contractId,
      dto,
    );
  }

  @Delete('contracts/:contractId')
  @Roles('BUSINESS')
  deleteContract(@Req() req: any, @Param('contractId') contractId: string) {
    return this.payrollService.deleteContract(
      this.getBusinessId(req),
      contractId,
    );
  }

  @Post('contracts/:contractId/settlements/simulate')
  @Roles('BUSINESS')
  simulateContractSettlement(
    @Req() req: any,
    @Param('contractId') contractId: string,
    @Body() dto: SimulateContractSettlementDto,
  ) {
    return this.payrollService.simulateContractSettlement(
      this.getBusinessId(req),
      contractId,
      dto,
    );
  }

  @Get('contracts/:contractId/benefit-payments')
  @Roles('BUSINESS')
  listContractBenefitPayments(
    @Req() req: any,
    @Param('contractId') contractId: string,
  ) {
    return this.payrollService.listContractBenefitPayments(
      this.getBusinessId(req),
      contractId,
    );
  }

  @Post('contracts/:contractId/benefit-payments')
  @Roles('BUSINESS')
  createContractBenefitPayment(
    @Req() req: any,
    @Param('contractId') contractId: string,
    @Body() dto: CreatePayrollBenefitPaymentDto,
  ) {
    return this.payrollService.createContractBenefitPayment(
      this.getBusinessId(req),
      contractId,
      dto,
    );
  }

  @Post('contracts/:contractId/settlements')
  @Roles('BUSINESS')
  createContractSettlement(
    @Req() req: any,
    @Param('contractId') contractId: string,
    @Body() dto: CreateContractSettlementDto,
  ) {
    return this.payrollService.createContractSettlement(
      this.getBusinessId(req),
      contractId,
      dto,
    );
  }

  @Get('settlements')
  @Roles('BUSINESS')
  listContractSettlements(
    @Req() req: any,
    @Query() query: QueryContractSettlementsDto,
  ) {
    return this.payrollService.listContractSettlements(
      this.getBusinessId(req),
      query,
    );
  }

  @Get('settlements/:id')
  @Roles('BUSINESS')
  getContractSettlement(@Req() req: any, @Param('id') id: string) {
    return this.payrollService.getContractSettlement(
      this.getBusinessId(req),
      id,
    );
  }

  @Post('settlements/:id/post')
  @Roles('BUSINESS')
  postContractSettlement(@Req() req: any, @Param('id') id: string) {
    return this.payrollService.postContractSettlement(
      this.getBusinessId(req),
      id,
    );
  }

  @Post('periods')
  @Roles('BUSINESS')
  createPayrollPeriod(@Req() req: any, @Body() dto: CreatePayrollPeriodDto) {
    return this.payrollService.createPayrollPeriod(this.getBusinessId(req), dto);
  }

  @Get('periods')
  @Roles('BUSINESS')
  listPayrollPeriods(
    @Req() req: any,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('status') status?: string,
  ) {
    return this.payrollService.listPayrollPeriods(this.getBusinessId(req), {
      year,
      month,
      status,
    });
  }

  @Get('periods/:id')
  @Roles('BUSINESS')
  getPayrollPeriod(@Req() req: any, @Param('id') id: string) {
    return this.payrollService.getPayrollPeriod(this.getBusinessId(req), id);
  }

  @Patch('periods/:id/status')
  @Roles('BUSINESS')
  updatePayrollPeriodStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePayrollPeriodStatusDto,
  ) {
    return this.payrollService.updatePayrollPeriodStatus(
      this.getBusinessId(req),
      id,
      dto,
    );
  }

  @Post('runs/:runId/adjustments')
  @Roles('BUSINESS')
  createPayrollAdjustment(
    @Req() req: any,
    @Param('runId') runId: string,
    @Body() dto: CreatePayrollAdjustmentDto,
  ) {
    return this.payrollService.createPayrollAdjustment(
      this.getBusinessId(req),
      runId,
      dto,
    );
  }

  @Delete('adjustments/:id')
  @Roles('BUSINESS')
  deletePayrollAdjustment(@Req() req: any, @Param('id') id: string) {
    return this.payrollService.deletePayrollAdjustment(
      this.getBusinessId(req),
      id,
    );
  }

  @Post('periods/:periodId/calculate/:employeeId')
  @Roles('BUSINESS')
  calculateEmployeePayroll(
    @Req() req: any,
    @Param('periodId') periodId: string,
    @Param('employeeId') employeeId: string,
    @Body() dto: CalculatePayrollDto,
  ) {
    return this.payrollService.calculateEmployeePayroll(
      this.getBusinessId(req),
      periodId,
      employeeId,
      dto,
    );
  }

  @Post('periods/:periodId/preview/:employeeId')
  @Roles('BUSINESS')
  previewEmployeePayroll(
    @Req() req: any,
    @Param('periodId') periodId: string,
    @Param('employeeId') employeeId: string,
    @Body() dto: CalculatePayrollDto,
  ) {
    return this.payrollService.previewEmployeePayroll(
      this.getBusinessId(req),
      periodId,
      employeeId,
      dto,
    );
  }

  @Post('periods/:periodId/calculate')
  @Roles('BUSINESS')
  calculatePeriodPayroll(@Req() req: any, @Param('periodId') periodId: string) {
    return this.payrollService.calculatePeriodPayroll(
      this.getBusinessId(req),
      periodId,
    );
  }

  @Post('periods/:periodId/runs')
  @Roles('BUSINESS')
  liquidatePeriodPayroll(@Req() req: any, @Param('periodId') periodId: string) {
    return this.payrollService.liquidatePeriodPayroll(
      this.getBusinessId(req),
      periodId,
    );
  }

  @Post('periods/:periodId/runs/complementary/:employeeId')
  @Roles('BUSINESS')
  createComplementaryPayrollRun(
    @Req() req: any,
    @Param('periodId') periodId: string,
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateComplementaryPayrollRunDto,
  ) {
    return this.payrollService.createComplementaryPayrollRun(
      this.getBusinessId(req),
      periodId,
      employeeId,
      dto,
    );
  }

  @Get('runs/:runId')
  @Roles('BUSINESS')
  getPayrollRun(@Req() req: any, @Param('runId') runId: string) {
    return this.payrollService.getPayrollRun(this.getBusinessId(req), runId);
  }

  @Get('runs/:runId/payments')
  @Roles('BUSINESS')
  listPayrollRunPayments(@Req() req: any, @Param('runId') runId: string) {
    return this.payrollService.listPayrollRunPayments(
      this.getBusinessId(req),
      runId,
    );
  }

  @Post('runs/:runId/payments')
  @Roles('BUSINESS')
  createPayrollRunPayment(
    @Req() req: any,
    @Param('runId') runId: string,
    @Body() dto: CreatePayrollPaymentDto,
  ) {
    return this.payrollService.createPayrollRunPayment(
      this.getBusinessId(req),
      runId,
      dto,
    );
  }

  @Patch('payments/:paymentId/status')
  @Roles('BUSINESS')
  updatePayrollPaymentStatus(
    @Req() req: any,
    @Param('paymentId') paymentId: string,
    @Body() dto: UpdatePayrollPaymentStatusDto,
  ) {
    return this.payrollService.updatePayrollPaymentStatus(
      this.getBusinessId(req),
      paymentId,
      dto,
    );
  }

  @Get('periods/:periodId/runs')
  @Roles('BUSINESS')
  listPayrollRuns(@Req() req: any, @Param('periodId') periodId: string) {
    return this.payrollService.listPayrollRuns(
      this.getBusinessId(req),
      periodId,
    );
  }
}
