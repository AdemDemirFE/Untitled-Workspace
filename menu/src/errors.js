'use strict';

/** An error whose message is safe to show to the user, sent with the given HTTP status. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const badRequest = (message) => new HttpError(400, message);
const notFound = (message) => new HttpError(404, message);

module.exports = { HttpError, badRequest, notFound };
