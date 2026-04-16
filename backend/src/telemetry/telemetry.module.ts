import { Module, Global, forwardRef } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { AdminModule } from '../admin/admin.module';

@Global()
@Module({
  imports: [forwardRef(() => AdminModule)],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
