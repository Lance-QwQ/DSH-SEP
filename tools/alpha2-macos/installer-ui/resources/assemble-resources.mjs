// RED scaffold: build-time only, never an installer runtime or model entry.
export async function assembleInstallerResources(_input){
 throw Object.assign(Error('SEP_INSTALLER_RESOURCES_NOT_IMPLEMENTED'),{code:'SEP_INSTALLER_RESOURCES_NOT_IMPLEMENTED'});
}
