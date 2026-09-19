import { Request, Response } from 'express';
import CommonRoutes from '../CommonRoutes.js';
import routerHelper from '../RouterHelper.js';
import { HealthCheckRegistry } from './HealthCheckRegistry.js';

export class HealthRoutes extends CommonRoutes {
    private healthRegistry: HealthCheckRegistry;

    constructor(registry: HealthCheckRegistry) {
        super();
        this.healthRegistry = registry;
    }

    /**
     * Public unauthenticated access for health check probes
     */
    protected async isValidUser(_user: any): Promise<boolean> {
        return true;
    }

    protected bindRoutes(): void {
        this.get('/live', routerHelper.invokeRestfulAction(this.getLiveness));
        this.get('/ready', this.getReadinessCustomHandler);
        this.get('/', this.getReadinessCustomHandler);
    }

    /**
     * Liveness probe handler (always 200 OK if process is listening)
     */
    private getLiveness = async (_req: Request) => {
        return this.healthRegistry.checkLiveness();
    };

    /**
     * Readiness probe custom Express handler (returns 200 OK or 503 Service Unavailable)
     */
    private getReadinessCustomHandler = async (_req: Request, res: Response): Promise<void> => {
        const readiness = await this.healthRegistry.checkReadiness();
        const statusCode = readiness.status === 'DOWN' ? 503 : 200;
        res.status(statusCode).json(readiness);
    };
}
