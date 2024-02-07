import { Request, Response } from 'express';
import { loadFilters } from '../filter/filtersAsync';
import { v4 as uuid } from 'uuid';

import { log as logger } from '../../logs/logger';
import { incrementHttpRequestsTotal } from '../utils/metrics';

import { ExtendedLogContext } from '../types/log';
import { makeRequestToDownstream } from '../http/request';

// 1. Request coming in over HTTP conn (logged)
// 2. Filter for rule match (log and block if no match)
// 3. Relay over websocket conn (logged)
// 4. Get response over websocket conn (logged)
// 5. Send response over HTTP conn
export const forwardHttpRequestOverHttp = (filterRules, config) => {
  const filters = loadFilters(filterRules);

  return (req: Request, res: Response) => {
    // If this is the server, we should receive a Snyk-Request-Id header from upstream
    // If this is the client, we will have to generate one
    req.headers['snyk-request-id'] ||= uuid();
    const logContext: ExtendedLogContext = {
      url: req.url,
      requestMethod: req.method,
      requestHeaders: req.headers,
      requestId:
        req.headers['snyk-request-id'] &&
        Array.isArray(req.headers['snyk-request-id'])
          ? req.headers['snyk-request-id'].join(',')
          : req.headers['snyk-request-id'] || '',
      maskedToken: req['maskedToken'],
      hashedToken: req['hashedToken'],
    };

    const simplifiedContext = logContext;
    delete simplifiedContext.requestHeaders;
    logger.info(simplifiedContext, '[HTTP Flow] Received request');
    const filterResponse = filters(req);
    if (!filterResponse) {
      incrementHttpRequestsTotal(true, 'inbound-request');
      const reason =
        'Request does not match any accept rule, blocking HTTP request';
      logContext.error = 'blocked';
      logger.warn(logContext, reason);
      // TODO: respect request headers, block according to content-type
      return res.status(401).send({ message: 'blocked', reason, url: req.url });
    } else {
      incrementHttpRequestsTotal(false, 'inbound-request');

      const apiDomain = new URL(
        config.API_BASE_URL ||
          (config.BROKER_SERVER_URL
            ? config.BROKER_SERVER_URL.replace('//broker.', '//api.')
            : 'https://api.snyk.io'),
      );

      const requestUri = new URL(req.url, apiDomain);
      req.headers['host'] = requestUri.host;

      const filteredReq = {
        url: requestUri.toString(),
        method: req.method,
        body: req.body,
        headers: req.headers,
      };

      makeRequestToDownstream(filteredReq)
        .then((resp) => {
          if (resp.statusCode) {
            res.status(resp.statusCode).set(resp.headers).send(resp.body);
          } else {
            res.status(500).send(resp.statusText);
          }
        })
        .catch((err) => {
          logger.error(
            logContext,
            err,
            'Failed to forward webhook event to Snyk Platform',
          );
        });
    }
  };
};