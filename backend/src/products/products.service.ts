import { Injectable } from '@nestjs/common';

@Injectable()
export class ProductsService {
  create(data: any) {
    return {
      message: 'Producto creado (MVP sin DB)',
      data,
    };
  }

  findAll() {
    return {
      message: 'Listado de productos (MVP sin DB)',
      data: [],
    };
  }

  findOne(id: string) {
    return {
      message: 'Producto encontrado (MVP sin DB)',
      id,
    };
  }
}
