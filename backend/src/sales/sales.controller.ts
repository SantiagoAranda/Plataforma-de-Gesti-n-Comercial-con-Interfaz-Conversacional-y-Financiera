import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';

import { SalesService } from './sales.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { AddOrderItemDto } from "./dto/add-order-item.dto";
import { UpdateOrderItemDto } from "./dto/update-order-item.dto";

@Controller('sales')
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  create(@Req() req: any, @Body() dto: CreateOrderDto) {
    return this.salesService.create(req.user.businessId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  findAll(@Req() req: any) {
    return this.salesService.findAll(req.user.businessId);
  }

  @Patch(':id/confirm')
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  confirm(@Req() req: any, @Param('id') id: string) {
    return this.salesService.confirmOrder(req.user.businessId, id);
  }
  @Get(":id")
getOne(@Req() req: any, @Param("id") id: string) {
  return this.salesService.getOne(req.user.businessId, id);
}

@Patch(":id/cancel")
cancel(@Req() req: any, @Param("id") id: string) {
  return this.salesService.cancel(req.user.businessId, id);
}

@Post(":id/items")
addItem(@Req() req: any, @Param("id") id: string, @Body() dto: AddOrderItemDto) {
  return this.salesService.addItem(req.user.businessId, id, dto);
}

@Patch(":id/items/:orderItemId")
updateItem(
  @Req() req: any,
  @Param("id") id: string,
  @Param("orderItemId") orderItemId: string,
  @Body() dto: UpdateOrderItemDto
) {
  return this.salesService.updateItem(req.user.businessId, id, orderItemId, dto);
}

@Delete(":id/items/:orderItemId")
removeItem(
  @Req() req: any,
  @Param("id") id: string,
  @Param("orderItemId") orderItemId: string
) {
  return this.salesService.removeItem(req.user.businessId, id, orderItemId);
}
  
}
