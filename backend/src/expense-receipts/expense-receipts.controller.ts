import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { ExpenseReceiptsService } from './expense-receipts.service';
import { UpdateExpenseReceiptDto } from './dto/update-expense-receipt.dto';

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller('expense-receipts')
export class ExpenseReceiptsController {
  constructor(private readonly expenseReceipts: ExpenseReceiptsService) {}

  @Post('scan')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  scan(@Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    return this.expenseReceipts.scan(req.user.businessId, file);
  }

  @Post('manual')
  createManual(@Req() req: any, @Body() dto: UpdateExpenseReceiptDto) {
    return this.expenseReceipts.createManual(req.user.businessId, dto);
  }

  @Get()
  list(@Req() req: any) {
    return this.expenseReceipts.list(req.user.businessId);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.expenseReceipts.get(req.user.businessId, id);
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseReceiptDto,
  ) {
    return this.expenseReceipts.update(req.user.businessId, id, dto);
  }

  @Post(':id/post')
  postReceipt(@Req() req: any, @Param('id') id: string) {
    return this.expenseReceipts.post(req.user.businessId, id);
  }

  @Post(':id/reject')
  reject(@Req() req: any, @Param('id') id: string) {
    return this.expenseReceipts.reject(req.user.businessId, id);
  }
}
