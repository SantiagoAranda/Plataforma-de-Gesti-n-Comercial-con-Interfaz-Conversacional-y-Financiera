import { Controller, Get, UseGuards, Req, Patch, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BusinessesService } from './businesses.service';

@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  // Obtener información del usuario logueado
  @Get('me')
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  getMe(@Req() req: any) {
    return req.user;
  }

  // ADMIN - listar negocios activos
  @Get('admin/active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getActiveBusinesses() {
    return this.businessesService.getActiveBusinesses();
  }

  // ADMIN - listar negocios inactivos
  @Get('admin/inactive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getInactiveBusinesses() {
    return this.businessesService.getInactiveBusinesses();
  }

  // ADMIN - inactivar negocio
  @Patch(':id/inactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  inactivateBusiness(@Param('id') id: string) {
    return this.businessesService.inactivateBusiness(id);
  }

  // ADMIN - reactivar negocio
  @Patch(':id/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  activateBusiness(@Param('id') id: string) {
    return this.businessesService.activateBusiness(id);
  }
}