# live_class_service

Скелет сервиса live-занятий для образовательной платформы.

## Технологии

- NestJS (HTTP + WebSocket signaling)
- mediasoup (планируемый SFU слой)
- PostgreSQL (метаданные комнат/уроков)
- Redis (presence, pub/sub, scaling)

## MVP ограничения

- 1 преподаватель + до 10 учеников
- максимум 11 участников в комнате
- room lifecycle: create -> active -> closed

## Быстрый старт

```bash
cp .env.local.example .env
npm install
npm run start:dev
```

Healthcheck:

```bash
curl http://localhost:8010/healthz
```

Контракт live API и signaling: `docs/00-live-contract.md`.

## Структура

- `domain`: инварианты и агрегаты
- `application`: use-cases и фасад
- `infrastructure`: репозитории/di/config
- `modules`: HTTP/WS адаптеры

Подробно: `docs/01-architecture.md`.
