import { Body, Controller, Get, Param, Post, Put, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { FiscalDocumentService } from './fiscal-document.service';

@UseGuards(JwtAuthGuard, BusinessActiveGuard)
@Controller('fiscal-documents')
export class FiscalDocumentsController {
  constructor(private readonly fiscalDocuments: FiscalDocumentService) {}

  @Get()
  list(@Req() req: any) { return this.fiscalDocuments.list(req.user.businessId); }

  @Get('configuration')
  getConfiguration(@Req() req: any) {
    return this.fiscalDocuments.getConfiguration(req.user.businessId);
  }

  @Put('configuration')
  configure(@Req() req: any, @Body() body: any) { return this.fiscalDocuments.configure(req.user.businessId, body); }

  @Post(':id/dispatch')
  dispatch(@Req() req: any, @Param('id') id: string) {
    return this.fiscalDocuments.dispatch(req.user.businessId, id);
  }

  @Post(':id/retry')
  retry(@Req() req: any, @Param('id') id: string) {
    return this.fiscalDocuments.retry(req.user.businessId, id);
  }

  @Post(':id/credit-note')
  creditNote(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.fiscalDocuments.requestCreditNote(req.user.businessId, id, body?.correctionConceptCode ?? '2');
  }

  @Get(':id/artifacts/:kind')
  async downloadArtifact(
    @Req() req: any,
    @Param('id') id: string,
    @Param('kind') kind: string,
  ) {
    const artifact = await this.fiscalDocuments.downloadArtifact(
      req.user.businessId,
      id,
      kind,
    );
    return new StreamableFile(artifact.body, {
      type: artifact.contentType,
      disposition: `attachment; filename="${artifact.filename}"`,
    });
  }
}
