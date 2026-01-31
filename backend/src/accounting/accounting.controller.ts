import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { AccountingService } from './accounting.service';

@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  // POST /accounting
  @Post()
  create(@Body() body: any) {
    return this.accountingService.create(body);
  }

  // GET /accounting
  @Get()
  findAll() {
    return this.accountingService.findAll();
  }

  // GET /accounting/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accountingService.findOne(id);
  }
}
