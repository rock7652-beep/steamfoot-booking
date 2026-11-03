/* eslint-disable @typescript-eslint/no-require-imports -- Node --require preload must be CommonJS. */
const net=require('node:net'),tls=require('node:tls'),dns=require('node:dns');
const blocked=()=>{throw new Error('Offline verification: network and database sockets are forbidden');};
net.Socket.prototype.connect=blocked;net.connect=blocked;net.createConnection=blocked;tls.connect=blocked;dns.lookup=blocked;dns.resolve=blocked;globalThis.fetch=blocked;
