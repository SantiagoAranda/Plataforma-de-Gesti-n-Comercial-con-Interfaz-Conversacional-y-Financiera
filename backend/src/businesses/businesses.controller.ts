import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BusinessesService } from './businesses.service';
import { ForbiddenException } from '@nestjs/common';

type AuthenticatedRequest = Request & {
  user: {
    userId: string;
    role: string;
    businessId?: string | null;
    companyId?: string | null;
  };
};

function getBusinessId(req: AuthenticatedRequest) {
  const businessId = req.user.businessId ?? req.user.companyId;

  if (!businessId) {
    throw new ForbiddenException('El usuario no tiene negocio asociado');
  }

  return businessId;
}

@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) { }

  // Obtener información del usuario logueado
  @Get('me')
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  getMe(@Req() req: AuthenticatedRequest) {
    return req.user;
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  getProfile(@Req() req: AuthenticatedRequest) {
    return this.businessesService.getProfile(getBusinessId(req));
  }

  @Post('profile/logo')
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  @UseInterceptors(FileInterceptor('logo'))
  uploadLogo(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.businessesService.uploadLogo(getBusinessId(req), file);
  }

  @Delete('profile/logo')
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  deleteLogo(@Req() req: AuthenticatedRequest) {
    return this.businessesService.deleteLogo(getBusinessId(req));
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

  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getBusinessById(@Param('id') id: string) {
    return this.businessesService.getBusinessById(id);
  }
}
