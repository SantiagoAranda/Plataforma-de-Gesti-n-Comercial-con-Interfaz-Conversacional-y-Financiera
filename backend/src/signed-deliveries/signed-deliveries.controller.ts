import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  MAX_SIGNED_DELIVERY_BYTES,
  SignedDeliveriesService,
} from './signed-deliveries.service';

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller('sales/:orderId/signed-delivery')
export class SignedDeliveriesController {
  constructor(private readonly service: SignedDeliveriesService) {}

  @Get()
  find(@Req() req: any, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.service.find(req.user.businessId, orderId);
  }

  @Get('file')
  async file(
    @Req() req: any,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Res() res: Response,
  ) {
    const { body, mimeType } = await this.service.file(req.user.businessId, orderId);
    res.set({
      'Content-Type': mimeType,
      'Content-Length': String(body.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(body);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_SIGNED_DELIVERY_BYTES } }),
  )
  put(
    @Req() req: any,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.put(req.user.businessId, orderId, file);
  }

  @Delete()
  remove(@Req() req: any, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.service.remove(req.user.businessId, orderId);
  }
}
