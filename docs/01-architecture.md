# Архитектура (Senior++ Baseline)

`live_class_service` организован по Clean Architecture и DDD-ориентированным слоям.

## Слои

- `src/domain/*`
  - бизнес-правила и инварианты (без Nest/infra зависимостей)
  - агрегат `LiveRoomAggregate`, политики и доменные ошибки
- `src/application/*`
  - use-case orchestration и фасад (`LiveRoomFacade`)
  - порты (`LiveRoomRepositoryPort`)
- `src/infrastructure/*`
  - адаптеры persistence/di/config
  - текущая реализация репозитория: in-memory
- `src/modules/*`
  - transport/adapters: HTTP controller, WS gateway, auth guard

## Dependency Rule

Внутренние слои не зависят от внешних:

- `domain` <- `application` <- `infrastructure/modules`

Запрещено тянуть Nest/decorators в `domain`.

## Текущий Tech Baseline

- API/Signaling framework: NestJS
- RTC engine target: mediasoup
- Persistence baseline: in-memory (MVP), далее PostgreSQL + Redis
- Auth baseline: Bearer JWT (guard skeleton), далее JWKS signature verify

## Следующие инженерные шаги

1. Полный JWT JWKS verifier в auth guard.
2. Postgres repository и migration для `LiveRoom`.
3. Redis adapter для multi-instance signaling.
4. Mediasoup worker/router/transport lifecycle с telemetry.
