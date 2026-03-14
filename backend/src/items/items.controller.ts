import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { ItemsService } from "./items.service";
import { CreateItemDto } from "./dto/create-item.dto";
import { UpdateItemDto } from "./dto/update-item.dto";
import { UpdateItemStatusDto } from "./dto/update-item-status.dto";
import { AddItemImageDto } from "./dto/add-item-image.dto";

import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { BusinessActiveGuard } from "../common/guards/business-active.guard";

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller("items")
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  // 🔹 Crear item
  @Post()
  create(@Req() req: any, @Body() dto: CreateItemDto) {
    return this.itemsService.create(req.user.businessId, dto);
  }

  // 🔹 Listar items del negocio
  @Get()
  findAll(@Req() req: any, @Query("status") status?: string) {
    return this.itemsService.findAll(req.user.businessId, status);
  }

  // 🔹 Obtener item específico
  @Get(":id")
  getOne(@Req() req: any, @Param("id") id: string) {
    return this.itemsService.findOne(req.user.businessId, id);
  }

  // 🔹 Editar item
  @Patch(":id")
  update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateItemDto
  ) {
    return this.itemsService.update(req.user.businessId, id, dto);
  }

  // 🔹 Cambiar estado (ACTIVE / INACTIVE)
  @Patch(":id/status")
  setStatus(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateItemStatusDto
  ) {
    return this.itemsService.setStatus(
      req.user.businessId,
      id,
      dto.status
    );
  }

  // 🔹 Eliminar item
  @Delete(":id")
  remove(@Req() req: any, @Param("id") id: string) {
    return this.itemsService.remove(req.user.businessId, id);
  }

  // 🔹 Agregar imagen
  @Post(":id/images")
  addImage(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: AddItemImageDto
  ) {
    return this.itemsService.addImage(
      req.user.businessId,
      id,
      dto
    );
  }

  // 🔹 Eliminar imagen
  @Delete(":id/images/:imageId")
  deleteImage(
    @Req() req: any,
    @Param("id") id: string,
    @Param("imageId") imageId: string
  ) {
    return this.itemsService.deleteImage(
      req.user.businessId,
      id,
      imageId
    );
  }
}