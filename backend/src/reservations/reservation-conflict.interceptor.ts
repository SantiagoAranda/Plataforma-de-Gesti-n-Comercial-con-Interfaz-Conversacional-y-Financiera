import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { catchError } from 'rxjs';
import { throwLifecycleError } from './reservation-lifecycle';

@Injectable()
export class ReservationConflictInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(catchError(error => throwLifecycleError(error)));
  }
}
