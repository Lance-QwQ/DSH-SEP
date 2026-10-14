/** Deliberate fail-closed placeholder for the native RED stage.
 * No route/tool is installed, no caller authorization is minted, and no
 * filesystem or transaction is accessed by this unfinished factory. */
export async function openProjectWorkflow() {
  throw Object.assign(new Error('SEP_MAC_WORKFLOW_NOT_IMPLEMENTED'), {
    code: 'SEP_MAC_WORKFLOW_NOT_IMPLEMENTED',
  });
}
