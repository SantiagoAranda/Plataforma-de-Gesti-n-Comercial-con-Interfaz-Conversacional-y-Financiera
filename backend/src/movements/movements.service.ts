import { Injectable } from '@nestjs/common';
import { CreateMovementDto } from './dto/create-movement.dto';

@Injectable()
export class MovementsService {
  // Legacy double-entry bookkeeping was removed. These handlers now act as
  // placeholders until the new accounting flow is available.
  constructor() {}

  async create(businessId: string, dto: CreateMovementDto) {
    return {
      id: `legacy-movement-${Date.now()}`,
      businessId,
      date: new Date(),
      description: dto.description,
      amount: dto.amount,
      type: dto.type,
      status: 'DISABLED',
      note: 'Legacy accounting removed; persistence pending new model.',
    };
  }

  async findAll(businessId: string) {
    return [];
  }
}
