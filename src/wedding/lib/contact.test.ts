import { isValidEmail, mailtoHref, normalisePhone, safeWebsiteHref, telHref, whatsappHref } from './contact';

describe('normalisePhone', () => {
  it.each([
    ['082 123 4567', '27821234567'],
    ['082-123-4567', '27821234567'],
    ['(082) 123 4567', '27821234567'],
    ['+27 82 123 4567', '27821234567'],
    ['+27 (0)82 123 4567', '27821234567'],
    ['0027821234567', '27821234567'],
    ['27821234567', '27821234567'],
    ['+44 20 7946 0958', '442079460958'],
  ])('reads %s', (input, out) => {
    expect(normalisePhone(input)).toBe(out);
  });
  it.each(['', '   ', 'abc', '082 123', '08212345678', '+27 82 123', '0821234567x', '12345', '+0821234567', 'tel:0821234567', '082 123 4567; rm'])(
    'rejects %j', (input) => {
      expect(normalisePhone(input)).toBeNull();
    }
  );
  it('handles null and undefined', () => {
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone(undefined)).toBeNull();
  });
  it('builds tel and wa.me links from digits only', () => {
    expect(telHref('082 123 4567')).toBe('tel:+27821234567');
    expect(whatsappHref('082 123 4567')).toBe('https://wa.me/27821234567');
    expect(telHref('nonsense')).toBeNull();
    expect(whatsappHref('javascript:alert(1)')).toBeNull();
  });
});

describe('email', () => {
  it('accepts ordinary addresses', () => {
    expect(isValidEmail('ada@example.com')).toBe(true);
    expect(isValidEmail(' ada.b+tag@mail.example.co.za ')).toBe(true);
  });
  it.each(['', 'ada', 'ada@', '@example.com', 'ada@example', 'a da@example.com', 'ada@example.com?cc=x@y.z', 'ada@exa%mple.com', 'a"b@example.com', 'ada@example.com&bcc=x@y.z'])(
    'rejects %j', (v) => {
      expect(isValidEmail(v)).toBe(false);
      expect(mailtoHref(v)).toBeNull();
    }
  );
  it('builds a mailto link from a valid address only', () => {
    expect(mailtoHref(' ada@example.com ')).toBe('mailto:ada@example.com');
  });
});

describe('safeWebsiteHref', () => {
  it('accepts http and https and assumes https for a bare domain', () => {
    expect(safeWebsiteHref('https://riverside.example/menu')).toBe('https://riverside.example/menu');
    expect(safeWebsiteHref('http://riverside.example')).toBe('http://riverside.example/');
    expect(safeWebsiteHref('riverside.example')).toBe('https://riverside.example/');
    expect(safeWebsiteHref('  www.riverside.example/a?b=1 ')).toBe('https://www.riverside.example/a?b=1');
    expect(safeWebsiteHref('riverside.example:8080/x')).toBe('https://riverside.example:8080/x');
  });
  it.each([
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x', 'file:///etc/passwd', 'ftp://x.example',
    'vbscript:x', 'mailto:a@b.co', '//evil.example', 'https://user:pw@riverside.example', 'not a url', 'localhost',
    'https://', 'http://exa mple.com', '',
  ])('rejects %j', (v) => {
    expect(safeWebsiteHref(v)).toBeNull();
  });
  it('handles null', () => {
    expect(safeWebsiteHref(null)).toBeNull();
  });
});
