import { PartialType } from '@nestjs/mapped-types';
import { CreateAccountingMovementDto } from './create-accounting-movement.dto';

export class UpdateAccountingMovementDto extends PartialType(CreateAccountingMovementDto) {}