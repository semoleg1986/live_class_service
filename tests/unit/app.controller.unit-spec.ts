import { AppController } from '../../src/app.controller';
import { LiveClassMetricsService } from '../../src/infrastructure/observability/live-class-metrics.service';

describe('AppController (unit)', () => {
  it('healthz returns ok', () => {
    const controller = new AppController(new LiveClassMetricsService(), {
      get: jest.fn((_key: string, fallback = '') => fallback)
    } as never);
    expect(controller.healthz()).toEqual({ status: 'ok' });
  });

  it('metrics returns prometheus text', () => {
    const controller = new AppController(new LiveClassMetricsService(), {
      get: jest.fn((_key: string, fallback = '') => fallback)
    } as never);
    const request = {
      header: jest.fn(() => undefined)
    } as never;
    expect(controller.metrics(request)).toContain('live_room_rooms_created_total');
  });

  it('metrics requires token when configured', () => {
    const controller = new AppController(new LiveClassMetricsService(), {
      get: jest.fn((key: string, fallback = '') =>
        key === 'liveClass.metricsToken' ? 'metrics-secret' : fallback
      )
    } as never);
    const request = {
      header: jest.fn(() => undefined)
    } as never;
    expect(() => controller.metrics(request)).toThrow('Unauthorized');
  });
});
