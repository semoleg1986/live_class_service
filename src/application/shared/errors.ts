export class ApplicationError extends Error {}

export class ApplicationValidationError extends ApplicationError {}

export class ApplicationNotFoundError extends ApplicationError {}

export class ApplicationConflictError extends ApplicationError {}
