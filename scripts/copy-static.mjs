import {cpSync, existsSync, mkdirSync} from 'node:fs';
for(const name of ['data','img','manifest.json','sw.js']){if(existsSync(name)){mkdirSync('dist',{recursive:true});cpSync(name,`dist/${name}`,{recursive:true})}}
