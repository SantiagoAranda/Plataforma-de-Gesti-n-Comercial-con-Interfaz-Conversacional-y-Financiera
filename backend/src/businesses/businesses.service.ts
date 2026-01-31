import { Injectable } from '@nestjs/common';

@Injectable()
export class BusinessesService {
  create(data: any) {
    return {
      message: 'Negocio creado (MVP sin DB)',
      data,
    };
  }

  findAll() {
    return {
      message: 'Listado de negocios (MVP sin DB)',
      data: [],
    };
  }

  findOne(id: string) {
    return {
      message: 'Negocio encontrado (MVP sin DB)',
      id,
    };
  }
}