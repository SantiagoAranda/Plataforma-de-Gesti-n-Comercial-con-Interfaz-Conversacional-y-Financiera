import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
  create(data: any) {
    return {
      message: 'Usuario creado (MVP sin DB)',
      data,
    };
  }

  findAll() {
    return {
      message: 'Listado de usuarios (MVP sin DB)',
      data: [],
    };
  }

  findOne(id: string) {
    return {
      message: 'Usuario encontrado (MVP sin DB)',
      id,
    };
  }
}
