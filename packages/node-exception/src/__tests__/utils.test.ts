import {toHtml, toText} from '../utils.js';
import ErrorResponse from '../ErrorResponse.js';

const base = (over: Partial<ErrorResponse> = {}): ErrorResponse => ({
    code: -1,
    client: '127.0.0.1',
    path: '/api/orders',
    method: 'GET',
    timestamp: 1700000000000,
    message: 'boom',
    ...over
});

const XSS = '"><script>alert(1)</script>';

describe('toHtml', () => {
    it('renders the core fields', () => {
        const html = toHtml(base());
        expect(html).toContain('<h1>Error Code: -1</h1>');
        expect(html).toContain('<strong>Client:</strong> 127.0.0.1');
        expect(html).toContain('<strong>Path:</strong> /api/orders');
        expect(html).toContain('<strong>Method:</strong> GET');
    });

    // Regression: every request-derived field used to be interpolated raw.
    // `client` resolves to req.ip, which comes from X-Forwarded-For whenever the
    // application enables `trust proxy`, so this was a reachable stored-input XSS.
    it.each(['client', 'path', 'method'] as const)('escapes %s', (field) => {
        const html = toHtml(base({[field]: XSS}));
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('escapes a non-numeric code in both the title and the heading', () => {
        const html = toHtml(base({code: XSS as unknown as number}));
        expect(html).not.toContain('<script>');
        expect(html.match(/&lt;script&gt;/g)).toHaveLength(2);
    });

    it('escapes the message', () => {
        expect(toHtml(base({message: XSS}))).not.toContain('<script>');
    });

    it('escapes the stack and keeps its line breaks', () => {
        const html = toHtml(base({stack: 'Error: <x>\nat a\nat b'}));
        expect(html).toContain('Error: &lt;x&gt;<br/>at a<br/>at b');
        expect(html).toContain('class="stack"');
    });

    it('omits the stack block when there is no stack', () => {
        expect(toHtml(base())).not.toContain('class="stack"');
    });

    it('renders null/undefined fields as empty rather than "null"', () => {
        const html = toHtml(base({message: null}));
        expect(html).toContain('<strong>Message:</strong> </div>');
    });

    it('escapes ampersands exactly once', () => {
        expect(toHtml(base({path: '/a?x=1&y=2'}))).toContain('/a?x=1&amp;y=2');
    });
});

describe('toText', () => {
    it('renders the core fields', () => {
        const text = toText(base());
        expect(text).toContain('Code: -1');
        expect(text).toContain('Client: 127.0.0.1');
        expect(text).toContain('Path: /api/orders');
        expect(text).toContain('Message: boom');
    });

    it('omits empty message and absent stack', () => {
        const text = toText(base({message: null}));
        expect(text).not.toContain('Message:');
        expect(text).not.toContain('Stack Trace');
    });

    it('includes the stack when present', () => {
        expect(toText(base({stack: 'at a'}))).toContain('---Stack Trace---\nat a');
    });
});
