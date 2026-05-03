export type LiveClassConfig = {
  httpPort: number;
  wsNamespace: string;
  useInmemory: boolean;
  useInmemoryCourseAccessChecker: boolean;
  maxStudents: number;
  maxParticipants: number;
  authIssuer: string;
  authAudience: string;
  authJwksUrl: string;
  courseServiceBaseUrl: string;
  courseAccessTimeoutMs: number;
  redisUrl: string;
  outboxStream: string;
  outboxBatchSize: number;
  outboxPollIntervalMs: number;
  databaseUrl: string;
  turnUrl: string;
  turnUsername: string;
  turnPassword: string;
};

function parseIntOrDefault(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolOrDefault(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) {
    return fallback;
  }
  return raw === '1' || raw.toLowerCase() === 'true';
}

export default (): { liveClass: LiveClassConfig } => ({
  liveClass: {
    httpPort: parseIntOrDefault(process.env.LIVE_CLASS_HTTP_PORT, 8010),
    wsNamespace: process.env.LIVE_CLASS_WS_NAMESPACE ?? '/ws/live',
    useInmemory: parseBoolOrDefault(process.env.LIVE_CLASS_USE_INMEMORY, true),
    useInmemoryCourseAccessChecker: parseBoolOrDefault(
      process.env.LIVE_CLASS_USE_INMEMORY_COURSE_ACCESS_CHECKER,
      false
    ),
    maxStudents: parseIntOrDefault(process.env.LIVE_CLASS_MAX_STUDENTS, 10),
    maxParticipants: parseIntOrDefault(process.env.LIVE_CLASS_MAX_PARTICIPANTS, 11),
    authIssuer: process.env.LIVE_CLASS_AUTH_ISSUER ?? 'auth_service',
    authAudience: process.env.LIVE_CLASS_AUTH_AUDIENCE ?? 'platform_clients',
    authJwksUrl:
      process.env.LIVE_CLASS_AUTH_JWKS_URL ?? 'http://localhost:8000/.well-known/jwks.json',
    courseServiceBaseUrl: process.env.LIVE_CLASS_COURSE_SERVICE_BASE_URL ?? 'http://localhost:8001',
    courseAccessTimeoutMs: parseIntOrDefault(process.env.LIVE_CLASS_COURSE_ACCESS_TIMEOUT_MS, 3000),
    redisUrl: process.env.LIVE_CLASS_REDIS_URL ?? 'redis://localhost:6379/0',
    outboxStream: process.env.LIVE_CLASS_OUTBOX_STREAM ?? 'live_room.events',
    outboxBatchSize: parseIntOrDefault(process.env.LIVE_CLASS_OUTBOX_BATCH_SIZE, 100),
    outboxPollIntervalMs: parseIntOrDefault(process.env.LIVE_CLASS_OUTBOX_POLL_INTERVAL_MS, 1000),
    databaseUrl:
      process.env.LIVE_CLASS_DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/live_class_service',
    turnUrl: process.env.LIVE_CLASS_TURN_URL ?? 'turn:localhost:3478',
    turnUsername: process.env.LIVE_CLASS_TURN_USERNAME ?? 'turn-user',
    turnPassword: process.env.LIVE_CLASS_TURN_PASSWORD ?? 'turn-password'
  }
});
