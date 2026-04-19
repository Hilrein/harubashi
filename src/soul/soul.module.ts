import { Global, Module } from '@nestjs/common';
import { SoulService } from './soul.service';

@Global()
@Module({
  providers: [SoulService],
  exports: [SoulService],
})
export class SoulModule {}
