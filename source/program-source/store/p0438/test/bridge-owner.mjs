import { runBridge } from '../native-process.js';
await runBridge(process.argv[2],process.argv[3],100000,new AbortController().signal);
