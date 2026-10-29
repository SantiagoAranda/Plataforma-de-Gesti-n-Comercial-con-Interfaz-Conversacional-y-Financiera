import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // PRISMA_QUERY_LOG=1 imprime cada consulta con su duración (diagnóstico de latencia).
    super(
      process.env.PRISMA_QUERY_LOG
        ? { log: [{ emit: 'event', level: 'query' }] }
        : undefined,
    );
    if (process.env.PRISMA_QUERY_LOG) {
      (this as any).$on('query', (e: any) =>
        console.log(`[SQL] ${e.duration}ms ${e.query.slice(0, 90)}`),
      );
    }
  }

  async onModuleInit() {
    await this.$connect();
  }
}
