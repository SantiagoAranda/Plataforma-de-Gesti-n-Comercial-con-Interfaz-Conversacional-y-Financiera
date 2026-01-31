import { Injectable } from '@nestjs/common';

@Injectable()
export class ReservationsService {
  create(data: any) {
    return {
      message: 'Reserva creada (MVP sin DB)',
      data,
    };
  }

  findAll() {
    return {
      message: 'Listado de reservas (MVP sin DB)',
      data: [],
    };
  }

  findOne(id: string) {
    return {
      message: 'Reserva encontrada (MVP sin DB)',
      id,
    };
  }
}
