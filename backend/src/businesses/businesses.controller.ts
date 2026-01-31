import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { BusinessesService } from './businesses.service';

@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  // POST /businesses
  @Post()
  create(@Body() body: any) {
    return this.businessesService.create(body);
  }

  // GET /businesses
  @Get()
  findAll() {
    return this.businessesService.findAll();
  }

  // GET /businesses/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.businessesService.findOne(id);
  }
}