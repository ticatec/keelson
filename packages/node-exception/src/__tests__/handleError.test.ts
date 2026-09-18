import {handleError, setHttpContainer, getHttpContainer} from '../handleError.js';
import HttpContainer, {ExpressContainer} from '../HttpContainer.js';
import ErrorResponse from '../ErrorResponse.js';
import {AppError, IllegalParameterError} from '../HttpError.js';

const makeContainer = (isDev = false) => {
    const sent: Array<{statusCode: number; data: ErrorResponse}> = [];
    const container: HttpContainer = {
        getRemoteIp: () => '10.0.0.1',
        getPath: () => '/api/orders',
        isDevelopment: () => isDev,
        sendError: (_req, _res, statusCode, data) => {
            sent.push({statusCode, data});
        }
    };
    return {container, sent};
};

describe('handleError', () => {
    afterEach(() => setHttpContainer(new ExpressContainer()));

    it('keeps the 4-argument arity Express uses to detect error middleware', () => {
        expect(handleError.length).toBe(4);
    });

    it('maps HttpError subclasses to their status codes', () => {
        const {container, sent} = makeContainer();
        setHttpContainer(container);
        handleError(new IllegalParameterError('bad id'), {method: 'POST'}, {}, jest.fn());
        expect(sent[0].statusCode).toBe(400);
        expect(sent[0].data.message).toBe('bad id');
        expect(sent[0].data.code).toBe(-1);
        expect(sent[0].data.method).toBe('POST');
    });

    it('carries the AppError application code', () => {
        const {container, sent} = makeContainer();
        setHttpContainer(container);
        handleError(new AppError(1001, 'nope'), {method: 'GET'}, {}, jest.fn());
        expect(sent[0]).toMatchObject({statusCode: 500, data: {code: 1001, message: 'nope'}});
    });

    it('treats unknown throwables as a 500 with code -1', () => {
        const {container, sent} = makeContainer();
        setHttpContainer(container);
        handleError('just a string', {method: 'GET'}, {}, jest.fn());
        expect(sent[0]).toMatchObject({statusCode: 500, data: {code: -1, message: 'Unknown error'}});
    });

    it('defaults the method when the request has none', () => {
        const {container, sent} = makeContainer();
        setHttpContainer(container);
        handleError(new Error('x'), {}, {}, jest.fn());
        expect(sent[0].data.method).toBe('GET');
    });

    it('omits the stack outside development', () => {
        const {container, sent} = makeContainer(false);
        setHttpContainer(container);
        handleError(new Error('x'), {method: 'GET'}, {}, jest.fn());
        expect(sent[0].data.stack).toBeUndefined();
    });

    it('includes the stack in development', () => {
        const {container, sent} = makeContainer(true);
        setHttpContainer(container);
        handleError(new Error('x'), {method: 'GET'}, {}, jest.fn());
        expect(sent[0].data.stack).toContain('Error: x');
    });

    it('does not fabricate a stack for a non-Error throwable in development', () => {
        const {container, sent} = makeContainer(true);
        setHttpContainer(container);
        handleError({oops: true}, {method: 'GET'}, {}, jest.fn());
        expect(sent[0].data.stack).toBeUndefined();
    });

    // Writing a status line after the response has started throws ERR_HTTP_HEADERS_SENT.
    it('delegates to next() once headers are sent', () => {
        const {container, sent} = makeContainer();
        setHttpContainer(container);
        const next = jest.fn();
        const err = new Error('late');
        handleError(err, {method: 'GET'}, {headersSent: true}, next);
        expect(next).toHaveBeenCalledWith(err);
        expect(sent).toHaveLength(0);
    });

    // Callers that invoke the handler directly pass `null` for next
    // (common-express-server's RouterHelper does). Falling through to write a
    // response here throws ERR_HTTP_HEADERS_SENT out of the error handler itself.
    it.each([[null], [undefined]])('writes nothing when headers are sent and next is %p', (next) => {
        const {container, sent} = makeContainer();
        setHttpContainer(container);
        expect(() => handleError(new Error('late'), {method: 'GET'}, {headersSent: true}, next)).not.toThrow();
        expect(sent).toHaveLength(0);
    });
});

describe('setHttpContainer / getHttpContainer', () => {
    afterEach(() => setHttpContainer(new ExpressContainer()));

    it('defaults to the Express container', () => {
        expect(getHttpContainer()).toBeInstanceOf(ExpressContainer);
    });

    it('swaps the active container', () => {
        const {container} = makeContainer();
        setHttpContainer(container);
        expect(getHttpContainer()).toBe(container);
    });
});
