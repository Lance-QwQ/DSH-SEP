/** Expected management rejection; presentation belongs to the caller's locale. */
export class ManagementFailure extends Error {
    /** Code rendered by the caller's locale dictionary. */
    code;
    /** @param code Localizable management rejection. */
    constructor(code) { super(code); this.code = code; }
}
//# sourceMappingURL=failure.js.map