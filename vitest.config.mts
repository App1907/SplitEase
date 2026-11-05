import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Minimal valid env so modules that read the configuration can be imported (nothing connects).
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      MONGO_URI: 'mongodb://localhost:27017/splitease-test',
      REDIS_URL: 'redis://localhost:6379',
      RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123456789',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef0123456789',
      SMTP_HOST: 'localhost',
    },
  },
});
