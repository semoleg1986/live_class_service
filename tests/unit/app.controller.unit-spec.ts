import { AppController } from '../../src/app.controller';

describe('AppController (unit)', () => {
  it('healthz returns ok', () => {
    const controller = new AppController();
    expect(controller.healthz()).toEqual({ status: 'ok' });
  });
});
