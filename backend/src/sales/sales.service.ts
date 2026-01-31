import { Injectable } from '@nestjs/common';

@Injectable()
export class SalesService {
  create(data: any) {
    return {
      message: 'Venta creada (MVP sin DB)',
      data,
    };
  }

  findAll() {
    return {
      message: 'Listado de ventas (MVP sin DB)',
      data: [],
    };
  }

  findOne(id: string) {
    return {
      message: 'Venta encontrada (MVP sin DB)',
      id,
    };
  }
}
