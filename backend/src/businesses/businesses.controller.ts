import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';


@Controller('businesses')
export class BusinessesController {

  @Get('me')
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  getMe(@Req() req: any) {
    return req.user;
  }

}
