import { Injectable } from '@nestjs/common';

@Injectable()
export class AccountingService {
  create(data: any) {
    return {
      message: 'Movimiento contable creado (MVP sin DB)',
      data,
    };
  }

  findAll() {
    return {
      message: 'Listado de movimientos contables (MVP sin DB)',
      data: [],
    };
  }

  findOne(id: string) {
    return {
      message: 'Movimiento contable encontrado (MVP sin DB)',
      id,
    };
  }
}
