import { IncomingMessage } from 'http';
import { ConnectQOS, BeforeThrottleFn, BadActorType } from '../src';
import toobusy from 'toobusy-js';
import { forEachChild } from 'typescript';

jest.mock('toobusy-js');

beforeEach(() => {
  toobusy.mockReturnValue(false);
  toobusy.maxLag = jest.fn();
  toobusy.lag = jest.fn().mockReturnValue(0);  
});

describe('constructor', () => {
  it('defaults', () => {
    const qos = new ConnectQOS();
    expect(qos.minLag).toEqual(70);
    expect(qos.maxLag).toEqual(300);
    expect(qos.userLag).toEqual(500);
    expect(qos.minBadHostThreshold).toEqual(0.50);
    expect(qos.maxBadHostThreshold).toEqual(0.01);
    expect(qos.minBadIpThreshold).toEqual(0.50);
    expect(qos.maxBadIpThreshold).toEqual(0.01);
    expect(qos.errorStatusCode).toEqual(503);
    expect(qos.exemptLocalAddress).toEqual(true);
  });

  it('overrides', () => {
    const qos = new ConnectQOS({
      minLag: 50,
      maxLag: 200,
      minBadHostThreshold: 0.60,
      maxBadHostThreshold: 0.02,
      minBadIpThreshold: 0.65,
      maxBadIpThreshold: 0.03,
      errorStatusCode: 500,
      exemptLocalAddress: false
    });
    expect(qos.minLag).toEqual(50);
    expect(qos.maxLag).toEqual(200);
    expect(qos.minBadHostThreshold).toEqual(0.60);
    expect(qos.maxBadHostThreshold).toEqual(0.02);
    expect(qos.minBadIpThreshold).toEqual(0.65);
    expect(qos.maxBadIpThreshold).toEqual(0.03);
    expect(qos.errorStatusCode).toEqual(500);
    expect(qos.exemptLocalAddress).toEqual(false);
  });
});

describe('metrics', () => {
  it('defaults', () => {
    const qos = new ConnectQOS();
    expect(qos.metrics.historySize).toEqual(500);
  });

  it('overrides', () => {
    const qos = new ConnectQOS({ historySize: 100 });
    expect(qos.metrics.historySize).toEqual(100);
  });
});

describe('getMiddleware', () => {
  it('returns Function', () => {
    const qos = new ConnectQOS();
    const middleware = qos.getMiddleware();
    expect(typeof middleware).toEqual('function');
  });

  it('beforeThrottle option', () => {
    const beforeThrottle = jest.fn().mockReturnValue(true) as BeforeThrottleFn;
    const qos = new ConnectQOS();
    const middleware = qos.getMiddleware({ beforeThrottle });
    expect(typeof middleware).toEqual('function');
    const writeHead = jest.fn();
    const end = jest.fn();
    middleware({ headers: {} } as IncomingMessage, { writeHead, end }, () => {});
    expect(beforeThrottle).not.toHaveBeenCalled;
    expect(writeHead).not.toHaveBeenCalled;
    expect(end).not.toHaveBeenCalled;
  });

  it('throttled if toobusy', () => {
    const qos = new ConnectQOS({ minHostRequests: 10 });
    const middleware = qos.getMiddleware();
    expect(typeof middleware).toEqual('function');
    expect(qos.metrics.getHostRatio('unknown', false)).toEqual(0);
    for (let i = 0; i < 10; i++) {
      qos.isBadHost('unknown', true);  
    }
    const writeHead = jest.fn();
    const end = jest.fn();
    toobusy.mockReturnValue(true);
    toobusy.lag.mockReturnValue(70);
    expect(qos.metrics.getHostRatio('unknown', false)).toEqual(1);
    middleware({ headers: {} } as IncomingMessage, { writeHead, end }, () => {});
    expect(qos.isBadHost('unknown', false)).toEqual(true);
    expect(writeHead).toHaveBeenCalled;
    expect(end).toHaveBeenCalled;
  });

  it('throttled via IP if toobusy', () => {
    const qos = new ConnectQOS({ minIpRequests: 10 });
    const middleware = qos.getMiddleware();
    expect(typeof middleware).toEqual('function');
    expect(qos.metrics.getIpRatio('unknown', false)).toEqual(0);
    for (let i = 0; i < 10; i++) {
      qos.isBadIp('unknown', true);  
    }
    const writeHead = jest.fn();
    const end = jest.fn();
    toobusy.mockReturnValue(true);
    toobusy.lag.mockReturnValue(70);
    expect(qos.metrics.getIpRatio('unknown', false)).toEqual(1);
    middleware({ headers: {} } as IncomingMessage, { writeHead, end }, () => {});
    expect(qos.isBadIp('unknown', false)).toEqual(true);
    expect(writeHead).toHaveBeenCalled;
    expect(end).toHaveBeenCalled;
  });

  it('beforeThrottle invoked if badHost', () => {
    const beforeThrottle = jest.fn().mockReturnValue(true) as BeforeThrottleFn;
    const qos = new ConnectQOS({ minHostRequests: 10 });
    const middleware = qos.getMiddleware({ beforeThrottle });
    expect(typeof middleware).toEqual('function');
    for (let i = 0; i < 10; i++) {
      qos.isBadHost('unknown', true);  
    }
    const writeHead = jest.fn();
    const end = jest.fn();
    toobusy.mockReturnValue(true);
    toobusy.lag.mockReturnValue(70);
    const req = { headers: {} } as IncomingMessage;
    middleware(req, { writeHead, end }, () => {});
    expect(beforeThrottle).toHaveBeenCalledWith(qos, req, BadActorType.badHost);
    expect(writeHead).toHaveBeenCalled;
    expect(end).toHaveBeenCalled;
  });

  it('beforeThrottle invoked if badHost bad not blocked if returns false', () => {
    const beforeThrottle = jest.fn().mockReturnValue(false) as BeforeThrottleFn;
    const qos = new ConnectQOS({ minHostRequests: 10 });
    const middleware = qos.getMiddleware({ beforeThrottle });
    expect(typeof middleware).toEqual('function');
    for (let i = 0; i < 10; i++) {
      qos.isBadHost('unknown', true);  
    }
    const writeHead = jest.fn();
    const end = jest.fn();
    toobusy.mockReturnValue(true);
    toobusy.lag.mockReturnValue(70);
    const req = { headers: {} } as IncomingMessage;
    middleware(req, { writeHead, end }, () => {});
    expect(beforeThrottle).toHaveBeenCalledWith(qos, req, BadActorType.badHost);
    expect(writeHead).not.toHaveBeenCalled;
    expect(end).not.toHaveBeenCalled;
  });
});

describe('isBadHost', () => {
  it('returns false if no bad hosts', () => {
    const qos = new ConnectQOS();
    expect(qos.isBadHost('unknown')).toEqual(false);
  });

  it('returns true if bad hosts', () => {
    const qos = new ConnectQOS({ minHostRequests: 10 });
    toobusy.mockReturnValue(true);
    toobusy.lag.mockReturnValue(70);
    expect(qos.isBadHost('unknown', false)).toEqual(false); // insufficient history
    for (let i = 0; i < 9; i++) {
      qos.isBadHost('unknown', true);  
    }
    expect(qos.isBadHost('unknown', false)).toEqual(false); // insufficient history
    qos.isBadHost('unknown', true);  
    expect(qos.isBadHost('unknown', false)).toEqual(true);
  });

  it('returns true if maxBadHostThreshold exceeded @ maxLag', () => {
    const qos = new ConnectQOS({ minHostRequests: 2 });
    expect(qos.isBadHost('a', false)).toEqual(false); // insufficient history
    toobusy.mockReturnValue(true);
    toobusy.lag.mockReturnValue(70);
    for (let i = 0; i < 9; i++) {
      qos.isBadHost('a', true);  
    }
    expect(qos.isBadHost('a', false)).toEqual(true);
    qos.isBadHost('b', true);  
    expect(qos.isBadHost('b', false)).toEqual(false);
    toobusy.lag.mockReturnValue(300);
    expect(qos.isBadHost('b', false)).toEqual(true);
  });
});

describe('isBadIp', () => {
  it('returns false if no bad IPs', () => {
    const qos = new ConnectQOS();
    expect(qos.isBadIp('unknown')).toEqual(false);
  });

  it('returns true if bad IPs', () => {
    const qos = new ConnectQOS({ minIpRequests: 10 });
    toobusy.mockReturnValue(true);
    toobusy.lag.mockReturnValue(70);
    expect(qos.isBadIp('unknown', false)).toEqual(false); // insufficient history
    for (let i = 0; i < 9; i++) {
      qos.isBadIp('unknown', true);  
    }
    expect(qos.isBadIp('unknown', false)).toEqual(false); // insufficient history
    qos.isBadIp('unknown', true);  
    expect(qos.isBadIp('unknown', false)).toEqual(true);
  });

  it('returns true if maxBadIpThreshold exceeded @ maxLag', () => {
    const qos = new ConnectQOS({ minIpRequests: 2 });
    expect(qos.isBadIp('a', false)).toEqual(false); // insufficient history
    toobusy.mockReturnValue(true);
    toobusy.lag.mockReturnValue(70);
    for (let i = 0; i < 9; i++) {
      qos.isBadIp('a', true);  
    }
    expect(qos.isBadIp('a', false)).toEqual(true);
    qos.isBadIp('b', true);  
    expect(qos.isBadIp('b', false)).toEqual(false);
    toobusy.lag.mockReturnValue(300);
    expect(qos.isBadIp('b', false)).toEqual(true);
  });
});

describe('exemptLocalAddress', () => {
  it('localhost blocked by default', () => {
    const qos = new ConnectQOS({ minIpRequests: 10 });
    toobusy.mockReturnValue(true);
    toobusy.lag.mockReturnValue(70);
    expect(qos.isBadIp('127.0.0.1', false)).toEqual(false); // insufficient history
    for (let i = 0; i < 10; i++) {
      qos.isBadIp('127.0.0.1', true);  
    }
    expect(qos.isBadIp('127.0.0.1', false)).toEqual(true);
    // even though it's a bad IP, the connect path will never block a local IP
    expect(qos.shouldThrottleRequest({
      headers: {}, socket: { remoteAddress: '127.0.0.1' }
    } as IncomingMessage)).toEqual(false);
  });

  it('localhost not blocked if exemptLocalAddress set to false', () => {
    const qos = new ConnectQOS({ minIpRequests: 10, exemptLocalAddress: false });
    expect(qos.exemptLocalAddress).toEqual(false);
    toobusy.mockReturnValue(true);
    toobusy.lag.mockReturnValue(70);
    expect(qos.isBadIp('127.0.0.1', false)).toEqual(false); // insufficient history
    for (let i = 0; i < 10; i++) {
      qos.isBadIp('127.0.0.1', true);  
    }
    expect(qos.isBadIp('127.0.0.1', false)).toEqual(true);
    expect(qos.shouldThrottleRequest({
      headers: {}, socket: { remoteAddress: '127.0.0.1' }
    } as IncomingMessage)).toEqual(BadActorType.badIp);
  });
});

describe('shouldThrottleRequest', () => {
  it('userLag triggered for all requests if execeeded regardless of history', () => {
    const userLag = 450;
    const qos = new ConnectQOS({ minIpRequests: 10, userLag, exemptLocalAddress: false });
    expect(qos.exemptLocalAddress).toEqual(false);
    toobusy.mockReturnValue(true);
    toobusy.lag.mockReturnValue(70);
    expect(qos.shouldThrottleRequest({
      headers: { host: 'a' }
    } as IncomingMessage)).toEqual(false);
    toobusy.lag.mockReturnValue(userLag);
    expect(qos.shouldThrottleRequest({
      headers: { host: 'a' }
    } as IncomingMessage)).toEqual(BadActorType.userLag);
  });
});