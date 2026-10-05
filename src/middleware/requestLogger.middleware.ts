import { pinoHttp } from "pino-http";

import { logger } from "../utils/logger.js";

export const requestLogger = pinoHttp({
  logger,
  wrapSerializers: false,
  serializers: {
    req(request) {
      return {
        method: request.method,
        url: request.url?.split("?")[0],
        remoteAddress: request.socket.remoteAddress
      };
    },
    res(response) {
      return {
        statusCode: response.statusCode
      };
    }
  },
  customLogLevel(_request, response, error) {
    if (error || response.statusCode >= 500) {
      return "error";
    }

    if (response.statusCode >= 400) {
      return "warn";
    }

    return "info";
  }
});
