import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  login(data: any) {
    return {
      message: 'Login exitoso (MVP sin auth real)',
      data,
    };
  }
}
