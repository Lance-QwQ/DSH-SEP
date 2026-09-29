import { createHash } from "node:crypto";
import { canonicalizeOpenClawInboundMetadataIdentityContent } from "../openclaw-inbound-metadata.js";
export function buildMessageIdentityKey(role, content) {
    return `${role}\u0000${canonicalizeOpenClawInboundMetadataIdentityContent(role, content)}`;
}
export function buildMessageIdentityHash(role, content) {
    const identityContent = canonicalizeOpenClawInboundMetadataIdentityContent(role, content);
    return createHash("sha256")
        .update(role)
        .update("\u0000")
        .update(identityContent)
        .digest("hex");
}
