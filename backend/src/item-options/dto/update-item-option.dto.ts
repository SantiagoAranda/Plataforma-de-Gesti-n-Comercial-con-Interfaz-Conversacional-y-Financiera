import { PartialType } from '@nestjs/mapped-types';
import { CreateItemOptionDto } from './create-item-option.dto';

export class UpdateItemOptionDto extends PartialType(CreateItemOptionDto) {}
