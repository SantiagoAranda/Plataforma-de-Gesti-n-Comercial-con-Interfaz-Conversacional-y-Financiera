import { Module } from '@nestjs/common';
import { FeatureFlagsService } from './config/feature-flags';

@Module({
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class CommonModule {}
