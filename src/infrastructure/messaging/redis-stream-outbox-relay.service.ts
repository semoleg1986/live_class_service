import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { Pool } from 'pg';

type OutboxRow = {
  event_id: string;
  topic: string;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: Date;
};

@Injectable()
export class RedisStreamOutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisStreamOutboxRelayService.name);
  private readonly pool: Pool;
  private redisClient: RedisClientType | null = null;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isConnecting = false;

  constructor(private readonly configService: ConfigService) {
    const connectionString = this.configService.get<string>(
      'liveClass.databaseUrl',
      'postgresql://postgres:postgres@localhost:5432/live_class_service'
    );
    this.pool = new Pool({ connectionString });
  }

  async onModuleInit(): Promise<void> {
    const useInMemory = this.configService.get<boolean>('liveClass.useInmemory', true);
    if (useInMemory) {
      return;
    }

    const redisUrl = this.configService.get<string>(
      'liveClass.redisUrl',
      'redis://localhost:6379/0'
    );
    this.redisClient = createClient({ url: redisUrl });
    this.redisClient.on('error', (error) => {
      this.logger.error(`Ошибка Redis relay: ${String(error)}`);
    });

    const pollIntervalMs = this.configService.get<number>('liveClass.outboxPollIntervalMs', 1000);
    this.timer = setInterval(() => {
      void this.relayPendingBatch();
    }, pollIntervalMs);

    void this.ensureRedisConnected();
    void this.relayPendingBatch();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.redisClient) {
      if (this.redisClient.isOpen) {
        await this.redisClient.quit();
      }
      this.redisClient = null;
    }
    await this.pool.end();
  }

  private async relayPendingBatch(): Promise<void> {
    if (this.isRunning || !this.redisClient) {
      return;
    }

    this.isRunning = true;
    try {
      const connected = await this.ensureRedisConnected();
      if (!connected) {
        return;
      }

      const batchSize = this.configService.get<number>('liveClass.outboxBatchSize', 100);
      const stream = this.configService.get<string>('liveClass.outboxStream', 'live_room.events');

      const rows = await this.fetchPending(batchSize);
      for (const row of rows) {
        await this.publishRow(stream, row);
      }
    } catch (error) {
      this.logger.error(`Outbox relay batch error: ${String(error)}`);
    } finally {
      this.isRunning = false;
    }
  }

  private async ensureRedisConnected(): Promise<boolean> {
    if (!this.redisClient) {
      return false;
    }
    if (this.redisClient.isOpen) {
      return true;
    }
    if (this.isConnecting) {
      return false;
    }

    this.isConnecting = true;
    try {
      await this.redisClient.connect();
      this.logger.log('Outbox relay подключен к Redis.');
      return true;
    } catch (error) {
      this.logger.error(`Не удалось подключиться к Redis: ${String(error)}`);
      return false;
    } finally {
      this.isConnecting = false;
    }
  }

  private async fetchPending(limit: number): Promise<OutboxRow[]> {
    const result = await this.pool.query<OutboxRow>(
      `
      SELECT event_id, topic, payload, attempts, created_at
      FROM outbox_events
      WHERE status = 'pending' AND available_at <= NOW()
      ORDER BY created_at ASC
      LIMIT $1
      `,
      [limit]
    );
    return result.rows;
  }

  private async publishRow(stream: string, row: OutboxRow): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    try {
      await this.redisClient.xAdd(stream, '*', {
        event_id: row.event_id,
        topic: row.topic,
        payload: JSON.stringify(row.payload),
        created_at: row.created_at.toISOString()
      });

      await this.pool.query(
        `
        UPDATE outbox_events
        SET status = 'sent',
            sent_at = NOW(),
            last_error = NULL
        WHERE event_id = $1
        `,
        [row.event_id]
      );
    } catch (error) {
      const nextAttempts = row.attempts + 1;
      const delaySeconds = Math.min(300, 2 ** Math.min(nextAttempts, 8));
      const message = String(error).slice(0, 2000);

      await this.pool.query(
        `
        UPDATE outbox_events
        SET attempts = $2,
            available_at = NOW() + ($3 * INTERVAL '1 second'),
            last_error = $4
        WHERE event_id = $1
        `,
        [row.event_id, nextAttempts, delaySeconds, message]
      );
    }
  }
}
