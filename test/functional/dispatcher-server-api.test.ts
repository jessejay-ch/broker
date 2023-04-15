const nock = require('nock');

describe('Broker Server Dispatcher API interaction', () => {
  // token hashed with 256-sha algorithm
  const token =
    '3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0';
  const hashedToken =
    'db37d21181592000efad06f87a00afba59f9c99b11e119d118be2b929c3387ce';
  const clientId = '40365f1c-8c8f-45d4-8311-788058652c4d';
  const clientVersion = '4.144.1';

  const serverUrl = 'http://broker-server-dispatcher';

  const spyLogWarn = jest
    .spyOn(require('bunyan').prototype, 'warn')
    .mockImplementation((value) => {
      return value;
    });
  const spyLogError = jest
    .spyOn(require('bunyan').prototype, 'error')
    .mockImplementation((value) => {
      return value;
    });
  const spyFn = jest.fn();
  afterAll(() => {
    spyLogWarn.mockReset();
    spyLogError.mockReset();
  });
  beforeEach(() => {
    spyFn.mockReset();
    spyLogWarn.mockReset();
    spyLogError.mockReset();
  });

  it('should fire off clientConnected call successfully with server response', async () => {
    nock(`${serverUrl}`)
      .post(
        `/internal/brokerservers/0/connections/${hashedToken}?broker_client_id=${clientId}&version=2022-12-02%7Eexperimental`,
      )
      .reply((uri, requestBody) => {
        spyFn(JSON.parse(requestBody));
        return [200, 'OK'];
      });

    try {
      process.env.DISPATCHER_URL = `${serverUrl}`;
      const dispatcher = require('../../lib/dispatcher');
      await expect(
        dispatcher.clientConnected(token, clientId, clientVersion),
      ).resolves.not.toThrowError();
      expect(spyLogWarn).toHaveBeenCalledTimes(0);
      expect(spyFn).toBeCalledWith({
        data: {
          attributes: {
            broker_client_version: '4.144.1',
            health_check_link: 'http://undefined/healthcheck',
          },
        },
      });
    } catch (err) {
      expect(err).toBeNull();
    }
  });

  it('should fire off clientConnected call successfully with warnings', async () => {
    nock(`${serverUrl}`)
      .post(
        `/internal/brokerservers/0/connections/${hashedToken}?broker_client_id=${clientId}&version=2022-12-02%7Eexperimental`,
      )
      .reply((uri, requestBody) => {
        spyFn(JSON.parse(requestBody));
        return [500, 'NOK'];
      })
      .persist();

    try {
      process.env.DISPATCHER_URL = `${serverUrl}`;
      const dispatcher = require('../../lib/dispatcher');
      await expect(
        dispatcher.clientConnected(token, clientId, clientVersion),
      ).resolves.not.toThrowError();
      expect(spyLogWarn).toHaveBeenCalledTimes(3);
      for (let i = 0; i < 3; i++) {
        const output = spyLogWarn.mock.calls[i][0] as Object;
        expect(output['errorMessage']).toEqual(
          'Request failed with status code 500',
        );
        expect(output['retryCount']).toEqual(i + 1);
      }

      expect(spyLogError).toBeCalledTimes(1);
      const errorOutput = spyLogError.mock.calls[0][0] as Object;
      expect(errorOutput['errorMessage']).toEqual(
        'Request failed with status code 500',
      );
      expect(errorOutput['requestType']).toEqual('client-connected');
    } catch (err) {
      expect(err).toBeNull();
    }
  });
});
