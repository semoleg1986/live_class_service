import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

import {
  ApplicationAccessDeniedError,
  ApplicationConflictError,
  ApplicationNotFoundError,
  ApplicationValidationError
} from '../../application/shared/errors';
import { RequestWithObservability } from './http-observability';

@Catch(
  ApplicationValidationError,
  ApplicationNotFoundError,
  ApplicationConflictError,
  ApplicationAccessDeniedError
)
export class ApplicationErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<RequestWithObservability & Request>();
    const requestId = request.requestId;
    const correlationId = request.correlationId;

    if (requestId) {
      response.setHeader('X-Request-ID', requestId);
    }
    if (correlationId) {
      response.setHeader('X-Correlation-ID', correlationId);
    }

    if (exception instanceof ApplicationValidationError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: exception.message,
        request_id: requestId,
        correlation_id: correlationId
      });
      return;
    }

    if (exception instanceof ApplicationNotFoundError) {
      response.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: exception.message,
        request_id: requestId,
        correlation_id: correlationId
      });
      return;
    }

    if (exception instanceof ApplicationConflictError) {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: exception.message,
        request_id: requestId,
        correlation_id: correlationId
      });
      return;
    }

    if (exception instanceof ApplicationAccessDeniedError) {
      response.status(HttpStatus.FORBIDDEN).json({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
        message: exception.message,
        request_id: requestId,
        correlation_id: correlationId
      });
    }
  }
}
