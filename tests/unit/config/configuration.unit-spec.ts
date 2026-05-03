import configuration from '../../../src/config/configuration';

describe('configuration (unit)', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('uses defaults when env is absent', () => {
    delete process.env.LIVE_CLASS_HTTP_PORT;
    delete process.env.LIVE_CLASS_USE_INMEMORY;
    delete process.env.LIVE_CLASS_USE_INMEMORY_COURSE_ACCESS_CHECKER;
    const cfg = configuration().liveClass;
    expect(cfg.httpPort).toBe(8010);
    expect(cfg.useInmemory).toBe(true);
    expect(cfg.useInmemoryCourseAccessChecker).toBe(false);
    expect(cfg.maxParticipants).toBe(11);
  });

  it('parses numeric and boolean env values', () => {
    process.env.LIVE_CLASS_HTTP_PORT = '9001';
    process.env.LIVE_CLASS_USE_INMEMORY = 'false';
    process.env.LIVE_CLASS_USE_INMEMORY_COURSE_ACCESS_CHECKER = 'true';
    process.env.LIVE_CLASS_MAX_PARTICIPANTS = '25';
    process.env.LIVE_CLASS_OUTBOX_BATCH_SIZE = '250';

    const cfg = configuration().liveClass;
    expect(cfg.httpPort).toBe(9001);
    expect(cfg.useInmemory).toBe(false);
    expect(cfg.useInmemoryCourseAccessChecker).toBe(true);
    expect(cfg.maxParticipants).toBe(25);
    expect(cfg.outboxBatchSize).toBe(250);
  });

  it('falls back for invalid numeric env values', () => {
    process.env.LIVE_CLASS_HTTP_PORT = 'abc';
    process.env.LIVE_CLASS_MAX_STUDENTS = 'x';

    const cfg = configuration().liveClass;
    expect(cfg.httpPort).toBe(8010);
    expect(cfg.maxStudents).toBe(10);
  });
});
