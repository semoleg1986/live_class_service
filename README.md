# live_class_service

Live room and attendance service.

## Responsibility

`live_class_service` owns:
- live room lifecycle
- participant join/leave
- lesson attendance
- live access checks around course/lesson participation

## Local run

### Install
```bash
npm install
```

### Run
```bash
npm run start:dev
```

### Health
```bash
curl -fsS http://127.0.0.1:8010/healthz
```

## Environment

- [live_class_service/.env.example](/Users/olegsemenov/Programming/curs/live_class_service/.env.example)
- [live_class_service/.env.local.example](/Users/olegsemenov/Programming/curs/live_class_service/.env.local.example)

Key variables:
- `LIVE_CLASS_HTTP_PORT`
- `LIVE_CLASS_AUTH_JWKS_URL`
- `LIVE_CLASS_REDIS_URL`
- `LIVE_CLASS_DATABASE_URL`
- `LIVE_CLASS_TURN_URL`

## Tests and quality

```bash
npm test
npm run lint
npm run format:check
```

## Build and migrations

```bash
npm run build
npm run db:migrate
```

## Documentation

- [00-live-contract.md](/Users/olegsemenov/Programming/curs/live_class_service/docs/00-live-contract.md)
- [01-architecture.md](/Users/olegsemenov/Programming/curs/live_class_service/docs/01-architecture.md)
