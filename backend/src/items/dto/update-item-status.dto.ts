import { IsEnum } from 'class-validator';
import { ItemStatus } from '@prisma/client';

export class UpdateItemStatusDto {
    @IsEnum(ItemStatus)
    status: ItemStatus;
}