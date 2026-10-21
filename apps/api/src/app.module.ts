import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Pool } from 'pg';
import { AUTH_CONFIG, loadConfig } from './config.js';
import { ACCESS_REPOSITORY } from './modules/access/types.js';
import { PgAccessRepository } from './modules/access/repository.js';
import { AccessGuard } from './modules/access/access.guard.js';
import { TokenVerifier } from './modules/access/token-verifier.js';
import { MeController } from './modules/access/me.controller.js';
import { BookingController } from './modules/booking/booking.controller.js';
export const DATABASE_POOL = 'DATABASE_POOL';
@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}
  async onApplicationShutdown() { await this.pool.end(); }
}
@Module({
  controllers: [MeController, BookingController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: loadConfig },
    { provide: DATABASE_POOL, useFactory: (config: ReturnType<typeof loadConfig>) => new Pool({ connectionString: config.databaseUrl }), inject: [AUTH_CONFIG] },
    { provide: ACCESS_REPOSITORY, useFactory: (pool: Pool) => new PgAccessRepository(pool), inject: [DATABASE_POOL] },
    DatabaseLifecycle, TokenVerifier, { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AppModule {}
