// Dedicated image/chat composition. Execution tools come from the governed
// Linux root carrier. Do not activate a second native shell/job/workflow tree.
export const linuxImagePresetPatch=()=>[
 {id:'agent-preset-registry',config:{default:'sep-linux-images'}},
 {insert:[{id:'sep-linux-image-preset',name:'@deepseek-ai/dsh-agent-preset',config:{id:'sep-linux-images',name:'SEP Linux governed images',description:'Isolated Linux image/chat Profile; governed root tools; other official preset trees are not certified.',plugins:[]}}]},
];
