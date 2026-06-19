import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { ItemOptionsService } from './item-options.service';
import { CreateOptionGroupDto } from './dto/create-option-group.dto';
import { UpdateOptionGroupDto } from './dto/update-option-group.dto';
import { CreateItemOptionDto } from './dto/create-item-option.dto';
import { UpdateItemOptionDto } from './dto/update-item-option.dto';

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller('items/:itemId/option-groups')
export class ItemOptionsController {
  constructor(private readonly itemOptionsService: ItemOptionsService) {}

  @Get()
  list(@Req() req: any, @Param('itemId') itemId: string) {
    return this.itemOptionsService.listGroups(req.user.businessId, itemId);
  }

  @Post()
  createGroup(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Body() dto: CreateOptionGroupDto,
  ) {
    return this.itemOptionsService.createGroup(req.user.businessId, itemId, dto);
  }

  @Patch(':groupId')
  updateGroup(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateOptionGroupDto,
  ) {
    return this.itemOptionsService.updateGroup(
      req.user.businessId,
      itemId,
      groupId,
      dto,
    );
  }

  @Delete(':groupId')
  deleteGroup(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Param('groupId') groupId: string,
  ) {
    return this.itemOptionsService.deleteGroup(
      req.user.businessId,
      itemId,
      groupId,
    );
  }

  @Post(':groupId/options')
  createOption(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Param('groupId') groupId: string,
    @Body() dto: CreateItemOptionDto,
  ) {
    return this.itemOptionsService.createOption(
      req.user.businessId,
      itemId,
      groupId,
      dto,
    );
  }

  @Patch(':groupId/options/:optionId')
  updateOption(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Param('groupId') groupId: string,
    @Param('optionId') optionId: string,
    @Body() dto: UpdateItemOptionDto,
  ) {
    return this.itemOptionsService.updateOption(
      req.user.businessId,
      itemId,
      groupId,
      optionId,
      dto,
    );
  }

  @Delete(':groupId/options/:optionId')
  deleteOption(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Param('groupId') groupId: string,
    @Param('optionId') optionId: string,
  ) {
    return this.itemOptionsService.deleteOption(
      req.user.businessId,
      itemId,
      groupId,
      optionId,
    );
  }
}
