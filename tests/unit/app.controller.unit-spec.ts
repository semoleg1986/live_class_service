import { AppController } from '../../src/app.controller';
import { LiveClassMetricsService } from '../../src/infrastructure/observability/live-class-metrics.service';

describe('AppController (unit)', () => {
  it('healthz returns ok', () => {
    const controller = new AppController(new LiveClassMetricsService());
    expect(controller.healthz()).toEqual({ status: 'ok' });
  });

  it('metrics returns prometheus text', () => {
    const controller = new AppController(new LiveClassMetricsService());
    expect(controller.metrics()).toContain('live_room_rooms_created_total');
  });
});
