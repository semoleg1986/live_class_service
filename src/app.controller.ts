import { Controller, Get, Header } from '@nestjs/common';

import { LiveClassMetricsService } from './infrastructure/observability/live-class-metrics.service';

@Controller()
export class AppController {
  constructor(private readonly metricsService: LiveClassMetricsService) {}

  @Get('/healthz')
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('/metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(): string {
    return this.metricsService.render();
  }
}
