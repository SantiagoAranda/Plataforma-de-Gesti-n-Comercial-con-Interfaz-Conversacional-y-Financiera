import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  // POST /sales
  @Post()
  create(@Body() body: any) {
    return this.salesService.create(body);
  }

  // GET /sales
  @Get()
  findAll() {
    return this.salesService.findAll();
  }

  // GET /sales/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }
}
