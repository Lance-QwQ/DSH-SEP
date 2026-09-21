export class ConversionError extends Error {
  constructor(code, message, options) { super(message, options); this.name = 'ConversionError'; this.code = code; }
}
