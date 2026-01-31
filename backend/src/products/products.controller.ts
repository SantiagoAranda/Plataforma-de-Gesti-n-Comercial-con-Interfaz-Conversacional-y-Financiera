import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // POST /products
  @Post()
  create(@Body() body: any) {
    return this.productsService.create(body);
  }

  // GET /products
  @Get()
  findAll() {
    return this.productsService.findAll();
  }

  // GET /products/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }
}
