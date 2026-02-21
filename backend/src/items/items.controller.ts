
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';

import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { UpdateItemDto } from "./dto/update-item.dto";
import { UpdateItemStatusDto } from "./dto/update-item-status.dto";
import { AddItemImageDto } from "./dto/add-item-image.dto";
@Controller('items')
export class ItemsController {
  constructor(private itemsService: ItemsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  create(@Req() req: any, @Body() dto: CreateItemDto) {
    return this.itemsService.create(req.user.businessId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, BusinessActiveGuard)
  findAll(@Req() req: any) {
    return this.itemsService.findAll(req.user.businessId);
  }

  @Get(":id")
getOne(@Req() req: any, @Param("id") id: string) {
  return this.itemsService.findOne(req.user.businessId, id);
}

@Patch(":id")
update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateItemDto) {
  return this.itemsService.update(req.user.businessId, id, dto);
}

@Patch(":id/status")
setStatus(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateItemStatusDto) {
  return this.itemsService.setStatus(req.user.businessId, id, dto.status);
}

@Delete(":id")
remove(@Req() req: any, @Param("id") id: string) {
  return this.itemsService.remove(req.user.businessId, id);
}

@Post(":id/images")
addImage(@Req() req: any, @Param("id") id: string, @Body() dto: AddItemImageDto) {
  return this.itemsService.addImage(req.user.businessId, id, dto);
}

@Delete(":id/images/:imageId")
deleteImage(
  @Req() req: any,
  @Param("id") id: string,
  @Param("imageId") imageId: string
) {
  return this.itemsService.deleteImage(req.user.businessId, id, imageId);
}
}
