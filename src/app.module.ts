import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from './config/configuration';
import { AuthModule } from './modules/auth/auth.module';
import { LiveRoomModule } from './modules/live-room/live-room.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration]
    }),
    AuthModule,
    LiveRoomModule
  ],
  controllers: [AppController]
})
export class AppModule {}
