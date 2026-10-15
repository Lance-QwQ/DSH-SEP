window.__ModuleLoader__.load({id:'sep-native-browser-test-carrier',factory(require){
 const React=require('react'),{createSnapshotStore}=require('@deepseek-ai/dsh-client-store');
 return {inject:['slots'],apply(ctx){
  ctx.slots.provideRoot({hooks:{sessions:createSnapshotStore({phase:'ready',byId:{}})}});
  const absent=createSnapshotStore({key:undefined,hooks:{},keyedHooks:{},props:{}});
  ctx.slots.installScope('session',{current:absent,bindingSource(target){if(target!=null)throw Error('test carrier supports only absent sessions');return absent},renderArea(props){if(props.session!=null)throw Error('test carrier cannot render a private session');return props.children}});
  ctx.slots.register({name:'root',children:{'sidebar.settings':{kind:'single',scope:'root'}}},props=>React.createElement('main',{'data-test-carrier':'true'},props.renderSlot('sidebar.settings',{wide:true})));
 }};
}});
