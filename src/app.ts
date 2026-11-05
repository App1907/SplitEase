import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { AppRoutes } from './app.routes';
import { configuration } from './config/configuration';
import { openApiDocument } from './config/swagger';
import { ALLOWED_HEADERS, API_PREFIX, EXPOSED_HEADERS, LIMITS } from './common/constant';
import { MESSAGES } from './common/messages';
import { ApiResponse } from './common/responses';
import { errorMiddleware, notFoundMiddleware } from './middlewares/error.middleware';
import { headerValidator } from './middlewares/header.validator';
import { requestContextMiddleware } from './middlewares/requestContext.middleware';
import { databaseProvider } from './providers/database/database.provider';
import { rabbitMQProvider } from './providers/rabbitmq/rabbitmq.provider';
import { redisProvider } from './providers/redis/redis.provider';

export class App {
  readonly app: Express = express();

  constructor() {
    this.app.disable('x-powered-by');
    this.app.set('trust proxy', configuration.trustProxy);
    this.app.set('etag', false);

    this.registerGlobalMiddlewares();
    this.registerPublicRoutes();
    this.app.use(API_PREFIX, headerValidator, new AppRoutes().router);
    this.app.use(notFoundMiddleware);
    this.app.use(errorMiddleware);
  }

  private registerGlobalMiddlewares(): void {
    this.app.use(requestContextMiddleware);
    this.app.use(
      cors({
        origin: configuration.corsOrigins,
        allowedHeaders: ALLOWED_HEADERS,
        exposedHeaders: EXPOSED_HEADERS,
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        maxAge: 600,
      }),
    );
    if (configuration.swaggerEnabled) {
      // Before helmet: Swagger UI needs inline scripts that the default CSP blocks.
      this.app.get('/docs.json', (_req: Request, res: Response) => {
        res.json(openApiDocument);
      });
      this.app.use(
        '/docs',
        swaggerUi.serve,
        swaggerUi.setup(openApiDocument, {
          customSiteTitle: 'SplitEase API',
          swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
        }),
      );
    }
    this.app.use(helmet());
    this.app.use(express.json({ limit: LIMITS.JSON_BODY, strict: true }));
  }

  private registerPublicRoutes(): void {
    this.app.get('/health', async (req: Request, res: Response) => {
      const [mongo, redis] = await Promise.all([databaseProvider.isHealthy(), redisProvider.isHealthy()]);
      const rabbitmq = rabbitMQProvider.isHealthy();
      const status = (up: boolean) => (up ? 'up' : 'down');
      const healthy = mongo && redis && rabbitmq;
      ApiResponse.send(req, res, healthy ? 200 : 503, healthy ? MESSAGES.HEALTHY : MESSAGES.UNHEALTHY, {
        mongo: status(mongo),
        redis: status(redis),
        rabbitmq: status(rabbitmq),
        uptimeSeconds: Math.round(process.uptime()),
      });
    });
  }
}
