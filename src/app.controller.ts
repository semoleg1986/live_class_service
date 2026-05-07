import { Controller, Get, Header, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { LiveClassMetricsService } from './infrastructure/observability/live-class-metrics.service';

@Controller()
export class AppController {
  constructor(
    private readonly metricsService: LiveClassMetricsService,
    private readonly configService: ConfigService
  ) {}

  @Get('/healthz')
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('/metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(@Req() request: Request): string {
    const expectedToken = this.configService.get<string>('liveClass.metricsToken', '');
    if (expectedToken) {
      const serviceToken = request.header('X-Service-Token');
      const authorization = request.header('Authorization');
      const bearerToken = authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : undefined;
      if (serviceToken !== expectedToken && bearerToken !== expectedToken) {
        throw new UnauthorizedException('Unauthorized');
      }
    }
    return this.metricsService.render();
  }
}
